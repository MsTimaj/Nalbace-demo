import type {ClientCase} from "./cases.ts";
import {contactEligibility,remainingInvoices} from "./case-rules.ts";

export type Approach="payment-update"|"invoice-copy"|"resolve-blocker";
export type DraftContext={caseVersion:number;invoiceIds:string[];invoices:{number:string;dueDate:string;amountMinor:number}[];totalMinor:number;preference:"paypal"|"check";history:string[]};
export type DraftProposal={approach:Approach;reason:string;caseVersion:number;invoiceIds:string[]};
export type DraftModel={provider:string;model:string;propose:(context:DraftContext)=>Promise<unknown>};
export function draftContext(c:ClientCase,now=new Date()):DraftContext {
  const gate=contactEligibility(c,now);if(!gate.eligible)throw new Error(gate.reason);
  const open=remainingInvoices(c);
  return {caseVersion:c.version,invoiceIds:open.map(i=>i.id),invoices:open.map(i=>({number:i.number.slice(0,100),dueDate:i.dueDate,amountMinor:i.balanceMinor})),totalMinor:gate.totalMinor,preference:c.preference,history:c.history.slice(0,6).map(e=>e.text.slice(0,300))};
}
export function validateProposal(value:unknown,context:DraftContext):DraftProposal {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Draft proposal is invalid.");
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="approach,caseVersion,invoiceIds,reason"||!["payment-update","invoice-copy","resolve-blocker"].includes(String(v.approach))||typeof v.reason!=="string"||!v.reason.trim()||v.reason.length>500||v.caseVersion!==context.caseVersion||!Array.isArray(v.invoiceIds)||!v.invoiceIds.every(i=>typeof i==="string")||JSON.stringify([...v.invoiceIds].sort())!==JSON.stringify([...context.invoiceIds].sort()))throw new Error("Draft proposal does not match the reviewed evidence.");
  return {approach:v.approach as Approach,reason:v.reason.trim(),caseVersion:context.caseVersion,invoiceIds:[...context.invoiceIds]};
}
// Financial facts and message language are application-owned. The model selects
// a bounded approach and supplies an owner-facing rationale; it cannot invent
// a balance, contact, payment URL, promise, discount or transaction instruction.
export function renderProposal(context:DraftContext,proposal:DraftProposal){
  validateProposal(proposal,context);
  const numbers=context.invoices.map(i=>`#${i.number}`).join(" and ");
  const total=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(context.totalMinor/100);
  const asks:Record<Approach,string>={"payment-update":"Could you share an update on payment?","invoice-copy":"Would another copy of the invoice details be helpful?","resolve-blocker":"Is there anything you need from us to move this forward?"};
  return {subject:`Following up on ${numbers}`,body:`Hello,\n\nA quick follow-up on ${numbers}, totaling ${total}.\n\nIf you have already sent payment, please let us know so we can update our records. ${asks[proposal.approach]}\n\nThank you.`};
}
