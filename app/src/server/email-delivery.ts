import "server-only";
import {reserveSpend,recordSpendOutcome} from "./spending.ts";
import {createHash} from "node:crypto";
import {simpleEmail} from "../domain/email-delivery.ts";
import type {EmailAttempt} from "../domain/email-delivery.ts";
import {readWorkspace,reserveEmailDelivery,finishEmailDelivery} from "./store.ts";
import {readSandboxInvoice} from "./paypal-sandbox.ts";
import {normalizeSandboxInvoice} from "../domain/paypal-evidence.ts";
import type {SandboxInvoice} from "../domain/paypal-evidence.ts";
import {readGmailConnection} from "./gmail-vault.ts";
import {gmailAccess} from "./gmail-connection.ts";
import {submitGmailTestEmail} from "./gmail-delivery.ts";
import {sesConnection,submitSesTestEmail,SesDeliveryError} from "./ses-delivery.ts";
import {appendFileSync} from "node:fs";
import path from "node:path";
export function emailConfiguration(env:Record<string,string|undefined>=process.env){
  const limit=Number(env.NALBACE_EMAIL_MAX_ATTEMPTS??0),from=env.NALBACE_EMAIL_FROM??"",recipient=env.NALBACE_EMAIL_TEST_RECIPIENT??"";
  const replyTo=env.NALBACE_EMAIL_REPLY_TO??"";
  const provider=env.NALBACE_EMAIL_PROVIDER??"resend",connection=provider==="gmail"?readGmailConnection():null;
  const ses=provider==="ses"?sesConnection(env):null;
  const access=provider==="resend"?Boolean(env.RESEND_API_KEY?.trim()):provider==="ses"?Boolean(ses):provider==="gmail"&&Boolean(connection&&connection.email.toLowerCase()===from.toLowerCase()&&from.toLowerCase()===recipient.toLowerCase());
  const ready=env.NALBACE_EMAIL_ENABLED==="true"&&(provider!=="ses"||simpleEmail(replyTo))&&access&&simpleEmail(from)&&simpleEmail(recipient)&&Number.isSafeInteger(limit)&&limit>=1&&limit<=3;
  const connectionId=provider==="ses"?ses?.binding??null:provider==="resend"?createHash("sha256").update(env.RESEND_API_KEY??"").digest("hex"):connection?.id??null;
  return {ready,limit:ready?limit:0,from,recipient,provider,connectionId,replyTo};
}
export async function submitTestEmail(attempt:EmailAttempt,key:string,request:typeof fetch=fetch):Promise<string>{
  // A single attempt. Any exception, malformed response or provider error is
  // treated as unknown; callers retain the reservation and never auto-retry.
  const response=await request("https://api.resend.com/emails",{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":attempt.id},body:JSON.stringify({from:attempt.from,to:[attempt.to],subject:attempt.subject,text:attempt.text})});
  if(!response.ok)throw new Error("Email acceptance could not be confirmed.");
  const body=await response.json();if(!body||typeof body.id!=="string"||!/^[a-zA-Z0-9-]{1,100}$/.test(body.id))throw new Error("Email acceptance could not be confirmed.");return body.id;
}
export async function deliverApprovedTestEmail(caseId:string,draftId:string,approvalId:string){
  const config=emailConfiguration();
  if(!config.ready)throw new Error("Review email setup: test sending is disabled until sender, exact recipient and explicit allowance are configured.");
  const gmail=config.provider==="gmail"?await gmailAccess():null;
  const ses=config.provider==="ses"?sesConnection():null,resendKey=process.env.RESEND_API_KEY??"";
  if(ses&&ses.binding!==config.connectionId)throw new Error("Review email setup: configuration changed. Nothing was attempted.");
  const w=readWorkspace(),existing=w.emailAttempts?.find(a=>a.approvalId===approvalId&&a.caseId===caseId);
  if(existing){if(existing.draftId!==draftId)throw new Error("Review the original email attempt.");return existing;}
  const c=w.cases.find(c=>c.id===caseId),d=w.drafts.find(d=>d.id===draftId&&d.caseId===caseId),approval=w.approvals.find(a=>a.id===approvalId&&a.draftId===draftId&&a.caseId===caseId);
  if(!c||!d||!approval||c.source!=="paypal-sandbox")throw new Error("Exact approved sandbox message is required.");
  const clientId=process.env.PAYPAL_SANDBOX_CLIENT_ID??"",clientSecret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET??"";
  if(!clientId||!clientSecret)throw new Error("Review sandbox configuration first.");
  const binding=createHash("sha256").update(clientId).digest("hex");
  if(c.providerBinding!==binding)throw new Error("Merchant sandbox access does not match this case.");
  const evidence:SandboxInvoice[]=[];
  for(const invoice of c.invoices){
    try{const result=await readSandboxInvoice(invoice.id,{clientId,clientSecret});evidence.push(normalizeSandboxInvoice(result.raw,result.checkedAt));}
    catch{throw new Error("Review fresh PayPal evidence: pre-delivery verification failed. Nothing was attempted.");}
  }
  const latest=emailConfiguration();
  if(!latest.ready||latest.replyTo!==config.replyTo||latest.from!==config.from||latest.recipient!==config.recipient||latest.limit!==config.limit||latest.provider!==config.provider||latest.connectionId!==config.connectionId||(gmail&&gmail.id!==latest.connectionId))throw new Error("Review email setup: configuration changed during verification. Nothing was attempted.");
  const result=reserveEmailDelivery(caseId,draftId,approvalId,c.version,evidence,binding,config.from,config.recipient,config.limit,{provider:config.provider,...(config.replyTo?{replyTo:config.replyTo}:{}),binding:ses?ses.binding:createHash("sha256").update(gmail?gmail.id:resendKey).digest("hex")});
  if(result.blocked)throw new Error(result.blocked);
  const attempt=result.attempt!;
  if(result.reused)return attempt;
  let spendingId:string|undefined;
  try{
    spendingId=reserveSpend(`email:${attempt.id}`,c.merchantId,"email",config.provider).id;
    const id=ses?await submitSesTestEmail(attempt,ses):gmail?await submitGmailTestEmail(attempt,gmail.token):await submitTestEmail(attempt,resendKey);recordSpendOutcome(spendingId,"committed");finishEmailDelivery(attempt.id,id);}
  catch(error){
    if(error instanceof SesDeliveryError){try{appendFileSync(path.join(process.cwd(),".data","ses-diagnostics.jsonl"),JSON.stringify({at:new Date().toISOString(),attemptId:attempt.id,...error.diagnostic})+"\n",{mode:0o600});}catch{/* Diagnostic failure cannot permit retry or discard an uncertain attempt. */}}
    if(spendingId)recordSpendOutcome(spendingId,"unknown");finishEmailDelivery(attempt.id,null,!spendingId);if(!spendingId)throw new Error("Email blocked by spending controls. Nothing was sent; review the allowance before a new approval.");throw new Error("Review email outcome: acceptance could not be confirmed. No automatic retry; follow-up remains held.");}
  return readWorkspace().emailAttempts!.find(a=>a.id===attempt.id)!;
}
