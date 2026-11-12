"use client";
import {useState} from "react";
export default function ReceiptCorrectionsReview({busy,onSave}:{busy:boolean;onSave:(note:string)=>Promise<boolean>}){
  const [note,setNote]=useState("");
  return <details className="receipt-correction"><summary>Review corrected receipt records</summary><p className="hint">Refresh PayPal evidence first. This review can resolve a mismatch after erroneous receipts are voided and all active receipts are matched. It changes no financial records and leaves the manual hold in place.</p><form onSubmit={async e=>{e.preventDefault();if(await onSave(note))setNote("");}}><label>What did you verify?<textarea required rows={2} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="secondary" disabled={busy}>Save corrections review</button></form></details>;
}
