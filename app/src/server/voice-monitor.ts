import "server-only";
import {readWorkspace,confirmVoiceEnded} from "./store.ts";
import {retellConnection,voiceConfiguration} from "./retell-connection.ts";
import {retellCallControl} from "./retell-call-control.ts";
import {voiceStopDecision} from "../domain/voice-stop.ts";

// One monitor step, intended for a future independent supervised worker. This
// module does not schedule itself, discover PayPal changes, or start any calls.
export async function monitorVoiceCall(id:string,lastHeartbeatAt:string,request:typeof fetch=fetch,now=new Date()){
 const w=readWorkspace(),call=w.voiceCalls?.find(c=>c.id===id);
 if(!call||!call.providerCallId||!["accepted","ended"].includes(call.state))throw new Error("Review the unresolved provider call before monitoring.");
 if(call.state==="ended")return {state:"ended" as const};
 const connection=retellConnection();if(!connection||connection.binding!==call.providerBinding)throw new Error("Review the original voice provider connection; stopping is unconfirmed.");
 const control=retellCallControl(connection.key,{callId:call.providerCallId,agentId:call.profile.agentId},request);
 const provider=await control.read();
 if(provider.ended){confirmVoiceEnded(call.id,call.providerBinding,call.providerCallId);return {state:"ended" as const};}
 // Read after the provider lookup so a stop/payment during that await is seen.
 const latest=readWorkspace(),c=latest.cases.find(c=>c.id===call.caseId),review=latest.voiceReviews?.find(r=>r.id===call.reviewId);
 let mustStop=!voiceConfiguration().ready||!c||!review;
 if(c&&review){
  // Exclude only the reservation's own hold/contact/version changes. Any other
  // case mutation, including an incoming reply, requires stopping for review.
  const unchanged=c.version===review.context.caseVersion+1&&c.hold==="owner-review"&&c.lastContactAt===call.at;
  // Once dispatched, payment-check freshness belongs to the running supervisor.
  // The pre-call approval's expiry must not terminate an otherwise unchanged,
  // freshly checked conversation. Its independent duration limit still applies.
  const checkedAt=call.paymentCheckedAt??c.evidenceAt;
  const decision=voiceStopDecision({caseId:call.caseId,merchantId:call.merchantId,caseVersion:review.context.caseVersion,phone:review.context.phone,startedAt:call.at,maxSeconds:60,lastHeartbeatAt},unchanged?{...c,evidenceAt:checkedAt,version:review.context.caseVersion,hold:"none",lastContactAt:null}:c,now);
  mustStop ||= decision.stop;
 }
 if(!mustStop)return {state:"ongoing" as const};
 const stopped=await control.stop();
 if(stopped.state==="confirmed-ended"||stopped.state==="already-ended"){confirmVoiceEnded(call.id,call.providerBinding,call.providerCallId);return {state:"ended" as const};}
 return {state:"stop-requested" as const};
}
