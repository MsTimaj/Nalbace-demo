import "server-only";
import {spawn} from "node:child_process";
import {openSync,closeSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import path from "node:path";
import {readVoiceSelfTest} from "./voice-self-test.ts";
import {readWorkspace,saveContactPermission,refreshSandboxCase,prepareVoiceReview,approveVoicePurpose} from "./store.ts";
import {retellConnection,voiceConfiguration} from "./retell-connection.ts";
import {requireVoiceSupervisor} from "./voice-supervisor-lease.ts";
import {deliverApprovedVoiceCall} from "./voice-delivery.ts";
export async function reviewSelfTestVoice(caseId:string){
 if(caseId!=="sandbox-voice-test")throw new Error("Use the separate synthetic phone-test case.");
 const test=readVoiceSelfTest(),connection=retellConnection();
 if(!test||!connection||connection.recipient!==test.phone||Date.now()-Date.parse(test.capturedAt)>86400000)throw new Error("Save your own test phone and agreement on the private phone-test page first.");
 let c=readWorkspace().cases.find(c=>c.id===caseId);if(!c)throw new Error("Phone-test invoice is not linked yet.");
 if(!c.voiceRetest&&c.permissionReviews?.at(-1)?.evidence?.reference!==test.reference){saveContactPermission(c.id,c.version,{email:"nalbaceapp@gmail.com",verified:true,emailAllowed:false,voiceAllowed:true,phone:test.phone,note:"Owner-entered self-test agreement; one synthetic AI call only.",evidence:{basis:"self-test",wording:test.wording,capturedAt:test.capturedAt,reference:test.reference}});}
 await refreshSandboxCase(caseId);c=readWorkspace().cases.find(c=>c.id===caseId)!;return prepareVoiceReview(c.id,c.version);
}
export function approveSelfTestVoice(caseId:string,reviewId:string){const connection=retellConnection();if(!connection||!voiceConfiguration().ready)throw new Error("Voice connection is not ready.");return approveVoicePurpose(caseId,reviewId,connection.profile);}
export async function callSelfTestVoice(caseId:string,approvalId:string){
 const connection=retellConnection();if(!connection||!voiceConfiguration().ready||caseId!=="sandbox-voice-test")throw new Error("Voice connection is not ready.");
 // Starting a monitor is not a call. Durable attempt and spending gates below
 // still decide whether the single approved provider request can be made.
 const fd=openSync(path.join(process.cwd(),".data","voice-supervisor.log"),"a",0o600);
 try{const worker=spawn(process.execPath,["--env-file=.env.local","--experimental-strip-types","--conditions=react-server",path.join(process.cwd(),"scripts","voice-supervise-approved.ts"),approvalId],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:["ignore",fd,fd]});worker.on("error",()=>{});worker.unref();}finally{closeSync(fd);}
 let ready=false;for(let i=0;i<30;i++){try{requireVoiceSupervisor(approvalId,connection.binding);ready=true;break;}catch{await delay(100);}}
 if(!ready)throw new Error("Independent supervision did not start. No call was placed.");
 return deliverApprovedVoiceCall(caseId,approvalId);
}
