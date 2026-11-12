import test from "node:test";
import assert from "node:assert/strict";
import {fixtures} from "../src/server/fixtures.ts";
import {contactEligibility} from "../src/domain/case-rules.ts";
import {beginVoiceRehearsal,stepVoiceRehearsal} from "../src/domain/voice-rehearsal.ts";
import type {VoicePurpose,RehearsalAllowance,RehearsalEvent} from "../src/domain/voice-rehearsal.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
const now=new Date("2026-10-25T16:00:00Z");
const after=(seconds:number)=>new Date(now.getTime()+seconds*1000);
function client(){const c=fixtures(now)[1];c.aiCallPreference="allow";c.contactPermission={emailAllowed:false,voiceAllowed:true,phone:"+12025550123",note:"Synthetic owner roleplay only.",reviewedAt:now.toISOString()};return c;}
function purpose(c=client()):VoicePurpose{return {ownerId:"owner-demo",merchantId:c.merchantId,businessName:"Demo Services",caseId:c.id,caseVersion:c.version,phone:c.contactPermission!.phone,invoiceIds:c.invoices.map(i=>i.id),expiresAt:after(300).toISOString(),limits:{maxSeconds:120,maxTurns:8,billingUnitSeconds:60,rateMicroUsdPerSecond:2000,setupMicroUsd:10000}};}
const allowance:RehearsalAllowance={attempts:3,seconds:360,microUsd:750000};
function start(){const c=client(),p=purpose(c),r=beginVoiceRehearsal(c,p,allowance,now);return {c,p,...r};}
const identity:RehearsalEvent={id:"identity-1",kind:"identity-confirmed",basis:"synthetic-owner-roleplay"};
test("voice permission is separate from email while all shared financial gates remain",()=>{
  const c=client();assert.equal(contactEligibility(c,now).eligible,false);assert.equal(contactEligibility(c,now,"voice").eligible,true);
  c.contactPermission!.voiceAllowed=false;assert.equal(contactEligibility(c,now,"voice").eligible,false);
});
test("missing consent, wrong destination, changed case, wrong merchant and invoice changes cannot begin",()=>{
  for(const kind of ["consent","phone","version","merchant","invoices"]){const c=client(),p=purpose(c);if(kind==="consent")c.contactPermission!.voiceAllowed=false;if(kind==="phone")p.phone="+12025550124";if(kind==="version")p.caseVersion++;if(kind==="merchant")p.merchantId="other";if(kind==="invoices")p.invoiceIds=[];assert.throws(()=>beginVoiceRehearsal(c,p,allowance,now));}
});
test("paid, pending check, promise wait and suppressed cases cannot begin",()=>{
  for(const kind of ["paid","check","promise","stop"]){const c=client();if(kind==="paid")c.invoices.forEach(i=>i.balanceMinor=0);if(kind==="check")c.receipts=[{id:"pending-check",kind:"check",state:"received",receivedAt:now.toISOString(),allocations:[{invoiceId:c.invoices[0].id,amountMinor:1000}]}];if(kind==="promise")c.nextActionAt=after(86400).toISOString();if(kind==="stop")c.hold="suppressed";assert.throws(()=>beginVoiceRehearsal(c,purpose(c),allowance,now));}
});
test("opening discloses AI and business but reveals no invoice or balance before simulated identity",()=>{
  const {session,c}=start();assert.match(session.lines[0],/AI assistant.*Demo Services/);assert.doesNotMatch(session.lines[0],/400|1041|1045/);
  const ended=stepVoiceRehearsal(session,c,{id:"unconfirmed",kind:"payment-claim"},after(1));assert.equal(ended.state,"ended");assert.equal(ended.identityConfirmed,false);assert.doesNotMatch(ended.lines.join(" "),/400|1041|1045/);
});
test("wrong person and voicemail reveal no details; voicemail leaves no message",()=>{
  for(const kind of ["wrong-person","voicemail"] as const){const {session,c}=start(),ended=stepVoiceRehearsal(session,c,{id:kind,kind},after(1));assert.equal(ended.state,"ended");assert.doesNotMatch(ended.lines.join(" "),/400|1041|1045/);if(kind==="voicemail")assert.equal(ended.lines.length,1);}
});
test("billing facts appear only after synthetic confirmation; payment claim holds for review without changing a balance",()=>{
  const {session,c}=start(),before=structuredClone(c),identified=stepVoiceRehearsal(session,c,identity,after(1));assert.match(identified.lines[1],/synthetic rehearsal.*\$400\.00.*2 invoices/);
  const ended=stepVoiceRehearsal(identified,c,{id:"payment-claim",kind:"payment-claim"},after(2));assert.equal(ended.outcome,"payment-claimed");assert.deepEqual(ended.ownerReview,[{kind:"verify-payment-and-hold"}]);assert.deepEqual(c,before);
});
test("disputes, discounts, copies and card details route to owner without a send or financial change",()=>{
  for(const kind of ["dispute","discount","needs-copy","card-details"] as const){const {session,c}=start(),before=structuredClone(c),identified=stepVoiceRehearsal(session,c,identity,after(1)),ended=stepVoiceRehearsal(identified,c,{id:kind,kind},after(2));assert.equal(ended.state,"ended");assert.equal(ended.ownerReview.length,1);assert.deepEqual(c,before);assert.equal((ended as unknown as Record<string,unknown>).send,undefined);}
});
test("a promise is a proposed date for owner review, never a scheduled change or payment",()=>{
  const {session,c}=start(),before=structuredClone(c),identified=stepVoiceRehearsal(session,c,identity,after(1));
  const ended=stepVoiceRehearsal(identified,c,{id:"promise",kind:"promise",reviewDate:"2026-10-28"},after(2));assert.deepEqual(ended.ownerReview,[{kind:"review-payment-promise",reviewDate:"2026-10-28"}]);assert.deepEqual(c,before);
  for(const date of ["2026-10-24","2026-02-30","2028-10-25","tomorrow"]){const invalid=stepVoiceRehearsal(identified,c,{id:"bad-promise",kind:"promise",reviewDate:date},after(2));assert.equal(invalid.outcome,"promise-needs-clarification");}
});
test("reservation counts maximum rounded duration and setup under explicit hypothetical rates; no refund is automatic",()=>{
  const {session,allowance:remaining}=start();assert.equal(session.reservedMicroUsd,250000);assert.deepEqual(remaining,{attempts:2,seconds:240,microUsd:500000});assert.deepEqual(allowance,{attempts:3,seconds:360,microUsd:750000});
  const c=client(),p=purpose(c);p.limits.maxSeconds=61;assert.equal(beginVoiceRehearsal(c,p,allowance,now).session.reservedMicroUsd,250000);
  for(const caps of [{...allowance,attempts:0},{...allowance,seconds:60},{...allowance,microUsd:249999},{...allowance,attempts:4}])assert.throws(()=>beginVoiceRehearsal(c,p,caps,now),/allowance/);
  p.limits.rateMicroUsdPerSecond=0;assert.throws(()=>beginVoiceRehearsal(c,p,allowance,now),/known rate/);
});
test("new payment, stop or pending receipt during conversation ends further pursuit",()=>{
  for(const kind of ["paid","stop","check"]){const {session,c}=start(),identified=stepVoiceRehearsal(session,c,identity,after(1));if(kind==="paid")c.invoices.forEach(i=>i.balanceMinor=0);if(kind==="stop")c.hold="suppressed";if(kind==="check")c.receipts.push({id:"new-check",kind:"check",state:"received",receivedAt:after(2).toISOString(),allocations:[{invoiceId:c.invoices[0].id,amountMinor:1000}]});const ended=stepVoiceRehearsal(identified,c,{id:"next",kind:"interruption"},after(3));assert.equal(ended.outcome,"case-no-longer-eligible");}
});
test("live-style sandbox evidence becomes unusable when stale; fixture rehearsal is not provider verification",()=>{
  const c=client();c.source="paypal-sandbox";c.evidenceStatus="ready";c.evidenceAt=now.toISOString();c.invoices=c.invoices.map(i=>({...i,evidence:normalizeSandboxInvoice({id:"INV2-"+i.number,status:"UNPAID",due_amount:{currency_code:"USD",value:(i.balanceMinor/100).toFixed(2)},detail:{payment_term:{due_date:i.dueDate}}},now.toISOString())}));
  const started=beginVoiceRehearsal(c,purpose(c),allowance,now).session;assert.equal(stepVoiceRehearsal(started,c,identity,after(61)).outcome,"case-no-longer-eligible");
});
test("timeout, turn limit, changed purpose and backward clock end the conversation",()=>{
  const {session,c}=start();assert.equal(stepVoiceRehearsal(session,c,identity,after(120)).outcome,"duration-limit");
  const changed=structuredClone(session);changed.purpose.limits.maxSeconds=999;assert.equal(stepVoiceRehearsal(changed,c,identity,after(1)).outcome,"purpose-changed");
  assert.equal(stepVoiceRehearsal(session,c,identity,after(-1)).outcome,"invalid-clock");
  let s=stepVoiceRehearsal(session,c,identity,after(1));for(let i=2;i<=9;i++)s=stepVoiceRehearsal(s,c,{id:`turn-${i}`,kind:"interruption"},after(i));assert.equal(s.outcome,"turn-limit");
});
test("duplicate turns do not advance the conversation but cannot hide changed payment evidence",()=>{
  const {session,c}=start(),s=stepVoiceRehearsal(session,c,identity,after(1)),duplicate=stepVoiceRehearsal(s,c,identity,after(2));assert.equal(duplicate.turns,1);assert.equal(duplicate.lines.length,2);
  c.invoices.forEach(i=>i.balanceMinor=0);assert.equal(stepVoiceRehearsal(duplicate,c,identity,after(3)).state,"ended");
});
test("stop before identity, at duration cap, after ending or with a reused event id is always retained once",()=>{
  const {session,c}=start();assert.equal(stepVoiceRehearsal(session,c,{id:"stop-1",kind:"stop"},after(0)).outcome,"contact-stop");
  const timed=stepVoiceRehearsal(session,c,identity,after(120));const stopped=stepVoiceRehearsal(timed,c,{id:"identity-1",kind:"stop"},after(121));assert.equal(stopped.outcome,"contact-stop");assert.equal(stopped.ownerReview.filter(r=>r.kind==="record-contact-stop").length,1);assert.deepEqual(stepVoiceRehearsal(stopped,c,{id:"stop-again",kind:"stop"},after(122)),stopped);
});
test("watchdog ticks check duration without speaking, using a turn or refunding the reservation",()=>{
  const {session,c}=start();let s=stepVoiceRehearsal(session,c,{id:"tick-1",kind:"tick"},after(30));assert.equal(s.turns,0);assert.deepEqual(s.lines,session.lines);
  s=stepVoiceRehearsal(s,c,{id:"tick-2",kind:"tick"},after(120));assert.equal(s.outcome,"duration-limit");assert.equal(s.reservedMicroUsd,session.reservedMicroUsd);
});
