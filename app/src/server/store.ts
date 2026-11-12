import {relationshipConcernOpen} from "../domain/account-priority.ts";
import {customerAllowsAiCalls} from "../domain/customer-calling.ts";
import {calendarDay, easternDate, runAutomaticFollowup} from "../domain/automatic-followup.ts";
import {hasUnreviewedReply} from "../domain/reply-review.ts";
import {replyAddress} from "../domain/reply-routing.ts";
import {validateVoiceProfile,voicePurposeFingerprint} from "../domain/voice-lifecycle.ts";
import type {VoiceProfile,VoicePurposeApproval,VoiceCallRecord,VoiceOutcome} from "../domain/voice-lifecycle.ts";
import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID,createHash } from "node:crypto";
import {readSandboxInvoice} from "./paypal-sandbox.ts";
import {normalizeSandboxInvoice} from "../domain/paypal-evidence.ts";
import type {SandboxInvoice} from "../domain/paypal-evidence.ts";
import {applyProviderEvidence,importedInvoice,matchExternalReceipt} from "../domain/reconcile.ts";
import { fixtures, DEMO_OWNER } from "./fixtures.ts";
import { approvalGate, contactEligibility, draftFingerprint, financials, remainingInvoices } from "../domain/cases.ts";
import type { ClientCase, Draft, Approval, Receipt } from "../domain/cases.ts";
import {draftContext,validateProposal,renderProposal} from "../domain/draft-proposal.ts";
import type {DraftContext} from "../domain/draft-proposal.ts";
import {defaultControls} from "../domain/workspace-controls.ts";
import type {WorkspaceControls} from "../domain/workspace-controls.ts";
import {replyContext,validateReplyProposal} from "../domain/reply-review.ts";
import {simpleEmail} from "../domain/email-delivery.ts";
import type {EmailAttempt} from "../domain/email-delivery.ts";
import {validatePermissionEvidence,hasSelfTestEmailEvidence} from "../domain/permission-evidence.ts";

import {prepareVoiceContext,voiceContextFingerprint,recheckVoiceContext} from "../domain/voice-context.ts";
import type {VoiceContextReview} from "../domain/voice-context.ts";
type AiRun={id:string;caseId:string;caseVersion:number;at:string;state:"pending"|"succeeded"|"failed";purpose?:"draft"|"reply";replyId?:string};
type Workspace = {voiceApprovals?:VoicePurposeApproval[];voiceCalls?:VoiceCallRecord[];voiceReviews?:VoiceContextReview[];cases:ClientCase[]; drafts:Draft[]; approvals:Approval[]; events:{id:string; at:string; text:string}[];aiRuns?:AiRun[];controls?:WorkspaceControls;emailAttempts?:EmailAttempt[];inboundEvents?:{id:string;fingerprint:string;at:string;result:"matched"|"unmatched";caseId?:string}[]};
function database() {
  const dir=path.join(process.cwd(),".data"); mkdirSync(dir,{recursive:true});
  const db=new DatabaseSync(path.join(dir,"local-demo.sqlite"));
  db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS demo_workspace (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);");
  db.prepare("INSERT OR IGNORE INTO demo_workspace (id,payload) VALUES (1,?)").run(JSON.stringify({cases:fixtures(),drafts:[],approvals:[],events:[]}));
  return db;
}
export function readWorkspace(): Workspace {
  const db=database();try {return JSON.parse((db.prepare("SELECT payload FROM demo_workspace WHERE id=1").get() as {payload:string}).payload);}finally{db.close();}
}
function mutate<T>(fn:(w:Workspace)=>T):T {
  const db=database(); db.exec("BEGIN IMMEDIATE");
  try {const w=JSON.parse((db.prepare("SELECT payload FROM demo_workspace WHERE id=1").get() as {payload:string}).payload) as Workspace;
    const result=fn(w);db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(w));db.exec("COMMIT");return result;
  }catch(e){db.exec("ROLLBACK");throw e;}finally{db.close();}
}
function caseFor(w:Workspace,id:string) {
  const c=w.cases.find(c=>c.id===id && c.merchantId===DEMO_OWNER.merchantId);
  if(!c)throw new Error("Client not found in this workspace.");return c;
}
function event(w:Workspace,text:string){w.events.unshift({id:randomUUID(),at:new Date().toISOString(),text});}
function changed(w:Workspace,c:ClientCase,text:string){c.version++;c.history.unshift({at:new Date().toISOString(),text});w.approvals=w.approvals.filter(a=>a.caseId!==c.id);event(w,`${c.name}: ${text}`);}
export function prepareDraft(id:string) {
  return mutate(w=>{const c=caseFor(w,id);const gate=contactEligibility(c,new Date());if(!gate.eligible)throw new Error(gate.reason);
    if(w.aiRuns?.some(r=>r.caseId===id&&r.state==="pending"))throw new Error("Review the AI request already in progress before preparing another draft.");
    const existing=w.drafts.find(d=>d.caseId===id&&d.caseVersion===c.version);if(existing&&(c.source!=="fixture"||!existing.body.startsWith("Hello,\n\nA quick follow-up on ")||w.approvals.some(a=>a.draftId===existing.id)))return existing;
    const open=remainingInvoices(c);const numbers=open.map(i=>`#${i.number}`).join(" and ");
    const greeting=c.source==="fixture"?"Hello "+c.name+",":"Hello,";
    const signature=c.source==="fixture"?"\nOak & Harbor Services (sample business)":"";
    const paymentLinks=open.flatMap(invoice=>invoice.evidence?.paymentUrl?["View and pay invoice #"+invoice.number+": "+invoice.evidence.paymentUrl]:[]).join("\n");
    const d:Draft={id:randomUUID(),caseId:id,caseVersion:c.version,merchantId:c.merchantId,recipient:c.contact,subject:`Following up on ${numbers}`,body:`${greeting}\n\nA quick follow-up on ${numbers}, totaling ${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(gate.totalMinor/100)}.\n\nIf you have already sent payment, please let us know so we can update our records. Is there anything you need from us to move this forward?${paymentLinks?"\n\n"+paymentLinks:""}\n\nThank you.${signature}`,invoiceIds:open.map(i=>i.id),createdAt:new Date().toISOString(),origin:"sample-template"};
    if(existing)w.drafts=w.drafts.filter(item=>item.id!==existing.id);
    w.drafts.push(d);event(w,`${c.name}: sample draft prepared. No AI request or email was sent.`);return d;
  });
}
export function approveDraft(id:string,draftId:string,subject:string,body:string) {
  return mutate(w=>{const c=caseFor(w,id);const d=w.drafts.find(d=>d.id===draftId&&d.caseId===id);if(!d)throw new Error("Draft not found.");
    if(w.aiRuns?.some(r=>r.caseId===id&&r.state==="pending"))throw new Error("Review the AI request already in progress before approval.");
    if(!subject.trim()||!body.trim()||subject.length>200||body.length>6000)throw new Error("Enter a subject and message within the supported length.");
    // Browser must identify the version it reviewed; don't silently upgrade stale content.
    const gate=approvalGate(c,d,null,DEMO_OWNER,new Date());if(!gate.eligible)throw new Error(gate.reason);
    d.subject=subject.trim();d.body=body.trim();
    const a:Approval={id:randomUUID(),ownerId:DEMO_OWNER.id,merchantId:c.merchantId,caseId:id,caseVersion:c.version,draftId:d.id,fingerprint:draftFingerprint(d),expiresAt:new Date(Date.now()+30*60000).toISOString(),status:"reviewed"};
    w.approvals=w.approvals.filter(a=>a.caseId!==id);w.approvals.push(a);event(w,`${c.name}: exact draft approved for local review. Sending remains disabled.`);return a;
  });
}
export function saveCustomerCalling(id:string,version:number,allow:boolean){
  mutate(w=>{
    const client=caseFor(w,id);
    if(typeof allow!=="boolean"||client.version!==version)throw new Error("Review the current customer before saving calling preferences.");
    if(allow&&!client.contactPermission?.voiceAllowed)throw new Error("Contact agreement is required before enabling AI calls.");
    client.aiCallPreference=allow?"allow":"email-only";
    changed(w,client,allow?"Owner allows AI calls for this customer when customer permission and service limits allow.":"Owner set this customer to email only across all invoices.");
  });
}

export function saveCustomerFollowup(id:string,version:number,emailEnabled:boolean,callEnabled:boolean){
  mutate(w=>{
    const client=caseFor(w,id);
    if(typeof emailEnabled!=="boolean"||typeof callEnabled!=="boolean"||client.version!==version)throw new Error("Review the current customer before saving follow-up preferences.");
    if(callEnabled&&!client.contactPermission?.voiceAllowed)throw new Error("Contact agreement is required before enabling AI calls.");
    client.emailFollowupEnabled=emailEnabled;
    client.aiCallPreference=callEnabled?"allow":"email-only";
    changed(w,client,`Owner saved account follow-up: email ${emailEnabled?"on":"off"}, AI calls ${callEnabled?"on":"off"}. Applies across invoices.`);
  });
}

export function saveReminderPolicy(input:{enabled:boolean;beforeDays:7|14;businessName:string;demoDate?:string},revision:number){
  mutate(w=>{
    const controls=w.controls??defaultControls;
    if(controls.revision!==revision)throw new Error("Review current settings before saving the reminder policy.");
    if(typeof input.enabled!=="boolean"||![7,14].includes(input.beforeDays)||typeof input.businessName!=="string"||!input.businessName.trim()||input.businessName.length>120||/[\r\n<>]/.test(input.businessName))throw new Error("Enter a business name and valid reminder schedule.");
    if(input.demoDate)calendarDay(input.demoDate);
    if(controls.reminderPolicy?.demoDate&&(input.demoDate??easternDate())<controls.reminderPolicy.demoDate)throw new Error("Choose the current demo date or a later date.");
    w.controls={...controls,revision:controls.revision+1,reminderPolicy:{...input,businessName:input.businessName.trim()}};
    event(w,"Owner saved the automatic sample reminder policy.");
  });
  tickAutomaticReminders();
}

export function tickAutomaticReminders(){
  mutate(w=>{
    const controls=w.controls??defaultControls;
    if(!controls.reminderPolicy?.enabled)return;
    const date=controls.reminderPolicy.demoDate??easternDate();
    for(const client of w.cases){
      if(client.source!=="fixture")continue;
      const before=client.automaticFollowup?.completed.length??0;
      const previousPlan=client.automaticFollowup;
      runAutomaticFollowup(client,controls,date);
      const plan=client.automaticFollowup;
      const offset=plan===previousPlan?before:0;
      const newSteps=plan?.completed.slice(offset)??[];
      if(newSteps.length){
        client.lastContactAt=date+"T17:00:00Z";
        changed(w,client,`Automatic sample ${newSteps[0].channel} simulated for ${date}. No external contact.`);
      }
    }
  });
}

export function approveFollowupRehearsal(id:string,draftId:string,subject:string,body:string,_legacyIncludeCall?:boolean){
  return mutate(w=>{
    const client=caseFor(w,id);
    const includeCall=customerAllowsAiCalls(client)&&client.contactPermission?.voiceAllowed===true&&/^\+[1-9]\d{6,14}$/.test(client.contactPermission.phone);
    const draft=w.drafts.find(item=>item.id===draftId&&item.caseId===id);
    if(client.source!=="fixture"||!draft)throw new Error("Choose an eligible sample customer and current draft.");
    const now=new Date();
    const gate=approvalGate(client,draft,null,DEMO_OWNER,now);
    if(!gate.eligible)throw new Error(gate.reason);
    if(!subject.trim()||!body.trim()||subject.length>200||body.length>6000)throw new Error("Enter a subject and message within the supported length.");
    const fingerprint=draftFingerprint({...draft,subject:subject.trim(),body:body.trim()});
    const existing=client.followupRehearsal;
    if(existing?.caseVersion===client.version){
      if(existing.draftFingerprint===fingerprint&&existing.steps.some(step=>step.channel==="call")===includeCall)return;
      throw new Error("Review the workflow already approved for this case.");
    }
    if(w.controls?.emailPaused||(includeCall&&w.controls?.voicePaused))throw new Error("Review paused follow-up preferences in Settings.");
    const at=now.toISOString();
    client.followupRehearsal={
      id:randomUUID(),caseVersion:client.version,approvedAt:at,draftFingerprint:fingerprint,
      subject:subject.trim(),body:body.trim(),invoiceIds:[...draft.invoiceIds],totalMinor:gate.totalMinor,
      steps:[{channel:"email",day:0,completedAt:at},{channel:"email",day:7},...(includeCall?[{channel:"call" as const,day:14}]:[])],
    };
    event(w,`${client.name}: sample workflow approved; first email simulated.`);
  });
}

export function advanceFollowupRehearsal(id:string,planId:string,day:number){
  return mutate(w=>{
    const client=caseFor(w,id);
    const plan=client.followupRehearsal;
    if(client.source!=="fixture"||!plan||plan.id!==planId||plan.caseVersion!==client.version)throw new Error("Review current account changes before continuing the workflow.");
    const step=plan.steps.find(item=>item.day===day);
    if(step?.completedAt)return;
    if(!step||step!==plan.steps.find(item=>!item.completedAt))throw new Error("Review the next scheduled step.");
    const now=new Date();
    const gate=contactEligibility(client,now);
    if(!gate.eligible)throw new Error(gate.reason);
    if(step.channel==="email"?w.controls?.emailPaused:w.controls?.voicePaused)throw new Error("Review paused follow-up preferences in Settings.");
    step.completedAt=now.toISOString();
    event(w,`${client.name}: day ${day} ${step.channel} simulated. No customer contacted.`);
  });
}

function reserveAi(w:Workspace,c:ClientCase,limit:number){
    if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new Error("Review an explicit AI request allowance between one and twenty requests.");
    const runs=w.aiRuns??=[];
    if(runs.some(r=>r.caseId===c.id&&r.state==="pending"))throw new Error("Review the AI request already in progress. Interrupted requests require explicit resolution.");
    if(runs.length>=limit)throw new Error("Review AI usage: the configured request allowance is exhausted.");
    const controls=w.controls??defaultControls;
    if(controls.aiPaused)throw new Error("Review AI usage: assistance is paused in workspace settings.");
    if(runs.length>=controls.aiRequestCap)throw new Error("Review AI usage: the workspace request allowance is exhausted.");
    if(runs.some(r=>r.state==="pending"))throw new Error("Review the AI request already in progress in this workspace.");
    if(runs.some(r=>r.caseId===c.id&&Date.now()-Date.parse(r.at)<86400000))throw new Error("Review AI usage: one request per client is allowed in twenty-four hours, including failed requests.");
    const run:AiRun={id:randomUUID(),caseId:c.id,caseVersion:c.version,at:new Date().toISOString(),state:"pending"};runs.push(run);
    w.approvals=w.approvals.filter(a=>a.caseId!==c.id);
    event(w,`${c.name}: one AI request reserved. Existing approval invalidated; no sending authorized.`);
    return run;

}
export function reserveAiDraft(id:string,limit:number):{runId:string;context:DraftContext}{
  return mutate(w=>{const c=caseFor(w,id);
    const context=draftContext(c);
    const run=reserveAi(w,c,limit);
    return {runId:run.id,context};
  });
}
export function completeAiDraft(runId:string,value:unknown,provider:string,model:string){
  return mutate(w=>{const run=w.aiRuns?.find(r=>r.id===runId&&r.state==="pending");if(!run)throw new Error("Draft request is no longer pending.");
    if(run.purpose==="reply")throw new Error("Review the reply request separately from drafting.");
    const c=caseFor(w,run.caseId);if(c.version!==run.caseVersion)throw new Error("The case changed during AI drafting. Review fresh evidence.");
    const context=draftContext(c),proposal=validateProposal(value,context),text=renderProposal(context,proposal);
    const draft:Draft={id:randomUUID(),caseId:c.id,caseVersion:c.version,merchantId:c.merchantId,recipient:c.contact,...text,invoiceIds:context.invoiceIds,createdAt:new Date().toISOString(),origin:"ai-assisted-template",assistance:{provider,model,approach:proposal.approach,reason:proposal.reason}};
    w.drafts=w.drafts.filter(d=>d.caseId!==c.id||d.caseVersion!==c.version);w.drafts.push(draft);
    w.approvals=w.approvals.filter(a=>a.caseId!==c.id);run.state="succeeded";
    event(w,`${c.name}: AI approach proposed; message facts assembled by Nalbace. Exact owner review required. Nothing sent.`);
    return draft;
  });
}
export function failAiDraft(runId:string){
  mutate(w=>{const run=w.aiRuns?.find(r=>r.id===runId&&r.state==="pending");if(run){run.state="failed";event(w,"AI draft request failed or became stale. Its reserved allowance remains consumed; no automatic retry.");}});
}
export function resolveInterruptedAiDraft(runId:string){
  mutate(w=>{const run=w.aiRuns?.find(r=>r.id===runId&&r.state==="pending");if(!run||Date.now()-Date.parse(run.at)<120000)throw new Error("Review the active AI request; interruption can be resolved after two minutes.");
    run.state="failed";event(w,"Owner resolved an interrupted AI request. Allowance was not refunded. A future request needs a new deliberate action.");
  });
}
export function recordReceipt(id:string,kind:"cash"|"check",allocations:Receipt["allocations"],operationId:string) {
  return mutate(w=>{const c=caseFor(w,id);if(!allocations.length)throw new Error("Choose invoice amounts for this receipt.");
    if(new Set(allocations.map(a=>a.invoiceId)).size!==allocations.length)throw new Error("An invoice can appear only once in a receipt.");
    if(!/^[a-zA-Z0-9-]{8,64}$/.test(operationId))throw new Error("A valid receipt operation is required.");
    const existing=c.receipts.find(r=>r.id===operationId);
    if(existing){if(existing.kind!==kind||JSON.stringify(existing.allocations)!==JSON.stringify(allocations))throw new Error("Receipt retry details do not match.");return;}
    if(c.reconciliationRequired)throw new Error("Review existing receipts against PayPal before adding another receipt.");
    const receipt:Receipt={id:operationId,kind,state:kind==="cash"?"cleared":"received",receivedAt:new Date().toISOString(),allocations};
    const candidate={...c,receipts:[...c.receipts,receipt]};financials(candidate);c.receipts=candidate.receipts;
    changed(w,c,kind==="check"?"Check recorded; pursuit paused while awaiting clearance.":"Cash receipt recorded with explicit invoice allocations.");
  });
}

function sandboxConfiguration(){
  const clientId=process.env.PAYPAL_SANDBOX_CLIENT_ID??"",clientSecret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET??"";
  if(!clientId||!clientSecret)throw new Error("Review sandbox credential configuration first.");
  return {credentials:{clientId,clientSecret},binding:createHash("sha256").update(clientId).digest("hex")};
}
// Only server-fetched evidence can enter a case. No browser-supplied amounts/statuses.
export function saveSandboxImport(evidence:SandboxInvoice,binding:string,caseId:"sandbox-test"|"sandbox-voice-test"|"sandbox-email-loop-test"|"sandbox-recording-email"|"sandbox-recording-call"="sandbox-test"){
  return mutate(w=>{
    if(!["sandbox-test","sandbox-voice-test","sandbox-email-loop-test","sandbox-recording-email","sandbox-recording-call"].includes(caseId)||w.cases.some(c=>c.id!==caseId&&c.invoices.some(i=>i.id===evidence.id)))throw new Error("Keep each sandbox invoice in its original case.");
    let c=w.cases.find(c=>c.id===caseId);
    if(c&&c.providerBinding!==binding)throw new Error("Merchant sandbox app changed. Existing cases require review.");
    if(c?.invoices.some(i=>i.id===evidence.id))return;
    if(c&&c.invoices.length>=10)throw new Error("Review at most ten invoices in this controlled sandbox case.");
    if(!c){
      c={id:caseId,merchantId:DEMO_OWNER.merchantId,name:caseId==="sandbox-email-loop-test"?"Fatima Jalloh":caseId==="sandbox-voice-test"?"Fatima · phone test":"Sandbox test client",contact:"Test contact not verified",verifiedContact:false,preference:"paypal",version:1,hold:"none",nextActionAt:new Date().toISOString(),lastContactAt:null,firstEligibleAt:new Date().toISOString(),evidenceAt:evidence.checkedAt,source:"paypal-sandbox",invoices:[],receipts:[],history:[],providerBinding:binding,evidenceStatus:"ready"};
      w.cases.push(c);
    }
    c.invoices.push(importedInvoice(evidence));
    c.evidenceAt=c.invoices.map(i=>i.evidence!.checkedAt).sort()[0];
    changed(w,c,`Sandbox invoice #${evidence.number} linked for review. No contact authorized.`);
  });
}
export async function importSandboxInvoice(invoiceId:string){
  const {credentials,binding}=sandboxConfiguration();
  const result=await readSandboxInvoice(invoiceId,credentials);
  saveSandboxImport(normalizeSandboxInvoice(result.raw,result.checkedAt),binding);
}
export function beginEvidenceRefresh(id:string,binding:string){
  return mutate(w=>{const c=caseFor(w,id);
    if(c.source!=="paypal-sandbox"||c.providerBinding!==binding)throw new Error("Merchant sandbox access does not match this case.");
    c.evidenceStatus="refreshing";changed(w,c,"PayPal refresh started. Previous approvals invalidated.");
    return {version:c.version,invoiceIds:c.invoices.map(i=>i.id)};
  });
}
export function finishEvidenceRefresh(id:string,version:number,evidence:SandboxInvoice[]){
  mutate(w=>{const c=caseFor(w,id);if(c.version!==version)throw new Error("The case changed during refresh. Refresh again before review.");
    const next=applyProviderEvidence(c,evidence);next.evidenceStatus="ready";
    Object.assign(c,next);changed(w,c,c.reconciliationRequired?"PayPal evidence changed. Offline receipt reconciliation required; pursuit held.":"PayPal invoice evidence refreshed. Contact rules rechecked; no message sent.");
  });
}
export async function refreshSandboxCase(id:string){
  const {credentials,binding}=sandboxConfiguration();
  const pending=beginEvidenceRefresh(id,binding);
  try{
    const evidence:SandboxInvoice[]=[];
    for(const invoiceId of pending.invoiceIds){const result=await readSandboxInvoice(invoiceId,credentials);evidence.push(normalizeSandboxInvoice(result.raw,result.checkedAt));}
    finishEvidenceRefresh(id,pending.version,evidence);
  }catch{
    mutate(w=>{const c=caseFor(w,id);if(c.version===pending.version){c.evidenceStatus="failed";changed(w,c,"PayPal refresh failed. Contact remains blocked until a complete successful refresh.");}});
    throw new Error("Review fresh PayPal evidence: the refresh failed or the case changed. No contact authorized.");
  }
}
export function reconcileReceipt(id:string,receiptId:string,matches:{invoiceId:string;paymentId:string}[]){
  const {binding}=sandboxConfiguration();
  mutate(w=>{const c=caseFor(w,id);
    const age=Date.now()-Date.parse(c.evidenceAt);
    if(c.source!=="paypal-sandbox"||c.providerBinding!==binding||c.evidenceStatus!=="ready"||!Number.isFinite(age)||age<0||age>60000)throw new Error("Review fresh matching PayPal evidence before reconciliation.");
    const next=matchExternalReceipt(c,receiptId,matches);financials(next);Object.assign(c,next);
    changed(w,c,"Owner explicitly matched offline receipt to external payment records. No double subtraction; no PayPal payment verification implied.");
  });
}
export function confirmClearance(id:string,receiptId:string,checkNumber?:string) {
  if(checkNumber!==undefined&&(typeof checkNumber!=="string"||!checkNumber.trim()||checkNumber.trim().length>80))throw new Error("Enter a check number within 80 characters.");
  mutate(w=>{
    const c=caseFor(w,id);
    const receipt=c.receipts.find(r=>r.id===receiptId&&!r.voided&&r.kind==="check");
    if(!receipt)throw new Error("Check receipt not found. Refresh the case and review its received payments.");
    if(receipt.state==="cleared"){if(checkNumber&&receipt.checkNumber!==checkNumber.trim())throw new Error("This check was already cleared. Review its saved reference.");return;}
    if(checkNumber)receipt.checkNumber=checkNumber.trim();
    receipt.state="cleared";
    changed(w,c,"Owner confirmed check clearance. This is offline evidence, not PayPal verification.");
  });
}
export function voidReceipt(id:string,receiptId:string,reason:string,version:number){
  mutate(w=>{const c=caseFor(w,id),r=c.receipts.find(r=>r.id===receiptId);
    if(!r)throw new Error("Receipt not found.");
    if(typeof reason!=="string"||!reason.trim()||reason.trim().length>500)throw new Error("Enter a correction reason within 500 characters.");
    if(r.voided){if(r.voided.reason!==reason.trim())throw new Error("Receipt correction retry does not match.");return;}
    if(c.version!==version)throw new Error("The case changed. Review the receipt again.");
    r.voided={at:new Date().toISOString(),reason:reason.trim()};
    // A correction never triggers pursuit. Keep stops/disputes, and require
    // review if the receipt had already been matched to provider evidence.
    if(c.hold==="none")c.hold="owner-review";
    if(r.providerMatches?.length)c.reconciliationRequired=true;
    financials(c);changed(w,c,`Receipt ${r.id} voided by owner. Original record preserved; follow-up held. Reason: ${reason.trim()}`);
  });
}
export function resolveReceiptCorrections(id:string,version:number,note:string){
  mutate(w=>{const c=caseFor(w,id);
    if(c.version!==version)throw new Error("The case changed. Review corrected receipts again.");
    if(typeof note!=="string"||!note.trim()||note.trim().length>500)throw new Error("Enter the basis for reviewing these corrections within 500 characters.");
    const {binding}=sandboxConfiguration(),age=Date.now()-Date.parse(c.evidenceAt);
    if(c.source!=="paypal-sandbox"||c.providerBinding!==binding||c.evidenceStatus!=="ready"||!Number.isFinite(age)||age<0||age>60000)throw new Error("Review fresh matching PayPal evidence before resolving corrections.");
    if(!c.reconciliationRequired||!c.receipts.some(r=>r.voided)||c.receipts.some(r=>!r.voided&&r.allocations.some(a=>!r.providerMatches?.some(m=>m.invoiceId===a.invoiceId))))throw new Error("Review all active receipts against PayPal before resolving corrections.");
    c.reconciliationRequired=false;financials(c);
    if(c.hold==="none")c.hold="owner-review";
    changed(w,c,`Owner reviewed corrected receipts against fresh PayPal evidence. Financial records unchanged; manual hold remains. Note: ${note.trim()}`);
  });
}
export function saveContactPermission(id:string,version:number,input:{email:string;verified:boolean;emailAllowed:boolean;voiceAllowed:boolean;phone:string;note:string;evidence?:unknown}){
  mutate(w=>{const c=caseFor(w,id);
    if(c.version!==version)throw new Error("The case changed. Review contact permissions again.");
    if(typeof input.email!=="string"||!simpleEmail(input.email.trim())||/[\r\n]/.test(input.email))throw new Error("Enter a valid billing email.");
    if(typeof input.verified!=="boolean"||typeof input.emailAllowed!=="boolean"||typeof input.voiceAllowed!=="boolean"||typeof input.phone!=="string"||typeof input.note!=="string"||!input.note.trim()||input.note.trim().length>500)throw new Error("Enter the basis for these contact permissions within 500 characters.");
    if(input.phone&&!/^\+[1-9]\d{6,14}$/.test(input.phone))throw new Error("Enter the phone number in international format, for example +12025550123.");
    if(input.voiceAllowed&&(!input.verified||!input.phone))throw new Error("Verify the contact and record the consented phone number before allowing voice.");
    const at=new Date().toISOString(),evidence=input.evidence===undefined?undefined:validatePermissionEvidence(input.evidence,new Date(at));
    c.contact=input.email.trim();c.verifiedContact=input.verified;
    c.contactPermission={emailAllowed:input.emailAllowed,voiceAllowed:input.voiceAllowed,phone:input.phone,note:input.note.trim(),reviewedAt:at};
    // Preserve each review; legacy current flags are never backfilled as proof.
    (c.permissionReviews??=[]).push({id:randomUUID(),at,merchantId:c.merchantId,caseId:c.id,email:c.contact,phone:input.phone,verified:input.verified,emailAllowed:input.emailAllowed,voiceAllowed:input.voiceAllowed,note:input.note.trim(),...(evidence?{evidence}:{})});
    changed(w,c,"Owner reviewed billing contact and channel permissions. This does not remove a dispute or stop request, or activate delivery.");
  });
}
export function saveAiPreference(paused:boolean,revision:number){
  mutate(w=>{const current=w.controls??defaultControls;
    if(typeof paused!=="boolean"||!Number.isSafeInteger(revision))throw new Error("Choose a valid AI preference.");
    if(revision!==current.revision)throw new Error("Review settings again; another change was saved.");
    w.controls={...current,revision:current.revision+1,aiPaused:paused};
    event(w,`Owner ${paused?"paused AI suggestions":"allowed AI suggestions within existing service limits"}. Allowances and server activation unchanged.`);
  });
}
export function saveFollowupPreference(channel:"email"|"voice",paused:boolean,revision:number){
  mutate(w=>{const current=w.controls??defaultControls;
    if(!["email","voice"].includes(channel)||typeof paused!=="boolean"||!Number.isSafeInteger(revision))throw new Error("Choose a valid follow-up preference.");
    if(revision!==current.revision)throw new Error("Review settings again; another change was saved.");
    w.controls={...current,revision:current.revision+1,[channel==="email"?"emailPaused":"voicePaused"]:paused};
    event(w,`Owner ${paused?"paused":"allowed"} new ${channel==="email"?"email reminders":"AI calls"} within existing service limits. Existing attempts, holds and allowances unchanged.`);
  });
}
export function savePriorityPreference(days:number,revision:number){mutate(w=>{const current=w.controls??defaultControls;if(!Number.isSafeInteger(days)||days<1||days>3650||!Number.isSafeInteger(revision))throw new Error("Enter an urgent overdue threshold from 1 to 3650 days.");if(current.revision!==revision)throw new Error("Review settings again; another change was saved.");w.controls={...current,revision:current.revision+1,urgentOverdueDays:days};event(w,`Owner set urgent overdue attention to ${days} days. Disputes and relationship concerns remain urgent regardless of balance. Contact rules and allowances unchanged.`);});}
export function saveWorkspaceControls(input:WorkspaceControls){
  mutate(w=>{const current=w.controls??defaultControls;
    if(input.revision!==current.revision)throw new Error("Review settings again; another change was saved.");
    if(typeof input.aiPaused!=="boolean"||!Number.isSafeInteger(input.aiRequestCap)||input.aiRequestCap<0||input.aiRequestCap>20)throw new Error("Enter an AI allowance from zero to twenty requests.");
    w.controls={...current,revision:current.revision+1,aiPaused:input.aiPaused,aiRequestCap:input.aiRequestCap};
    event(w,`Workspace AI controls saved: ${input.aiPaused?"paused":"subject to server activation"}, ${input.aiRequestCap} total requests. Existing usage was not reset. Delivery remains off.`);
  });
}
export function recordPastedReply(id:string,text:string,operationId:string){
  mutate(w=>{const c=caseFor(w,id);
    if(typeof text!=="string"||!text.trim()||text.trim().length>4000||!/^[a-zA-Z0-9-]{8,64}$/.test(operationId))throw new Error("Enter a customer reply within 4000 characters.");
    const existing=c.pastedReplies?.find(r=>r.id===operationId);
    if(existing){if(existing.text!==text.trim())throw new Error("Review the reply retry; its text changed.");return;}
    if((c.pastedReplies?.length??0)>=20)throw new Error("Review the twenty replies already saved in this controlled test case.");
    (c.pastedReplies??=[]).push({id:operationId,text:text.trim(),at:new Date().toISOString(),source:"owner-pasted"});
    if(c.hold==="none")c.hold="owner-review";
    changed(w,c,"Owner pasted a customer reply for review. Follow-up held; no mailbox source verification or payment verification implied.");
  });
}
export function reserveAiReply(id:string,replyId:string,limit:number){
  return mutate(w=>{const c=caseFor(w,id),context=replyContext(c,replyId),run=reserveAi(w,c,limit);
    run.purpose="reply";run.replyId=replyId;return {runId:run.id,context};
  });
}
export function completeAiReply(runId:string,value:unknown,provider:string,model:string){
  return mutate(w=>{const run=w.aiRuns?.find(r=>r.id===runId&&r.state==="pending"&&r.purpose==="reply");
    if(!run?.replyId)throw new Error("Review the pending reply request.");
    const c=caseFor(w,run.caseId);
    if(c.version!==run.caseVersion)throw new Error("The case changed during reply interpretation.");
    const context=replyContext(c,run.replyId),proposal=validateReplyProposal(value,context);
    c.pastedReplies!.find(r=>r.id===run.replyId)!.proposal={...proposal,provider,model};run.state="succeeded";
    changed(w,c,"AI suggested a reply interpretation for owner review. Hold, permissions, dates and financial facts were not changed.");
    return proposal;
  });
}
export function reserveEmailDelivery(id:string,draftId:string,approvalId:string,version:number,evidence:SandboxInvoice[],binding:string,from:string,recipient:string,limit:number,delivery?:{provider:string;binding:string;replyTo?:string}):{blocked?:string;attempt?:EmailAttempt;reused?:boolean}{
  return mutate(w=>{const c=caseFor(w,id),attempts=w.emailAttempts??=[];
    if(w.controls?.emailPaused)throw new Error("Email reminders are paused by the owner in Settings.");
    const existing=attempts.find(a=>a.approvalId===approvalId&&a.caseId===id);
    if(existing){if(existing.draftId!==draftId||existing.from!==from||existing.to!==recipient)throw new Error("Review the original email attempt; retry details changed.");return {attempt:existing,reused:true};}
    if(!Number.isSafeInteger(limit)||limit<1||limit>3||attempts.length>=limit)throw new Error("Review email usage: the configured test allowance is exhausted or disabled.");
    if(c.version!==version)throw new Error("The case changed before delivery. Review again.");
    if(c.source!=="paypal-sandbox"||c.providerBinding!==binding||c.evidenceStatus!=="ready")throw new Error("Review fresh matching sandbox evidence before delivery.");
    if(!simpleEmail(from)||!simpleEmail(recipient)||c.contact!==recipient||!c.contactPermission?.emailAllowed||!c.verifiedContact)throw new Error("Contact permission or the exact allowed test recipient does not match.");
    if(!hasSelfTestEmailEvidence(c))throw new Error("Review recorded self-test permission evidence before sending. Legacy contact checks do not authorize delivery.");
    if(attempts.some(a=>a.caseId===id&&(a.state==="reserved"||a.state==="unknown")))throw new Error("Review the email attempt with an uncertain outcome before another contact.");
    const d=w.drafts.find(d=>d.id===draftId&&d.caseId===id),a=w.approvals.find(a=>a.id===approvalId&&a.caseId===id);
    if(!d||!a)throw new Error("Exact owner approval is required for this email.");
    const next=applyProviderEvidence(c,evidence);
    const signature=(invoices:ClientCase["invoices"])=>JSON.stringify(invoices, (key,value)=>key==="checkedAt"?undefined:value);
    if(signature(c.invoices)!==signature(next.invoices)||Boolean(next.reconciliationRequired)!==Boolean(c.reconciliationRequired)){
      Object.assign(c,next);changed(w,c,"Fresh pre-delivery PayPal evidence changed. Approval invalidated; no email attempted.");
      return {blocked:"Review changed PayPal evidence before approving another message."};
    }
    Object.assign(c,next);c.evidenceStatus="ready";
    const gate=approvalGate(c,d,a,DEMO_OWNER,new Date());if(!gate.eligible)throw new Error(gate.reason);
    // Fresh evidence, a verified test destination, exact approval and an atomic
    // allowance reservation are required together. No job can auto-retry.
    const attempt:EmailAttempt={id:randomUUID(),caseId:id,draftId:d.id,approvalId:a.id,at:new Date().toISOString(),from,to:recipient,subject:d.subject,text:d.body,state:"reserved"};
    if(delivery?.replyTo!==undefined){if(!simpleEmail(delivery.replyTo))throw new Error("Review the approved reply mailbox.");attempt.replyTo=/^[a-z0-9.]+@gmail\.com$/i.test(delivery.replyTo)?replyAddress(delivery.replyTo,attempt.id):delivery.replyTo;}
    if(delivery){if(!["resend","gmail","postmark","ses"].includes(delivery.provider)||!/^[a-f0-9]{64}$/.test(delivery.binding))throw new Error("Review the delivery account binding.");attempt.deliveryProvider=delivery.provider;attempt.deliveryBinding=delivery.binding;}
    attempts.push(attempt);w.approvals=w.approvals.filter(x=>x.id!==a.id);
    if(c.hold==="none")c.hold="owner-review";
    changed(w,c,"One approved test email attempt reserved. Pursuit held until the outcome is reviewed; no automatic retry.");
    return {attempt,reused:false};
  });
}
export function finishEmailDelivery(attemptId:string,providerId:string|null,knownNotSent=false){
  mutate(w=>{const a=w.emailAttempts?.find(a=>a.id===attemptId&&a.state==="reserved");if(!a)return;
    const c=caseFor(w,a.caseId);
    if(providerId&&/^[a-zA-Z0-9-]{1,100}$/.test(providerId)){a.state="accepted";a.providerId=providerId;c.lastContactAt=a.at;}
    else a.state=knownNotSent?"blocked":"unknown";
    changed(w,c,a.state==="blocked"?"Email blocked before dispatch by spending controls. Nothing sent; owner review required.":a.state==="accepted"?"Email provider accepted the test message. Delivery is unconfirmed; follow-up remains held.":"Email attempt outcome is unknown. Follow-up held; reservation consumed and automatic resend blocked.");
  });
}
export function setPause(id:string,paused:boolean) {
  mutate(w=>{const c=caseFor(w,id);if(c.hold==="suppressed"||c.hold==="dispute")throw new Error("This exception needs an explicit owner resolution.");if(!paused&&relationshipConcernOpen(c))throw new Error("Review and resolve the relationship concern before resuming reminders.");if(!paused&&hasUnreviewedReply(c))throw new Error("Review the customer reply and record an outcome before resuming follow-up.");c.hold=paused?"owner-review":"none";changed(w,c,paused?"Owner paused follow-up.":"Owner removed manual pause; payment and receipt checks still apply.");});
}
export function recordCustomerUpdate(id:string,kind:"payment-claim"|"promise"|"dispute"|"stop"|"relationship-concern"|"relationship-resolved",note:string,followUpAt:string|null,operationId:string){
  mutate(w=>{const c=caseFor(w,id);
    if(!["payment-claim","promise","dispute","stop","relationship-concern","relationship-resolved"].includes(kind)||typeof note!=="string"||note.trim().length>1000||!note.trim())throw new Error("Enter a brief customer update.");
    if(!/^[a-zA-Z0-9-]{8,64}$/.test(operationId))throw new Error("A valid update operation is required.");
    const existing=c.customerUpdates?.find(u=>u.id===operationId);
    if(existing){if(existing.kind!==kind||existing.note!==note.trim()||existing.followUpAt!==followUpAt)throw new Error("The customer update retry does not match.");return;}
    if(kind==="promise"){
      const date=typeof followUpAt==="string"?Date.parse(followUpAt):NaN;
      if(!Number.isFinite(date)||date<=Date.now()||date>Date.now()+366*86400000)throw new Error("Choose a future review date within one year.");
      c.nextActionAt=new Date(date).toISOString();
    }else if(followUpAt!==null)throw new Error("Choose a review date only for a confirmed promise.");
    if((kind==="relationship-concern"||kind==="relationship-resolved")&&c.hold==="none")c.hold="owner-review";
    if(kind==="payment-claim"&&c.hold==="none")c.hold="owner-review";
    if(kind==="dispute"&&c.hold!=="suppressed")c.hold="dispute";
    if(kind==="stop")c.hold="suppressed";
    (c.customerUpdates??=[]).push({id:operationId,kind,note:note.trim(),followUpAt,at:new Date().toISOString(),source:"owner-recorded"});
    const meaning={"relationship-concern":"Owner recorded a relationship concern; human review required even if fully paid.","relationship-resolved":"Owner recorded relationship concern resolved; existing follow-up holds and payment checks remain.","payment-claim":"Customer reports payment; verification required. No balance changed.",promise:"Customer promise recorded; wait until the confirmed review date. No balance changed.",dispute:"Dispute recorded; ordinary pursuit held for owner resolution.",stop:"Contact stop recorded; ordinary pursuit suppressed."};
    changed(w,c,`Owner-recorded update: ${meaning[kind]} Note: ${note.trim()}`);
  });
}

// Internal normalized intake only. The receiving adapter must authenticate its
// raw request before invoking this function; there is no public intake route yet.
// Internal authenticated mailbox adapter only; never accept these fields from an HTTP client.
export function recordMailboxDelivery(input:{attemptId:string;mailbox:string;binding:string;messageId:string;replyTo:string}){
 mutate(w=>{const a=w.emailAttempts?.find(a=>a.id===input.attemptId);if(!a||a.state!=="accepted"||a.to.toLowerCase()!==input.mailbox.toLowerCase()||a.replyTo!==input.replyTo||a.replyTo!==replyAddress(input.mailbox,a.id)||!/^[a-f0-9]{64}$/.test(input.binding)||!/^[a-f0-9]{1,64}$/i.test(input.messageId))throw new Error("Received-copy evidence does not match the accepted test reminder.");
 if(a.receivedCopy){if(a.receivedCopy.messageId!==input.messageId)throw new Error("Review multiple received test copies.");return;}
 a.receivedCopy={at:new Date().toISOString(),mailboxBinding:input.binding,messageId:input.messageId};const c=caseFor(w,a.caseId);changed(w,c,"One matching reminder copy confirmed in the authorized test mailbox. This does not prove a human read it or verify payment; follow-up remains held.");});
}

export function recordMailboxReply(input:{connectionBinding:string;mailbox:string;messageId:string;alias:string;from:string;text:string}){
 return mutate(w=>{
  if(!/^[a-f0-9]{64}$/.test(input.connectionBinding)||!/^[a-f0-9]{1,64}$/i.test(input.messageId)||!simpleEmail(input.mailbox)||!simpleEmail(input.from)||!input.text.trim()||input.text.length>4000)throw new Error("Invalid mailbox reply.");
  const id=createHash("sha256").update(`gmail-inbox:${input.mailbox.toLowerCase()}:${input.messageId}`).digest("hex"),fingerprint=createHash("sha256").update(JSON.stringify({mailbox:input.mailbox.toLowerCase(),messageId:input.messageId,alias:input.alias,from:input.from,text:input.text})).digest("hex"),events=w.inboundEvents??=[];
  const previous=events.find(e=>e.id===id);if(previous){if(previous.fingerprint!==fingerprint)throw new Error("Incoming event changed after processing.");return previous;}
  const matches=(w.emailAttempts??[]).filter(a=>a.state==="accepted"&&a.replyTo===input.alias&&a.replyTo===replyAddress(input.mailbox,a.id)&&a.to.toLowerCase()===input.from.toLowerCase());
  const c=matches.length===1?w.cases.find(c=>c.id===matches[0].caseId&&c.merchantId===DEMO_OWNER.merchantId):undefined;
  const result:{id:string;fingerprint:string;at:string;result:"matched"|"unmatched";caseId?:string}={id,fingerprint,at:new Date().toISOString(),result:c?"matched":"unmatched"};
  if(c){result.caseId=c.id;if(c.hold==="none")c.hold="owner-review";(c.pastedReplies??=[]).push({id,at:result.at,text:input.text,source:"provider-received"});changed(w,c,"Authenticated mailbox reply matched to one sent reminder. Follow-up held before AI review; payment and contact identity remain unverified.");}
  else event(w,"Mailbox reply could not match one accepted reminder. Operator review required; no customer facts changed.");
  events.push(result);return result;
 });
}

export function recordTransportReply(input:{eventId:string;provider:string;binding:string;originalProviderId:string;from:string;text:string}){
 return mutate(w=>{
  if(!/^[A-Za-z0-9._:-]{1,120}$/.test(input.eventId)||!["resend","postmark","ses"].includes(input.provider)||!/^[a-f0-9]{64}$/.test(input.binding)||!/^[A-Za-z0-9._@<>:-]{1,200}$/.test(input.originalProviderId)||!simpleEmail(input.from)||typeof input.text!=="string"||!input.text.trim()||input.text.length>4000)throw new Error("Incoming reply needs a supported, bounded envelope.");
  const id=createHash("sha256").update(`${input.provider}:${input.binding}:${input.eventId}`).digest("hex"),fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex"),events=w.inboundEvents??=[];
  const existing=events.find(e=>e.id===id);if(existing){if(existing.fingerprint!==fingerprint)throw new Error("Incoming event changed after processing.");return existing;}
  const matches=(w.emailAttempts??[]).filter(a=>a.deliveryProvider===input.provider&&a.deliveryBinding===input.binding&&a.providerId===input.originalProviderId&&a.to.toLowerCase()===input.from.toLowerCase());
  const matched=matches.length===1?matches[0]:undefined,c=matched?w.cases.find(c=>c.id===matched.caseId&&c.merchantId===DEMO_OWNER.merchantId):undefined;
  const result:{id:string;fingerprint:string;at:string;result:"matched"|"unmatched";caseId?:string}={id,fingerprint,at:new Date().toISOString(),result:c?"matched":"unmatched"};
  if(c){
   result.caseId=c.id;if(c.hold==="none")c.hold="owner-review";
   (c.pastedReplies??=[]).push({id,at:result.at,text:input.text.trim(),source:"provider-received"});
   changed(w,c,"Reply matched to an outbound test message. Follow-up held before interpretation. Transport provenance does not verify payment or the sender's identity.");
  }else event(w,"Incoming reply could not be matched safely. Local operator review required; no client facts changed.");
  events.push(result);return result;
 });
}


export function prepareVoiceReview(id:string,version:number){
 return mutate(w=>{const c=caseFor(w,id);if(c.version!==version)throw new Error("The case changed. Review voice facts again.");const now=new Date(),context=prepareVoiceContext(c,DEMO_OWNER,now),fingerprint=voiceContextFingerprint(context);const existing=w.voiceReviews?.find(r=>r.fingerprint===fingerprint);if(existing)return existing;const review:VoiceContextReview={id:randomUUID(),createdAt:now.toISOString(),fingerprint,context};(w.voiceReviews??=[]).push(review);event(w,`${c.name}: voice facts saved for local review only. No call approved or placed.`);return review;});
}


// Internal lifecycle foundation. No public dispatch/outcome endpoint. A future
// authenticated provider adapter must call these with trusted exact bindings.
export function approveVoicePurpose(caseId:string,reviewId:string,profile:VoiceProfile){
 return mutate(w=>{const c=caseFor(w,caseId),review=w.voiceReviews?.find(r=>r.id===reviewId&&r.context.caseId===caseId);if(!review)throw new Error("Review saved call facts first.");recheckVoiceContext(review,c,DEMO_OWNER);const pinned=validateVoiceProfile(profile);const approval:VoicePurposeApproval={id:randomUUID(),reviewId,contextFingerprint:review.fingerprint,profile:pinned,expiresAt:review.context.expiresAt,fingerprint:"",state:"approved"};approval.fingerprint=voicePurposeFingerprint(approval);w.voiceApprovals=(w.voiceApprovals??[]).filter(a=>a.reviewId!==reviewId||a.state==="consumed");w.voiceApprovals.push(approval);event(w,`${c.name}: exact local voice purpose reviewed. No call placed.`);return approval;});
}
export function reserveVoiceCall(caseId:string,approvalId:string,profile:VoiceProfile,providerBinding:string,limit:number){
 return mutate(w=>{
    if(w.controls?.voicePaused)throw new Error("AI calls are paused by the owner in Settings.");const c=caseFor(w,caseId),calls=w.voiceCalls??=[];if(!Number.isSafeInteger(limit)||limit<1||limit>3||calls.length>=limit||calls.some(r=>r.state!=="ended"))throw new Error("Review the exhausted or unresolved voice allowance.");if(!/^[a-f0-9]{64}$/.test(providerBinding))throw new Error("Review the voice provider binding.");if((limit===2||limit===3)&&(calls.length!==limit-1||c.voiceRetest?.state!=="approved"||c.voiceRetest.id!==process.env.NALBACE_VOICE_RETEST_AUTHORIZATION||c.voiceRetest.phone!==c.contactPermission?.phone||Date.parse(c.voiceRetest.expiresAt)<=Date.now()))throw new Error("A separate unconsumed bounded retest grant is required.");const a=w.voiceApprovals?.find(a=>a.id===approvalId),r=w.voiceReviews?.find(r=>r.id===a?.reviewId&&r.context.caseId===caseId);if(!a||!r||a.state!=="approved"||a.contextFingerprint!==r.fingerprint||a.fingerprint!==voicePurposeFingerprint(a)||JSON.stringify(validateVoiceProfile(profile))!==JSON.stringify(a.profile))throw new Error("Exact current voice-purpose approval is required.");recheckVoiceContext(r,c,DEMO_OWNER);const call:VoiceCallRecord={id:randomUUID(),caseId,merchantId:c.merchantId,approvalId,reviewId:r.id,providerBinding,profile:a.profile,state:"reserved",at:new Date().toISOString(),outcomes:[]};calls.push(call);if(c.voiceRetest)c.voiceRetest.state="consumed";a.state="consumed";c.lastContactAt=call.at;if(c.hold==="none")c.hold="owner-review";changed(w,c,"Voice attempt reserved; other follow-up held pending the call result. Reservation is not proof a call was placed.");return call;});
}
export function recordVoiceDispatch(callId:string,binding:string,result:{state:"accepted";providerCallId:string}|{state:"unknown"}){
 return mutate(w=>{if(!result||!["accepted","unknown"].includes(result.state))throw new Error("Review a valid voice dispatch result.");const call=w.voiceCalls?.find(r=>r.id===callId&&r.merchantId===DEMO_OWNER.merchantId&&r.providerBinding===binding);if(!call)throw new Error("Review the exact voice attempt binding.");if(result.state==="accepted"&&!/^[A-Za-z0-9_-]{1,100}$/.test(result.providerCallId))throw new Error("Review the provider call identity.");if(call.state!=="reserved"){if(call.state===result.state&&(result.state==="unknown"||call.providerCallId===result.providerCallId))return call;throw new Error("Review the previously recorded voice outcome; no automatic retry.");}if(result.state==="accepted"&&w.voiceCalls?.some(r=>r.id!==call.id&&r.providerBinding===binding&&r.providerCallId===result.providerCallId))throw new Error("Review duplicate provider call identity.");call.state=result.state;if(result.state==="accepted")call.providerCallId=result.providerCallId;event(w,"Voice dispatch result recorded; acceptance is not a completed conversation.");return call;});
}
export function recordTrustedVoiceOutcome(input:{callId:string;providerCallId:string;binding:string;eventId:string;kind:VoiceOutcome;quote?:string}){
 return mutate(w=>{if((input.quote!==undefined&&(input.kind!=="dispute"||typeof input.quote!=="string"||!input.quote.trim()||input.quote.length>1000))||!/^[A-Za-z0-9._:-]{1,120}$/.test(input.eventId)||!["stop","payment-claim","dispute","promise","copy-request","wrong-person","completed"].includes(input.kind))throw new Error("Review a bounded voice event.");const call=w.voiceCalls?.find(r=>r.id===input.callId&&r.providerBinding===input.binding&&r.providerCallId===input.providerCallId&&r.merchantId===DEMO_OWNER.merchantId);if(!call||!["accepted","ended"].includes(call.state))throw new Error("Review the bound provider call before accepting an outcome.");const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex"),existing=call.outcomes.find(e=>e.eventId===input.eventId);if(existing){if(existing.fingerprint!==fingerprint)throw new Error("Review changed duplicate voice event.");return call;}const c=caseFor(w,call.caseId);call.outcomes.push({eventId:input.eventId,kind:input.kind,...(input.quote?{quote:input.quote}:{}),fingerprint,at:new Date().toISOString()});if(input.kind==="dispute"&&input.quote)c.voiceDisputeEvidence={quote:input.quote,callId:call.id,recordedAt:new Date().toISOString()};if(input.kind==="stop")c.hold="suppressed";else if(input.kind==="dispute"&&c.hold!=="suppressed")c.hold="dispute";else if(c.hold==="none")c.hold="owner-review";changed(w,c,`Voice outcome recorded: ${input.kind}. Financial evidence and review dates unchanged; owner review required.`);return call;});
}
export function confirmVoiceEnded(callId:string,binding:string,providerCallId:string){
 return mutate(w=>{const call=w.voiceCalls?.find(r=>r.id===callId&&r.providerBinding===binding&&r.providerCallId===providerCallId&&r.merchantId===DEMO_OWNER.merchantId);if(!call||!["accepted","ended"].includes(call.state))throw new Error("Review the exact provider call before confirming ending.");if(call.state!=="ended"){call.state="ended";event(w,"Provider-confirmed call ending recorded. Follow-up holds remain for owner review.");}return call;});
}

// Internal only: called after unchanged authenticated PayPal readback. This
// records active-call freshness without extending an approval or changing money.
export function recordVoicePaymentCheck(callId:string,caseVersion:number,paypalBinding:string,checkedAt:string){
 return mutate(w=>{const call=w.voiceCalls?.find(item=>item.id===callId&&item.state==="accepted"&&item.merchantId===DEMO_OWNER.merchantId);if(!call)throw new Error("Review the active voice call.");const c=caseFor(w,call.caseId),time=Date.parse(checkedAt);if(c.version!==caseVersion||c.providerBinding!==paypalBinding||!Number.isFinite(time)||time<Date.parse(call.at)||time>Date.now()||Date.now()-time>60000)throw new Error("Review unchanged fresh voice payment evidence.");call.paymentCheckedAt=checkedAt;});
}

// Operator-only controlled self-test exception. Never clears a customer stop,
// dispute, payment claim, unknown call or unrelated hold; retains contact history.
export function authorizeRecordingVoiceTest(caseId:string,grantId:string){
  mutate(w=>{
    const client=caseFor(w,caseId);
    const calls=w.voiceCalls??[];
    if(caseId!=="sandbox-recording-call"||calls.length!==2||calls.some(call=>call.state!=="ended")||client.hold!=="none"||client.voiceRetest||!client.contactPermission?.voiceAllowed||client.aiCallPreference!=="allow"||!/^[a-f0-9]{64}$/.test(grantId))throw new Error("Review the exact fresh recording test and prior completed calls.");
    client.voiceRetest={id:grantId,priorCallId:calls.at(-1)!.id,phone:client.contactPermission.phone,expiresAt:new Date(Date.now()+600000).toISOString(),state:"approved"};
    changed(w,client,"Owner authorized one fresh recording call to the saved test number, at most 60 seconds and 50 cents. Prior attempts retained.");
  });
}

export function authorizeVoiceRetest(caseId:string,grantId:string){
 return mutate(w=>{const c=caseFor(w,caseId),calls=w.voiceCalls??[],prior=calls.at(-1);if(caseId!=="sandbox-voice-test"||calls.length!==1||prior?.caseId!==caseId||prior.state!=="ended"||prior.outcomes.some(o=>o.kind!=="completed")||c.hold!=="owner-review"||c.voiceRetest||!c.contactPermission?.voiceAllowed||!/^[a-f0-9]{64}$/.test(grantId))throw new Error("Review the original controlled test before granting one retest.");c.voiceRetest={id:grantId,priorCallId:prior.id,phone:c.contactPermission.phone,expiresAt:new Date(Date.now()+600000).toISOString(),state:"approved"};c.hold="none";changed(w,c,"Owner explicitly authorized one additional synthetic phone test, at most 60 seconds and 50 cents trial usage. Prior attempt and contact history retained.");});
}

export function reviewDispute(caseId:string,version:number,input:{resolution:"still-open"|"resolved";note:string;reference:string;nextAction?:string;reviewAt?:string;operationId:string}){
 return mutate(w=>{const c=caseFor(w,caseId);if(!input||!["still-open","resolved"].includes(input.resolution)||typeof input.note!=="string"||!input.note.trim()||input.note.trim().length>1000||typeof input.reference!=="string"||(input.resolution==="resolved"&&!input.reference.trim())||input.reference.trim().length>300||!/^[A-Za-z0-9-]{8,64}$/.test(input.operationId)||!Number.isSafeInteger(version))throw new Error("Enter a valid dispute review and supporting reference.");const permitted=input.resolution==="still-open"?["review-records","request-details","correct-invoice","check-later"]:["verify-payment","payment-promise","review-overdue"];
 if(input.nextAction!==undefined&&!permitted.includes(input.nextAction))throw new Error("Choose a valid dispute next action.");
 const needsDate=input.nextAction==="check-later"||input.nextAction==="payment-promise";
 const reviewDate=typeof input.reviewAt==="string"?Date.parse(input.reviewAt):NaN;
 const today=new Date();today.setHours(0,0,0,0);
 if(needsDate?(!Number.isFinite(reviewDate)||reviewDate<today.getTime()||reviewDate>Date.now()+366*86400000):input.reviewAt!==undefined)throw new Error("Choose a review date within the next year.");
 const existing=c.disputeReviews?.find(r=>r.id===input.operationId);if(existing){if(existing.caseVersion!==version||existing.resolution!==input.resolution||existing.note!==input.note.trim()||existing.reference!==input.reference.trim()||existing.nextAction!==input.nextAction||existing.reviewAt!==input.reviewAt)throw new Error("The saved review does not match this retry.");return;}if(c.version!==version||c.hold!=="dispute")throw new Error("Review the current dispute; a stop or changed case cannot be overridden.");if(input.resolution==="resolved"){const age=Date.now()-Date.parse(c.evidenceAt);if(c.reconciliationRequired||(c.source==="paypal-sandbox"&&(c.evidenceStatus!=="ready"||age<0||age>60000||c.invoices.some(i=>!i.evidence||i.evidence.dueMinor===null))))throw new Error("Refresh and reconcile current payment evidence before resolving the dispute.");financials(c);c.hold="owner-review";
 if(input.nextAction==="payment-promise"&&input.reviewAt)c.nextActionAt=new Date(reviewDate).toISOString();
 if(w.controls?.reminderPolicy?.enabled&&(input.nextAction==="review-overdue"||input.nextAction==="payment-promise"||financials(c).remainingMinor===0)){
   c.hold="none";
   if(input.nextAction==="review-overdue")c.nextActionAt=new Date().toISOString();
 }} (c.disputeReviews??=[]).push({id:input.operationId,at:new Date().toISOString(),caseVersion:version,resolution:input.resolution,note:input.note.trim(),reference:input.reference.trim(),nextAction:input.nextAction,reviewAt:input.reviewAt,evidenceAt:c.evidenceAt});changed(w,c,input.resolution==="resolved"?"Owner recorded dispute resolution. Follow-up remains paused; financial evidence unchanged.":"Owner reviewed dispute; it remains open and follow-up is held.");});
}

export function renameClient(caseId:string,version:number,name:string){return mutate(w=>{const c=caseFor(w,caseId);if(c.version!==version||typeof name!=="string"||!name.trim()||name.trim().length>120||/[\x00-\x1f\x7f]/.test(name))throw new Error("Enter a valid current client or business name.");c.name=name.trim();changed(w,c,"Owner updated the client display name. Contact permissions and financial evidence unchanged.");});}

export function editClientDetails(caseId:string,version:number,input:{name:string;email:string;phone:string;operationId:string}){return mutate(w=>{const c=caseFor(w,caseId);if(!input||typeof input.name!=="string"||!input.name.trim()||input.name.trim().length>120||/[\x00-\x1f\x7f]/.test(input.name)||typeof input.email!=="string"||!simpleEmail(input.email.trim())||/[\r\n]/.test(input.email)||typeof input.phone!=="string"||(input.phone!==""&&!/^\+[1-9]\d{6,14}$/.test(input.phone))||!/^[A-Za-z0-9-]{8,64}$/.test(input.operationId)||!Number.isSafeInteger(version))throw new Error("Enter a valid client name, billing email and international phone number.");const fingerprint=createHash("sha256").update(JSON.stringify([version,input.name.trim(),input.email.trim(),input.phone])).digest("hex"),existing=c.profileEdits?.find(e=>e.id===input.operationId);if(existing){if(existing.fingerprint!==fingerprint)throw new Error("This edit retry differs from the saved change.");return;}if(c.version!==version)throw new Error("The client changed. Review the current details before saving.");const emailChanged=input.email.trim()!==c.contact,phoneChanged=input.phone!==(c.contactPermission?.phone??"");c.name=input.name.trim();c.contact=input.email.trim();if(emailChanged||phoneChanged){c.verifiedContact=false;const p=c.contactPermission;c.contactPermission={emailAllowed:emailChanged?false:p?.emailAllowed??false,voiceAllowed:phoneChanged?false:p?.voiceAllowed??false,phone:input.phone,note:"Client contact details changed; review channel permissions before further follow-up.",reviewedAt:p?.reviewedAt??new Date().toISOString()};} (c.profileEdits??=[]).push({id:input.operationId,fingerprint});changed(w,c,emailChanged||phoneChanged?"Owner changed client contact details. Changed-channel permissions disabled; verification required. Existing stops/disputes and financial evidence preserved.":"Owner changed the client display name. Financial evidence and contact permissions unchanged.");});}
