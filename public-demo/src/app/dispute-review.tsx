
import {useState,useRef} from "react";
import {financials} from "../domain/case-rules.ts";
import type {ClientCase} from "../domain/cases.ts";
export default function DisputeReview({client,busy,onSave,onReadMessage}:{client:ClientCase;busy:boolean;onReadMessage?:()=>void;onSave:(value:{resolution:"still-open"|"resolved";note:string;reference:string;nextAction:string;reviewAt?:string;operationId:string;version:number})=>Promise<boolean>}){
 const [resolution,setResolution]=useState<"still-open"|"resolved">("still-open"),[note,setNote]=useState(""),[reference,setReference]=useState(""),[saved,setSaved]=useState(false),retry=useRef({payload:"",id:""});
 const [nextAction,setNextAction]=useState(""),[reviewDate,setReviewDate]=useState("");
 const openActions=[["review-records","Check invoice or service records"],["request-details","Ask the customer for details"],["correct-invoice","Correct the invoice in PayPal"],["check-later","Review again on a date"]];
 const resolvedActions=remainingActions();
 function remainingActions(){return financials(client).remainingMinor===0?[["verify-payment","Verify and close payment follow-up"]]:[["verify-payment","Verify reported payment"],["payment-promise","Record an agreed payment date"],["review-overdue","Review for routine follow-up"]];}
 const actions=resolution==="still-open"?openActions:resolvedActions;
 const needsDate=nextAction==="check-later"||nextAction==="payment-promise";
 const remaining=financials(client).remainingMinor;
 const latest=client.disputeReviews?.at(-1);
 if(client.hold!=="dispute"&&!latest)return null;
 return <section id="dispute-review" className="card dispute-review" tabIndex={-1}><h2>Owner dispute review</h2>{onReadMessage&&(client.pastedReplies?.length||client.voiceDisputeEvidence)&&<button type="button" className="text-button" onClick={onReadMessage}>Read customer message</button>}
 {client.voiceDisputeEvidence?<><p className="hint">Customer’s transcribed words · review for accuracy</p><blockquote>{client.voiceDisputeEvidence.quote}</blockquote></>:<p className="hint">No specific dispute reason has been captured here yet. Ask the customer before deciding how to resolve it.</p>}
 {latest&&<p className="hint">Latest review: {latest.resolution==="resolved"?"Resolved by owner; follow-up remains paused":"Still open"} · {new Date(latest.at).toLocaleString()}</p>}
 {latest?.nextAction&&<p><strong>Saved next action:</strong> {[...openActions,...resolvedActions].find(([key])=>key===latest.nextAction)?.[1]??latest.nextAction}{latest.reviewAt&&<> · {new Date(latest.reviewAt).toLocaleDateString()}</>}</p>}
 {saved&&<p className="notice" role="status">Review saved. No payment was changed and no follow-up was sent.</p>}
 {client.hold==="dispute"?<form onSubmit={async e=>{e.preventDefault();const savedNote=note.trim()||actions.find(([value])=>value===nextAction)?.[1]||"";const reviewAt=needsDate&&reviewDate?new Date(reviewDate+"T12:00:00").toISOString():undefined;const payload=JSON.stringify([resolution,savedNote,reference,nextAction,reviewAt,client.version]);if(retry.current.payload!==payload)retry.current={payload,id:crypto.randomUUID()};if(await onSave({resolution,note:savedNote,reference,nextAction,reviewAt,operationId:retry.current.id,version:client.version})){setSaved(true);setNote("");setReference("");}}}>
 
 <label>Review result<select className="inset-select" value={resolution} onChange={e=>{setResolution(e.target.value as typeof resolution);setNextAction("");setReviewDate("");setSaved(false);}}><option value="still-open">Keep dispute open</option><option value="resolved">I have resolved the dispute</option></select></label>
 <label>Next action<select required value={nextAction} onChange={e=>setNextAction(e.target.value)}><option value="">Choose the next action</option>{actions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 {needsDate&&<label>{nextAction==="payment-promise"?"Agreed payment date":"Review date"}<input type="date" required value={reviewDate} onChange={e=>setReviewDate(e.target.value)}/></label>}
 <label>{resolution==="resolved"?"How was the issue resolved?":"Add a note (optional)"}<textarea required={resolution==="resolved"} maxLength={1000} rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <label>{resolution==="resolved"?"How did you verify the resolution?":"Reference (optional)"}<input required={resolution==="resolved"} maxLength={300} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Example: Nov. 12 call or corrected invoice #1041"/></label>
 <div className="sample-notice"><strong>After saving</strong>{resolution==="still-open"?<p>The dispute stays in urgent owner review. Check the issue you recorded against the customer’s message, invoice, or supporting records. If a conversation would help, use the phone shortcut by the customer’s name. Automated reminders and calls stay paused.</p>:<p>Refresh PayPal first if needed, then save the resolution. The balance and payment status stay unchanged. The saved next action determines what follows. With the sample reminder policy enabled, routine follow-up resumes after the agreed payment date or returns to the overdue sequence. Verified settlement ends payment reminders.</p>}</div>
 <button className="secondary full" disabled={busy||!nextAction||(needsDate&&!reviewDate)||(resolution==="resolved"&&(!note.trim()||!reference.trim()))}>{busy?"Saving review…":"Save dispute review"}</button></form>:<p>{client.hold==="suppressed"?"Contact remains stopped.":client.reconciliationRequired||client.invoices.some(invoice=>invoice.evidence?.dueMinor===null)?"Dispute resolved. Review current payment evidence before deciding what comes next.":remaining===0?"Dispute resolved. No balance remains, so no payment reminder is needed.":"Dispute resolved. A balance remains. Check the invoice due date and current balance before approving any new follow-up."}</p>}
 </section>;
}
