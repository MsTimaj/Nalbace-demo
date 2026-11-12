import type {ClientCase,Invoice} from "./cases.ts";
import type {SandboxInvoice} from "./paypal-evidence.ts";

export function applyProviderEvidence(current:ClientCase,evidence:SandboxInvoice[]):ClientCase {
  if(current.source!=="paypal-sandbox")throw new Error("Sample cases cannot be replaced by sandbox invoices.");
  const expected=current.invoices.map(i=>i.id).sort();
  if(JSON.stringify(expected)!==JSON.stringify(evidence.map(i=>i.id).sort()))throw new Error("Invoice evidence must cover the exact linked invoice set.");
  const next=structuredClone(current);
  let changedBalance=false;
  next.invoices=current.invoices.map(old=>{
    const fresh=evidence.find(i=>i.id===old.id)!;
    if(old.evidence?.dueMinor!==fresh.dueMinor)changedBalance=true;
    return {...old,number:fresh.number,balanceMinor:fresh.dueMinor??old.balanceMinor,dueDate:fresh.dueDate??old.dueDate,evidence:fresh};
  });
  next.evidenceAt=evidence.map(i=>i.checkedAt).sort()[0];
  // No guessing which cash/check PayPal has already included. Changed balances
  // with unmatched receipts require an explicit reconciliation decision.
  const unmatched=next.receipts.some(r=>!r.voided&&r.allocations.some(a=>!r.providerMatches?.some(m=>m.invoiceId===a.invoiceId)));
  next.reconciliationRequired=Boolean(current.reconciliationRequired||(changedBalance&&unmatched));
  const used=new Set<string>();
  for(const r of next.receipts.filter(r=>!r.voided)){for(const match of r.providerMatches??[]){
    const allocation=r.allocations.find(a=>a.invoiceId===match.invoiceId);
    const p=next.invoices.find(i=>i.id===match.invoiceId)?.evidence?.payments.find(p=>p.id===match.paymentId);
    const key=match.invoiceId+":"+match.paymentId;
    if(!allocation||!p||p.type!=="external"||p.amountMinor!==allocation.amountMinor||r.state!=="cleared"||used.has(key)){
      // Preserve original receipts but remove an invalid mapping and stop contact.
      r.providerMatches=r.providerMatches?.filter(m=>m!==match);
      next.reconciliationRequired=true;
    }else used.add(key);
  }}
  return next;
}

export function importedInvoice(evidence:SandboxInvoice):Invoice {
  // Missing dates/amounts remain flagged in evidence; these placeholders never authorize contact.
  return {id:evidence.id,number:evidence.number,servicePeriod:"PayPal sandbox invoice",currency:"USD",balanceMinor:evidence.dueMinor??0,dueDate:evidence.dueDate??"1970-01-01",evidence};
}

export function matchExternalReceipt(current:ClientCase,receiptId:string,matches:{invoiceId:string;paymentId:string}[]):ClientCase {
  const next=structuredClone(current);
  const receipt=next.receipts.find(r=>r.id===receiptId);
  if(!receipt||receipt.voided||receipt.state!=="cleared")throw new Error("Receipt must be active and owner-confirmed cleared before reconciliation.");
  if(matches.length!==receipt.allocations.length||new Set(matches.map(m=>m.invoiceId)).size!==matches.length)throw new Error("Receipt needs one exact payment match for every allocation.");
  for(const match of matches){
    const allocation=receipt.allocations.find(a=>a.invoiceId===match.invoiceId);
    const invoice=next.invoices.find(i=>i.id===match.invoiceId);
    const payment=invoice?.evidence?.payments.find(p=>p.id===match.paymentId);
    if(!allocation||!payment||payment.type!=="external"||payment.amountMinor!==allocation.amountMinor)throw new Error("Receipt does not match an externally recorded PayPal payment.");
    if(next.receipts.some(r=>!r.voided&&r.id!==receipt.id&&r.providerMatches?.some(m=>m.invoiceId===match.invoiceId&&m.paymentId===match.paymentId)))throw new Error("Receipt payment is already matched.");
  }
  receipt.providerMatches=matches;
  next.reconciliationRequired=next.receipts.some(r=>!r.voided&&r.allocations.some(a=>!r.providerMatches?.some(m=>m.invoiceId===a.invoiceId)));
  return next;
}
