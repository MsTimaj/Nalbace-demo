import "server-only";
import {createHash} from "node:crypto";
import {voiceDisputeExcerpt} from "../domain/voice-dispute-excerpt.ts";
import {readWorkspace,recordTrustedVoiceOutcome} from "./store.ts";
import {retellConnection} from "./retell-connection.ts";
// Authenticated pull, not an unauthenticated public callback. Financial claims
// only create holds; model summaries never verify payments or promise dates.
export async function pullVoiceOutcome(id:string,request:typeof fetch=fetch){
 const call=readWorkspace().voiceCalls?.find(c=>c.id===id),connection=retellConnection();
 if(!call?.providerCallId||!connection||connection.binding!==call.providerBinding)throw new Error("Review bound voice outcome.");
 try{
  const r=await request(`https://api.retellai.com/v2/get-call/${call.providerCallId}`,{headers:{Authorization:`Bearer ${connection.key}`},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error();const value=await r.json();
  if(value.call_id!==call.providerCallId||value.agent_id!==call.profile.agentId||value.agent_version!==call.profile.agentVersion||value.from_number!==call.profile.from||value.to_number!==connection.recipient||value.metadata?.nalbace_call_id!==call.id||value.call_status!=="ended")throw new Error();
  const turns=value.transcript_object;if(!Array.isArray(turns)||turns.length>200)throw new Error();
  const user=turns.filter(t=>t?.role==="user");if(user.some(t=>typeof t.content!=="string"||t.content.length>2000))throw new Error();const text=user.map(t=>t.content).join("\n");if(text.length>12000)throw new Error();
  const kind=/\bstop\b|do not call|don't call|remove me|no more calls|do not contact|don't contact/i.test(text)?"stop":/\bdisput|not my invoice|wrong amount/i.test(text)?"dispute":/already paid|i paid|i have paid|i've paid|sent (?:the )?payment/i.test(text)?"payment-claim":"completed";
  const digest=createHash("sha256").update(JSON.stringify(user.map(t=>t.content))).digest("hex");
  const quote=kind==="dispute"?voiceDisputeExcerpt(turns.filter(t=>typeof t?.role==="string"&&typeof t?.content==="string")):undefined;
  recordTrustedVoiceOutcome({callId:call.id,providerCallId:call.providerCallId,binding:call.providerBinding,eventId:`retell-pull-v2-${digest.slice(0,40)}`,kind,...(quote?{quote}:{})});
  return {kind,utterances:user.length};
 }catch{throw new Error("Voice outcome is unconfirmed. Keep follow-up held; review the provider transcript.");}
}
