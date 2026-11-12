import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import {readWorkspace,recordCustomerUpdate,reviewDispute,saveSandboxImport} from "../src/server/store.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import {manualCallTarget} from "../src/domain/manual-call.ts";
function isolated(fn:()=>void){const old=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-dispute-")));try{fn();}finally{process.chdir(old);}}
const input={resolution:"resolved" as const,note:"Owner reviewed correction with customer",reference:"Synthetic correction reference",operationId:"review-offline-1"};
function setup(){recordCustomerUpdate("birch","dispute","Synthetic dispute",null,"dispute-offline-1");return readWorkspace().cases.find(c=>c.id==="birch")!;}
test("owner resolution records evidence without changing money or enabling pursuit; exact retry deduplicates",()=>isolated(()=>{const c=setup(),before=JSON.stringify(c.invoices);reviewDispute(c.id,c.version,input);let next=readWorkspace().cases.find(x=>x.id===c.id)!;assert.equal(next.hold,"owner-review");assert.equal(JSON.stringify(next.invoices),before);assert.equal(next.disputeReviews!.length,1);reviewDispute(c.id,c.version,input);next=readWorkspace().cases.find(x=>x.id===c.id)!;assert.equal(next.disputeReviews!.length,1);assert.throws(()=>reviewDispute(c.id,c.version,{...input,note:"Different result"}));}));
test("open review keeps dispute and stale review or later stop cannot be cleared",()=>isolated(()=>{const c=setup();reviewDispute(c.id,c.version,{...input,resolution:"still-open"});assert.equal(readWorkspace().cases.find(x=>x.id===c.id)!.hold,"dispute");assert.throws(()=>reviewDispute(c.id,c.version,{...input,operationId:"new-review-1"}));recordCustomerUpdate(c.id,"stop","Stop request",null,"stop-offline-1");const next=readWorkspace().cases.find(x=>x.id===c.id)!;assert.throws(()=>reviewDispute(c.id,next.version,{...input,operationId:"new-review-2"}));assert.equal(readWorkspace().cases.find(x=>x.id===c.id)!.hold,"suppressed");}));
test("resolution with stale PayPal evidence fails without changing the hold",()=>isolated(()=>{saveSandboxImport(normalizeSandboxInvoice({id:"INV2-STALE-REVIEW",status:"SENT",due_amount:{currency_code:"USD",value:"25.00"},detail:{invoice_number:"REVIEW",payment_term:{due_date:"2026-01-01"}}},new Date(Date.now()-61000).toISOString()),"offline");recordCustomerUpdate("sandbox-test","dispute","Synthetic dispute",null,"dispute-paypal-1");const c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;assert.throws(()=>reviewDispute(c.id,c.version,input));assert.equal(readWorkspace().cases.find(c=>c.id==="sandbox-test")!.hold,"dispute");}));
test("manual device calling is independent of AI permission and rejects stopped, unverified or malformed contacts",()=>isolated(()=>{const c=setup();c.verifiedContact=true;c.contactPermission={emailAllowed:false,voiceAllowed:false,phone:"+12025550123",note:"Synthetic",reviewedAt:new Date().toISOString()};assert.equal(manualCallTarget(c),"tel:+12025550123");c.hold="suppressed";assert.equal(manualCallTarget(c),null);c.hold="none";c.verifiedContact=false;assert.equal(manualCallTarget(c),null);c.verifiedContact=true;c.contactPermission.phone="javascript:alert(1)";assert.equal(manualCallTarget(c),null);}));

test("dispute next actions persist, validate dates and preserve payment and holds",()=>isolated(()=>{
  let c=setup();
  const invoices=JSON.stringify(c.invoices);
  const reviewAt=new Date(Date.now()+7*86400000).toISOString();
  reviewDispute(c.id,c.version,{...input,resolution:"still-open",reference:"",nextAction:"check-later",reviewAt});
  c=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.equal(c.hold,"dispute");
  assert.equal(c.disputeReviews!.at(-1)!.reviewAt,reviewAt);
  assert.throws(()=>reviewDispute(c.id,c.version,{...input,nextAction:"daily-call",operationId:"bad-next-action"}),/next action/);
  assert.throws(()=>reviewDispute(c.id,c.version,{...input,nextAction:"payment-promise",reviewAt:"invalid",operationId:"bad-review-date"}),/review date/);
  reviewDispute(c.id,c.version,{...input,nextAction:"payment-promise",reviewAt,operationId:"promise-resolution"});
  c=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.equal(c.hold,"owner-review");
  assert.equal(c.nextActionAt,reviewAt);
  assert.equal(c.disputeReviews!.at(-1)!.nextAction,"payment-promise");
  assert.equal(JSON.stringify(c.invoices),invoices);
  assert.equal(c.followupRehearsal,undefined);
}));
