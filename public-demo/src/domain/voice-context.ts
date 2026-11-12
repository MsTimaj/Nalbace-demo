import {createHash} from "node:crypto";
import type {ClientCase} from "./cases.ts";
import {contactEligibility,remainingInvoices} from "./case-rules.ts";
import {validatePermissionEvidence} from "./permission-evidence.ts";
export type VoiceContext={mode:"sandbox-review-only";caseId:string;caseVersion:number;merchantId:string;ownerId:string;providerBinding:string;phone:string;permissionReviewId:string;evidenceAt:string;expiresAt:string;maxSeconds:60;currency:"USD";totalMinor:number;invoices:{id:string;number:string;dueDate:string;balanceMinor:number}[]};
export type VoiceContextReview={id:string;createdAt:string;fingerprint:string;context:VoiceContext};
export function prepareVoiceContext(c:ClientCase,owner:{id:string;merchantId:string},now=new Date()):VoiceContext{
 if(!Number.isFinite(now.getTime())||!owner.id||owner.merchantId!==c.merchantId)throw new Error("Review the voice case and owner binding.");
 if(c.source!=="paypal-sandbox"||!c.providerBinding)throw new Error("Voice facts require linked PayPal sandbox evidence.");
 const gate=contactEligibility(c,now,"voice");if(!gate.eligible)throw new Error(gate.reason);
 const review=c.permissionReviews?.at(-1),permission=c.contactPermission!;
 if(!review||!review.verified||!review.voiceAllowed||!review.evidence||review.evidence.basis!=="self-test"||review.merchantId!==c.merchantId||review.caseId!==c.id||review.phone!==permission.phone||review.at!==permission.reviewedAt)throw new Error("Record matching self-test voice permission before reviewing a call.");
 validatePermissionEvidence(review.evidence,now);
 const reviewedAt=Date.parse(review.at);if(!Number.isFinite(reviewedAt)||reviewedAt>now.getTime())throw new Error("Review a valid voice permission time.");
 if(!c.invoices.length||c.invoices.length>20||new Set(c.invoices.map(i=>i.id)).size!==c.invoices.length)throw new Error("Review the exact bounded invoice set.");
 for(const i of c.invoices){const e=i.evidence,age=e?now.getTime()-Date.parse(e.checkedAt):NaN;if(!e||e.id!==i.id||e.currency!=="USD"||e.dueMinor!==i.balanceMinor||e.dueDate!==i.dueDate||!Number.isFinite(age)||age<0||age>=60000)throw new Error("Review fresh matching invoice facts before a voice review.");}
 const expires=Math.min(Date.parse(c.evidenceAt),...c.invoices.map(i=>Date.parse(i.evidence!.checkedAt)))+60000;
 if(expires<=now.getTime())throw new Error("Refresh invoice facts before a voice review.");
 const invoices=remainingInvoices(c).map(i=>({id:i.id,number:i.number,dueDate:i.dueDate,balanceMinor:i.balanceMinor})).sort((a,b)=>a.id.localeCompare(b.id));
 // Minimal facts only. No history, replies, email, consent wording or credentials.
 // Strings are data, never instructions. This does not authorize a provider call.
 return {mode:"sandbox-review-only",caseId:c.id,caseVersion:c.version,merchantId:c.merchantId,ownerId:owner.id,providerBinding:c.providerBinding,phone:permission.phone,permissionReviewId:review.id,evidenceAt:c.evidenceAt,expiresAt:new Date(expires).toISOString(),maxSeconds:60,currency:"USD",totalMinor:gate.totalMinor,invoices};
}
export function voiceContextFingerprint(context:VoiceContext){return createHash("sha256").update(JSON.stringify(context)).digest("hex");}
export function recheckVoiceContext(review:VoiceContextReview,c:ClientCase,owner:{id:string;merchantId:string},now=new Date()){
 if(Date.parse(review.context.expiresAt)<=now.getTime()||review.fingerprint!==voiceContextFingerprint(review.context))throw new Error("The reviewed voice facts expired or changed.");
 const fresh=prepareVoiceContext(c,owner,now);if(voiceContextFingerprint(fresh)!==review.fingerprint)throw new Error("The case changed. Review fresh voice facts.");return fresh;
}
