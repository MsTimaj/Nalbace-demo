import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fixtures,DEMO_OWNER} from "../src/server/fixtures.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import {prepareVoiceContext,voiceContextFingerprint,recheckVoiceContext} from "../src/domain/voice-context.ts";
import {saveCustomerCalling,readWorkspace,saveSandboxImport,saveContactPermission,prepareVoiceReview} from "../src/server/store.ts";
const now=new Date("2026-11-10T18:00:00Z");
function client(){const c=fixtures(now)[1];c.source="paypal-sandbox";c.providerBinding="synthetic-binding";c.evidenceStatus="ready";c.invoices=c.invoices.map((i,index)=>({...i,id:`INV2-VOICE${index}`,evidence:normalizeSandboxInvoice({id:`INV2-VOICE${index}`,status:"SENT",due_amount:{currency_code:"USD",value:String(i.balanceMinor/100)},detail:{invoice_number:i.number,payment_term:{due_date:i.dueDate}}},now.toISOString())}));c.aiCallPreference="allow";c.contactPermission={emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"private note",reviewedAt:now.toISOString()};c.permissionReviews=[{id:"permission-test",at:now.toISOString(),merchantId:c.merchantId,caseId:c.id,email:c.contact,phone:c.contactPermission.phone,verified:true,emailAllowed:false,voiceAllowed:true,note:"private note",evidence:{basis:"self-test",wording:"private permission wording",capturedAt:now.toISOString(),reference:"private source"}}];return c;}
function review(c=client()){const context=prepareVoiceContext(c,DEMO_OWNER,now);return {id:"review-test",createdAt:now.toISOString(),context,fingerprint:voiceContextFingerprint(context)};}
test("voice facts contain exact invoice cents and no history, permission wording or email",()=>{
 const c=client(),facts=prepareVoiceContext(c,DEMO_OWNER,now);assert.equal(facts.totalMinor,40000);assert.equal(facts.invoices.length,2);assert.equal(facts.maxSeconds,60);assert.equal(facts.mode,"sandbox-review-only");const text=JSON.stringify(facts);for(const privateText of [c.contact,"private note","private permission wording","private source","Sample history"])assert.ok(!text.includes(privateText));assert.deepEqual(recheckVoiceContext(review(c),c,DEMO_OWNER,now),facts);
});
test("paid, stop, pending check, withdrawn voice permission and legacy flags block voice context",()=>{
 for(const reason of ["paid","stop","check","permission","legacy","recipient"]){const c=client();if(reason==="paid")c.invoices.forEach(i=>{i.balanceMinor=0;i.evidence!.dueMinor=0;});if(reason==="stop")c.hold="suppressed";if(reason==="check")c.receipts=[{id:"check",kind:"check",state:"received",receivedAt:now.toISOString(),allocations:[{invoiceId:c.invoices[0].id,amountMinor:1000}]}];if(reason==="permission")c.contactPermission!.voiceAllowed=false;if(reason==="legacy")c.permissionReviews=[];if(reason==="recipient")c.permissionReviews![0].evidence!.basis="recipient-record";assert.throws(()=>prepareVoiceContext(c,DEMO_OWNER,now));}
});
test("stale, mismatched invoice evidence and fixture data cannot supply external call facts",()=>{
 for(const reason of ["stale","wrong-id","wrong-money","fixture","merchant","duplicate"]){const c=client();if(reason==="stale")c.invoices[0].evidence!.checkedAt=new Date(now.getTime()-60000).toISOString();if(reason==="wrong-id")c.invoices[0].evidence!.id="INV2-OTHER";if(reason==="wrong-money")c.invoices[0].evidence!.dueMinor=1;if(reason==="fixture")c.source="fixture";if(reason==="merchant")c.merchantId="other";if(reason==="duplicate")c.invoices.push(c.invoices[0]);assert.throws(()=>prepareVoiceContext(c,DEMO_OWNER,now));}
});
test("voice review expires and changes of destination, binding, version or payload invalidate it",()=>{
 const c=client(),r=review(c);assert.throws(()=>recheckVoiceContext(r,c,DEMO_OWNER,new Date(now.getTime()+60000)));
 for(const field of ["phone","binding","version","payload"]){const next=client(),saved=structuredClone(r);if(field==="phone")next.contactPermission!.phone="+12025550124";if(field==="binding")next.providerBinding="different";if(field==="version")next.version++;if(field==="payload")saved.context.totalMinor=1;assert.throws(()=>recheckVoiceContext(saved,next,DEMO_OWNER,now));}
});
test("saved voice review is durable and deduplicated without approving, calling or editing money",()=>{
 const cwd=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-voice-context-")));
 try{const at=new Date().toISOString();const e=normalizeSandboxInvoice({id:"INV2-CONTEXT",status:"SENT",due_amount:{currency_code:"USD",value:"25.00"},detail:{invoice_number:"CONTEXT",payment_term:{due_date:"2026-01-01"}}},at);saveSandboxImport(e,"synthetic-binding");let c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;saveContactPermission(c.id,c.version,{email:"owner@example.test",verified:true,emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"Synthetic",evidence:{basis:"self-test",wording:"Synthetic voice permission",capturedAt:at,reference:"Offline test"}});c=readWorkspace().cases.find(item=>item.id==="sandbox-test")!;saveCustomerCalling(c.id,c.version,true);c=readWorkspace().cases.find(item=>item.id===c.id)!;const before=structuredClone(c);const saved=prepareVoiceReview(c.id,c.version);assert.equal(prepareVoiceReview(c.id,c.version).id,saved.id);assert.equal(readWorkspace().voiceReviews!.length,1);assert.equal(readWorkspace().approvals.length,0);assert.deepEqual(readWorkspace().cases.find(item=>item.id===c.id),before);assert.throws(()=>prepareVoiceReview(c.id,c.version-1));}finally{process.chdir(cwd);}
});

