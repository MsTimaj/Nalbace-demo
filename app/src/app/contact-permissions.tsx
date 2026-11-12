"use client";
import {useState} from "react";
import type {ClientCase} from "../domain/cases.ts";
import Icon from "./ui-icon.tsx";
import {hasSelfTestEmailEvidence} from "../domain/permission-evidence.ts";
export function TestContactPermissions({client:c,busy,onSave}:{client:ClientCase;busy:boolean;onSave:(permission:Record<string,unknown>)=>Promise<boolean>}){
  const p=c.contactPermission;
  const [editing,setEditing]=useState(false);
  const testPermission=hasSelfTestEmailEvidence(c);
  const [email,setEmail]=useState(c.contact.includes("@")?c.contact:""),[verified,setVerified]=useState(c.verifiedContact),[emailAllowed,setEmailAllowed]=useState(p?.emailAllowed??false),[voiceAllowed,setVoiceAllowed]=useState(p?.voiceAllowed??false),[phone,setPhone]=useState(p?.phone??""),[note,setNote]=useState("");
  const [basis,setBasis]=useState("self-test"),[wording,setWording]=useState(""),[capturedAt,setCapturedAt]=useState(""),[reference,setReference]=useState("");
  const needsEvidence=emailAllowed||voiceAllowed;
  return <section id="contact-permissions" tabIndex={-1} className="card permission-panel"><h2 className="section-title"><Icon name="account"/>Contact permissions<span>{c.hold==="suppressed"?"Stopped":c.verifiedContact?"Reviewed":"Needs review"}</span></h2>
    <dl className="permission-summary"><div><dt>Billing email</dt><dd>{c.contact.includes("@")?c.contact:"Not recorded"}</dd></div><div><dt>Email reminders</dt><dd>{c.hold==="suppressed"?"Stopped":!p?.emailAllowed?"Not permitted":testPermission?"Test permission saved":"Needs permission review"}</dd></div></dl>
    <p className="hint">{testPermission?"Your test email permission is recorded. You do not need to enter it again to view this client.":"Review permission before enabling reminders."} Sending and payment checks still apply.</p>
    <button type="button" className="secondary" aria-expanded={editing} aria-controls={`permission-edit-${c.id}`} onClick={()=>setEditing(!editing)}>{editing?"Cancel changes":"Change permissions"}</button>
    {editing&&<form id={`permission-edit-${c.id}`} onSubmit={async e=>{e.preventDefault();if(capturedAt&&!Number.isFinite(Date.parse(capturedAt)))return;if(await onSave({email,verified,emailAllowed,voiceAllowed,phone,note,...(needsEvidence?{evidence:{basis,wording,capturedAt:capturedAt?new Date(capturedAt).toISOString():"",reference}}:{})})){setEditing(false);setNote("");setWording("");setCapturedAt("");setReference("");}}}>
      <p className="hint">Record a new review only when permission or contact details change. Saving does not remove a stop or dispute, or activate sending.</p>
      <label>Billing email<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Customer phone number<input type="tel" autoComplete="tel" placeholder="+12025550123" maxLength={16} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <label className="check-label"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>I checked this billing contact</label>
      <label className="check-label"><input type="checkbox" checked={emailAllowed} onChange={e=>setEmailAllowed(e.target.checked)}/>Email follow-up is permitted</label>
      <details className="permission-phone"><summary>Optional AI phone permission{voiceAllowed?" · recorded":" · off"}</summary><p className="hint">Email permission does not enable AI calls.</p>
      <label className="check-label"><input type="checkbox" checked={voiceAllowed} onChange={e=>setVoiceAllowed(e.target.checked)}/>This contact consented to an AI phone test</label></details>
      {needsEvidence&&<fieldset><legend>Permission evidence</legend>
        <label>Permission source<select value={basis} onChange={e=>setBasis(e.target.value)}><option value="self-test">My test mailbox or number</option><option value="recipient-record">Customer record · needs review</option></select></label>
        <label>What was agreed<textarea required maxLength={2000} rows={3} value={wording} onChange={e=>setWording(e.target.value)} placeholder="Record the actual words agreed to, including the business, channel and purpose. Do not invent or backdate permission."/></label>
        <label>Permission date and time<input type="datetime-local" required value={capturedAt} onChange={e=>setCapturedAt(e.target.value)}/></label>
        <label>Record reference<input required maxLength={300} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Where the agreement is recorded; no passwords or private access links"/></label>
        <p className="hint">These are owner-recorded details, not independent verification or legal approval. Recipient records do not enable the controlled email test. Do not paste payment credentials or unrelated personal information.</p>
      </fieldset>}
      <label>How did you confirm this?<textarea required maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="For the demo: my own sandbox email and business phone; I am role-playing the customer."/></label>
      <button className="secondary full" disabled={busy}>Save contact review</button>
    </form>}
    <details className="permission-details"><summary>Permission details</summary>{p&&<p className="hint">Last reviewed {new Date(p.reviewedAt).toLocaleString()}. {p.note}</p>}
    {!c.permissionReviews?.at(-1)?.evidence&&p&&<p className="hint">Earlier contact review has no structured evidence. Record a new review before a controlled email test.</p>}
    {!!c.permissionReviews?.length&&<div>{[...c.permissionReviews].reverse().map(r=><article key={r.id}><p><strong>{new Date(r.at).toLocaleString()}</strong> · Email {r.emailAllowed?"permitted":"off"} · AI phone {r.voiceAllowed?"permitted":"off"}</p><p>{r.note}</p>{r.evidence?<><p>{r.evidence.basis==="self-test"?"Owner-controlled test":"Recipient record · not independently verified"} · Given {new Date(r.evidence.capturedAt).toLocaleString()}</p><blockquote>{r.evidence.wording}</blockquote><p>Evidence reference: {r.evidence.reference}</p></>:<p>No structured evidence recorded.</p>}</article>)}</div>}</details>
  </section>;
}


export default function ContactPermissions({client,busy,onSave}:{
  client:ClientCase;
  busy:boolean;
  onSave:(preferences:{emailEnabled:boolean;callEnabled:boolean})=>Promise<boolean>;
}){
  const emailEnabled=client.emailFollowupEnabled!==false;
  const hasCallingAgreement=client.contactPermission?.voiceAllowed===true;
  const callEnabled=client.aiCallPreference==="allow"&&hasCallingAgreement;
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  async function save(email:boolean,calls:boolean){
    setSaving(true);
    setMessage("");
    try{
      if(await onSave({emailEnabled:email,callEnabled:calls}))setMessage("Customer follow-up saved.");
    }finally{setSaving(false);}
  }
  return <section id="contact-permissions" tabIndex={-1} className="card">
    <h2>Customer follow-up</h2>
    <p className="hint">Applies to all invoices for this customer.</p>
    <div className="service-switch-row"><span>Email reminders<small>{emailEnabled?"On":"Off"}</small></span>
      <button type="button" className="service-switch" role="switch" aria-label="Email reminders for this customer" aria-checked={emailEnabled} disabled={busy||saving} onClick={()=>void save(!emailEnabled,callEnabled)}><span/></button>
    </div>
    <div className="service-switch-row"><span>AI phone calls<small>{callEnabled?"On":"Off"}</small></span>
      <button type="button" className="service-switch" role="switch" aria-label="AI calls for this customer" aria-checked={callEnabled} disabled={busy||saving||!hasCallingAgreement} onClick={()=>void save(emailEnabled,!callEnabled)}><span/></button>
    </div>
    {client.hold==="suppressed"&&<p className="hint">This customer asked for contact to stop. Their stop remains in effect.</p>}
    {client.hold==="dispute"&&<p className="hint">Follow-up is paused while the dispute is open.</p>}
    {!hasCallingAgreement&&<p className="hint">AI calls stay off until a calling agreement is recorded.</p>}
    {callEnabled&&client.source==="fixture"&&<p className="hint">Fictional demo agreement and phone number. Calls are simulated only.</p>}{callEnabled&&<details><summary>Customer agreement</summary><p className="hint">{client.contactPermission?.voiceAllowed?"A calling agreement is recorded.":"No calling agreement is recorded yet."}</p></details>}
    <p className="hint" role="status">{saving?"Saving…":message}</p>
  </section>;
}
