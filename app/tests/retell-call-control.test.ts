import test from "node:test";
import assert from "node:assert/strict";
import {retellCallControl} from "../src/server/retell-call-control.ts";
const binding={callId:"call_synthetic",agentId:"agent_synthetic"};
const payload=(status="ongoing",extra:Record<string,unknown>={})=>new Response(JSON.stringify({call_id:binding.callId,agent_id:binding.agentId,call_status:status,...extra}));
test("stop is bound to exact provider call and confirms ending separately",async()=>{
 const paths:string[]=[];const methods:string[]=[];
 const request:typeof fetch=async(input,init)=>{paths.push(String(input));methods.push(init!.method!);assert.equal(init!.redirect,"error");assert.equal(init!.cache,"no-store");assert.ok(init!.signal);return paths.length===1?payload():paths.length===2?new Response(null,{status:204}):payload("ended");};
 const control=retellCallControl("synthetic-key",binding,request);assert.deepEqual(await control.stop(),{state:"confirmed-ended"});
 assert.deepEqual(methods,["GET","POST","GET"]);assert.deepEqual(paths,["https://api.retellai.com/v2/get-call/call_synthetic","https://api.retellai.com/v2/stop-call/call_synthetic","https://api.retellai.com/v2/get-call/call_synthetic"]);
});
test("accepted stop is not reported as a confirmed hangup while provider still says ongoing",async()=>{
 let count=0;const control=retellCallControl("synthetic-key",binding,async()=>++count===2?new Response(null,{status:204}):payload());assert.deepEqual(await control.stop(),{state:"stop-requested"});assert.equal(count,3);
});
test("wrong agent, call or status never reaches stop; secrets are not returned",async()=>{
 for(const extra of [{agent_id:"other"},{call_id:"other"},{call_status:"unrecognized"}]){let count=0;const control=retellCallControl("synthetic-key",binding,async()=>{count++;return payload("ongoing",extra);});await assert.rejects(control.stop(),/unresolved/);assert.equal(count,1);}
 const control=retellCallControl("synthetic-key",binding,async()=>payload("ended",{access_token:"private-token",transcript:"private-transcript"}));assert.deepEqual(await control.read(),{status:"ended",ended:true});assert.deepEqual(await control.stop(),{state:"already-ended"});
});
test("invalid identifiers and credentials fail before any network access",()=>{
 assert.throws(()=>retellCallControl("synthetic-key",{...binding,callId:"../other?token=secret"}));assert.throws(()=>retellCallControl("bad\r\nkey",binding));assert.throws(()=>retellCallControl("",binding));
});
test("stop failure or uncertain read is unresolved with no automatic retry",async()=>{
 for(const failedAt of [1,2,3]){let count=0;const control=retellCallControl("synthetic-key",binding,async()=>{count++;if(count===failedAt)throw new Error("sensitive provider detail");return count===2?new Response(null,{status:204}):payload();});await assert.rejects(control.stop(),error=>error instanceof Error&&!error.message.includes("sensitive")&&error.message.includes("unresolved"));assert.equal(count,failedAt);}
});
