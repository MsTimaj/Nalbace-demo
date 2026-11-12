import { createHash } from "node:crypto";
import {instant,contactEligibility,remainingInvoices} from "./case-rules.ts";
import type {SandboxInvoice} from "./paypal-evidence.ts";
import type {PastedReply} from "./reply-review.ts";
import type {PermissionReview} from "./permission-evidence.ts";

export type Invoice = {
  id: string; number: string; servicePeriod: string; currency: "USD";
  balanceMinor: number; dueDate: string;
  evidence?:SandboxInvoice;
};
export type Receipt = {
  id: string; kind: "cash" | "check"; state: "received" | "cleared";
  allocations: { invoiceId: string; amountMinor: number }[]; receivedAt: string;
  checkNumber?:string;
  providerMatches?:{invoiceId:string;paymentId:string}[];
  voided?:{at:string;reason:string};
};
export type ClientCase = {
  id: string; merchantId: string; name: string; contact: string; verifiedContact: boolean;
  preference: "paypal" | "check"; version: number;
  hold: "none" | "dispute" | "suppressed" | "owner-review";
  nextActionAt: string; lastContactAt: string | null; firstEligibleAt: string;
  evidenceAt: string; source: "fixture" | "paypal-sandbox"; invoices: Invoice[];
  receipts: Receipt[]; history: { at: string; text: string }[];
  providerBinding?:string;
  evidenceStatus?:"refreshing"|"failed"|"ready";
  reconciliationRequired?:boolean;
  voiceRetest?:{id:string;priorCallId:string;phone:string;expiresAt:string;state:"approved"|"consumed"};
  customerUpdates?:{id:string;kind:"payment-claim"|"promise"|"dispute"|"stop"|"relationship-concern"|"relationship-resolved";at:string;note:string;followUpAt:string|null;source:"owner-recorded"}[];
  contactPermission?:{emailAllowed:boolean;voiceAllowed:boolean;phone:string;note:string;reviewedAt:string};
  permissionReviews?:PermissionReview[];
  disputeReviews?:{id:string;at:string;caseVersion:number;resolution:"still-open"|"resolved";note:string;reference:string;evidenceAt:string;nextAction?:string;reviewAt?:string}[];
  voiceDisputeEvidence?:{quote:string;callId:string;recordedAt:string};
  profileEdits?:{id:string;fingerprint:string}[];
  pastedReplies?:PastedReply[];
  aiCallPreference?: "email-only" | "allow";
  emailFollowupEnabled?: boolean;
  automaticFollowup?: {
    cycle: string;
    startedOn: string;
    stage: "coming-due" | "overdue";
    invoiceIds: string[];
    completed: {key: string; on: string; channel: "email" | "call"; text: string}[];
    status: "scheduled" | "held" | "settled" | "owner-review";
    finishedOn?: string;
    reason: string;
  };
  followupRehearsal?: {
    id:string; caseVersion:number; approvedAt:string; draftFingerprint:string;
    subject:string; body:string; invoiceIds:string[]; totalMinor:number;
    steps:{channel:"email"|"call"; day:number; completedAt?:string}[];
  };
};
export type Draft = {
  id: string; caseId: string; caseVersion: number; merchantId: string;
  recipient: string; subject: string; body: string; invoiceIds: string[];
  createdAt: string; origin: "sample-template"|"ai-assisted-template";
  assistance?:{provider:string;model:string;approach:string;reason:string};
};
export type Approval = {
  id: string; ownerId: string; merchantId: string; caseId: string; caseVersion: number;
  draftId: string; fingerprint: string; expiresAt: string; status: "reviewed";
};
export type Gate = { eligible: boolean; reason: string; totalMinor: number };

export {instant,financials,contactEligibility,remainingInvoices} from "./case-rules.ts";

export function draftFingerprint(d: Draft) {
  return createHash("sha256").update(JSON.stringify([
    d.id,d.caseId,d.caseVersion,d.merchantId,d.recipient,d.subject,d.body,[...d.invoiceIds].sort()
  ])).digest("hex");
}

// This is a pure preflight, not authentication or an executor. Inputs must be
// loaded by a trusted server. Fixture evidence can authorize only local review.
export function approvalGate(c: ClientCase, d: Draft, a: Approval | null, owner: {id:string; merchantId:string}, now: Date, execute=false): Gate {
  const no = (reason: string): Gate => ({eligible:false,reason,totalMinor:0});
  if (owner.merchantId !== c.merchantId || d.merchantId !== c.merchantId) return no("Merchant access mismatch.");
  if (d.caseId !== c.id || d.caseVersion !== c.version) return no("The case changed. Review a fresh draft.");
  if (d.recipient !== c.contact) return no("The billing contact changed.");
  const ids = remainingInvoices(c).map(i=>i.id).sort();
  if (JSON.stringify([...d.invoiceIds].sort()) !== JSON.stringify(ids)) return no("The approved invoice set changed.");
  const eligible = contactEligibility(c,now);
  if (!eligible.eligible) return eligible;
  if (a && (a.ownerId !== owner.id || a.merchantId !== c.merchantId || a.caseId !== c.id || a.caseVersion !== c.version || a.draftId !== d.id || a.fingerprint !== draftFingerprint(d) || instant(a.expiresAt) <= now.getTime())) return no("Approval expired or no longer matches this action.");
  if (execute) {
    if (!a) return no("Exact owner approval is required.");
    if (c.source !== "paypal-sandbox") return no("Sample evidence cannot authorize an external send.");
    const age=now.getTime()-instant(c.evidenceAt);
    if (age < 0 || age > 60000) return no("Payment evidence needs a fresh provider check.");
    return no("External delivery is not enabled in this milestone.");
  }
  return eligible;
}
