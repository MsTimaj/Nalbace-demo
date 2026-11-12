import "server-only";
import {randomBytes} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {heartbeatVoiceSupervisor,releaseVoiceSupervisor} from "./voice-supervisor-lease.ts";
import {readWorkspace} from "./store.ts";
import {retellConnection} from "./retell-connection.ts";
import {monitorVoiceCall} from "./voice-monitor.ts";
import {checkVoicePayments} from "./voice-payment-monitor.ts";
import {pullVoiceOutcome} from "./voice-provider-outcome.ts";
// Separate worker starts BEFORE dispatch. Its durable lease is a dispatch gate.
export async function superviseApprovedVoice(approvalId:string){
 const connection=retellConnection(),approval=readWorkspace().voiceApprovals?.find(a=>a.id===approvalId);
 if(!connection||!approval||approval.state!=="approved")throw new Error("Review exact voice approval before starting supervision.");
 const token=randomBytes(16).toString("hex"),began=Date.now();let callId:string|undefined,lastPaymentCheck=0;
 try{
  while(Date.now()-began<120000){
   heartbeatVoiceSupervisor(approvalId,token,connection.binding);
   const call=readWorkspace().voiceCalls?.find(c=>c.approvalId===approvalId);
   if(!call){if(Date.now()-began>30000)return {state:"no-call"};await delay(1000);continue;}
   callId=call.id;
   if(call.state==="unknown"||call.state==="reserved"){await delay(1000);continue;}
   let forceStop=false;
   if(call.state!=="ended"&&Date.now()-lastPaymentCheck>=5000){try{await checkVoicePayments(call.id);}catch{forceStop=true;}lastPaymentCheck=Date.now();}
   const result=await monitorVoiceCall(call.id,new Date(Date.now()-(forceStop?11000:0)).toISOString());
   if(result.state==="ended"){try{const outcome=await pullVoiceOutcome(call.id);return {state:"ended",outcome:outcome.kind};}catch{await delay(2000);continue;}}
   await delay(2000);
  }
  if(callId)await monitorVoiceCall(callId,new Date(Date.now()-11000).toISOString());
  return {state:"unresolved"};
 }finally{if(callId){try{await monitorVoiceCall(callId,new Date(Date.now()-11000).toISOString());}catch{/* Provider-side minute limit remains the independent fallback. */}}releaseVoiceSupervisor(approvalId,token);}
}
