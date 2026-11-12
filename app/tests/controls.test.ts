import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {saveFollowupPreference,reserveEmailDelivery,reserveVoiceCall,readWorkspace,saveWorkspaceControls,saveAiPreference,reserveAiDraft,failAiDraft,prepareDraft,approveDraft,saveContactPermission,recordReceipt,voidReceipt,confirmClearance,recordCustomerUpdate} from "../src/server/store.ts";
import {financials,contactEligibility} from "../src/domain/cases.ts";
import {saveSandboxImport,beginEvidenceRefresh,finishEvidenceRefresh,reconcileReceipt,resolveReceiptCorrections} from "../src/server/store.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import {caseView} from "../src/domain/case-view.ts";
function temporary(fn:()=>void){const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-controls-")));try{fn();}finally{process.chdir(before);}}
const permission={email:"owner@example.test",verified:true,emailAllowed:true,voiceAllowed:false,phone:"",note:"Owner role-playing customer; checked sandbox account."};
test("AI defaults to paused, settings cannot refund usage, and stale edits are rejected",()=>temporary(()=>{
  assert.throws(()=>reserveAiDraft("birch",5),/paused/);
  saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:1});
  assert.throws(()=>saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:20}),/another change/);
  const r=reserveAiDraft("birch",5);failAiDraft(r.runId);
  assert.throws(()=>reserveAiDraft("river",5),/allowance is exhausted/);
  saveWorkspaceControls({revision:1,aiPaused:false,aiRequestCap:2});
  assert.throws(()=>reserveAiDraft("birch",5),/twenty-four hours/);
  const other=reserveAiDraft("river",5);assert.equal(readWorkspace().aiRuns?.length,2);failAiDraft(other.runId);
  saveWorkspaceControls({revision:2,aiPaused:true,aiRequestCap:20});
  assert.equal(readWorkspace().aiRuns?.length,2);assert.throws(()=>reserveAiDraft("birch",20),/paused/);
}));
test("workspace-wide concurrency and server cap both apply",()=>temporary(()=>{
  saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:20});const r=reserveAiDraft("birch",1);
  assert.throws(()=>reserveAiDraft("river",20),/in progress in this workspace/);
  failAiDraft(r.runId);assert.throws(()=>reserveAiDraft("river",1),/exhausted/);
}));
test("contact edits invalidate exact approvals, enforce channels and preserve stops",()=>temporary(()=>{
  const d=prepareDraft("birch");approveDraft("birch",d.id,d.subject,d.body);
  const version=readWorkspace().cases.find(c=>c.id==="birch")!.version;
  saveContactPermission("birch",version,{...permission,emailAllowed:false});
  let w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;assert.equal(w.approvals.length,0);assert.equal(contactEligibility(c,new Date()).eligible,false);assert.equal(caseView(c).category,"decision");
  assert.throws(()=>saveContactPermission("birch",version,permission),/case changed/);
  assert.throws(()=>saveContactPermission("birch",c.version,{...permission,voiceAllowed:true}),/consented phone/);
  assert.throws(()=>saveContactPermission("birch",c.version,{...permission,email:"safe@example.test\r\nBcc: bad@example.test"}),/valid billing email/);
  recordCustomerUpdate("birch","stop","Customer stopped contact.",null,"permission-stop-1");
  c=readWorkspace().cases.find(c=>c.id==="birch")!;saveContactPermission("birch",c.version,{...permission,phone:"+12025550123",voiceAllowed:true});
  c=readWorkspace().cases.find(c=>c.id==="birch")!;assert.equal(c.hold,"suppressed");assert.equal(c.contactPermission?.voiceAllowed,true);assert.equal(contactEligibility(c,new Date()).eligible,false);
}));
test("receipt correction restores amount, preserves original, stops pursuit and is idempotent",()=>temporary(()=>{
  recordReceipt("birch","cash",[{invoiceId:"inv-birch-1041",amountMinor:10000}],"correct-receipt-1");
  const d=prepareDraft("birch");approveDraft("birch",d.id,d.subject,d.body);
  const version=readWorkspace().cases.find(c=>c.id==="birch")!.version;
  assert.throws(()=>voidReceipt("birch","correct-receipt-1","Wrong amount",version-1),/changed/);
  voidReceipt("birch","correct-receipt-1","Wrong amount",version);
  voidReceipt("birch","correct-receipt-1","Wrong amount",version);
  const w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;
  assert.equal(c.receipts[0].allocations[0].amountMinor,10000);assert.equal(c.receipts[0].voided?.reason,"Wrong amount");
  assert.equal(financials(c).remainingMinor,40000);assert.equal(c.hold,"owner-review");assert.equal(w.approvals.length,0);assert.equal(contactEligibility(c,new Date()).eligible,false);
  assert.throws(()=>voidReceipt("birch","correct-receipt-1","Different reason",c.version),/retry/);
  recordReceipt("birch","cash",[{invoiceId:"inv-birch-1041",amountMinor:10000}],"correct-receipt-1");assert.equal(financials(readWorkspace().cases.find(c=>c.id==="birch")!).remainingMinor,40000);
}));
test("voided pending check cannot be cleared and doesn't keep funds reserved",()=>temporary(()=>{
  const c=readWorkspace().cases.find(c=>c.id==="elm")!;
  voidReceipt(c.id,"receipt-elm","Recorded on wrong client",c.version);
  assert.equal(financials(readWorkspace().cases.find(c=>c.id==="elm")!).pendingMinor,0);
  assert.throws(()=>confirmClearance("elm","receipt-elm"),/not found/);
}));
test("a voided matched receipt can be resolved against fresh evidence without changing the provider balance or removing the hold",()=>temporary(()=>{
  const oldId=process.env.PAYPAL_SANDBOX_CLIENT_ID,oldSecret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
  process.env.PAYPAL_SANDBOX_CLIENT_ID="fake-client";process.env.PAYPAL_SANDBOX_CLIENT_SECRET="fake-secret";
  try{
    const binding=createHash("sha256").update("fake-client").digest("hex");
    const evidence=(due:string,payments:unknown[]=[])=>normalizeSandboxInvoice({id:"INV2-CORRECTION",status:"UNPAID",detail:{payment_term:{due_date:"2026-01-01"}},due_amount:{currency_code:"USD",value:due},payments:{transactions:payments}},new Date().toISOString());
    saveSandboxImport(evidence("100.00"),binding);recordReceipt("sandbox-test","cash",[{invoiceId:"INV2-CORRECTION",amountMinor:3000}],"matched-correction-1");
    const pending=beginEvidenceRefresh("sandbox-test",binding);
    finishEvidenceRefresh("sandbox-test",pending.version,[evidence("70.00",[{payment_id:"EXT-1",type:"EXTERNAL",amount:{currency_code:"USD",value:"30.00"}}])]);
    reconcileReceipt("sandbox-test","matched-correction-1",[{invoiceId:"INV2-CORRECTION",paymentId:"EXT-1"}]);
    let c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;
    voidReceipt(c.id,"matched-correction-1","Receipt was entered on the wrong evidence.",c.version);
    c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;assert.equal(c.reconciliationRequired,true);
    resolveReceiptCorrections(c.id,c.version,"Reviewed the fresh PayPal source and original entry.");
    c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;assert.equal(c.reconciliationRequired,false);assert.equal(financials(c).remainingMinor,7000);assert.equal(c.hold,"owner-review");assert.equal(c.receipts[0].providerMatches?.[0].paymentId,"EXT-1");
  }finally{
    if(oldId===undefined)delete process.env.PAYPAL_SANDBOX_CLIENT_ID;else process.env.PAYPAL_SANDBOX_CLIENT_ID=oldId;
    if(oldSecret===undefined)delete process.env.PAYPAL_SANDBOX_CLIENT_SECRET;else process.env.PAYPAL_SANDBOX_CLIENT_SECRET=oldSecret;
  }
}));

test("owner AI preference preserves allowance and usage, rejects stale changes, and cannot bypass zero capacity",()=>temporary(()=>{
  saveAiPreference(false,0);
  let w=readWorkspace();assert.equal(w.controls?.aiRequestCap,0);assert.equal(w.controls?.aiPaused,false);
  assert.throws(()=>reserveAiDraft("birch",5),/allowance/);
  assert.throws(()=>saveAiPreference(true,0),/another change/);
  saveWorkspaceControls({revision:1,aiPaused:false,aiRequestCap:1});
  const run=reserveAiDraft("birch",5);failAiDraft(run.runId);
  saveAiPreference(true,2);w=readWorkspace();assert.equal(w.controls?.aiRequestCap,1);assert.equal(w.aiRuns?.length,1);
  saveAiPreference(false,3);assert.throws(()=>reserveAiDraft("river",5),/allowance/);
  assert.throws(()=>saveAiPreference("false" as unknown as boolean,4),/valid AI preference/);
}));

 test("owner follow-up pauses block reservations, survive operator settings and never reset attempts",()=>temporary(()=>{
  saveFollowupPreference("email",true,0);saveFollowupPreference("voice",true,1);
  assert.throws(()=>reserveEmailDelivery("birch","draft","approval",0,[],"binding","sender@example.test","owner@example.test",1),/paused by the owner/);
  assert.throws(()=>reserveVoiceCall("birch","approval",{} as never,"binding",1),/paused by the owner/);
  assert.throws(()=>saveFollowupPreference("email",false,0),/another change/);
  saveWorkspaceControls({revision:2,aiPaused:true,aiRequestCap:0});
  assert.equal(readWorkspace().controls?.emailPaused,true);assert.equal(readWorkspace().controls?.voicePaused,true);
  saveFollowupPreference("email",false,3);assert.equal(readWorkspace().controls?.voicePaused,true);
  assert.equal(readWorkspace().emailAttempts?.length??0,0);assert.equal(readWorkspace().voiceCalls?.length??0,0);
  assert.throws(()=>saveFollowupPreference("other" as never,false,4),/valid follow-up/);
 }));
