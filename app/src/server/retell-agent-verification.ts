import "server-only";
import type {VoiceProfile} from "../domain/voice-lifecycle.ts";
import {validateVoiceProfile} from "../domain/voice-lifecycle.ts";
import {nalbaceVoiceGreeting,nalbaceVoicePrompt,nalbaceVoiceTools,nalbaceVoiceSpecFingerprint} from "./retell-agent-spec.ts";

// Authenticated readback before dispatch: a local "ready" flag is not evidence
// that a provider draft was published or that its tools/prompt stayed unchanged.
export async function verifyRetellAgent(key:string,profile:VoiceProfile,request:typeof fetch=fetch){
 validateVoiceProfile(profile);
 if(key.length<20||key.length>1000||/\s/.test(key))throw new Error("Review the voice provider connection.");
 async function read(path:string){
  const response=await request(`https://api.retellai.com${path}`,{method:"GET",headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("provider");return response.json();
 }
 try{
  const a=await read(`/get-agent/${profile.agentId}?version=${profile.agentVersion}`),engine=a?.response_engine;
  if(a?.agent_id!==profile.agentId||a.version!==profile.agentVersion||a.is_published!==true||a.voice_id!==profile.voiceId||a.language!==profile.language||a.max_call_duration_ms!==60000||a.end_call_after_silence_ms!==10000||engine?.type!=="retell-llm"||!/^llm_[A-Za-z0-9_-]{1,100}$/.test(engine.llm_id)||!Number.isSafeInteger(engine.version)||engine.version<0)throw new Error("agent");
  const llm=await read(`/get-retell-llm/${engine.llm_id}?version=${engine.version}`),tools=llm?.general_tools;
  if(llm?.llm_id!==engine.llm_id||llm.version!==engine.version||llm.is_published!==true||llm.general_prompt!==nalbaceVoicePrompt||llm.begin_message!==nalbaceVoiceGreeting||!Array.isArray(tools)||tools.length!==1||tools[0]?.type!==nalbaceVoiceTools[0].type||tools[0]?.name!==nalbaceVoiceTools[0].name||(llm.states?.length??0)!==0||(llm.knowledge_base_ids?.length??0)!==0)throw new Error("prompt");
  // Match the reviewed standard-tier model behind the demo's rate ceiling.
  // No priority/ultrafast surcharge or fallback to a different model is allowed.
  if(llm.model_config?.type!=="cascading"||llm.model_config.primary?.model!=="gpt-5.6-terra"||llm.model_config.primary?.tier!=="standard"||llm.model_config.backup||llm.backup_model||llm.model_high_priority===true||llm.model_ultrafast===true)throw new Error("rate-profile");
  return {agentId:profile.agentId,version:profile.agentVersion,specFingerprint:nalbaceVoiceSpecFingerprint};
 }catch{throw new Error("Published voice agent verification failed. No call is authorized; review the exact prompt, tools, voice and duration.");}
}
