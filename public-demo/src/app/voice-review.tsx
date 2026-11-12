
import {useState,useEffect} from "react";
import type {ClientCase} from "../domain/cases.ts";
import type {VoiceContextReview} from "../domain/voice-context.ts";
import type {VoicePurposeApproval,VoiceCallRecord} from "../domain/voice-lifecycle.ts";
export default function VoiceReview({client,reviews,approvals,calls,busy,onReview,onApprove,onCall}:{client:ClientCase;reviews:VoiceContextReview[];approvals:VoicePurposeApproval[];calls:VoiceCallRecord[];busy:boolean;onReview:()=>void;onApprove:(id:string)=>void;onCall:(id:string)=>void}){
 const [ready,setReady]=useState(false);useEffect(()=>{let active=true;fetch("/api/voice-setup",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(v=>{if(active)setReady(v?.ready===true);}).catch(()=>{});return()=>{active=false;};},[]);
 const latest=reviews.filter(r=>r.context.caseId===client.id).at(-1),call=calls.filter(c=>c.caseId===client.id).at(-1),approval=approvals.find(a=>a.reviewId===latest?.id&&a.state==="approved");
 const paid=client.invoices.every(i=>i.balanceMinor===0),test=client.id==="sandbox-voice-test",allowed=test&&client.hold==="none"&&!paid&&(!call||client.voiceRetest?.state==="approved");
 const retry=client.voiceRetest?.state==="approved";
 const fresh=latest&&latest.context.caseVersion===client.version&&Date.parse(latest.context.expiresAt)>Date.now();
 return <details className="card history"><summary className="section-title">Phone follow-up</summary>
 <p>{paid?"No call needed: no balance remains.":retry?"One additional bounded test is authorized. Refresh facts before approving it.":call?call.state==="ended"?"Provider confirmed the call ended. Follow-up remains held for review.":call.state==="unknown"?"Call outcome unknown. No automatic retry.":"Test attempt recorded. Independent supervision is checking its status.":!test?"Use the separate phone-test client for the one approved call.":"Review current invoice facts, approve the purpose, then place one test call."}</p>
 {(!call||retry)&&test&&<><p className="hint">{ready?"One attempt · maximum 60 seconds · maximum 50¢ reserved trial usage.":"Calling is disabled while connection checks are completed."}</p><button className="secondary full" disabled={busy||!allowed} onClick={onReview}>Refresh and review call facts</button></>}
 {latest&&<div><p>{call&&!retry?"Invoice snapshot used for this test":fresh?"Current facts for review":"Saved facts expired or the case changed. Refresh before approval."}</p><p>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(latest.context.totalMinor/100)} · {latest.context.invoices.length} synthetic invoice(s) · no real payment due</p><p className="hint">Facts checked {new Date(latest.context.evidenceAt).toLocaleString()}.</p></div>}
 {(!call||retry)&&test&&fresh&&<>{!approval?<button className="secondary full" disabled={busy||!ready} onClick={()=>onApprove(latest.id)}>Approve this one test call</button>:<button className="primary full" disabled={busy||!ready} onClick={()=>onCall(approval.id)}>Call my test phone · max 60 seconds</button>}</>}
 {call?.outcomes.slice(-1).map(o=><p key={o.eventId}>{o.kind==="completed"?"Transcript retrieved; conversation requires owner review.":`Recorded outcome: ${o.kind.replaceAll("-"," ")}.`} Financial evidence is unchanged.</p>)}
 </details>;
}
