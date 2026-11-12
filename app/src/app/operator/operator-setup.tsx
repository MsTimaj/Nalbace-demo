"use client";
import {TestContactPermissions} from "../contact-permissions.tsx";
import InboxPanel from "../inbox-panel.tsx";

import {useEffect,useState} from "react";

import type {State} from "../workspace.tsx";

import type {AiStatus,DeliveryStatus} from "../service-status.ts";

import OperatorControls from "./operator-controls.tsx";

import GmailPanel from "../gmail-panel.tsx";

export default function OperatorSetup({initial}:{initial:State}){

  const [contactId,setContactId]=useState(initial.cases[0]?.id??"");
  const [workspace,setWorkspace]=useState(initial),[ai,setAi]=useState<AiStatus|null>(null),[email,setEmail]=useState<DeliveryStatus|null>(null);

  const [spending,setSpending]=useState<{period:string;enabled:boolean;incidents:number;unresolved:number;application:{used:{microUsd:number};limitMicroUsd:number};business:{used:{microUsd:number;aiRequests:number;emailAttempts:number;voiceSeconds:number};limitMicroUsd:number;aiRequests:number;emailAttempts:number;voiceSeconds:number}}|null>(null);

  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");

  async function refresh(){

    try{

      const responses=await Promise.all([fetch("/api/ai-drafting",{cache:"no-store"}),fetch("/api/email-delivery",{cache:"no-store"}),fetch("/api/workspace",{cache:"no-store"}),fetch("/api/spending",{cache:"no-store"})]);

      if(responses.some(r=>!r.ok))throw new Error("Local setup status could not refresh.");

      const [a,e,w,s]=await Promise.all(responses.map(r=>r.json()));setAi(a);setEmail(e);setWorkspace(w);setSpending(s);

    }catch(e){setAi(null);setEmail(null);setSpending(null);setError(e instanceof Error?e.message:"Setup status unavailable.");}

  }

  useEffect(()=>{

    const params=new URL(window.location.href).searchParams;const result=params.get("gmail"),inbox=params.get("inbox");
    if(inbox){setNotice(inbox==="connected"?"Read-only reply inbox connected. Sending remains disabled.":"Reply inbox was not connected.");window.history.replaceState(null,"",window.location.pathname);}

    if(result){setNotice(result==="connected"?"Gmail connected for the optional local sending test. Delivery limits still apply.":"Gmail was not connected. No delivery was enabled.");window.history.replaceState(null,"",window.location.pathname);}

    void refresh();

  },[]);

  async function act(payload:Record<string,unknown>){

    setBusy(true);setError("");setNotice("");

    try{const r=await fetch("/api/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),v=await r.json();if(!r.ok)throw new Error(v.error);setWorkspace(v);setNotice("Local controls saved. Server activation and delivery permissions still apply.");return true;}

    catch(e){setError(e instanceof Error?e.message:"Setup change failed.");return false;}

    finally{await refresh();setBusy(false);}

  }

  return <div className="app-shell operator-shell"><header className="brand"><img src="/nalbace-app-icon.svg?v=silver-1" alt=""/><span>Nalbace</span><span className="mode">LOCAL ADMINISTRATION</span></header><main>

    <a className="back" href="/">Back to workspace</a><h1>Local test setup</h1><p className="intro">Provider configuration for the developer, separate from customer onboarding.</p>

    <p className="sample-notice">Local computer only. This page has no separate administrator sign-in. It must not be publicly deployed as an administration console.</p>

    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}

    <section className="card"><h2>Provider setup</h2><p>This page manages Nalbace’s internal services. Customer invoice access belongs in Connections; service preferences belong in Settings.</p><p className="hint">The statuses below come from this local workspace and configuration. Saving credentials alone does not enable sending or calling.</p></section>

    <section className="card"><h2>AI provider</h2><dl><div><dt>Implemented adapter</dt><dd>Claude</dd></div><div><dt>Key</dt><dd>{ai?ai.keyPresent?"Saved locally":"Not configured":"Unavailable"}</dd></div><div><dt>Model</dt><dd>{ai?ai.modelSelected?"Selected":"Not selected":"Unavailable"}</dd></div></dl><p>{ai?.message??"Status unavailable. No test is authorized by this page."}</p>

    {ai?.pending.map(run=><div key={run.id}><p className="hint">Pending since {new Date(run.at).toLocaleString()}. Wait two minutes before resolving an interrupted request; its allowance is not refunded.</p><button className="secondary full" disabled={busy} onClick={()=>void act({action:"resolve-ai",caseId:run.caseId,runId:run.id})}>Resolve interrupted request</button></div>)}</section>

    <OperatorControls key={workspace.controls?.revision??0} controls={workspace.controls} busy={busy} used={ai?.used??0} available={ai?.ready??false} onSave={controls=>act({action:"settings",controls})}/>

    <details className="card"><summary>Optional Gmail test adapter</summary><p className="hint">This is an earlier test option. Amazon SES is the agreed candidate for managed email; connecting Gmail is not required for that path.</p><GmailPanel/></details>

    <details className="card"><summary>Controlled test contact evidence</summary><label>Test customer<select value={contactId} onChange={event=>setContactId(event.target.value)}>{workspace.cases.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>{workspace.cases.filter(client=>client.id===contactId).map(client=><TestContactPermissions key={client.id+"-"+client.version} client={client} busy={busy} onSave={permission=>act({action:"contact-permission",caseId:client.id,version:client.version,permission})}/>)}</details>

    <InboxPanel attempts={workspace.emailAttempts??[]} onRefresh={refresh}/>
    <section className="card"><h2>Email test dispatcher</h2><p>{email?email.ready?"Configured for an exact allowlisted test recipient.":"Delivery disabled.":"Status unavailable."}</p>{email&&<dl><div><dt>Attempts reserved</dt><dd>{email.used} / {email.limit}</dd></div><div><dt>Unresolved outcomes</dt><dd>{email.pending}</dd></div></dl>}<p className="hint">Gmail is an optional local test adapter. Managed sender eligibility, signed callbacks and inbound reply correlation remain pending. No automatic retries.</p></section>

    <section className="card"><h2>Incoming reply review</h2><p>{workspace.inboundEvents?.filter(e=>e.result==="unmatched").length??0} unmatched incoming events require operator review.</p><p className="hint">Normalized intake is coded and tested. A bounded Gmail read-only pull adapter is coded; its separate grant and real routed reply still need verification. Public receiving callbacks remain absent. Unmatched events never change financial facts.</p></section><section className="card"><h2>Monthly spending safeguards</h2><p>{spending?spending.enabled?"Rate-card gate enabled; all service, allowance and approval checks still apply.":"Spending disabled. Monthly limits default to zero.":"Spending status unavailable."}</p>{spending&&<><p className="hint">UTC month {spending.period}. Amounts below include conservative reservations, not just verified provider charges.</p><dl><div><dt>Deployment ceiling</dt><dd>${(spending.application.used.microUsd/1000000).toFixed(4)} / ${(spending.application.limitMicroUsd/1000000).toFixed(2)}</dd></div><div><dt>Business ceiling</dt><dd>${(spending.business.used.microUsd/1000000).toFixed(4)} / ${(spending.business.limitMicroUsd/1000000).toFixed(2)}</dd></div><div><dt>AI requests</dt><dd>{spending.business.used.aiRequests} / {spending.business.aiRequests}</dd></div><div><dt>Email attempts</dt><dd>{spending.business.used.emailAttempts} / {spending.business.emailAttempts}</dd></div><div><dt>Voice seconds</dt><dd>{spending.business.used.voiceSeconds} / {spending.business.voiceSeconds}</dd></div><div><dt>Unresolved reservations</dt><dd>{spending.unresolved}</dd></div><div><dt>Billing incidents</dt><dd>{spending.incidents}</dd></div></dl></>}<p className="hint">Unknown costs carry into the next month. Billing reconciliation needs trusted operator evidence. This ledger covers this SQLite deployment, not independent hosted instances.</p></section><section className="card"><h2>Voice test records</h2><p>{workspace.voiceCalls?.length??0} call attempts recorded in this workspace.</p><p className="hint">Call history is not permission for another call. Server configuration, exact approval, contact permission, monetary allowance and supervision must all pass. Review provider privacy settings and the current draft before more tests.</p></section>

  </main></div>;

}
