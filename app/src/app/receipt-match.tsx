"use client";
import {useState} from "react";
import type {ClientCase,Receipt} from "../domain/cases.ts";
export default function ReceiptMatch({client,receipt,busy,onMatch}:{client:ClientCase;receipt:Receipt;busy:boolean;onMatch:(matches:{invoiceId:string;paymentId:string}[])=>void}){
  const [chosen,setChosen]=useState<Record<string,string>>({});
  const complete=receipt.allocations.every(a=>chosen[a.invoiceId]);
  return <form className="receipt-matching" onSubmit={e=>{e.preventDefault();if(complete)onMatch(receipt.allocations.map(a=>({invoiceId:a.invoiceId,paymentId:chosen[a.invoiceId]})));}}>
    <p>Only match this receipt if you recognize the exact external payment recorded in PayPal. Matching prevents counting it twice.</p>
    {receipt.allocations.map(a=>{const invoice=client.invoices.find(i=>i.id===a.invoiceId)!;const candidates=invoice.evidence?.payments.filter(p=>p.type==="external"&&p.id&&p.amountMinor===a.amountMinor)??[];return <label key={a.invoiceId}>Invoice #{invoice.number} · ${(a.amountMinor/100).toFixed(2)}<select required value={chosen[a.invoiceId]??""} onChange={e=>setChosen({...chosen,[a.invoiceId]:e.target.value})}><option value="">Choose the matching external payment</option>{candidates.map(p=><option key={p.id} value={p.id!}>{p.id} · ${(p.amountMinor!/100).toFixed(2)}</option>)}</select>{!candidates.length&&<span className="hint">No exact external payment match in the current evidence. Refresh PayPal; keep this case on hold.</span>}</label>;})}
    <button className="secondary full" disabled={busy||!complete} type="submit">Confirm this receipt is already included in PayPal</button>
  </form>;
}
