import type {ClientCase,Invoice,Gate} from "./cases.ts";
import {customerAllowsAiCalls} from "./customer-calling.ts";

export function instant(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("A valid date is required.");
  return result;
}
function minor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Amounts must be whole, non-negative cents.");
  return value;
}

// Source balance remains separate from locally evidenced receipts. A future PayPal
// reconciliation must explicitly map the same receipt, never subtract it twice.
export function financials(c: ClientCase) {
  const balances = new Map(c.invoices.map(i => [i.id, minor(i.balanceMinor)]));
  if (balances.size !== c.invoices.length) throw new Error("Duplicate invoice identity.");
  const reserved = new Map<string, number>();
  const settled = new Map<string, number>();
  for (const r of c.receipts) {
    if(r.voided)continue;
    if (!r.allocations.length) throw new Error("A receipt needs explicit allocations.");
    for (const a of r.allocations) {
      const amount = minor(a.amountMinor);
      if (!amount || !balances.has(a.invoiceId)) throw new Error("Receipt allocation does not match an invoice.");
      const match=r.providerMatches?.find(m=>m.invoiceId===a.invoiceId);
      if(match){
        const invoice=c.invoices.find(i=>i.id===a.invoiceId)!;
        const payment=invoice.evidence?.payments.find(p=>p.id===match.paymentId);
        if(r.state!=="cleared"||!payment||payment.type!=="external"||payment.amountMinor!==amount)throw new Error("Receipt match needs fresh reconciliation.");
        continue; // This amount is already included in PayPal's due balance.
      }
      const next = (reserved.get(a.invoiceId) ?? 0) + amount;
      if (next > balances.get(a.invoiceId)!&&!c.reconciliationRequired) throw new Error("Receipt exceeds the remaining invoice balance.");
      reserved.set(a.invoiceId, next);
      if (r.kind === "cash" || r.state === "cleared") settled.set(a.invoiceId, (settled.get(a.invoiceId) ?? 0) + amount);
    }
  }
  const sourceMinor = [...balances.values()].reduce((a,b) => a+b,0);
  const settledMinor = [...settled.values()].reduce((a,b) => a+b,0);
  const pendingMinor = [...reserved.values()].reduce((a,b) => a+b,0) - settledMinor;
  if (![sourceMinor,settledMinor,pendingMinor].every(Number.isSafeInteger)) throw new Error("Balance exceeds supported precision.");
  return { sourceMinor, settledMinor, pendingMinor, remainingMinor:c.reconciliationRequired?sourceMinor:sourceMinor-settledMinor };
}

export function contactEligibility(c: ClientCase, now: Date,channel:"email"|"voice"="email"): Gate {
  const f = financials(c);
  const no = (reason: string): Gate => ({eligible:false,reason,totalMinor:f.remainingMinor});
  if(c.reconciliationRequired)return no("Review changed PayPal balances against offline receipts. No further contact is allowed.");
  if(c.source==="paypal-sandbox"){
    if(c.evidenceStatus!=="ready")return no("Review fresh PayPal evidence. The last refresh is incomplete or failed.");
    if(c.invoices.some(i=>!i.evidence||i.evidence.dueMinor===null||!i.evidence.dueDate))return no("Review incomplete PayPal invoice evidence before contact.");
    if(c.invoices.some(i=>i.evidence!.dueMinor!>0&&i.evidence!.followUp==="stopped"))return no("Invoice status stops ordinary follow-up.");
    const age=now.getTime()-instant(c.evidenceAt);
    if(age<0||age>60000)return no("Review fresh PayPal evidence before preparing or approving contact.");
  }
  if (c.hold !== "none") return no(c.hold === "suppressed" ? "Contact is stopped." : "An owner decision is needed.");
  if (f.remainingMinor === 0) return no(f.sourceMinor === 0 ? "No remaining balance in current source evidence." : "Covered by owner-confirmed offline receipts.");
  if (f.pendingMinor > 0) return no("Check received. Follow-up stays paused until clearance is confirmed.");
  if (!c.verifiedContact) return no("Verify the billing contact first.");
  if(channel==="email"&&c.emailFollowupEnabled===false)return no("Contact preference excludes email reminders for this customer.");
  if(channel==="email"&&c.contactPermission&&!c.contactPermission.emailAllowed)return no("Contact permission for email is off.");
  if(channel==="voice"&&(!c.contactPermission?.voiceAllowed||!/^\+[1-9]\d{6,14}$/.test(c.contactPermission.phone)))return no("Contact permission and a consented test phone are required for voice.");
  if(channel==="voice"&&!customerAllowsAiCalls(c))return no("Contact preference excludes AI calls for this customer.");
  if (instant(c.nextActionAt) > now.getTime()) return no("Waiting until the agreed next review.");
  if (c.lastContactAt && now.getTime()-instant(c.lastContactAt) < 7*86400000 && !(channel==="voice"&&c.voiceRetest?.state==="approved"&&c.voiceRetest.phone===c.contactPermission?.phone&&instant(c.voiceRetest.expiresAt)>now.getTime())) return no("The last contact is too recent for another routine follow-up.");
  if (remainingInvoices(c).some(i => instant(i.dueDate+"T23:59:59Z") >= now.getTime())) return no("Review invoices that are not yet overdue separately.");
  return {eligible:true,reason:"Due for review; check payment evidence before any contact.",totalMinor:f.remainingMinor};
}

export function remainingInvoices(c: ClientCase): Invoice[] {
  financials(c);
  return c.invoices.map(i=>({...i,balanceMinor:i.balanceMinor-(c.reconciliationRequired?0:c.receipts.reduce((sum,r)=>sum+((!r.voided&&(r.kind==="cash"||r.state==="cleared"))?r.allocations.filter(a=>a.invoiceId===i.id&&!r.providerMatches?.some(m=>m.invoiceId===i.id)).reduce((n,a)=>n+a.amountMinor,0):0),0))})).filter(i=>i.balanceMinor>0);
}

