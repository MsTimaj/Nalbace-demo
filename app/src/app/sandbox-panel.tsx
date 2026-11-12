"use client";
import Icon from "./ui-icon.tsx";
import {useState} from "react";
import type {SandboxInvoice} from "../domain/paypal-evidence.ts";
import type {State} from "./workspace.tsx";
type Snapshot={checkedAt:string;invoices:SandboxInvoice[];total:number|null;hasMore:boolean};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
export default function SandboxPanel({onImported,linkedEvidence}:{onImported:(workspace:State)=>void;linkedEvidence:SandboxInvoice[]}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[invoice,setInvoice]=useState<SandboxInvoice|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function read(invoiceId?:string){
    setBusy(true);setError("");setInvoice(null);
    // A failed refresh must not leave old evidence looking current.
    if(!invoiceId)setSnapshot(null);
    try{const response=await fetch("/api/paypal-sandbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(invoiceId?{action:"invoice",invoiceId}:{action:"refresh"})});const result=await response.json();if(!response.ok)throw new Error(result.error);if(invoiceId)setInvoice(result.invoice);else setSnapshot(result);}catch(e){setError(e instanceof Error?e.message:"Sandbox check failed.");}finally{setBusy(false);}
  }
  async function link(invoiceId:string){
    setBusy(true);setError("");
    try{const response=await fetch("/api/paypal-sandbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"import",invoiceId})});const result=await response.json();if(!response.ok)throw new Error(result.error);onImported(result.workspace);}catch(e){setError(e instanceof Error?e.message:"Invoice could not be linked.");}finally{setBusy(false);}
  }
  const latest=(value:SandboxInvoice)=>{const saved=linkedEvidence.find(i=>i.id===value.id);return saved&&Date.parse(saved.checkedAt)>Date.parse(value.checkedAt)?saved:value;};
  const shownSnapshot=snapshot?{...snapshot,invoices:snapshot.invoices.map(latest)}:null;
  const shownInvoice=invoice?latest(invoice):null;
  return <section className="card connection"><h2 className="section-title"><span className="silver-icon"><Icon name="invoice"/></span>PayPal sandbox <span>{busy?"Checking…":error?"Check failed":shownSnapshot?"Read access verified":"Ready to check"}</span></h2>
    <p>Check invoices from the PayPal test account configured for this demo, then select which invoices to review in Today.</p>
    <button className="primary full" disabled={busy} onClick={()=>void read()}>{busy?"Checking PayPal…":"Refresh sandbox invoices"}</button>
    {error&&<p className="error" role="alert">{error}</p>}
    {shownSnapshot&&<><p className="hint">Last list check: {new Date(shownSnapshot.checkedAt).toLocaleString()}. Linked invoices also reflect newer saved case evidence.</p>
      {!shownSnapshot.invoices.length?<p role="status">No invoices returned from this sandbox account.</p>:<><p>{shownSnapshot.invoices.length} invoice{shownSnapshot.invoices.length===1?"":"s"} shown{shownSnapshot.total!==null?` of ${shownSnapshot.total}`:""}.</p>{shownSnapshot.invoices.map(i=><div className="invoice" key={i.id}><div><strong>#{i.number}</strong><span>{i.status.replaceAll("_"," ")} · {i.dueMinor===null?"Amount due unavailable":`${money(i.dueMinor)} due`}</span><span>Evidence checked {new Date(i.checkedAt).toLocaleString()}</span><button className="secondary" disabled={busy} onClick={()=>void read(i.id)}>Check payment evidence</button></div></div>)}</>}
      {shownSnapshot.hasMore&&<p className="hint">Only the first 20 invoices are shown. This is not a complete account reconciliation.</p>}</>}
    {shownInvoice&&<section aria-label="Invoice evidence" className="sample-notice"><h3>#{shownInvoice.number}</h3><p>{shownInvoice.status.replaceAll("_"," ")} · {shownInvoice.dueMinor===null?"Amount due unavailable":`${money(shownInvoice.dueMinor)} due`}</p><p>{shownInvoice.reason}</p><p>Follow-up: {shownInvoice.followUp==="stopped"?"stopped for this evidence":"owner review required"}. No contact is authorized by this check.</p>
      {shownInvoice.payments.length?shownInvoice.payments.map((p,i)=><p key={i}>{p.type==="paypal"?"PayPal-reported payment":p.type==="external"?"Externally recorded payment · not PayPal-verified":"Unclassified payment · review required"}{p.amountMinor===null?" · amount unavailable":` · ${money(p.amountMinor)}`}</p>):<p>No payment transactions were returned. This does not prove that no offline payment was received.</p>}
      <p className="hint">Invoice checked: {new Date(shownInvoice.checkedAt).toLocaleString()}.</p><button className="secondary full" disabled={busy} onClick={()=>void link(shownInvoice.id)}>Link to sandbox test client</button><p className="hint">Groups only the invoices you select for your controlled test. Test contact verification remains required.</p></section>}
    <p className="hint">Demo access only. Connecting your own business PayPal account is not available yet. This check cannot send invoices or change payment records.</p>
  </section>;
}
