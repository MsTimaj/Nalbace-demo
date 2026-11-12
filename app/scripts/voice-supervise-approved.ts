import {superviseApprovedVoice} from "../src/server/voice-approved-supervisor.ts";
try{const result=await superviseApprovedVoice(process.argv[2]??"");console.log(JSON.stringify(result));process.exitCode=result.state==="ended"?0:1;}catch{console.error("Voice supervision is unresolved. Keep follow-up held and do not retry the call.");process.exitCode=1;}
