
import {useState} from "react";
export default function ReceiptCorrection({busy,onSave}:{busy:boolean;onSave:(reason:string)=>Promise<boolean>}){
  const [reason,setReason]=useState("");
  return <details className="receipt-correction"><summary>Correct this receipt</summary><p className="hint">Void an entry recorded in error. Its original details stay in history. Follow-up stays held for review; no PayPal payment is reversed.</p><form onSubmit={async e=>{e.preventDefault();if(await onSave(reason))setReason("");}}><label>Reason<textarea required rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="secondary" disabled={busy}>Void receipt and hold follow-up</button></form></details>;
}
