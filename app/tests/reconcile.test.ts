import test from "node:test";
import assert from "node:assert/strict";
import {fixtures} from "../src/server/fixtures.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import {applyProviderEvidence,matchExternalReceipt,importedInvoice} from "../src/domain/reconcile.ts";
import {contactEligibility,financials} from "../src/domain/case-rules.ts";
import {caseView} from "../src/domain/case-view.ts";
const now=new Date("2026-10-24T12:00:00Z");
const evidence=(due="100.00",status="UNPAID",payments:unknown[]=[])=>normalizeSandboxInvoice({id:"INV2-TEST",status,detail:{invoice_number:"TEST",payment_term:{due_date:"2026-10-01"}},due_amount:{currency_code:"USD",value:due},payments:{transactions:payments}},now.toISOString());
function client(){const c=fixtures(now)[1];c.source="paypal-sandbox";c.evidenceStatus="ready";c.evidenceAt=now.toISOString();c.invoices=[importedInvoice(evidence())];c.receipts=[];return c;}
const receipt=()=>({id:"receipt-test",kind:"cash" as const,state:"cleared" as const,receivedAt:now.toISOString(),allocations:[{invoiceId:"INV2-TEST",amountMinor:3000}]});
test("changed provider balance with offline receipt holds pursuit rather than subtracting twice",()=>{
  const c=client();c.receipts=[receipt()];assert.equal(financials(c).remainingMinor,7000);
  const next=applyProviderEvidence(c,[evidence("70.00")]);
  assert.equal(next.reconciliationRequired,true);assert.equal(financials(next).remainingMinor,7000);
  assert.equal(contactEligibility(next,now).eligible,false);assert.equal(caseView(next,now).category,"decision");
});
test("explicit external payment match removes double subtraction and survives refresh",()=>{
  const c=client();c.receipts=[receipt()];
  const fresh=evidence("70.00","UNPAID",[{type:"EXTERNAL",payment_id:"EXT-1",amount:{currency_code:"USD",value:"30.00"}}]);
  const held=applyProviderEvidence(c,[fresh]);
  const matched=matchExternalReceipt(held,"receipt-test",[{invoiceId:"INV2-TEST",paymentId:"EXT-1"}]);
  assert.equal(matched.reconciliationRequired,false);assert.equal(financials(matched).remainingMinor,7000);
  assert.equal(financials(applyProviderEvidence(matched,[fresh])).remainingMinor,7000);
  const missing=applyProviderEvidence(matched,[evidence("100.00")]);
  assert.equal(missing.reconciliationRequired,true);assert.equal(contactEligibility(missing,now).eligible,false);
});
test("PayPal payments, mismatched amounts and uncleared checks cannot reconcile offline receipts",()=>{
  for(const [type,value] of [["PAYPAL","30.00"],["EXTERNAL","20.00"]]){
    const c=client();c.receipts=[receipt()];c.invoices=[importedInvoice(evidence("70.00","UNPAID",[{type,payment_id:"TX-1",amount:{currency_code:"USD",value}}]))];
    assert.throws(()=>matchExternalReceipt(c,"receipt-test",[{invoiceId:"INV2-TEST",paymentId:"TX-1"}]));
  }
  const c=client();c.receipts=[{...receipt(),kind:"check",state:"received"}];
  assert.throws(()=>matchExternalReceipt(c,"receipt-test",[]),/cleared/);
});
test("a single external payment cannot satisfy two receipts",()=>{
  const c=client();c.invoices=[importedInvoice(evidence("40.00","UNPAID",[{type:"EXTERNAL",payment_id:"EXT-1",amount:{currency_code:"USD",value:"30.00"}}]))];c.receipts=[receipt(),{...receipt(),id:"receipt-2"}];
  const matched=matchExternalReceipt(c,"receipt-test",[{invoiceId:"INV2-TEST",paymentId:"EXT-1"}]);
  assert.throws(()=>matchExternalReceipt(matched,"receipt-2",[{invoiceId:"INV2-TEST",paymentId:"EXT-1"}]),/already matched/);
});
test("paid source closes pursuit and unknown/stale/failed evidence cannot prepare a draft",()=>{
  const c=client();assert.equal(contactEligibility(c,now).eligible,true);
  const paid=applyProviderEvidence(c,[evidence("0.00","PAID")]);assert.equal(contactEligibility(paid,now).eligible,false);assert.equal(caseView(paid,now).category,"waiting");
  const draft=applyProviderEvidence(c,[evidence("100.00","DRAFT")]);assert.equal(caseView(draft,now).category,"waiting");
  for(const status of ["refreshing","failed"] as const){const bad=client();bad.evidenceStatus=status;assert.equal(contactEligibility(bad,now).eligible,false);assert.equal(caseView(bad,now).category,"decision");}
  const unknown=client();unknown.invoices[0].evidence!.dueMinor=null;assert.equal(caseView(unknown,now).category,"decision");
  const stale=client();stale.evidenceAt="2026-10-24T11:00:00Z";assert.equal(contactEligibility(stale,now).eligible,false);
});
test("partial refresh and sample replacement are rejected",()=>{
  assert.throws(()=>applyProviderEvidence(client(),[]),/exact linked/);
  assert.throws(()=>applyProviderEvidence(fixtures(now)[1],[evidence()]),/Sample/);
});
