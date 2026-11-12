import "server-only";
import {createHash} from "node:crypto";
import {retellConnection,voiceConfiguration} from "./retell-connection.ts";
import {retellPhonePayload} from "./retell-call-payload.ts";
import {verifyRetellAgent} from "./retell-agent-verification.ts";
import {requireVoiceSupervisor} from "./voice-supervisor-lease.ts";
import {readWorkspace,reserveVoiceCall,recordVoiceDispatch} from "./store.ts";
import {reserveSpend,recordSpendOutcome,spendingPolicy} from "./spending.ts";
import {readSandboxInvoice} from "./paypal-sandbox.ts";
import {normalizeSandboxInvoice} from "../domain/paypal-evidence.ts";
import {recheckVoiceContext} from "../domain/voice-context.ts";
import {DEMO_OWNER} from "./fixtures.ts";
import type {VoiceCallRecord} from "../domain/voice-lifecycle.ts";
import type {VoiceContextReview} from "../domain/voice-context.ts";

export async function submitReservedRetellCall(call:VoiceCallRecord,review:VoiceContextReview,connection:NonNullable<ReturnType<typeof retellConnection>>,request:typeof fetch=fetch){
 if(call.providerBinding!==connection.binding||JSON.stringify(call.profile)!==JSON.stringify(connection.profile)||review.context.phone!==connection.recipient)throw new Error("Review the exact provider and allowed phone binding.");
 const payload=retellPhonePayload(call,review);
 try{
  const response=await request("https://api.retellai.com/v2/create-phone-call",{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${connection.key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error("provider");
  const body=await response.json();
  if(!body||typeof body.call_id!=="string"||!/^[A-Za-z0-9_-]{1,100}$/.test(body.call_id)||body.agent_id!==connection.profile.agentId||body.agent_version!==connection.profile.agentVersion||body.from_number!==connection.profile.from||body.to_number!==connection.recipient||body.call_type!=="phone_call"||body.direction!=="outbound"||!["registered","ongoing"].includes(body.call_status))throw new Error("binding");
  return body.call_id as string;
 }catch{throw new Error("Review voice outcome: call acceptance is unknown. No automatic retry.");}
}

// Internal only; no browser dispatch route. INTEGRATION_READY must remain false
// until published-agent, callback, independent watchdog and rates are verified.
export async function deliverApprovedVoiceCall(caseId:string,approvalId:string,request:typeof fetch=fetch){
 const config=voiceConfiguration(),connection=retellConnection();
 if(!config.ready||!connection)throw new Error("Review voice setup: calling is disabled.");
 const budget=spendingPolicy();
 if(budget.voiceMaxMicroUsd<=0||budget.voiceMaxMicroUsd>500000||budget.voiceSeconds!==60*config.limit)throw new Error("The approved phone test is limited to 60 seconds and a maximum 50-cent reservation.");
 requireVoiceSupervisor(approvalId,connection.binding);
 const w=readWorkspace(),existing=w.voiceCalls?.find(c=>c.caseId===caseId&&c.approvalId===approvalId);
 if(existing)return existing; // Never resubmit even a crashed/reserved attempt.
 const c=w.cases.find(c=>c.id===caseId),a=w.voiceApprovals?.find(a=>a.id===approvalId),review=w.voiceReviews?.find(r=>r.id===a?.reviewId&&r.context.caseId===caseId);
 if(!c||!a||!review)throw new Error("Exact reviewed voice purpose is required.");
 recheckVoiceContext(review,c,DEMO_OWNER);
 if(review.context.phone!==connection.recipient||JSON.stringify(a.profile)!==JSON.stringify(connection.profile))throw new Error("Review the allowed test phone and pinned agent.");
 await verifyRetellAgent(connection.key,connection.profile,request);
 const clientId=process.env.PAYPAL_SANDBOX_CLIENT_ID??"",clientSecret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET??"";
 if(!clientId||!clientSecret||createHash("sha256").update(clientId).digest("hex")!==c.providerBinding)throw new Error("Review the bound PayPal sandbox access.");
 for(const invoice of c.invoices){
  const raw=await readSandboxInvoice(invoice.id,{clientId,clientSecret},request),fresh=normalizeSandboxInvoice(raw.raw,raw.checkedAt),old=invoice.evidence!;
  if(fresh.id!==old.id||fresh.number!==old.number||fresh.status!==old.status||fresh.dueMinor!==old.dueMinor||fresh.dueDate!==old.dueDate||fresh.currency!==old.currency||fresh.followUp!==old.followUp||JSON.stringify(fresh.payments)!==JSON.stringify(old.payments))throw new Error("Review changed PayPal evidence before a new call approval.");
 }
 const latest=retellConnection();
 if(!voiceConfiguration().ready||voiceConfiguration().limit!==config.limit||latest?.binding!==connection.binding||process.env.PAYPAL_SANDBOX_CLIENT_ID!==clientId||process.env.PAYPAL_SANDBOX_CLIENT_SECRET!==clientSecret)throw new Error("Review provider configuration changed during call verification.");
 const spending=reserveSpend(`voice:${a.id}`,c.merchantId,"voice","retell",60,budget);
 let call:VoiceCallRecord|undefined;
 try{
  call=reserveVoiceCall(caseId,a.id,connection.profile,connection.binding,config.limit);
  const current=readWorkspace().cases.find(item=>item.id===caseId);
  // Reservation itself increments the case once and adds its own hold/contact
  // time. Any later mutation stops dispatch before the external request starts.
  if(!current||current.version!==review.context.caseVersion+1||current.hold!=="owner-review"||current.lastContactAt!==call.at)throw new Error("changed");
  requireVoiceSupervisor(approvalId,connection.binding);
  const providerCallId=await submitReservedRetellCall(call,review,connection,request);
  recordVoiceDispatch(call.id,connection.binding,{state:"accepted",providerCallId});recordSpendOutcome(spending.id,"committed");
 }catch{
  recordSpendOutcome(spending.id,"unknown");if(call&&readWorkspace().voiceCalls?.find(item=>item.id===call!.id)?.state==="reserved")recordVoiceDispatch(call.id,connection.binding,{state:"unknown"});throw new Error("Review voice attempt: unresolved outcome or changed case. No automatic retry; follow-up remains held.");
 }
 return readWorkspace().voiceCalls!.find(item=>item.id===call!.id)!;
}

