import type {ClientCase} from "./cases.ts";

export type PermissionEvidence={basis:"self-test"|"recipient-record";wording:string;capturedAt:string;reference:string};
export type PermissionReview={id:string;at:string;merchantId:string;caseId:string;email:string;phone:string;verified:boolean;emailAllowed:boolean;voiceAllowed:boolean;note:string;evidence?:PermissionEvidence};

export function validatePermissionEvidence(value:unknown,now=new Date()):PermissionEvidence{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Enter the permission evidence.");
  const v=value as Record<string,unknown>;
  if(!["self-test","recipient-record"].includes(String(v.basis))||typeof v.wording!=="string"||!v.wording.trim()||v.wording.trim().length>2000||typeof v.reference!=="string"||!v.reference.trim()||v.reference.trim().length>300||typeof v.capturedAt!=="string")throw new Error("Enter permission wording, source reference and collection time within the supported limits.");
  const time=Date.parse(v.capturedAt);
  if(!Number.isFinite(time)||time>now.getTime())throw new Error("Enter a valid permission collection time that is not in the future.");
  return {basis:v.basis as PermissionEvidence["basis"],wording:v.wording.trim(),reference:v.reference.trim(),capturedAt:new Date(time).toISOString()};
}

// This permits only the separately configured self-addressed test path. An
// owner-recorded recipient assertion is not production consent clearance.
export function hasSelfTestEmailEvidence(c:ClientCase):boolean{
  const latest=c.permissionReviews?.at(-1),p=c.contactPermission;
  if(!latest||!p||!latest.evidence||latest.evidence.basis!=="self-test"||!latest.verified||!latest.emailAllowed||!p.emailAllowed||!c.verifiedContact||latest.merchantId!==c.merchantId||latest.caseId!==c.id||latest.email!==c.contact||latest.at!==p.reviewedAt)return false;
  try{validatePermissionEvidence(latest.evidence);return true;}catch{return false;}
}
