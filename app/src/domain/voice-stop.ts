import type {ClientCase} from "./cases.ts";
import {contactEligibility} from "./case-rules.ts";

// Decision logic only. A future independent worker must execute and confirm stop.
export type ActiveCallBinding={caseId:string;merchantId:string;caseVersion:number;phone:string;startedAt:string;maxSeconds:number;lastHeartbeatAt:string};
export function voiceStopDecision(binding:ActiveCallBinding,client:ClientCase,now:Date,stopRequested=false):{stop:boolean;reason:string}{
  if(stopRequested)return {stop:true,reason:"stop-request"};
  const time=now.getTime(),start=Date.parse(binding.startedAt),heartbeat=Date.parse(binding.lastHeartbeatAt);
  if(![time,start,heartbeat].every(Number.isFinite)||start>time||heartbeat>time||heartbeat<start)return {stop:true,reason:"invalid-clock"};
  if(!Number.isSafeInteger(binding.maxSeconds)||binding.maxSeconds<1||binding.maxSeconds>120||time-start>=binding.maxSeconds*1000)return {stop:true,reason:"duration-limit"};
  if(time-heartbeat>=10000)return {stop:true,reason:"heartbeat-lost"};
  if(binding.caseId!==client.id||binding.merchantId!==client.merchantId||binding.caseVersion!==client.version||binding.phone!==client.contactPermission?.phone)return {stop:true,reason:"case-changed"};
  try{const gate=contactEligibility(client,now,"voice");if(!gate.eligible)return {stop:true,reason:gate.reason};}
  catch{return {stop:true,reason:"invalid-evidence"};}
  return {stop:false,reason:"eligible"};
}
