"use client";
import {emailDisplay} from "../domain/email-display.ts";
import {accountPriority} from "../domain/account-priority.ts";
import {hasUnreviewedReply} from "../domain/reply-review.ts";
import type {VoicePurposeApproval,VoiceCallRecord} from "../domain/voice-lifecycle.ts";
import RecordingCallButton from "./recording-call-button.tsx";
import AutomaticFollowupProgress from "./automatic-followup-progress.tsx";
import FollowupPlanPreview from "./followup-plan-preview.tsx";
import DisputeReview from "./dispute-review.tsx";
import ClientHeader from "./client-header.tsx";
import VoiceReview from "./voice-review.tsx";
import type {VoiceContextReview} from "../domain/voice-context.ts";


import {useState,useRef,useEffect} from "react";

import SandboxPanel from "./sandbox-panel.tsx";

import ReceiptMatch from "./receipt-match.tsx";

import CustomerUpdate from "./customer-update.tsx";

import {caseView} from "../domain/case-view.ts";

import {workspaceSync} from "./workspace-sync.ts";

import Icon from "./ui-icon.tsx";

import CaseOverview from "./case-overview.tsx";

import ActivityPanel from "./activity-panel.tsx";

import ContactPermissions from "./contact-permissions.tsx";
import {hasSelfTestEmailEvidence} from "../domain/permission-evidence.ts";

import ReceiptCorrection from "./receipt-correction.tsx";
import ReceiptCorrectionsReview from "./receipt-corrections-review.tsx";

import ReplyReview from "./reply-review.tsx";

import WorkspaceSettings from "./workspace-settings.tsx";

import type {EmailAttempt} from "../domain/email-delivery.ts";

import type {WorkspaceControls} from "../domain/workspace-controls.ts";

import type {ClientCase,Draft,Approval} from "../domain/cases.ts";

// Pure presentation helpers live separately: no browser import of server/crypto code.

import type {AiStatus,DeliveryStatus} from "./service-status.ts";

export type State={voiceApprovals?:VoicePurposeApproval[];voiceCalls?:VoiceCallRecord[];voiceReviews?:VoiceContextReview[];cases:ClientCase[];drafts:Draft[];approvals:Approval[];events:{id:string;at:string;text:string}[];controls?:WorkspaceControls;emailAttempts?:EmailAttempt[];inboundEvents?:{id:string;at:string;result:"matched"|"unmatched";caseId?:string}[]};

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);

const when=(s:string)=>new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric"});

const totals=(c:ClientCase)=>caseView(c);

const category=(c:ClientCase)=>caseView(c).category;

export default function Workspace({initial}:{initial:State}){

  const [checkNumber,setCheckNumber]=useState("");
  const [clearReceiptId,setClearReceiptId]=useState<string|null>(null);
  const [replyRequested,setReplyRequested]=useState<string|null>(null);
  const [clientTab,setClientTab]=useState<"overview"|"messages"|"history"|"details">("overview");
  const receiptOperation=useRef({payload:"",id:""});

  const [emailStatus,setEmailStatus]=useState<DeliveryStatus|null>(null);

  async function loadEmailStatus(){try{const response=await fetch("/api/email-delivery",{cache:"no-store"});if(response.ok)setEmailStatus(await response.json());else setEmailStatus(null);}catch{setEmailStatus(null);}}

  const [aiStatus,setAiStatus]=useState<AiStatus|null>(null);

  async function loadAiStatus(){try{const response=await fetch("/api/ai-drafting",{cache:"no-store"});if(response.ok)setAiStatus(await response.json());else setAiStatus(null);}catch{setAiStatus(null);}}

  useEffect(()=>{void loadAiStatus();void loadEmailStatus();},[]);

  const [data,setData]=useState(initial),[tab,setTab]=useState<"today"|"activity"|"connections"|"settings">("today"),[selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("case");if(requested&&initial.cases.some(item=>item.id===requested)){setTab("today");setSelected(requested);}},[]);

  const sync=useRef<ReturnType<typeof workspaceSync<State>>|null>(null);

  const [syncFailed,setSyncFailed]=useState(false);

  useEffect(()=>{

    const controller=workspaceSync<State>(async signal=>{const response=await fetch("/api/workspace",{cache:"no-store",signal});if(!response.ok)throw new Error("Saved workspace refresh failed.");return response.json();},value=>{setData(value);setSyncFailed(false);},()=>setSyncFailed(true));

    sync.current=controller;

    const refresh=()=>{if(document.visibilityState==="visible")void controller.refresh();};

    refresh();

    const interval=window.setInterval(refresh,5000);

    document.addEventListener("visibilitychange",refresh);window.addEventListener("focus",refresh);

    return ()=>{window.clearInterval(interval);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("focus",refresh);controller.dispose();if(sync.current===controller)sync.current=null;};

  },[]);



  const [panel,setPanel]=useState<"case"|"draft"|"receipt">("case"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");

  // Section and case navigation should reveal the new screen's heading on phones.
  // Background workspace refreshes must not move the reader's scroll position.
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"instant"});},[tab,selected,panel]);
  useEffect(()=>{if(!replyRequested)return;const target=document.getElementById(replyRequested);if(target){if(target.tagName==="DETAILS")target.setAttribute("open","");target.scrollIntoView({block:"start"});target.focus({preventScroll:true});setReplyRequested(null);}});


  const [subject,setSubject]=useState(""),[body,setBody]=useState(""),[kind,setKind]=useState<"cash"|"check">("check"),[amounts,setAmounts]=useState<Record<string,string>>({});

  const c=data.cases.find(c=>c.id===selected);
  const customerKey=(item:ClientCase)=>["sandbox-voice-test","sandbox-email-loop-test","sandbox-recording-email","sandbox-recording-call","sandbox-test"].includes(item.id)?`${item.merchantId}:controlled-self-test`:`${item.merchantId}:${item.id}`;
  const customerRecords=c?data.cases.filter(item=>customerKey(item)===customerKey(c)):[];

  const draft=c?data.drafts.find(d=>d.caseId===c.id&&d.caseVersion===c.version):undefined;

  const approval=draft?data.approvals.find(a=>a.draftId===draft.id&&Date.parse(a.expiresAt)>Date.now()):undefined;

  async function act(payload:Record<string,unknown>){const finishSyncMutation=sync.current?.beginMutation();setBusy(true);setError("");setNotice("");try{if(payload.action==="receipt"){const fingerprint=JSON.stringify(payload);if(receiptOperation.current.payload!==fingerprint)receiptOperation.current={payload:fingerprint,id:crypto.randomUUID()};payload={...payload,operationId:receiptOperation.current.id};}const response=await fetch("/api/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error);setData(result as State);if(payload.action==="receipt")receiptOperation.current={payload:"",id:""};return result as State;}catch(e){setError(e instanceof Error?e.message:"Please try again.");try{const fresh=await fetch("/api/workspace",{cache:"no-store"});if(fresh.ok)setData(await fresh.json());}catch{}return null;}finally{finishSyncMutation?.();setBusy(false);void loadAiStatus();void loadEmailStatus();}}

  function updateCaseUrl(id:string|null){const url=new URL(window.location.href);if(id)url.searchParams.set("case",id);else url.searchParams.delete("case");window.history.replaceState(null,"",url.pathname+url.search);}
  function closeCase(){setSelected(null);updateCaseUrl(null);}
  useEffect(()=>{
    if(!data.controls?.reminderPolicy?.enabled)return;
    let active=true;
    let running=false;
    const tick=async()=>{
      if(running||document.visibilityState!=="visible"||busy)return;
      running=true;
      try{
        const response=await fetch("/api/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"automation-tick"})});
        if(active&&response.ok)void sync.current?.refresh();
      }catch{if(active)setError("Automatic sample reminders could not be checked. Refresh and try again.");}finally{running=false;}
    };
    void tick();
    const interval=window.setInterval(()=>void tick(),15000);
    return()=>{active=false;window.clearInterval(interval);};
  },[data.controls?.reminderPolicy?.enabled,busy]);
  const open=(id:string)=>{updateCaseUrl(id);setClientTab("overview");setSelected(id);setPanel("case");setError("");setNotice("");};

  async function review(ai=false){if(!c)return;const result=await act({action:ai?"ai-draft":"draft",caseId:c.id});if(result){const version=result.cases.find(item=>item.id===c.id)?.version;const d=result.drafts.find(d=>d.caseId===c.id&&d.caseVersion===version);if(d){setSubject(d.subject);setBody(d.body);setPanel("draft");}}}

  function row(client:ClientCase){const f=totals(client),state=category(client),priority=accountPriority(client,data.controls);return <button className={`client ${priority.group==="urgent"?"disputed":f.pending?"hold":""}`} key={client.id} onClick={()=>{open(client.id);if(hasUnreviewedReply(client)){setClientTab("messages");setReplyRequested("customer-replies");}}}><span className={`avatar avatar-${state}`}><Icon name={priority.group==="urgent"?"alert":f.pending?"receipt":client.hold!=="none"?"pause":!f.remaining?"check":state==="waiting"?"clock":"mail"}/></span><span className="client-copy"><strong>{client.name}</strong><span>{client.id==="sandbox-email-loop-test"?"Email reply test · ":client.id==="sandbox-voice-test"?"Phone test · ":""}{f.pending?"Check received":client.invoices.length>1?`${client.invoices.length} invoices`:"Invoice"} · {client.invoices.map(i=>`#${i.number}`).join(", ")}</span><span className="priority-reason">{priority.reason}</span></span><span className="client-end"><strong>{client.invoices.some(i=>i.evidence?.dueMinor===null)?"Review needed":money(f.remaining)}</strong><span className={`status ${!f.remaining&&priority.group!=="urgent"?"is-settled ":""}${priority.group==="urgent"?"disputed":state}`}><Icon name={priority.group==="urgent"?"alert":f.pending||client.hold!=="none"?"pause":!f.remaining?"check":state==="waiting"?"clock":"mail"}/>{priority.group==="urgent"?client.hold==="dispute"?"Dispute":"Urgent":client.hold==="suppressed"?"Stopped":f.pending?"On hold":hasUnreviewedReply(client)?"New reply":!f.remaining?"Settled":client.hold!=="none"?"Paused":state==="waiting"?"Waiting":"Review"}</span></span></button>;}

  const visibleCustomers=data.cases.filter(item=>!data.cases.some(other=>customerKey(other)===customerKey(item)&&other.id!==item.id&&(accountPriority(other,data.controls).group==="urgent"&&accountPriority(item,data.controls).group!=="urgent"||accountPriority(other,data.controls).group===accountPriority(item,data.controls).group&&other.id.localeCompare(item.id)<0)));
  const urgent=visibleCustomers.filter(c=>accountPriority(c,data.controls).group==="urgent");
  const decisions=visibleCustomers.filter(c=>accountPriority(c,data.controls).group==="review"),waiting=visibleCustomers.filter(c=>accountPriority(c,data.controls).group==="waiting");

  return <div className="app-shell"><header className="brand"><img src="/nalbace-app-icon.svg?v=silver-1" alt=""/><span>Nalbace</span><span className="mode">LOCAL SAMPLE</span><button className="header-settings" aria-current={tab==="settings"?"page":undefined} onClick={()=>{setTab("settings");closeCase();setPanel("case");setError("");setNotice("");}}><Icon name="gear"/><span>Settings</span></button></header><div className="environment"><span className="environment-dot"/>Sandbox workspace<span className="environment-note">{emailStatus?.ready?"Allowlisted email test only":"Sending is off"}</span></div><p className={`sync-status ${syncFailed?"sync-warning":""}`} role="status">{syncFailed?"Saved changes could not refresh. Try again.":null}{syncFailed&&<button className="back" onClick={()=>void sync.current?.refresh()}>Refresh saved changes</button>}</p><main>

    {tab==="today"&&!c&&<><div className="page-heading"><div><p className="eyebrow">YOUR DAILY REVIEW</p><h1>Know who needs you.</h1><p className="intro">Resolve urgent issues first. Keep customer relationships and payments in view.</p></div></div><section className="summary" aria-label="Daily review workload"><span className="review-count">{urgent.length+decisions.length}</span><div><h2>accounts need your attention</h2><p>{urgent.length} urgent · {decisions.length} to review today</p></div></section>

    {!!urgent.length&&<section className="group urgent-group"><h2>Needs your attention <span>{urgent.length}</span></h2><p className="hint">Disputes, relationship concerns, stopped contact, or unpaid invoices past your overdue threshold. Review the reason before acting.</p>{urgent.map(row)}</section>}
    {!!decisions.length&&<section className="group"><h2>Review today <span>{decisions.length}</span></h2>{decisions.map(row)}</section>}

    {!urgent.length&&!decisions.length&&<div className="empty"><Icon name="check"/><h2>Nothing needs your review.</h2><p>Waiting accounts stay quiet until their next check.</p></div>}

    {waiting.some(item=>totals(item).remaining>0)&&<details className="waiting"><summary>Scheduled follow-up <span>{waiting.filter(item=>totals(item).remaining>0).length}</span></summary><p>No owner action is due now. Each account shows what it is waiting for.</p>{waiting.filter(item=>totals(item).remaining>0).map(row)}</details>}{waiting.some(item=>totals(item).remaining===0)&&<details className="waiting"><summary>Completed / settled <span>{waiting.filter(item=>totals(item).remaining===0).length}</span></summary><p>Payment work is complete. Saved history remains available.</p>{waiting.filter(item=>totals(item).remaining===0).map(row)}</details>}<p className="footnote">Controlled demo · no automatic sending or calling.</p></>}

    {tab==="today"&&c&&<><button className="back" onClick={()=>{if(panel!=="case")setPanel("case");else closeCase();setError("");setNotice("");}}><Icon name="arrow"/>{panel==="case"?"Today":"Client review"}</button><ClientHeader key={`header-${c.id}`} client={c} mode={panel==="draft"?"REVIEW EXACT MESSAGE":panel==="receipt"?"OWNER-RECORDED PAYMENT":"CLIENT DETAILS"} busy={busy} onSave={async value=>Boolean(await act({action:"edit-client-details",caseId:c.id,...value}))}/>

    {panel==="case"&&<>
    <div className="client-tabs" role="tablist" aria-label="Customer sections">{([['overview','Overview'],['messages','Messages'],['history','History'],['details','Details']] as const).map(([id,label])=><button type="button" key={id} id={`client-tab-${id}`} role="tab" aria-selected={clientTab===id} aria-controls={`client-panel-${id}`} onClick={()=>{setClientTab(id);}}>{label}{id==="messages"&&Boolean(c.pastedReplies?.length)&&<span>{c.pastedReplies!.length}</span>}</button>)}</div>
    {clientTab==="overview"&&customerKey(c).endsWith(":controlled-self-test")&&<RecordingCallButton/>}{clientTab==="overview"&&<AutomaticFollowupProgress client={c}/>}

    {clientTab==="overview"&&c.followupRehearsal&&<section className="card"><h2>Approved workflow rehearsal</h2><p>{c.followupRehearsal.caseVersion!==c.version?"Account changed. Remaining steps are held for review.":"Simulated steps only. No customer is contacted."}</p><ol>{c.followupRehearsal.steps.map(step=><li key={step.day}>Day {step.day} · {step.channel==="email"?"Email":"Call"} · {step.completedAt?"Simulated":c.followupRehearsal?.caseVersion!==c.version?"Held":"Scheduled"}</li>)}</ol>{c.followupRehearsal.caseVersion===c.version&&c.followupRehearsal.steps.find(step=>!step.completedAt)&&<button className="secondary" disabled={busy} onClick={()=>{const plan=c.followupRehearsal;const step=plan?.steps.find(item=>!item.completedAt);if(plan&&step)void act({action:"advance-workflow",caseId:c.id,planId:plan.id,day:step.day});}}>Advance demo to next scheduled day</button>}</section>}
    {clientTab==="overview"&&<div id="client-panel-overview" role="tabpanel" aria-labelledby="client-tab-overview"><CaseOverview controls={data.controls} onNavigate={destination=>{setClientTab(destination);setReplyRequested(destination==="messages"?"customer-replies":"contact-permissions");}} client={c} busy={busy} onReview={()=>{if(c.source==="fixture"){if(data.controls?.reminderPolicy?.enabled)setClientTab("messages");else{setTab("settings");closeCase();}}else void review();}} onRefresh={()=>void act({action:"refresh-evidence",caseId:c.id})}/><DisputeReview onReadMessage={()=>{setClientTab("messages");setReplyRequested("customer-replies");}} key={`dispute-${c.id}`} client={c} busy={busy} onSave={async value=>Boolean(await act({action:"review-dispute",caseId:c.id,...value}))}/>{c.hold==="dispute"&&<section className="card" aria-label="Follow-up workflow"><div className="workflow-status-heading"><h2>Start workflow</h2><span className="workflow-hold-label">On hold</span></div><p>While the dispute is open, review the evidence and record your next step above. Routine reminders and AI calls are paused.</p>{c.voiceDisputeEvidence&&<p><strong>From the customer’s call:</strong> {c.voiceDisputeEvidence.quote}</p>}<div className="actions"><button type="button" className="secondary" onClick={()=>setClientTab("messages")}>Open conversation history</button><button type="button" className="secondary" onClick={()=>setClientTab("history")}>Open case history</button></div></section>}<section className="card invoice-section"><h2 className="section-title"><span className="silver-icon"><Icon name="invoice"/></span>Invoices<span>{c.invoices.length}</span></h2>{c.source==="paypal-sandbox"&&<><div className="evidence-toolbar"><p className="hint">Checked {new Date(c.evidenceAt).toLocaleString()}</p><button className="text-button" disabled={busy} onClick={()=>void act({action:"refresh-evidence",caseId:c.id})}><Icon name="refresh"/>{busy?"Checking…":"Refresh"}</button></div></>}{c.invoices.map(i=><div className="invoice" key={i.id}><div><strong>#{i.number}</strong><span>{i.evidence?i.evidence.status.replaceAll("_"," "):i.servicePeriod} · {i.evidence&&!i.evidence.dueDate?"Due date unavailable":`Due ${when(i.dueDate+"T12:00:00Z")}`}</span></div><div><strong>{i.evidence&&i.evidence.dueMinor===null?"Unavailable":money(i.balanceMinor)}</strong></div></div>)}<p className="hint">Source balances. Recorded receipts are accounted for in the summary. Separate email and phone test artifacts are not added together as customer debt.</p></section>

    {(c.receipts.length>0||c.reconciliationRequired)&&<section id="receipt-evidence" tabIndex={-1} className={`card receipt-section ${totals(c).pending?"hold":""}`}><h2 className="section-title"><span className="silver-icon"><Icon name="receipt"/></span>Received payments<span>{c.receipts.length}</span></h2><p className="hint">Owner-recorded cash and checks · separate from PayPal verification.</p>{c.receipts.map(r=><div className="receipt" key={r.id}><div><strong>{r.kind==="check"?"Check":"Cash"} · {money(r.allocations.reduce((n,a)=>n+a.amountMinor,0))}</strong><span>{r.checkNumber&&<>Check #{r.checkNumber} · </>}{r.voided?`Voided: ${r.voided.reason}`:r.state==="cleared"?"Owner-confirmed":"Received: awaiting clearance"}</span></div>{!r.voided&&r.kind==="check"&&r.state==="received"&&<button className="secondary" disabled={busy} onClick={()=>{setClearReceiptId(r.id);setCheckNumber(r.checkNumber??"");}}>Confirm cleared</button>}{clearReceiptId===r.id&&<div role="group" aria-label="Confirm check clearance"><p>Has this check cleared? This records your confirmation, not bank or PayPal verification.</p><label>Check number<input maxLength={80} value={checkNumber} onChange={e=>setCheckNumber(e.target.value)}/></label><div className="actions"><button disabled={busy||!checkNumber.trim()} onClick={async()=>{const result=await act({action:"clear",caseId:c.id,receiptId:r.id,checkNumber});if(result)setClearReceiptId(null);}}>Yes, record clearance</button><button className="secondary" onClick={()=>setClearReceiptId(null)}>Cancel</button></div></div>}{!r.voided&&c.source==="paypal-sandbox"&&c.reconciliationRequired&&r.state==="cleared"&&<ReceiptMatch client={c} receipt={r} busy={busy} onMatch={matches=>void act({action:"reconcile",caseId:c.id,receiptId:r.id,matches})}/>} {!r.voided&&<ReceiptCorrection busy={busy} onSave={async reason=>Boolean(await act({action:"void-receipt",caseId:c.id,receiptId:r.id,reason,version:c.version}))}/>}</div>)}{c.reconciliationRequired&&c.receipts.some(r=>r.voided)&&<ReceiptCorrectionsReview busy={busy} onSave={async note=>Boolean(await act({action:"resolve-receipt-corrections",caseId:c.id,version:c.version,note}))}/>}</section>}

    {caseView(c).eligible&&<details className="optional-action"><summary><Icon name="assistant"/>AI assistance</summary><p className="hint">Suggest an approach, then review the message. A configured test allowance is required.</p><button className="secondary full" disabled={busy||!aiStatus?.ready||aiStatus.used>=aiStatus.limit} onClick={()=>void review(true)}><Icon name="assistant"/>Suggest an approach with AI</button></details>}


<section className="card"><h2 className="section-title"><span className="silver-icon"><Icon name="receipt"/></span>Payment actions</h2><p className="hint">Record money received outside PayPal. PayPal payments are checked using Refresh payment status. Resuming clears a manual pause; it does not send a reminder.</p><div className="actions"><button className="secondary" disabled={busy||!totals(c).remaining||c.reconciliationRequired} onClick={()=>{setAmounts({});setPanel("receipt");}}><Icon name="receipt"/>Record cash or check</button><button className="secondary" disabled={busy||c.hold==="dispute"||c.hold==="suppressed"} onClick={()=>{if(c.hold!=="none"&&hasUnreviewedReply(c)){setClientTab("messages");setReplyRequested("customer-replies");}else void act({action:"pause",caseId:c.id,paused:c.hold==="none"});}}><Icon name="pause"/>{c.hold==="suppressed"?"Contact stopped":c.hold==="dispute"?"Review dispute above":c.hold==="none"?"Pause follow-up":hasUnreviewedReply(c)?"Review reply before resuming":"Resume follow-up review"}</button></div></section>

    </div>}
    {clientTab==="messages"&&<div id="client-panel-messages" role="tabpanel" aria-labelledby="client-tab-messages"><p className={`message-hold ${c.hold==="dispute"?"disputed":""}`}>{c.hold==="dispute"?"Invoice disputed · reminders and AI calls stay stopped until owner resolution.":c.hold!=="none"?"Follow-up is on hold while you review this customer.":"Review customer conversations before approving follow-up."}</p><section className="card" id="customer-replies" tabIndex={-1}><h2>Conversation history</h2>{customerRecords.length>1&&<p className="hint">All email and phone conversations for this customer. Invoice balances remain separate.</p>}<ul className="conversation-history">{[
      ...customerRecords.flatMap(record=>record.automaticFollowup?.completed??[]).map(step=>({at:step.on+"T17:00:00Z",label:step.channel==="call"?"Simulated AI call":"Simulated email",text:step.text})),
      ...customerRecords.flatMap(record=>(record.pastedReplies??[]).filter(reply=>reply.text.trim()!==record.voiceDisputeEvidence?.quote.trim())).map(reply=>({at:reply.at,label:c.source==="fixture"?"Sample customer email":reply.source==="provider-received"?"Customer email":"Recorded customer reply",text:emailDisplay(reply.text).message})),
      ...customerRecords.flatMap(record=>record.customerUpdates??[]).map(update=>({at:update.at,label:"Owner note",text:update.note})),
      ...customerRecords.flatMap(record=>record.voiceDisputeEvidence?[{at:record.voiceDisputeEvidence.recordedAt,label:"Phone dispute",text:record.voiceDisputeEvidence.quote}]:[]),
      ...(data.emailAttempts??[]).filter(attempt=>customerRecords.some(record=>record.id===attempt.caseId)).map(attempt=>({at:attempt.at,label:"Email attempt",text:`${attempt.subject} · ${attempt.state}`})),
    ].sort((a,b)=>b.at.localeCompare(a.at)).map((item,index)=><li key={`${item.at}-${index}`}><strong>{item.label}</strong> · <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time><p>{item.text}</p></li>)}</ul><button className="text-button" onClick={()=>setClientTab("history")}>View full case history</button></section><ReplyReview showMessages={false} client={c} busy={busy} aiReady={Boolean(aiStatus?.ready&&aiStatus.used<aiStatus.limit)} onAction={async value=>Boolean(await act({...value,caseId:c.id}))}/><CustomerUpdate key={`update-${c.id}`} busy={busy} onSave={async value=>{const result=await act({...value,caseId:c.id});if(result)setNotice("Customer update saved. Follow-up rules and approvals were rechecked.");return Boolean(result);}}/>{(c.id==="sandbox-voice-test"||data.voiceCalls?.some(call=>call.caseId===c.id))&&<><VoiceReview client={c} reviews={data.voiceReviews??[]} approvals={data.voiceApprovals??[]} calls={data.voiceCalls??[]} busy={busy} onReview={()=>void act({action:"prepare-voice-review",caseId:c.id,version:c.version})} onApprove={reviewId=>void act({action:"approve-voice-test",caseId:c.id,reviewId})} onCall={approvalId=>void act({action:"call-voice-test",caseId:c.id,approvalId})}/></>}</div>}
    {clientTab==="history"&&<div id="client-panel-history" role="tabpanel" aria-labelledby="client-tab-history">{data.emailAttempts?.some(a=>a.caseId===c.id)&&<section className="card"><h2 className="section-title"><Icon name="mail"/>Email delivery</h2>{data.emailAttempts.filter(a=>a.caseId===c.id).map(a=><div className="timeline" key={a.id}><time>{new Date(a.at).toLocaleString()}</time><p><strong>{a.state==="accepted"?(a.receivedCopy?"Received in the test inbox · read status unknown":"Provider accepted · delivery unconfirmed"):a.state==="unknown"?"Unknown outcome · no resend":a.state==="blocked"?"Blocked before sending · review allowance":"Reserved · outcome not recorded"}</strong></p><p>{a.to} · {a.subject}</p><p className="hint">Follow-up held. This attempt cannot retry automatically.</p></div>)}</section>}<section className="card"><h2 className="section-title"><Icon name="history"/>Client history<span>{c.history.length}</span></h2><p className="hint">Usual payment method: {c.preference==="check"?"check":"PayPal"}. {c.source==="fixture"?"Sample history only; no mailbox has been imported.":"Sandbox case history; matched replies appear in customer reply review."}</p>{c.history.map((e,i)=><div className="timeline" key={i}><time>{when(e.at)}</time><p>{e.text}</p></div>)}</section></div>}
    {clientTab==="details"&&<div id="client-panel-details" role="tabpanel" aria-labelledby="client-tab-details"><ContactPermissions key={`${c.id}-${c.version}`} client={c} busy={busy} onSave={async preferences=>Boolean(await act({action:"customer-followup",caseId:c.id,version:c.version,...preferences}))}/></div>}
    </>}

    {panel==="draft"&&!draft&&<section className="card" role="status"><h2>This case changed.</h2><p>The previous draft is no longer current. Return to client review to see the latest payment evidence.</p><button className="secondary full" onClick={()=>setPanel("case")}>Return to client review</button></section>}

    {panel==="draft"&&draft&&c.source==="fixture"&&<section className="card"><h2>Automatic reminders</h2><p>Set the schedule once in Settings. This customer’s calling preference applies across invoices.</p><button className="primary full" onClick={()=>{setTab("settings");closeCase();}}>Review reminder policy</button></section>}
    {panel==="draft"&&draft&&c.source!=="fixture"&&<form onSubmit={async e=>{e.preventDefault();const result=await act({action:"approve",caseId:c.id,draftId:draft.id,subject,body});if(result)setNotice("Draft approved. Approval alone does not send a message.");}}><div className="sample-notice">{draft.origin==="ai-assisted-template"?"AI suggested the approach · Message assembled by Nalbace":"Sample template · No AI request used for this draft"}</div>{draft.assistance&&<details className="card history"><summary className="section-title"><Icon name="assistant"/>Why this approach?</summary><p>{draft.assistance.reason}</p><p className="hint">AI recommendation for your review. Check its explanation against the client history before approving.</p></details>}<section className="card"><h2 className="section-title"><span className="silver-icon"><Icon name="mail"/></span>Message for approval</h2><dl><div><dt>To</dt><dd>{draft.recipient}</dd></div><div><dt>Invoices</dt><dd>{c.invoices.map(i=>`#${i.number}`).join(", ")}</dd></div><div><dt>Remaining</dt><dd>{money(totals(c).remaining)}</dd></div></dl></section><FollowupPlanPreview client={c}/><label>Subject<input required maxLength={200} value={subject} onChange={e=>{setSubject(e.target.value);setNotice("");}}/></label><label>Message<textarea required maxLength={6000} rows={11} value={body} onChange={e=>{setBody(e.target.value);setNotice("");}}/></label><button className="primary full" disabled={busy} type="submit">{busy?"Checking approval…":"Approve email draft only"}</button>{approval&&emailStatus?.ready&&<button type="button" className="secondary full" disabled={busy||!hasSelfTestEmailEvidence(c)||subject!==draft.subject||body!==draft.body||emailStatus.used>=emailStatus.limit} onClick={async()=>{const result=await act({action:"send-test-email",caseId:c.id,draftId:draft.id,approvalId:approval.id});if(result){setPanel("case");setNotice("Email attempt recorded. Check its status; provider acceptance does not confirm delivery.");}}}>Send exact approved test email · 1 attempt</button>}{approval&&!hasSelfTestEmailEvidence(c)&&<p className="hint">Before a controlled email test, open contact permissions for this client and record permission for your own test mailbox. Earlier contact checks alone cannot enable sending.</p>}{approval&&<p className="hint">Approval stored for this exact case version. Changes to payment evidence invalidate it.</p>}<p className="footnote">Before a future send, the server must refresh payment evidence and recheck permission. Email tests require a separately configured sender, allowed recipient and allowance. Calls remain disabled.</p></form>}

    {panel==="receipt"&&<form onSubmit={async e=>{e.preventDefault();const allocations=[];for(const [invoiceId,value] of Object.entries(amounts)){if(!value.trim())continue;if(!/^\d+(\.\d{1,2})?$/.test(value)){setError("Use a positive amount with no more than two decimal places.");return;}const [dollars,cents=""]=value.split(".");const amountMinor=Number(dollars)*100+Number(cents.padEnd(2,"0"));if(amountMinor>0)allocations.push({invoiceId,amountMinor});}const result=await act({action:"receipt",caseId:c.id,kind,allocations});if(result){setPanel("case");setNotice("Receipt recorded. The case and any prior approval have been updated.");}}}><section className="card"><h2>Record what you received</h2><p>A check pauses follow-up until you confirm clearance. Cash is recorded as owner-confirmed. Neither is a PayPal-verified payment.</p><label>Payment method<select value={kind} onChange={e=>setKind(e.target.value as "cash"|"check")}><option value="check">Check received</option><option value="cash">Cash received</option></select></label><h3>Allocate this receipt</h3><p className="hint">Enter the amount covering each invoice. Nothing is allocated automatically.</p>{c.invoices.map(i=><label key={i.id}>Invoice #{i.number}<input inputMode="decimal" placeholder="0.00" aria-label={`Amount for invoice ${i.number}`} value={amounts[i.id]??""} onChange={e=>setAmounts({...amounts,[i.id]:e.target.value})}/></label>)}</section><button type="submit" className="primary full" disabled={busy}>{busy?"Recording…":"Record receipt"}</button></form>}

    </>}

    {tab==="activity"&&<ActivityPanel controls={data.controls} cases={data.cases} events={data.events} onOpen={id=>{setTab("today");open(id);const client=data.cases.find(c=>c.id===id);if(client&&hasUnreviewedReply(client)){setClientTab("messages");setReplyRequested("customer-replies");}}}/>}

    {tab==="connections"&&<><p className="eyebrow">INVOICE ACCESS</p><h1>Connections</h1><p className="intro">Review invoices from the PayPal test account. Manage follow-up preferences in Settings.</p><SandboxPanel linkedEvidence={data.cases.filter(item=>item.source==="paypal-sandbox").flatMap(item=>item.invoices.flatMap(i=>i.evidence?[i.evidence]:[]))} onImported={workspace=>{if(sync.current)sync.current.replace(workspace);else setData(workspace);setNotice("Sandbox invoice linked. Find the sandbox test client in Today.");}}/><section className="card"><h2>Customer records</h2><p>Nalbace stores customer details and follow-up history in this workspace. You can review and edit them on each customer’s page.</p><details><summary>What is still being built?</summary><p>Connecting a business PayPal account, importing a customer list, and syncing with an external CRM are future features. You can use the sample customer records without an external CRM.</p></details></section></>}

    {tab==="settings"&&<><p className="eyebrow">YOUR WORKSPACE</p><h1>Settings</h1><p className="intro">How Nalbace helps you follow up.</p><WorkspaceSettings key={data.controls?.revision??0} controls={data.controls} busy={busy} ai={aiStatus} email={emailStatus} voiceCalls={data.voiceCalls??[]} onReminderSave={async(policy,revision)=>{const saved=Boolean(await act({action:"reminder-policy",policy,revision}));if(saved)setNotice("Reminder policy saved.");return saved;}} onPrioritySave={async(days,revision)=>{const saved=Boolean(await act({action:"priority-preference",days,revision}));if(saved)setNotice("Account priority rule saved.");return saved;}} onFollowupSave={async (channel,paused,revision)=>{const saved=Boolean(await act({action:"followup-preference",channel,paused,revision}));if(saved)setNotice(`${channel==="email"?"Email":"Calling"} preference saved.`);return saved;}} onSave={async (paused,revision)=>{const saved=Boolean(await act({action:"ai-preference",paused,revision}));if(saved)setNotice("AI preference saved.");return saved;}}/><section className="card connection"><h2 className="section-title"><span className="silver-icon"><Icon name="account"/></span>Sign-in and team access<span>Local demo</span></h2><p>This demo opens on this computer without an account sign-in. Business accounts, team invitations and access roles are not available yet. Keep customer records synthetic until those protections are built.</p></section></>}

    {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}

    </main><nav className="workspace-nav" aria-label="Main navigation">{([['today','Today','home'],['activity','Activity','history'],['connections','Connections','connections']] as const).map(([name,label,icon])=><button key={name} aria-current={tab===name?"page":undefined} onClick={()=>{setTab(name);closeCase();setPanel("case");setError("");setNotice("");}}><Icon name={icon}/>{label}</button>)}</nav><footer className="app-footer">Nalbace · Local development · Sample data only</footer></div>;

}
