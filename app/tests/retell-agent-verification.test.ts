import test from "node:test";
import assert from "node:assert/strict";
import {verifyRetellAgent} from "../src/server/retell-agent-verification.ts";
import {nalbaceVoicePrompt,nalbaceVoiceGreeting,nalbaceVoiceTools} from "../src/server/retell-agent-spec.ts";
const p={agentId:"agent_offline",agentVersion:1,from:"+12025550123",voiceId:"retell-Tamsin",language:"en-US"} as const;
const agent={agent_id:p.agentId,version:1,is_published:true,voice_id:p.voiceId,language:p.language,max_call_duration_ms:60000,end_call_after_silence_ms:10000,response_engine:{type:"retell-llm",llm_id:"llm_offline",version:0}};
const llm={llm_id:"llm_offline",version:0,is_published:true,model_config:{type:"cascading",primary:{model:"gpt-5.6-terra",tier:"standard"}},general_prompt:nalbaceVoicePrompt,begin_message:nalbaceVoiceGreeting,general_tools:nalbaceVoiceTools};
test("verification reads only exact pinned agent and engine and returns no provider body",async()=>{
 const urls:string[]=[];const r=await verifyRetellAgent("offline-private-secret-value",p,async(url,init)=>{urls.push(String(url));assert.equal(init?.redirect,"error");assert.equal(init?.cache,"no-store");assert.ok(init?.signal);return Response.json(urls.length===1?agent:{...llm,private_field:"must-not-return"});});assert.equal(r.version,1);assert.ok(!JSON.stringify(r).includes("must-not-return"));assert.deepEqual(urls,["https://api.retellai.com/get-agent/agent_offline?version=1","https://api.retellai.com/get-retell-llm/llm_offline?version=0"]);
});
test("unpublished, changed voice, long duration or unbound engine fail closed",async()=>{
 for(const mutation of [{is_published:false},{version:2},{voice_id:"other"},{max_call_duration_ms:120000},{response_engine:{type:"retell-llm",llm_id:"../other",version:0}}]){let reads=0;await assert.rejects(verifyRetellAgent("offline-private-secret-value",p,async()=>{reads++;return Response.json({...agent,...mutation});}));assert.equal(reads,1);}
});
test("changed prompt, extra tools, states, knowledge or unpublished engine prevent dispatch",async()=>{
 for(const mutation of [{model_config:{type:"cascading",primary:{model:"other",tier:"standard"}}},{model_high_priority:true},{is_published:false},{general_prompt:"changed"},{general_tools:[...nalbaceVoiceTools,{type:"custom",name:"unsafe"}]},{states:[{name:"other"}]},{knowledge_base_ids:["kb_other"]}]){let reads=0;await assert.rejects(verifyRetellAgent("offline-private-secret-value",p,async()=>Response.json(++reads===1?agent:{...llm,...mutation})));assert.equal(reads,2);}
});
