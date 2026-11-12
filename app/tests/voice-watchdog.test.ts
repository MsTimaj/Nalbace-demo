import test from "node:test";
import assert from "node:assert/strict";
import {superviseVoiceCall} from "../src/server/voice-watchdog.ts";
test("watchdog polls only the saved attempt and exits on confirmed ending",async()=>{
 let now=0,reads=0;const result=await superviseVoiceCall("attempt_offline",{clock:()=>now,wait:async ms=>{now+=ms;},step:async(id,heartbeat,_request,at)=>{assert.equal(id,"attempt_offline");assert.equal(heartbeat,at.toISOString());return {state:++reads===3?"ended":"ongoing"};}});assert.equal(result.state,"ended");assert.equal(reads,3);assert.equal(now,4000);
});
test("provider outage has bounded polling and a stale-heartbeat stop pass, never a false ending",async()=>{
 let now=0,reads=0,finalStale=false;const result=await superviseVoiceCall("attempt_offline",{clock:()=>now,wait:async ms=>{now+=ms;},step:async(_id,heartbeat,_request,at)=>{reads++;finalStale=at.getTime()-Date.parse(heartbeat)>10000;throw new Error("private provider body");}});assert.equal(result.state,"unresolved");assert.equal(reads,41);assert.equal(now,80000);assert.equal(finalStale,true);
});
test("a stop request without provider confirmation remains unresolved",async()=>{
 let now=0;const result=await superviseVoiceCall("attempt_offline",{clock:()=>now,wait:async ms=>{now+=ms;},step:async()=>({state:"stop-requested"})});assert.equal(result.state,"unresolved");await assert.rejects(superviseVoiceCall("../wrong"));
});
