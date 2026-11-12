import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {readWorkspace,prepareDraft,approveDraft,recordReceipt,confirmClearance,saveSandboxImport,beginEvidenceRefresh,finishEvidenceRefresh,recordCustomerUpdate,setPause} from "../src/server/store.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
test("persistent local receipt invalidates approval; replay cannot double count",()=>{
  const before=process.cwd();const dir=mkdtempSync(path.join(os.tmpdir(),"nalbace-store-test-"));process.chdir(dir);
  try {
    const d=prepareDraft("birch");approveDraft("birch",d.id,d.subject,d.body);
    assert.equal(readWorkspace().approvals.length,1);
    const allocation=[{invoiceId:"inv-birch-1041",amountMinor:10000}];
    recordReceipt("birch","check",allocation,"test-operation-1");
    assert.equal(readWorkspace().approvals.length,0);
    assert.throws(()=>approveDraft("birch",d.id,d.subject,d.body),/changed/);
    recordReceipt("birch","check",allocation,"test-operation-1");
    assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.receipts.length,1);
    assert.throws(()=>recordReceipt("birch","check",[{...allocation[0],amountMinor:20000}],"test-operation-1"),/retry details/);
    confirmClearance("birch","test-operation-1");
    const next=prepareDraft("birch");assert.match(next.body,/300\.00/);
    assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.receipts[0].state,"cleared");
  }finally{process.chdir(before);}
});
test("sandbox import is separate, bound to app identity, durable and rejects stale refresh results",()=>{
  const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-sandbox-test-")));
  try{
    const evidence=normalizeSandboxInvoice({id:"INV2-TEST",status:"DRAFT",due_amount:{currency_code:"USD",value:"25.00"}},new Date().toISOString());
    saveSandboxImport(evidence,"app-a");saveSandboxImport(evidence,"app-a");
    const c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;
    assert.equal(c.invoices.length,1);assert.equal(c.verifiedContact,false);assert.equal(c.source,"paypal-sandbox");
    assert.equal(readWorkspace().cases.filter(c=>c.source==="fixture").length,4);
    assert.throws(()=>saveSandboxImport(evidence,"app-b"),/Merchant/);
    assert.throws(()=>beginEvidenceRefresh(c.id,"app-b"),/Merchant/);
    const first=beginEvidenceRefresh(c.id,"app-a"),second=beginEvidenceRefresh(c.id,"app-a");
    assert.throws(()=>finishEvidenceRefresh(c.id,first.version,[evidence]),/changed/);
    finishEvidenceRefresh(c.id,second.version,[evidence]);
    assert.equal(readWorkspace().cases.find(c=>c.id==="sandbox-test")!.evidenceStatus,"ready");
  }finally{process.chdir(before);}
});
test("cash settlement removes the covered invoice from a later draft",()=>{
  const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-cash-test-")));
  try {recordReceipt("birch","cash",[{invoiceId:"inv-birch-1041",amountMinor:25000}],"test-operation-2");const d=prepareDraft("birch");assert.deepEqual(d.invoiceIds,["inv-birch-1045"]);assert.doesNotMatch(d.body,/#1041/);assert.match(d.body,/150\.00/);}finally{process.chdir(before);}
});
test("payment claim invalidates approval and pauses pursuit without changing balances; retries do not duplicate",()=>{
  const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-update-test-")));
  try{
    const d=prepareDraft("birch");approveDraft("birch",d.id,d.subject,d.body);
    recordCustomerUpdate("birch","payment-claim","Customer says a check was mailed.",null,"update-test-1");
    recordCustomerUpdate("birch","payment-claim","Customer says a check was mailed.",null,"update-test-1");
    const w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;
    assert.equal(c.hold,"owner-review");assert.equal(c.invoices.reduce((n,i)=>n+i.balanceMinor,0),40000);
    assert.equal(c.customerUpdates?.length,1);assert.equal(w.approvals.length,0);assert.throws(()=>prepareDraft("birch"));
    assert.throws(()=>recordCustomerUpdate("birch","payment-claim","Changed claim",null,"update-test-1"),/retry/);
  }finally{process.chdir(before);}
});
test("confirmed promise waits; disputes and stop requests cannot be cleared by ordinary pause controls",()=>{
  const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-promise-test-")));
  try{
    const future=new Date(Date.now()+4*86400000).toISOString();
    recordCustomerUpdate("birch","promise","Confirmed review date.",future,"promise-test-1");
    assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.nextActionAt,future);assert.throws(()=>prepareDraft("birch"),/Waiting/);
    assert.throws(()=>recordCustomerUpdate("birch","promise","Yesterday",new Date(Date.now()-86400000).toISOString(),"promise-test-2"),/future/);
    recordCustomerUpdate("birch","dispute","Invoice disputed.",null,"dispute-test-1");assert.throws(()=>setPause("birch",false),/explicit owner/);
    recordCustomerUpdate("birch","stop","Do not contact.",null,"stop-test-1");
    recordCustomerUpdate("birch","promise","Another promise does not revoke the stop.",future,"promise-test-3");
    const c=readWorkspace().cases.find(c=>c.id==="birch")!;assert.equal(c.hold,"suppressed");assert.equal(c.invoices.reduce((n,i)=>n+i.balanceMinor,0),40000);assert.throws(()=>setPause("birch",false));
  }finally{process.chdir(before);}
});
