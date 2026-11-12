"use client";
import {useState} from "react";
import {defaultControls} from "../../domain/workspace-controls.ts";
import type {WorkspaceControls} from "../../domain/workspace-controls.ts";
export default function OperatorControls({controls,busy,used,available,onSave}:{controls?:WorkspaceControls;busy:boolean;used:number;available:boolean;onSave:(value:WorkspaceControls)=>Promise<boolean>}){
  const current=controls??defaultControls;
  const [paused,setPaused]=useState(current.aiPaused),[cap,setCap]=useState(current.aiRequestCap);
  return <section className="card settings-panel"><h2>Local AI test allowance</h2><p>AI is optional. Payment checks, balances and approval rules work without it.</p>
    <p className="settings-state"><strong>{current.aiPaused?"Paused":"Workspace permission enabled"}</strong><span>{available?"Test requests are available within the configured allowance.":"Paid AI is disabled in this demo."}</span></p><details className="operating-rules"><summary>Review AI test controls</summary><p className="hint">{used} requests reserved here. This is a one-time test allowance, with no automatic renewal.</p>
    <form onSubmit={async e=>{e.preventDefault();await onSave({...current,aiPaused:paused,aiRequestCap:cap});}}>
      <label className="check-label"><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>Pause AI assistance</label>
      <label>Total workspace AI allowance<input type="number" min={0} max={20} step={1} required value={cap} onChange={e=>setCap(Number(e.target.value))}/></label>
      <p className="hint">Zero blocks requests. This allowance includes past requests and failures. One active request at a time, one per client in 24 hours. The lower server allowance also applies. Saving cannot activate server usage or reset the counter.</p>
      <button className="secondary full" disabled={busy}>Save controls</button>
    </form><p className="hint">The five development evaluation requests were run separately and are already spent. This workspace counter is separate. No further paid evaluation is enabled.</p></details>
    <details className="operating-rules"><summary>What runs without AI?</summary><dl><div><dt>Ordinary automation</dt><dd>Balances, payment checks, receipt allocation, schedules, permissions, approvals and stopping follow-up.</dd></div><div><dt>AI, when useful</dt><dd>Interpreting an ambiguous reply, suggesting a useful next question, or a consented bounded voice conversation. Pasted-reply review is available locally; mailbox intake and voice are pending.</dd></div><div><dt>Fixed demo limits</dt><dd>Selected sandbox invoices only, seven days between routine contacts, exact message review, no automatic paid retries or provider fallback.</dd></div></dl></details>
    <p className="hint">Email and phone calls remain off. Production pricing and monthly budgets are still being built.</p>
  </section>;
}
