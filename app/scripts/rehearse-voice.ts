// No credentials, network, phone transport, model or live workspace are used.
import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import {fixtures} from "../src/server/fixtures.ts";
import {beginVoiceRehearsal,stepVoiceRehearsal} from "../src/domain/voice-rehearsal.ts";
import type {VoicePurpose,RehearsalEvent,VoiceRehearsal} from "../src/domain/voice-rehearsal.ts";
const now=new Date("2026-10-25T16:00:00Z"),at=(seconds:number)=>new Date(now.getTime()+seconds*1000);
const makeClient=()=>{const c=fixtures(now)[1];c.aiCallPreference="allow";c.contactPermission={emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"Synthetic roleplay; this is not a callable destination.",reviewedAt:now.toISOString()};return c;};
const purpose=(c:ReturnType<typeof makeClient>):VoicePurpose=>({ownerId:"owner-demo",merchantId:c.merchantId,businessName:"Demo Services",caseId:c.id,caseVersion:c.version,phone:c.contactPermission!.phone,invoiceIds:c.invoices.map(i=>i.id),expiresAt:at(300).toISOString(),limits:{maxSeconds:120,maxTurns:8,billingUnitSeconds:60,rateMicroUsdPerSecond:2000,setupMicroUsd:10000}});
const caps={attempts:3,seconds:360,microUsd:750000};
const identify:RehearsalEvent={id:"identity",kind:"identity-confirmed",basis:"synthetic-owner-roleplay"};
const results:{scenario:string;outcome:string;passed:boolean;transcript?:string[];ownerReview?:VoiceRehearsal["ownerReview"]}[]=[];
function run(scenario:string,events:{event:RehearsalEvent;seconds:number;paid?:boolean}[],expected:string){
  const c=makeClient(),before=structuredClone(c),reservation=beginVoiceRehearsal(c,purpose(c),caps,now);let s=reservation.session;
  for(const turn of events){if(turn.paid)c.invoices.forEach(i=>i.balanceMinor=0);s=stepVoiceRehearsal(s,c,turn.event,at(turn.seconds));}
  assert.equal(s.outcome,expected);assert.equal(s.mode,"offline-rehearsal");assert.equal(reservation.allowance.microUsd,500000);
  // Only the scenario's explicit simulated provider update may change facts.
  if(!events.some(t=>t.paid))assert.deepEqual(c,before);
  results.push({scenario,outcome:s.outcome,passed:true,transcript:s.lines,ownerReview:s.ownerReview});
}
run("Wrong person",[{event:{id:"wrong",kind:"wrong-person"},seconds:1}],"wrong-person");
run("Voicemail: no financial message",[{event:{id:"voicemail",kind:"voicemail"},seconds:1}],"voicemail-no-message");
run("Already paid: ask owner to verify",[{event:identify,seconds:1},{event:{id:"claim",kind:"payment-claim"},seconds:5}],"payment-claimed");
run("Disputed amount",[{event:identify,seconds:1},{event:{id:"dispute",kind:"dispute"},seconds:5}],"dispute");
run("Stop before identity confirmation",[{event:{id:"stop",kind:"stop"},seconds:1}],"contact-stop");
run("Late stop after timeout",[{event:identify,seconds:120},{event:{id:"late-stop",kind:"stop"},seconds:121}],"contact-stop");
run("Confirmed date stays a proposal",[{event:identify,seconds:1},{event:{id:"promise",kind:"promise",reviewDate:"2026-10-28"},seconds:5}],"promise-for-owner-review");
run("Discount needs owner",[{event:identify,seconds:1},{event:{id:"discount",kind:"discount"},seconds:5}],"outside-authority");
run("Copy request cannot send",[{event:identify,seconds:1},{event:{id:"copy",kind:"needs-copy"},seconds:5}],"copy-request");
run("No card collection",[{event:identify,seconds:1},{event:{id:"card",kind:"card-details"},seconds:5}],"sensitive-payment-details");
run("Payment arrives during conversation",[{event:identify,seconds:1},{event:{id:"next",kind:"interruption"},seconds:5,paid:true}],"case-no-longer-eligible");
run("Maximum duration",[{event:identify,seconds:120}],"duration-limit");
for(const kind of ["consent","allowance"]){const c=makeClient();if(kind==="consent")c.contactPermission!.voiceAllowed=false;assert.throws(()=>beginVoiceRehearsal(c,purpose(c),kind==="allowance"?{attempts:0,seconds:0,microUsd:0}:caps,now));results.push({scenario:kind==="consent"?"No consent":"No allowance",outcome:"blocked-before-start",passed:true});}
const report={kind:"offline-voice-rehearsal",syntheticScenarioTime:now.toISOString(),actualPhoneCalls:0,modelRequests:0,externalMessages:0,workspaceMutations:0,actualSpendUsd:0,rateAssumptionsOnly:{maxSeconds:120,maxTurns:8,billingUnitSeconds:60,rateMicroUsdPerSecond:2000,setupMicroUsd:10000,maximumReservationMicroUsd:250000,note:"Hypothetical test arithmetic only, not a provider quote, funded allowance or paid-call authorization."},limitations:["Typed synthetic events, not speech recognition or model interpretation.","Simulated billing-contact confirmation, not real identity verification.","Owner-review intents are returned, not persisted as real customer updates.","No telephony, voice quality, latency, interruptions, voicemail detection, provider hangup or billing integration has been verified."],results};
const output=fileURLToPath(new URL("../../output/evaluations/voice-rehearsal-2026-10-25.json",import.meta.url));mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({scenarios:results.length,passed:results.filter(r=>r.passed).length,actualPhoneCalls:0,modelRequests:0,actualSpendUsd:0,output}));
