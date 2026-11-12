
import ReminderPolicy from "./reminder-policy.tsx";
import type {VoiceCallRecord} from "../domain/voice-lifecycle.ts";
import {useEffect,useState} from "react";
import {defaultControls} from "../domain/workspace-controls.ts";
import type {WorkspaceControls} from "../domain/workspace-controls.ts";
import Icon from "./ui-icon.tsx";
import {serviceAvailability} from "./service-status.ts";
import type {AiStatus,DeliveryStatus} from "./service-status.ts";
export default function WorkspaceSettings({controls,busy,ai,email,voiceCalls=[],onReminderSave,onPrioritySave,onFollowupSave,onSave}:{controls?:WorkspaceControls;busy:boolean;ai:AiStatus|null;email:DeliveryStatus|null;voiceCalls?:VoiceCallRecord[];onReminderSave:(policy:NonNullable<WorkspaceControls["reminderPolicy"]>,revision:number)=>Promise<boolean>;onPrioritySave:(days:number,revision:number)=>Promise<boolean>;onFollowupSave:(channel:"email"|"voice",paused:boolean,revision:number)=>Promise<boolean>;onSave:(paused:boolean,revision:number)=>Promise<boolean>}){
  const [voiceReady,setVoiceReady]=useState<boolean|null>(null);
  useEffect(()=>{let active=true;fetch("/api/voice-setup",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(v=>{if(active)setVoiceReady(v?.ready===true);}).catch(()=>{if(active)setVoiceReady(null);});return()=>{active=false;};},[]);
  const current=controls??defaultControls;
  const aiState=ai?.pending.length?"Needs review":ai&&current.aiPaused?"Preference paused":serviceAvailability(ai?{...ai,pending:ai.pending.length}:null);
  const voiceState=voiceCalls.some(c=>c.state==="unknown")?"Needs review":voiceCalls.some(c=>c.state==="accepted"||c.state==="reserved")?"Test in progress":voiceReady===null?"Checking status":voiceReady?"Approved tests only":voiceCalls.length?"Paused":"Not enabled";
  return <>
    <p className="sample-notice">Your preferences control new follow-up. Nalbace service restrictions and each customer’s permissions still apply.</p>
    <ReminderPolicy key={current.revision} controls={current} busy={busy} onSave={onReminderSave}/>
    <PriorityPreferences controls={current} busy={busy} onSave={onPrioritySave}/>
    <section className="card connection service-card"><h2 className="section-title"><span className="silver-icon"><Icon name="assistant"/></span>AI assistance<span>{aiState}</span></h2>
      <p>Nalbace manages AI assistance. You review each suggestion before using it.</p>
      <p className="hint">Suggests an approach or helps interpret a reply. You review suggestions; balances, payment checks and approvals follow fixed rules.</p>
      <ServiceSwitch label="AI suggestions" enabled={!current.aiPaused} busy={busy} onChange={enabled=>onSave(!enabled,current.revision)}/>
      <p className="hint">Your preference does not activate a paid service or increase an allowance.</p>
    </section>
    <section className="card connection service-card"><h2 className="section-title"><span className="silver-icon"><Icon name="mail"/></span>Email reminders<span>{current.emailPaused?"Paused by you":email?.pending?"Delivery outcome uncertain":email?.ready?serviceAvailability(email):"Sending disabled by Nalbace"}</span></h2>
      <p>Approved email reminders are managed by Nalbace.</p>
      <p className="hint">This browser demo only simulates reminders. No email account is connected and no real email is sent.</p>
      {email?.pending? <p className="sample-notice">The earlier app send could not be confirmed. The separately received test email does not resolve that attempt. Nalbace must reconcile it before another send; you do not need to repeat setup.</p>:null}
      <ServiceSwitch label="Email reminders" enabled={!current.emailPaused} busy={busy} onChange={enabled=>onFollowupSave("email",!enabled,current.revision)}/>
    </section>
    <section className="card connection service-card"><h2 className="section-title"><span className="silver-icon"><Icon name="phone"/></span>Phone follow-up<span>{current.voicePaused?"Paused by you":voiceState==="Paused"||voiceState==="Not enabled"?"Calling disabled by Nalbace":voiceState}</span></h2>
      <p>AI calls are managed by Nalbace with separate permission, approval and calling limits.</p>
      <p className="hint">{voiceReady?"Only separately approved test calls can be placed.":"This public demo simulates call scheduling only. No real phone call can be made."} Cedar demonstrates a fictional calling agreement; River stays email-only.</p>
      <ServiceSwitch label="AI calls" enabled={!current.voicePaused} busy={busy} onChange={enabled=>onFollowupSave("voice",!enabled,current.revision)}/>
    </section>
    <section className="card"><h2>Customer follow-up</h2><p>Choose email and AI-call preferences in each customer’s Details. Email defaults to on and AI calls default to off. Disputes, stop requests and payment reviews pause contact.</p></section>
    <section className="card"><h2>Billing and usage</h2><p>This sample demo is free to try and makes no paid provider requests.</p><p className="hint">Customer pricing and included usage are still being developed. Monthly spending safeguards default to zero. The planned service has bounded email and AI assistance, with optional calling minutes. There are no automatic upgrades or overage purchases here.</p></section>
  </>;
}

function ServiceSwitch({label,enabled,busy,onChange}:{label:string;enabled:boolean;busy:boolean;onChange:(enabled:boolean)=>Promise<boolean>}){
  const [saving,setSaving]=useState(false);
  return <div className="service-preference">
    <div className="service-switch-row"><span>{label}<small>Owner preference · {saving?"Saving…":enabled?"On":"Off"}</small></span>
      <button type="button" className="service-switch" role="switch" aria-label={label} aria-checked={enabled} aria-busy={saving} disabled={busy||saving} onClick={async()=>{setSaving(true);try{await onChange(!enabled);}finally{setSaving(false);}}}><span/></button>
    </div>
    <p className="hint">{enabled?"Allowed when the service is available and the customer permits it.":"New attempts are paused by your preference."} Service restrictions, approval and spending limits still apply.</p>
  </div>;
}

function PriorityPreferences({controls,busy,onSave}:{controls:WorkspaceControls;busy:boolean;onSave:(days:number,revision:number)=>Promise<boolean>}){
 const [days,setDays]=useState(String(controls.urgentOverdueDays??90));
 return <section className="card"><h2>Account priorities</h2><p>Disputes and open relationship concerns always need your attention, even when the balance is paid.</p><form onSubmit={async e=>{e.preventDefault();await onSave(Number(days),controls.revision);}}><label>Flag unpaid invoices as urgent after how many overdue days?<input type="number" min="1" max="3650" step="1" required value={days} onChange={e=>setDays(e.target.value)}/></label><p className="hint">Demo starting point: 90 days, not a universal standard. Choose what fits your business. This changes your review queue, never permission to send reminders. Calendar dates currently use Eastern Time.</p><button className="secondary full" disabled={busy||Number(days)===(controls.urgentOverdueDays??90)}>Save priority rule</button></form></section>;
}

