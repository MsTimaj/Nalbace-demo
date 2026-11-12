import "server-only";
import {mkdirSync,readFileSync,writeFileSync,renameSync} from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {readWorkspace} from "./store.ts";
export const selfTestWording="I control this phone number and agree to receive one synthetic Nalbace AI invoice-reminder test call, lasting no more than 60 seconds. No real payment is due.";
type SelfTest={phone:string;wording:string;capturedAt:string;reference:string};
const file=()=>path.join(process.cwd(),".data","voice-self-test.json");
export function readVoiceSelfTest():SelfTest|null{
 try{const v=JSON.parse(readFileSync(file(),"utf8"));if(/^\+[1-9]\d{6,14}$/.test(v.phone)&&v.wording===selfTestWording&&Number.isFinite(Date.parse(v.capturedAt))&&typeof v.reference==="string")return v;}catch{}
 return null;
}
export function saveVoiceSelfTest(phone:unknown,agreed:unknown){
 if(typeof phone!=="string"||!/^\+[1-9]\d{6,14}$/.test(phone)||agreed!==true)throw new Error("Enter your own phone with country code and agree to the one-call test.");
 if(readWorkspace().voiceCalls?.length)throw new Error("A phone attempt is already recorded. Review it before changing the test recipient.");
 const record:SelfTest={phone,wording:selfTestWording,capturedAt:new Date().toISOString(),reference:`private-phone-form-${randomUUID()}`};
 const dest=file();mkdirSync(path.dirname(dest),{recursive:true});const temp=dest+"."+randomUUID();writeFileSync(temp,JSON.stringify(record),{mode:0o600,flag:"wx"});renameSync(temp,dest);
 // Deliberately return no phone number, credentials or permission text.
 return {saved:true,capturedAt:record.capturedAt};
}
