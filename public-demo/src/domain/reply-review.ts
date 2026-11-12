import {emailDisplay} from "./email-display.ts";
import type {ClientCase} from "./cases.ts";
import {financials} from "./case-rules.ts";
export type ReplyProposal={replyId:string;caseVersion:number;intent:"payment-claim"|"promise"|"dispute"|"stop"|"needs-copy"|"relationship-concern"|"unclear";quote:string;question:string};
export type PastedReply={id:string;at:string;text:string;source:"owner-pasted"|"provider-received";proposal?:ReplyProposal & {provider:string;model:string}};
export type ReplyContext={replyId:string;caseVersion:number;text:string;history:string[]};
export type ReplyModel={provider:string;model:string;interpret:(context:ReplyContext)=>Promise<unknown>};
export function replyContext(c:ClientCase,replyId:string):ReplyContext{
  const reply=c.pastedReplies?.find(r=>r.id===replyId);
  if(!reply)throw new Error("Review the saved reply first.");
  if(c.hold==="suppressed"||c.hold==="dispute")throw new Error("Contact is stopped or disputed. Review the exception without another AI request.");
  if(c.hold!=="owner-review")throw new Error("Review the reply with follow-up held first.");
  const f=financials(c);
  if(f.pendingMinor>0||c.reconciliationRequired)throw new Error("Review payment or receipt evidence first. Another AI request is unnecessary.");
  return {replyId,caseVersion:c.version,text:emailDisplay(reply.text).message,history:c.history.slice(0,3).map(h=>h.text.slice(0,250))};
}
export function validateReplyProposal(value:unknown,context:ReplyContext):ReplyProposal{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Review the AI reply proposal; its structure is invalid.");
  const p=value as Record<string,unknown>;
  if(Object.keys(p).sort().join(",")!=="caseVersion,intent,question,quote,replyId"||p.replyId!==context.replyId||p.caseVersion!==context.caseVersion||!["payment-claim","promise","dispute","stop","needs-copy","relationship-concern","unclear"].includes(String(p.intent)))throw new Error("Review the AI reply proposal; its references or intent are invalid.");
  if(typeof p.quote!=="string"||!p.quote.trim()||p.quote.length>500||!context.text.includes(p.quote))throw new Error("Review the AI reply proposal; evidence must be an exact quote from this reply.");
  if(typeof p.question!=="string"||!p.question.trim()||p.question.length>300)throw new Error("Review the AI reply proposal; a short owner-facing question is required.");
  return p as ReplyProposal;
}

export function hasUnreviewedReply(c:ClientCase){
 const latest=c.pastedReplies?.at(-1);if(!latest)return false;
 const reviewed=[c.customerUpdates?.at(-1)?.at,c.disputeReviews?.at(-1)?.at].filter((value):value is string=>Boolean(value)).sort().at(-1);
 return !reviewed||Date.parse(latest.at)>Date.parse(reviewed);
}
