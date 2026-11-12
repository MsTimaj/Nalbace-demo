import test from "node:test";
import assert from "node:assert/strict";
import {fixtures} from "../src/server/fixtures.ts";
import {voiceStopDecision,type ActiveCallBinding} from "../src/domain/voice-stop.ts";
const now=new Date("2026-11-10T18:00:00Z");
function setup(){const client=fixtures(now)[1];client.aiCallPreference="allow";client.contactPermission={emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"Synthetic only",reviewedAt:now.toISOString()};const binding:ActiveCallBinding={caseId:client.id,merchantId:client.merchantId,caseVersion:client.version,phone:client.contactPermission.phone,startedAt:now.toISOString(),lastHeartbeatAt:now.toISOString(),maxSeconds:60};return {client,binding};}
test("active-call decision stops on payment, withdrawn permission and explicit stop without editing money",()=>{
 for(const event of ["paid","withdraw","stop","dispute","version"]){const {client,binding}=setup();if(event==="paid")client.invoices.forEach(i=>i.balanceMinor=0);if(event==="withdraw")client.contactPermission!.voiceAllowed=false;if(event==="dispute")client.hold="dispute";if(event==="version")client.version++;const before=structuredClone(client);assert.equal(voiceStopDecision(binding,client,now,event==="stop").stop,true);assert.deepEqual(client,before);}
});
test("heartbeat and hard-duration decisions fail closed independently of conversation turns",()=>{
 const {client,binding}=setup();assert.equal(voiceStopDecision(binding,client,now).stop,false);
 assert.equal(voiceStopDecision(binding,client,new Date(now.getTime()+10000)).reason,"heartbeat-lost");
 binding.lastHeartbeatAt=new Date(now.getTime()+60000).toISOString();assert.equal(voiceStopDecision(binding,client,new Date(now.getTime()+60000)).reason,"duration-limit");
 binding.startedAt="bad";assert.equal(voiceStopDecision(binding,client,now).reason,"invalid-clock");
});
test("different call destination or merchant stops and stop request wins even with invalid clock",()=>{
 for(const field of ["phone","merchantId","caseId"] as const){const {client,binding}=setup();binding[field]="different";assert.equal(voiceStopDecision(binding,client,now).stop,true);}
 const {client,binding}=setup();assert.equal(voiceStopDecision(binding,client,new Date(NaN),true).reason,"stop-request");
});
