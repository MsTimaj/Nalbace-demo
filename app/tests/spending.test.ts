import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {reserveSpend,recordSpendOutcome,reconcileSpend,spendingSummary,spendingPolicy} from "../src/server/spending.ts";
import type {SpendPolicy} from "../src/server/spending.ts";
const policy:SpendPolicy={enabled:true,rateCard:"synthetic-v1",validUntil:"2027-01-01T00:00:00Z",applicationMicroUsd:1000,merchantMicroUsd:600,aiRequests:2,emailAttempts:2,voiceSeconds:120,aiMaxMicroUsd:300,emailMaxMicroUsd:100,voiceMaxMicroUsd:400,aiModel:"synthetic-model",emailProvider:"synthetic-email",voiceProvider:"synthetic-voice"};
const october=new Date("2026-10-31T23:59:00Z"),november=new Date("2026-11-01T00:01:00Z");
function temporary(fn:()=>void){const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-spend-")));try{fn();}finally{process.chdir(before);}}
test("defaults, malformed limits and mismatched rates cannot enable spending",()=>temporary(()=>{
 assert.equal(spendingPolicy({}).enabled,false);
 assert.equal(spendingPolicy({NALBACE_SPEND_APPLICATION_MICRO_USD:"1.5"}).applicationMicroUsd,0);
 assert.throws(()=>reserveSpend("default","one","ai","synthetic-model"),/disabled/);
 assert.throws(()=>reserveSpend("bad","one","ai","other",1,policy,october),/disabled/);
 assert.throws(()=>reserveSpend("expired","one","ai","synthetic-model",1,{...policy,validUntil:"2026-10-01T00:00:00Z"},october),/disabled/);
 assert.throws(()=>reserveSpend("bad","one","ai","synthetic-model",2,policy,october),/bounded/);
}));
test("idempotency, business and deployment ceilings apply across merchants",()=>temporary(()=>{
 const r=reserveSpend("one","merchant-a","ai","synthetic-model",1,policy,october);
 assert.deepEqual(reserveSpend("one","merchant-a","ai","synthetic-model",1,policy,october),r);
 assert.throws(()=>reserveSpend("one","merchant-b","ai","synthetic-model",1,policy,october),/retry/);
 reserveSpend("two","merchant-a","ai","synthetic-model",1,policy,october);
 assert.throws(()=>reserveSpend("three","merchant-a","email","synthetic-email",1,policy,october),/spending limit/);
 reserveSpend("four","merchant-b","ai","synthetic-model",1,policy,october);
 assert.throws(()=>reserveSpend("five","merchant-c","ai","synthetic-model",1,policy,october),/spending limit/);
 assert.equal(spendingSummary("merchant-a",policy,october).application.used.microUsd,900);
}));
test("unknown and interrupted costs survive restart and month rollover without destructive resets",()=>temporary(()=>{
 reserveSpend("unknown","one","ai","synthetic-model",1,policy,october);recordSpendOutcome("unknown","unknown",october);
 reserveSpend("interrupted","one","ai","synthetic-model",1,policy,october);
 assert.equal(spendingSummary("one",policy,november).business.used.microUsd,600);
 assert.throws(()=>reserveSpend("new","one","ai","synthetic-model",1,policy,november),/spending limit/);
 reconcileSpend("unknown",100,"provider-bill-0001",november);
 assert.equal(spendingSummary("one",policy,november).business.used.microUsd,300);
 reserveSpend("new","one","ai","synthetic-model",1,policy,november);
 assert.equal(spendingSummary("one",policy,october).business.used.microUsd,700); // includes unresolved later-period work conservatively
}));
test("billing reconciliation frees verified money but never refunds contact/request units",()=>temporary(()=>{
 reserveSpend("one","one","ai","synthetic-model",1,{...policy,aiRequests:1},october);
 assert.throws(()=>reconcileSpend("one",0,"provider-bill-0001",october),/Resolve/);
 recordSpendOutcome("one","committed",october);recordSpendOutcome("one","unknown",october);
 reconcileSpend("one",50,"provider-bill-0001",october);reconcileSpend("one",50,"provider-bill-0001",october);
 assert.equal(spendingSummary("one",policy,october).business.used.microUsd,50);
 assert.throws(()=>reserveSpend("two","one","ai","synthetic-model",1,{...policy,aiRequests:1},october),/service allowance/);
 assert.throws(()=>reconcileSpend("one",40,"provider-bill-0001",october),/already final/);
 reserveSpend("new-month","one","ai","synthetic-model",1,{...policy,aiRequests:1},november);
}));
test("rate overruns persist an incident and stop spending for every merchant",()=>temporary(()=>{
 reserveSpend("one","one","email","synthetic-email",1,policy,october);recordSpendOutcome("one","committed",october);
 assert.throws(()=>reconcileSpend("one",101,"provider-bill-0001",october),/spending blocked/);
 assert.equal(spendingSummary("one",policy,november).incidents,1);
 assert.throws(()=>reserveSpend("two","other","ai","synthetic-model",1,policy,november),/billing incident/);
}));
test("voice uses seconds and an explicit whole-call ceiling; no unlimited call reservation",()=>temporary(()=>{
 reserveSpend("voice","one","voice","synthetic-voice",120,policy,october);
 assert.equal(spendingSummary("one",policy,october).business.used.voiceSeconds,120);
 assert.throws(()=>reserveSpend("voice2","one","voice","synthetic-voice",1,policy,october),/spending limit|service allowance/);
 assert.throws(()=>reserveSpend("long","one","voice","synthetic-voice",121,policy,october),/bounded/);
}));

test("simultaneous processes cannot over-reserve a shared deployment ceiling",async()=>{
 const {spawn}=await import("node:child_process"),{pathToFileURL}=await import("node:url");
 const dir=mkdtempSync(path.join(os.tmpdir(),"nalbace-spend-concurrent-")),module=pathToFileURL(path.resolve("src/server/spending.ts")).href;
 const results=await Promise.all([1,2,3,4].map(id=>new Promise<string>((resolve,reject)=>{
  const script=`import {reserveSpend} from ${JSON.stringify(module)};try{reserveSpend("parallel-${id}","merchant-${id}","ai","synthetic-model",1,${JSON.stringify({...policy,applicationMicroUsd:300})},new Date("2026-10-31T23:59:00Z"));process.stdout.write("reserved")}catch(e){if(!e.message.includes("spending limit"))throw e;process.stdout.write("blocked")}`;
  const child=spawn(process.execPath,["--experimental-strip-types","--conditions=react-server","--input-type=module","-e",script],{cwd:dir});let out="",err="";child.stdout.on("data",v=>out+=v);child.stderr.on("data",v=>err+=v);child.on("error",reject);child.on("exit",code=>code===0?resolve(out):reject(new Error(err)));
 })));
 assert.equal(results.filter(x=>x==="reserved").length,1);assert.equal(results.filter(x=>x==="blocked").length,3);
});

test("AI dispatch is blocked by the money gate even when its older request allowance permits it",async()=>{
 const {prepareAiDraft}=await import("../src/server/ai-drafting.ts"),{saveWorkspaceControls,readWorkspace}=await import("../src/server/store.ts");
 const before=process.cwd(),dir=mkdtempSync(path.join(os.tmpdir(),"nalbace-spend-dispatch-"));
 const changes={NALBACE_AI_ENABLED:"true",ANTHROPIC_API_KEY:"synthetic-key",ANTHROPIC_MODEL:"synthetic-model",NALBACE_AI_MAX_REQUESTS:"2",NALBACE_SPEND_ENABLED:"false"},saved=Object.fromEntries(Object.keys(changes).map(k=>[k,process.env[k]]));
 process.chdir(dir);Object.assign(process.env,changes);let calls=0;
 try{saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:2});await assert.rejects(prepareAiDraft("birch",{provider:"fake",model:"synthetic-model",propose:async()=>{calls++;return {};}}));assert.equal(calls,0);assert.equal(readWorkspace().aiRuns?.[0].state,"failed");assert.equal(spendingSummary("merchant-demo").application.used.microUsd,0);}
 finally{process.chdir(before);for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test("a returned but invalid AI response retains its cost ceiling and cannot be retried for free",async()=>{
 const {prepareAiDraft}=await import("../src/server/ai-drafting.ts"),{saveWorkspaceControls,readWorkspace}=await import("../src/server/store.ts");
 const before=process.cwd(),dir=mkdtempSync(path.join(os.tmpdir(),"nalbace-spend-rejected-"));
 const changes={NALBACE_AI_ENABLED:"true",ANTHROPIC_API_KEY:"synthetic-key",ANTHROPIC_MODEL:"synthetic-model",NALBACE_AI_MAX_REQUESTS:"2",NALBACE_SPEND_ENABLED:"true",NALBACE_SPEND_RATE_CARD:"synthetic-v1",NALBACE_SPEND_VALID_UNTIL:"2030-01-01T00:00:00Z",NALBACE_SPEND_APPLICATION_MICRO_USD:"1000",NALBACE_SPEND_MERCHANT_MICRO_USD:"600",NALBACE_SPEND_AI_REQUESTS:"2",NALBACE_SPEND_AI_MAX_MICRO_USD:"300",NALBACE_SPEND_AI_MODEL:"synthetic-model"},saved=Object.fromEntries(Object.keys(changes).map(k=>[k,process.env[k]]));
 process.chdir(dir);Object.assign(process.env,changes);let calls=0;
 try{saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:2});await assert.rejects(prepareAiDraft("birch",{provider:"fake",model:"synthetic-model",propose:async()=>{calls++;return {};}}));assert.equal(calls,1);assert.equal(readWorkspace().aiRuns?.[0].state,"failed");const s=spendingSummary("merchant-demo");assert.equal(s.application.used.microUsd,300);assert.equal(s.business.used.aiRequests,1);assert.equal(s.unresolved,0);}
 finally{process.chdir(before);for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
