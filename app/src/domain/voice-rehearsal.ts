// Offline conversation rules only. No telephony transport, model call, actual
// authentication or live-call authorization is implemented by this module.
import {createHash} from "node:crypto";
import {contactEligibility,remainingInvoices} from "./case-rules.ts";
import type {ClientCase} from "./cases.ts";
export type RehearsalLimits={maxSeconds:number;maxTurns:number;billingUnitSeconds:number;rateMicroUsdPerSecond:number;setupMicroUsd:number};
export type RehearsalAllowance={attempts:number;seconds:number;microUsd:number};
export type VoicePurpose={ownerId:string;merchantId:string;businessName:string;caseId:string;caseVersion:number;phone:string;invoiceIds:string[];expiresAt:string;limits:RehearsalLimits};
export type RehearsalEvent=
  |{id:string;kind:"identity-confirmed";basis:"synthetic-owner-roleplay"}
  |{id:string;kind:"wrong-person"|"voicemail"|"silence"|"stop"|"payment-claim"|"dispute"|"needs-copy"|"discount"|"card-details"|"interruption"|"end"|"tick"}
  |{id:string;kind:"promise";reviewDate:string};
export type VoiceRehearsal={mode:"offline-rehearsal";purpose:VoicePurpose;fingerprint:string;startedAt:string;lastAt:string;turns:number;identityConfirmed:boolean;state:"active"|"ended";outcome:string;reservedMicroUsd:number;events:string[];lines:string[];ownerReview:{kind:string;reviewDate?:string}[]};
function fingerprint(p:VoicePurpose){return createHash("sha256").update(JSON.stringify(p)).digest("hex");}
function purposeCheck(c:ClientCase,p:VoicePurpose,now:Date){
  if(!p.ownerId||p.merchantId!==c.merchantId||p.caseId!==c.id||p.caseVersion!==c.version||p.phone!==c.contactPermission?.phone)throw new Error("Review the exact call purpose, case version and consented destination.");
  if(!/^[A-Za-z0-9][A-Za-z0-9 &.,'-]{0,79}$/.test(p.businessName))throw new Error("Review the business name for the disclosure.");
  const expires=Date.parse(p.expiresAt);if(!Number.isFinite(expires)||expires<=now.getTime()||expires>now.getTime()+30*60000)throw new Error("Review the call purpose expiry.");
  if(JSON.stringify([...p.invoiceIds].sort())!==JSON.stringify(remainingInvoices(c).map(i=>i.id).sort()))throw new Error("Review the exact invoice set for this call purpose.");
  const l=p.limits;
  if(![l.maxSeconds,l.maxTurns,l.billingUnitSeconds,l.rateMicroUsdPerSecond,l.setupMicroUsd].every(Number.isSafeInteger)||l.maxSeconds<1||l.maxSeconds>120||l.maxTurns<1||l.maxTurns>8||l.billingUnitSeconds<1||l.billingUnitSeconds>60||l.rateMicroUsdPerSecond<=0||l.setupMicroUsd<0)throw new Error("Review bounded voice duration, turns and a known rate assumption.");
  const eligible=contactEligibility(c,now,"voice");if(!eligible.eligible)throw new Error(eligible.reason);
}
export function beginVoiceRehearsal(c:ClientCase,purpose:VoicePurpose,allowance:RehearsalAllowance,now:Date){
  if(!Number.isFinite(now.getTime()))throw new Error("Review a valid rehearsal time.");purposeCheck(c,purpose,now);
  const seconds=Math.ceil(purpose.limits.maxSeconds/purpose.limits.billingUnitSeconds)*purpose.limits.billingUnitSeconds,cost=seconds*purpose.limits.rateMicroUsdPerSecond+purpose.limits.setupMicroUsd;
  if(!Number.isSafeInteger(cost)||![allowance.attempts,allowance.seconds,allowance.microUsd].every(Number.isSafeInteger)||allowance.attempts<1||allowance.attempts>3||allowance.seconds<seconds||allowance.seconds>360||allowance.microUsd<cost)throw new Error("Voice rehearsal allowance is exhausted or insufficient.");
  const session:VoiceRehearsal={mode:"offline-rehearsal",purpose:structuredClone(purpose),fingerprint:fingerprint(purpose),startedAt:now.toISOString(),lastAt:now.toISOString(),turns:0,identityConfirmed:false,state:"active",outcome:"awaiting-identity",reservedMicroUsd:cost,events:[],lines:[`Hi, I’m an AI assistant calling on behalf of ${purpose.businessName}. Before discussing any details, are you the authorized billing contact, and is now a convenient time?`],ownerReview:[]};
  return {session,allowance:{attempts:allowance.attempts-1,seconds:allowance.seconds-seconds,microUsd:allowance.microUsd-cost}};
}
function end(s:VoiceRehearsal,outcome:string,line:string,review?:{kind:string;reviewDate?:string}){
  s.state="ended";s.outcome=outcome;if(line)s.lines.push(line);if(review)s.ownerReview.push(review);return s;
}
export function stepVoiceRehearsal(current:VoiceRehearsal,c:ClientCase,event:RehearsalEvent,now:Date):VoiceRehearsal{
  if(current.mode!=="offline-rehearsal")throw new Error("Only an offline rehearsal is supported.");
  const s=structuredClone(current);
  if(c.id!==s.purpose.caseId||c.merchantId!==s.purpose.merchantId)throw new Error("The rehearsal does not belong to this client and merchant.");
  if(!/^[A-Za-z0-9-]{1,64}$/.test(event.id))return end(s,"invalid-event","",{kind:"review-input"});
  // A late stop still needs owner attention after timeout, payment or hangup.
  // It must not be swallowed by limits or reused provider-event identifiers.
  if(event.kind==="stop"){
    if(s.outcome==="contact-stop")return s;
    s.events.push(event.id);return end(s,"contact-stop","Understood. I’ll stop this conversation and pass your request to the business.",{kind:"record-contact-stop"});
  }
  if(s.state==="ended")return s;
  const time=now.getTime();if(!Number.isFinite(time)||time<Date.parse(s.lastAt))return end(s,"invalid-clock","",{kind:"review-clock"});
  s.lastAt=now.toISOString();
  // Recheck source, consent, receipts and case identity before each response,
  // including duplicate inputs. A payment or stop can never wait for turn dedupe.
  if(fingerprint(s.purpose)!==s.fingerprint)return end(s,"purpose-changed","",{kind:"review-purpose"});
  const gate=contactEligibility(c,now,"voice");
  if(!gate.eligible||c.version!==s.purpose.caseVersion||c.merchantId!==s.purpose.merchantId||c.id!==s.purpose.caseId||c.contactPermission?.phone!==s.purpose.phone){
    return end(s,"case-no-longer-eligible","I’ll stop here so the business can check its records. Thank you.",{kind:"review-fresh-case"});
  }
  if(Date.parse(s.purpose.expiresAt)<=time)return end(s,"purpose-expired","I’ll end the conversation here. Thank you.",{kind:"review-purpose"});
  if(time-Date.parse(s.startedAt)>=s.purpose.limits.maxSeconds*1000)return end(s,"duration-limit","I’ll leave this with the business to review. Thank you.",{kind:"review-call-limit"});
  // The future transport needs an independent watchdog. A synthetic clock tick
  // checks stopping conditions without being counted as a conversational turn.
  if(event.kind==="tick")return s;
  if(s.events.includes(event.id))return s;
  s.events.push(event.id);s.turns++;
  if(s.turns>s.purpose.limits.maxTurns)return end(s,"turn-limit","I’ll leave this with the business to review. Thank you.",{kind:"review-call-limit"});
  if(event.kind==="wrong-person")return end(s,"wrong-person","Thank you for letting me know. I won’t discuss any billing details.",{kind:"verify-billing-contact"});
  if(event.kind==="voicemail")return end(s,"voicemail-no-message","",{kind:"review-unanswered-call"});
  if(event.kind==="silence"||event.kind==="end")return end(s,"conversation-ended","Thank you. I’ll end the conversation here.");
  if(event.kind==="card-details")return end(s,"sensitive-payment-details","Please don’t share card or bank details on this call. I’ll leave this with the business.",{kind:"review-safe-payment-path"});
  if(!s.identityConfirmed){
    if(event.kind==="identity-confirmed"&&event.basis==="synthetic-owner-roleplay"){
      s.identityConfirmed=true;s.outcome="identity-roleplayed";
      const invoices=remainingInvoices(c),amount=invoices.reduce((n,i)=>n+i.balanceMinor,0);
      s.lines.push(`In this synthetic rehearsal, the checked records show ${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount/100)} remaining on ${invoices.length} invoice${invoices.length===1?"":"s"}. Have you already sent payment, or is there something the business needs to review?`);return s;
    }
    return end(s,"identity-not-confirmed","I won’t discuss billing details without confirming the right contact. Thank you.",{kind:"verify-billing-contact"});
  }
  if(event.kind==="payment-claim")return end(s,"payment-claimed","Thank you for letting me know. The business will check its payment records before following up again.",{kind:"verify-payment-and-hold"});
  if(event.kind==="dispute")return end(s,"dispute","I’ll pass that to the business for review. I won’t try to resolve the amount on this call.",{kind:"record-dispute-and-hold"});
  if(event.kind==="discount")return end(s,"outside-authority","A person at the business needs to review any change to the amount or payment terms.",{kind:"owner-decision"});
  if(event.kind==="needs-copy")return end(s,"copy-request","I’ll ask the business to review your request for a copy. Nothing will be sent from this rehearsal.",{kind:"review-invoice-copy"});
  if(event.kind==="promise"){
    const date=Date.parse(event.reviewDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(event.reviewDate)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==event.reviewDate||date<=time||date>time+366*86400000)return end(s,"promise-needs-clarification","I’ll ask the business to confirm the next review date with you.",{kind:"confirm-review-date"});
    return end(s,"promise-for-owner-review","Thank you. I’ll pass that proposed date to the business. This does not change the payment record.",{kind:"review-payment-promise",reviewDate:event.reviewDate});
  }
  if(event.kind==="interruption"){s.lines.push("Of course—go ahead.");return s;}
  return end(s,"unsupported-input","I’ll leave that with the business for review. Thank you.",{kind:"review-input"});
}
