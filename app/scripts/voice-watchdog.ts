import {superviseVoiceCall} from "../src/server/voice-watchdog.ts";
// Launch separately with Node's --env-file=.env.local and react-server condition.
// Only the local attempt ID is an argument; no credentials are printed.
try{
 const result=await superviseVoiceCall(process.argv[2]??"");
 console.log(result.state==="ended"?"Provider confirmed call ended; follow-up remains held.":"Call ending is unconfirmed. Review the provider; do not retry calling.");
 process.exitCode=result.state==="ended"?0:1;
}catch{console.error("Voice supervision could not start. Calling must remain disabled.");process.exitCode=1;}
