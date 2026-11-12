import {createHash} from "node:crypto";
export type VoiceProfile={agentId:string;agentVersion:number;from:string;voiceId:"retell-Tamsin";language:"en-US"};
export type VoicePurposeApproval={id:string;reviewId:string;contextFingerprint:string;profile:VoiceProfile;expiresAt:string;fingerprint:string;state:"approved"|"consumed"};
export type VoiceOutcome="stop"|"payment-claim"|"dispute"|"promise"|"copy-request"|"wrong-person"|"completed";
export type VoiceCallRecord={id:string;caseId:string;merchantId:string;approvalId:string;reviewId:string;providerBinding:string;profile:VoiceProfile;state:"reserved"|"accepted"|"unknown"|"ended";providerCallId?:string;at:string;paymentCheckedAt?:string;outcomes:{eventId:string;kind:VoiceOutcome;quote?:string;fingerprint:string;at:string}[]};
export function validateVoiceProfile(value:VoiceProfile){
 if(!value||!/^[A-Za-z0-9_-]{1,100}$/.test(value.agentId)||!Number.isSafeInteger(value.agentVersion)||value.agentVersion<0||!/^\+[1-9]\d{6,14}$/.test(value.from)||value.voiceId!=="retell-Tamsin"||value.language!=="en-US")throw new Error("Review a published, pinned voice agent, caller number and selected voice.");
 return {agentId:value.agentId,agentVersion:value.agentVersion,from:value.from,voiceId:value.voiceId,language:value.language};
}
export function voicePurposeFingerprint(value:Pick<VoicePurposeApproval,"id"|"reviewId"|"contextFingerprint"|"profile"|"expiresAt">){return createHash("sha256").update(JSON.stringify([value.id,value.reviewId,value.contextFingerprint,validateVoiceProfile(value.profile),value.expiresAt])).digest("hex");}
