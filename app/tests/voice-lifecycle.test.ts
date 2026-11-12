import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {authorizeRecordingVoiceTest,saveCustomerCalling,readWorkspace,saveSandboxImport,saveContactPermission,prepareVoiceReview,approveVoicePurpose,reserveVoiceCall,recordVoiceDispatch,recordTrustedVoiceOutcome,confirmVoiceEnded,recordCustomerUpdate} from "../src/server/store.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import type {VoiceProfile} from "../src/domain/voice-lifecycle.ts";
const profile:VoiceProfile={agentId:"agent_offline",agentVersion:1,from:"+12025550124",voiceId:"retell-Tamsin",language:"en-US"};
const binding="a".repeat(64);
function isolated(fn:()=>void){const old=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-voice-life-")));try{fn();}finally{process.chdir(old);}}
function setup(){const at=new Date().toISOString();saveSandboxImport(normalizeSandboxInvoice({id:"INV2-LIFECYCLE",status:"SENT",due_amount:{currency_code:"USD",value:"25.00"},detail:{invoice_number:"LIFECYCLE",payment_term:{due_date:"2026-01-01"}}},at),"offline-paypal");let c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;saveContactPermission(c.id,c.version,{email:"owner@example.test",verified:true,emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"Offline test",evidence:{basis:"self-test",wording:"Offline voice test only",capturedAt:at,reference:"Offline scenario"}});c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;saveCustomerCalling(c.id,c.version,true);c=readWorkspace().cases.find(item=>item.id===c.id)!;const review=prepareVoiceReview(c.id,c.version);const approval=approveVoicePurpose(c.id,review.id,profile);return {c,review,approval};}
function accepted(){const {c,review,approval}=setup();const call=reserveVoiceCall(c.id,approval.id,profile,binding,1);recordVoiceDispatch(call.id,binding,{state:"accepted",providerCallId:"call_offline"});return {c,review,approval,call};}
test("exact voice approval is consumed once, reservation holds contact and unknown never frees capacity",()=>isolated(()=>{
 const {c,approval}=setup();assert.throws(()=>reserveVoiceCall(c.id,approval.id,{...profile,agentVersion:2},binding,1));assert.equal(readWorkspace().voiceCalls?.length??0,0);const call=reserveVoiceCall(c.id,approval.id,profile,binding,1);assert.equal(readWorkspace().voiceApprovals![0].state,"consumed");assert.equal(readWorkspace().cases.find(x=>x.id===c.id)!.hold,"owner-review");assert.throws(()=>reserveVoiceCall(c.id,approval.id,profile,binding,1));recordVoiceDispatch(call.id,binding,{state:"unknown"});assert.equal(readWorkspace().voiceCalls![0].state,"unknown");assert.throws(()=>recordVoiceDispatch(call.id,binding,{state:"accepted",providerCallId:"call_other"}));assert.throws(()=>reserveVoiceCall(c.id,approval.id,profile,binding,3));
}));
test("intervening customer stop invalidates voice preparation before reservation",()=>isolated(()=>{
 const {c,approval}=setup();recordCustomerUpdate(c.id,"stop","Stop recorded in offline test",null,"voice-stop-test");assert.throws(()=>reserveVoiceCall(c.id,approval.id,profile,binding,1));assert.equal(readWorkspace().voiceCalls?.length??0,0);
}));
test("bound payment claim saves hold and deduplicates without changing amounts or dates",()=>isolated(()=>{
 const {c,call}=accepted(),before=readWorkspace().cases.find(x=>x.id===c.id)!;const input={callId:call.id,providerCallId:"call_offline",binding,eventId:"event-claim",kind:"payment-claim" as const};recordTrustedVoiceOutcome(input);const after=readWorkspace().cases.find(x=>x.id===c.id)!;assert.deepEqual(after.invoices,before.invoices);assert.equal(after.nextActionAt,before.nextActionAt);assert.equal(after.hold,"owner-review");const version=after.version;recordTrustedVoiceOutcome(input);assert.equal(readWorkspace().cases.find(x=>x.id===c.id)!.version,version);assert.throws(()=>recordTrustedVoiceOutcome({...input,kind:"promise"}));assert.throws(()=>recordTrustedVoiceOutcome({...input,eventId:"wrong-call",providerCallId:"call_other"}));
}));
test("late stop survives confirmed hangup and later disputes cannot weaken suppression",()=>isolated(()=>{
 const {c,call}=accepted();confirmVoiceEnded(call.id,binding,"call_offline");recordTrustedVoiceOutcome({callId:call.id,providerCallId:"call_offline",binding,eventId:"late-stop",kind:"stop"});recordTrustedVoiceOutcome({callId:call.id,providerCallId:"call_offline",binding,eventId:"dispute",kind:"dispute"});assert.equal(readWorkspace().cases.find(x=>x.id===c.id)!.hold,"suppressed");assert.equal(readWorkspace().voiceCalls![0].state,"ended");
}));
test("invalid agent version and fake provider binding cannot create an approved call path",()=>isolated(()=>{
 const {c,review,approval}=setup();assert.throws(()=>approveVoicePurpose(c.id,review.id,{...profile,agentVersion:-1}));assert.throws(()=>reserveVoiceCall(c.id,approval.id,profile,"invalid",1));assert.throws(()=>recordVoiceDispatch("missing",binding,{state:"accepted",providerCallId:"call_offline"}));assert.throws(()=>confirmVoiceEnded("missing",binding,"call_offline"));assert.equal(readWorkspace().voiceCalls?.length??0,0);
}));


test("separate phone-test invoice cannot overwrite the original payment case",()=>isolated(()=>{const {c}=setup();const before=JSON.stringify(readWorkspace().cases.find(item=>item.id===c.id));const e=normalizeSandboxInvoice({id:"INV2-SEPARATE",status:"SENT",due_amount:{currency_code:"USD",value:"25.00"},detail:{invoice_number:"SEPARATE",payment_term:{due_date:"2026-01-01"}}},new Date().toISOString());saveSandboxImport(e,"offline-paypal","sandbox-voice-test");assert.equal(JSON.stringify(readWorkspace().cases.find(item=>item.id===c.id)),before);assert.throws(()=>saveSandboxImport(e,"offline-paypal","sandbox-test"));assert.equal(readWorkspace().cases.find(item=>item.id==="sandbox-voice-test")!.hold,"none");}));

test("fresh recording grant permits only one third attempt with previous attempts retained",()=>isolated(()=>{
  const first=accepted();confirmVoiceEnded(first.call.id,binding,"call_offline");
  const w=readWorkspace();w.voiceCalls!.push({...w.voiceCalls![0],id:"prior-second",providerCallId:"call_second",state:"ended"});
  const db=new DatabaseSync(path.join(process.cwd(),".data/local-demo.sqlite"));db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(w));db.close();
  const at=new Date().toISOString();
  saveSandboxImport(normalizeSandboxInvoice({id:"INV2-RECORDING",status:"SENT",due_amount:{currency_code:"USD",value:"25.00"},detail:{invoice_number:"RECORDING",payment_term:{due_date:"2026-01-01"}}},at),"offline-paypal","sandbox-recording-call");
  let c=readWorkspace().cases.find(item=>item.id==="sandbox-recording-call")!;
  saveContactPermission(c.id,c.version,{email:"owner@example.test",verified:true,emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"Fresh recording agreement",evidence:{basis:"self-test",wording:"One recording call",capturedAt:at,reference:"Synthetic approval"}});
  c=readWorkspace().cases.find(item=>item.id===c.id)!;saveCustomerCalling(c.id,c.version,true);
  const grant="b".repeat(64);authorizeRecordingVoiceTest(c.id,grant);
  assert.throws(()=>authorizeRecordingVoiceTest(c.id,grant));
  c=readWorkspace().cases.find(item=>item.id===c.id)!;
  const review=prepareVoiceReview(c.id,c.version),approval=approveVoicePurpose(c.id,review.id,profile);
  const previous=process.env.NALBACE_VOICE_RETEST_AUTHORIZATION;
  try{
    delete process.env.NALBACE_VOICE_RETEST_AUTHORIZATION;
    assert.throws(()=>reserveVoiceCall(c.id,approval.id,profile,binding,3),/grant/);
    process.env.NALBACE_VOICE_RETEST_AUTHORIZATION=grant;reserveVoiceCall(c.id,approval.id,profile,binding,3);
    assert.equal(readWorkspace().voiceCalls!.length,3);
    assert.throws(()=>reserveVoiceCall(c.id,approval.id,profile,binding,3),/allowance/);
  }finally{if(previous===undefined)delete process.env.NALBACE_VOICE_RETEST_AUTHORIZATION;else process.env.NALBACE_VOICE_RETEST_AUTHORIZATION=previous;}
}));
