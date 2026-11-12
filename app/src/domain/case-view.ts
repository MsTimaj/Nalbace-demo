import type {ClientCase} from "./cases.ts";
import {financials,contactEligibility} from "./case-rules.ts";
export function caseView(c:ClientCase,now=new Date()){
  const f=financials(c),gate=contactEligibility(c,now);
  let category:"ready"|"decision"|"waiting";
  if(c.reconciliationRequired||c.hold!=="none"||f.pendingMinor>0)category="decision";
  else if(c.source==="paypal-sandbox"&&(c.evidenceStatus!=="ready"||c.invoices.some(i=>!i.evidence||i.evidence.dueMinor===null)))category="decision";
  else if(c.source==="paypal-sandbox"&&c.invoices.every(i=>i.evidence?.followUp==="stopped"))category="waiting";
  else if(f.remainingMinor===0)category="waiting";
  else if(gate.eligible)category="ready";
  else if(c.source==="paypal-sandbox"||!c.verifiedContact||c.contactPermission?.emailAllowed===false)category="decision";
  else category="waiting";
  return {category,reason:gate.reason,remaining:f.remainingMinor,pending:f.pendingMinor,paid:f.settledMinor,eligible:gate.eligible};
}
