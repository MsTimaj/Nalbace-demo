import "server-only";
import {createHash} from "node:crypto";
import {validateVoiceProfile} from "../domain/voice-lifecycle.ts";
// Explicit Nalbace fields only. Merely saving credentials does not enable calls.
export function retellConnection(env:Record<string,string|undefined>=process.env){
 const key=env.NALBACE_RETELL_API_KEY?.trim()??"";
 const rawVersion=env.NALBACE_RETELL_AGENT_VERSION??"";
 const recipient=env.NALBACE_VOICE_TEST_RECIPIENT??"";
 if(key.length<20||key.length>1000||/\s/.test(key)||!/^\d+$/.test(rawVersion)||!/^\+[1-9]\d{6,14}$/.test(recipient))return null;
 try{const profile=validateVoiceProfile({agentId:env.NALBACE_RETELL_AGENT_ID??"",agentVersion:Number(rawVersion),from:env.NALBACE_VOICE_FROM??"",voiceId:"retell-Tamsin",language:"en-US"});const binding=createHash("sha256").update(JSON.stringify([key,profile,recipient])).digest("hex");return {key,profile,recipient,binding};}catch{return null;}
}
export function voiceConfiguration(env:Record<string,string|undefined>=process.env){
 const connection=retellConnection(env),limit=Number(env.NALBACE_VOICE_MAX_ATTEMPTS??0);
 // A separate integration-ready latch prevents configuration alone from claiming
 // that callback/watchdog/approval wiring has been validated. No dispatch route.
 // Current authorization is exactly one controlled test, not a rolling quota.
 const ready=env.NALBACE_VOICE_ENABLED==="true"&&env.NALBACE_VOICE_INTEGRATION_READY==="true"&&Boolean(connection)&&(limit===1||((limit===2||limit===3)&&/^[a-f0-9]{64}$/.test(env.NALBACE_VOICE_RETEST_AUTHORIZATION??"")));
 return {ready,limit:ready?limit:0,keyPresent:Boolean(env.NALBACE_RETELL_API_KEY?.trim())};
}
