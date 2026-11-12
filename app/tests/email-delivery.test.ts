import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {readWorkspace,saveSandboxImport,saveContactPermission,prepareDraft,approveDraft,reserveEmailDelivery,finishEmailDelivery,recordCustomerUpdate} from "../src/server/store.ts";
import {emailConfiguration,submitTestEmail,deliverApprovedTestEmail} from "../src/server/email-delivery.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import type {EmailAttempt} from "../src/domain/email-delivery.ts";
function temporary(fn:()=>void){const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-email-")));try{fn();}finally{process.chdir(before);}}
const evidence=(due="25.00",status="UNPAID")=>normalizeSandboxInvoice({id:"INV2-EMAILTEST",status,detail:{invoice_number:"EMAILTEST",payment_term:{due_date:"2026-01-01"}},due_amount:{currency_code:"USD",value:due}},new Date().toISOString());
const sender="sender@example.test",recipient="owner@example.test";
function approved(basis:"self-test"|"recipient-record"|"legacy"="self-test"){
  saveSandboxImport(evidence(),"binding-a");let c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;
  saveContactPermission(c.id,c.version,{email:recipient,verified:true,emailAllowed:true,voiceAllowed:false,phone:"",note:"Own controlled test mailbox.",...(basis==="legacy"?{}:{evidence:{basis,wording:"I agree to one synthetic invoice reminder at my own test mailbox from this merchant using Nalbace.",capturedAt:new Date().toISOString(),reference:"Synthetic test fixture"}})});
  const draft=prepareDraft(c.id),approval=approveDraft(c.id,draft.id,draft.subject,draft.body);c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;
  return {c,draft,approval};
}

test("legacy checks and owner-recorded recipient evidence cannot authorize the self-test dispatcher",()=>{
  for(const basis of ["legacy","recipient-record"] as const)temporary(()=>{
    const {c,draft,approval}=approved(basis);
    assert.throws(()=>reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,recipient,1),/self-test permission evidence/);
    const w=readWorkspace();assert.equal(w.emailAttempts?.length??0,0);assert.equal(w.approvals.length,1);
  });
});
test("email is off by default and refuses missing or unbounded configuration",async()=>{
  assert.equal(emailConfiguration({}).ready,false);
  const valid={NALBACE_EMAIL_ENABLED:"true",RESEND_API_KEY:"fake-key",NALBACE_EMAIL_MAX_ATTEMPTS:"1",NALBACE_EMAIL_FROM:sender,NALBACE_EMAIL_TEST_RECIPIENT:recipient};
  assert.equal(emailConfiguration(valid).ready,true);
  for(const change of [{NALBACE_EMAIL_ENABLED:"false"},{NALBACE_EMAIL_MAX_ATTEMPTS:"4"},{NALBACE_EMAIL_TEST_RECIPIENT:""},{NALBACE_EMAIL_FROM:"Header\r\nattack@example.test"}])assert.equal(emailConfiguration({...valid,...change}).ready,false);
  const previous=process.env.NALBACE_EMAIL_ENABLED;process.env.NALBACE_EMAIL_ENABLED="false";
  try{await assert.rejects(deliverApprovedTestEmail("birch","fake","fake"),/sending is disabled/);}finally{if(previous===undefined)delete process.env.NALBACE_EMAIL_ENABLED;else process.env.NALBACE_EMAIL_ENABLED=previous;}
});
test("fresh unchanged evidence reserves exactly one approved message and consumes approval atomically",()=>temporary(()=>{
  const {c,draft,approval}=approved();
  const first=reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,recipient,1);
  assert.equal(first.reused,false);assert.equal(first.attempt?.text,draft.body);
  const second=reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,recipient,1);
  assert.equal(second.reused,true);assert.equal(first.attempt?.id,second.attempt?.id);
  let w=readWorkspace();assert.equal(w.emailAttempts?.length,1);assert.equal(w.approvals.length,0);assert.equal(w.cases.find(c=>c.id==="sandbox-test")!.hold,"owner-review");
  finishEmailDelivery(first.attempt!.id,"provider-email-id");w=readWorkspace();assert.equal(w.emailAttempts?.[0].state,"accepted");assert.ok(w.cases.find(c=>c.id==="sandbox-test")!.lastContactAt);
}));
test("fresh payment change cancels dispatch, persists payment evidence and invalidates approval",()=>temporary(()=>{
  const {c,draft,approval}=approved();
  const result=reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence("0.00","PAID")],"binding-a",sender,recipient,1);
  assert.match(result.blocked!,/changed PayPal/);const w=readWorkspace();
  assert.equal(w.cases.find(c=>c.id==="sandbox-test")!.invoices[0].balanceMinor,0);assert.equal(w.approvals.length,0);assert.equal(w.emailAttempts?.length??0,0);
}));
test("wrong recipient, changed merchant, intervening stop and stale evidence cannot reserve",()=>temporary(()=>{
  const {c,draft,approval}=approved();
  assert.throws(()=>reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-b",sender,recipient,1),/matching sandbox/);
  assert.throws(()=>reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,"other@example.test",1),/exact allowed/);
  const stale={...evidence(),checkedAt:new Date(Date.now()-120000).toISOString()};
  assert.throws(()=>reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[stale],"binding-a",sender,recipient,1),/fresh PayPal/);
  recordCustomerUpdate(c.id,"stop","No further contact",null,"email-stop-1");
  assert.throws(()=>reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,recipient,1),/case changed/);
  assert.equal(readWorkspace().emailAttempts?.length??0,0);
}));
test("unknown outcome retains reservation and never becomes a delivered claim",()=>temporary(()=>{
  const {c,draft,approval}=approved(),r=reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,recipient,1);
  finishEmailDelivery(r.attempt!.id,null);finishEmailDelivery(r.attempt!.id,"late-untrusted-id");
  const w=readWorkspace();assert.equal(w.emailAttempts?.[0].state,"unknown");assert.equal(w.cases.find(item=>item.id===c.id)!.lastContactAt,null);
  assert.equal(reserveEmailDelivery(c.id,draft.id,approval.id,c.version,[evidence()],"binding-a",sender,recipient,1).reused,true);
}));
test("email adapter uses a fixed host, exact plain text and idempotency key once; provider errors stay generic",async()=>{
  const attempt:EmailAttempt={id:"attempt-test-1",caseId:"test",draftId:"draft",approvalId:"approval",at:new Date().toISOString(),from:sender,to:recipient,subject:"Exact subject",text:"Exact body",state:"reserved"};
  let calls=0;const request:typeof fetch=async(url,init)=>{calls++;assert.equal(url,"https://api.resend.com/emails");assert.equal(init?.redirect,"error");assert.equal(new Headers(init?.headers).get("Idempotency-Key"),attempt.id);assert.deepEqual(JSON.parse(String(init?.body)),{from:sender,to:[recipient],subject:attempt.subject,text:attempt.text});return Response.json({id:"accepted-id"});};
  assert.equal(await submitTestEmail(attempt,"fake-key",request),"accepted-id");assert.equal(calls,1);
  const failure:typeof fetch=async()=>new Response("secret diagnostic",{status:500});await assert.rejects(submitTestEmail(attempt,"fake-key",failure),error=>error instanceof Error&&!error.message.includes("secret diagnostic"));
});
