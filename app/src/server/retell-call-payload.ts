import "server-only";
import type {VoiceCallRecord} from "../domain/voice-lifecycle.ts";
import {validateVoiceProfile} from "../domain/voice-lifecycle.ts";
import type {VoiceContextReview} from "../domain/voice-context.ts";
import {voiceContextFingerprint} from "../domain/voice-context.ts";

// Request preparation only. No network access or API key; not call authority.
// The published agent must first be reviewed to handle this data variable.
export function retellPhonePayload(call:VoiceCallRecord,review:VoiceContextReview,now=new Date()){
 const c=review.context;
 if(call.state!=="reserved"||call.reviewId!==review.id||call.caseId!==c.caseId||call.merchantId!==c.merchantId||review.fingerprint!==voiceContextFingerprint(c)||!Number.isFinite(now.getTime())||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=now.getTime()||c.maxSeconds!==60||!/^\+[1-9]\d{6,14}$/.test(c.phone)||!/^[A-Za-z0-9-]{1,100}$/.test(call.id))throw new Error("Review the exact unexpired reserved call facts.");
 const profile=validateVoiceProfile(call.profile);
 // Invoice labels are omitted from provider context; numeric facts use exact
 // application cents. No email, phone, consent text, history, or customer reply
 // is included in this LLM variable. Phone numbers belong only to telephony.
 if(!Number.isSafeInteger(c.totalMinor)||c.totalMinor<=0||!c.invoices.length||c.invoices.length>20||c.invoices.some(i=>!Number.isSafeInteger(i.balanceMinor)||i.balanceMinor<=0||!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate))||c.invoices.reduce((sum,i)=>sum+i.balanceMinor,0)!==c.totalMinor)throw new Error("Review exact supported voice financial facts.");
 const facts={mode:"synthetic-paypal-test",currency:"USD",total_minor:c.totalMinor,total_display:new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c.totalMinor/100),invoices:c.invoices.map((i,index)=>({position:index+1,balance_minor:i.balanceMinor,due_date:i.dueDate})),checked_at:c.evidenceAt,expires_at:c.expiresAt};
 return {from_number:profile.from,to_number:c.phone,idempotency_key:call.id,override_agent_id:profile.agentId,override_agent_version:profile.agentVersion,agent_override:{agent:{voice_id:profile.voiceId,language:profile.language,max_call_duration_ms:60000,end_call_after_silence_ms:10000}},retell_llm_dynamic_variables:{nalbace_invoice_facts:JSON.stringify(facts)},metadata:{nalbace_call_id:call.id},honor_internal_dnc:true};
}
