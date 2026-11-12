import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {readWorkspace,prepareDraft,approveDraft} from "../src/server/store.ts";
import {receiveProviderReply} from "../src/server/inbound-replies.ts";
import type {InboundAdapter,ReplyEnvelope} from "../src/server/inbound-replies.ts";
const binding="a".repeat(64),envelope:ReplyEnvelope={eventId:"synthetic-inbound-1",originalProviderId:"synthetic-outbound-1",from:"owner@example.test",text:"I already paid. Please stop following up."};
async function temporary(fn:()=>Promise<void>){const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-inbound-")));try{await fn();}finally{process.chdir(before);}}
function fixture(){const d=prepareDraft("birch");approveDraft("birch",d.id,d.subject,d.body);const w=readWorkspace();w.emailAttempts=[{id:"synthetic-attempt",caseId:"birch",draftId:d.id,approvalId:w.approvals[0].id,at:new Date().toISOString(),from:"sender@example.test",to:envelope.from,subject:d.subject,text:d.body,state:"accepted",providerId:envelope.originalProviderId,deliveryProvider:"resend",deliveryBinding:binding}];const db=new DatabaseSync(path.join(process.cwd(),".data/local-demo.sqlite"));db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(w));db.close();}
function adapter(value=envelope):InboundAdapter{return {provider:"resend",accountBinding:binding,authenticateAndNormalize:async()=>value};}
test("normalized authenticated reply holds pursuit and invalidates approval without changing financial evidence",()=>temporary(async()=>{
 fixture();const original=readWorkspace().cases.find(c=>c.id==="birch")!;const result=await receiveProviderReply("synthetic",new Headers(),adapter());
 const w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;assert.equal(result.result,"matched");assert.equal(c.hold,"owner-review");assert.deepEqual(c.invoices,original.invoices);assert.equal(w.approvals.length,0);assert.equal(w.aiRuns?.length??0,0);assert.equal(c.pastedReplies?.[0].source,"provider-received");
 const version=c.version;await receiveProviderReply("synthetic",new Headers(),adapter());assert.equal(readWorkspace().cases.find(item=>item.id===c.id)!.version,version);
 await assert.rejects(receiveProviderReply("synthetic",new Headers(),adapter({...envelope,text:"different"})),/changed/);
}));
test("failed transport authentication cannot change a case or record a reply",()=>temporary(async()=>{
 fixture();const before=readWorkspace();await assert.rejects(receiveProviderReply("forged",new Headers(),{...adapter(),authenticateAndNormalize:async()=>{throw new Error("Unverified transport");}}),/Unverified/);assert.deepEqual(readWorkspace(),before);
}));
test("wrong account, wrong sender and missing thread are quarantined without guessing a client",()=>temporary(async()=>{
 fixture();for(const value of [{...envelope,eventId:"wrong-sender",from:"stranger@example.test"},{...envelope,eventId:"wrong-thread",originalProviderId:"unrelated"}])assert.equal((await receiveProviderReply("synthetic",new Headers(),adapter(value))).result,"unmatched");
 assert.equal((await receiveProviderReply("synthetic",new Headers(),{...adapter({...envelope,eventId:"wrong-account"}),accountBinding:"b".repeat(64)})).result,"unmatched");
 const w=readWorkspace();assert.equal(w.cases.find(c=>c.id==="birch")!.hold,"none");assert.equal(w.inboundEvents?.length,3);
}));
test("oversized input is rejected before adapter/network work",()=>temporary(async()=>{
 let calls=0;await assert.rejects(receiveProviderReply("x".repeat(64001),new Headers(),{...adapter(),authenticateAndNormalize:async()=>{calls++;return envelope;}}),/size/);assert.equal(calls,0);
}));
