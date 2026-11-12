import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {accountPriority} from "../src/domain/account-priority.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import {
  advanceFollowupRehearsal, approveFollowupRehearsal, recordPastedReply, recordReceipt, approveDraft, beginEvidenceRefresh, finishEmailDelivery, finishEvidenceRefresh,
  prepareDraft, readWorkspace, recordCustomerUpdate, recordTransportReply,
  reserveEmailDelivery, saveContactPermission, saveSandboxImport,
} from "../src/server/store.ts";

const caseId = "sandbox-test";
const merchantBinding = "scenario-merchant";
const transportBinding = "a".repeat(64);
const recipient = "customer@example.test";

function invoice(paid = false) {
  return normalizeSandboxInvoice({
    id: "INV2-SCENARIO", status: paid ? "PAID" : "UNPAID",
    detail: {invoice_number: "SCENARIO", payment_term: {due_date: "2026-01-01"}},
    due_amount: {currency_code: "USD", value: paid ? "0.00" : "25.00"},
  }, new Date().toISOString());
}

function currentCase() {
  return readWorkspace().cases.find(item => item.id === caseId)!;
}

function isolated(run: () => void) {
  const original = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "nalbace-journey-"));
  process.chdir(directory);
  try { run(); }
  finally { process.chdir(original); rmSync(directory, {recursive: true, force: true}); }
}

function approveReminder() {
  saveSandboxImport(invoice(), merchantBinding);
  saveContactPermission(caseId, currentCase().version, {
    email: recipient, verified: true, emailAllowed: true, voiceAllowed: false,
    phone: "", note: "Synthetic mailbox",
    evidence: {
      basis: "self-test", wording: "I agree to one synthetic reminder at my test mailbox.",
      capturedAt: new Date().toISOString(), reference: "Offline journey scenario",
    },
  });
  const draft = prepareDraft(caseId);
  const approval = approveDraft(caseId, draft.id, draft.subject, draft.body);
  assert.equal(readWorkspace().approvals.length, 1);
  return {draft, approval};
}

test("business owner: overdue invoice is paid before approved reminder goes out", () => isolated(() => {
  const {draft, approval} = approveReminder();
  assert.equal(accountPriority(currentCase()).remaining, 2500);
  reserveEmailDelivery(caseId, draft.id, approval.id, currentCase().version,
    [invoice(true)], merchantBinding, "sender@example.test", recipient, 1);
  assert.equal(readWorkspace().emailAttempts?.length ?? 0, 0);
  assert.equal(readWorkspace().approvals.length, 0);
  assert.equal(accountPriority(currentCase()).remaining, 0);
  assert.throws(() => prepareDraft(caseId));
}));

test("late customer: polite reply, claimed payment, verified settlement and unresolved complaint", () => isolated(() => {
  const {draft, approval} = approveReminder();
  const reservation = reserveEmailDelivery(caseId, draft.id, approval.id, currentCase().version,
    [invoice()], merchantBinding, "sender@example.test", recipient, 1,
    {provider: "ses", binding: transportBinding});
  assert.ok(reservation.attempt);
  finishEmailDelivery(reservation.attempt.id, "scenario-message");
  const reply = recordTransportReply({
    eventId: "scenario-reply", provider: "ses", binding: transportBinding,
    originalProviderId: "scenario-message", from: recipient,
    text: "I'm sorry I'm late. Thank you for your work. I'll pay tomorrow.",
  });
  assert.equal(reply.result, "matched");
  assert.equal(currentCase().hold, "owner-review");
  assert.equal(accountPriority(currentCase(), {revision: 0, aiPaused: true, aiRequestCap: 0, urgentOverdueDays: 3650}).group, "review");
  assert.throws(() => prepareDraft(caseId));
  recordCustomerUpdate(caseId, "promise", "Customer will pay tomorrow.",
    new Date(Date.now() + 86400000).toISOString(), "scenario-promise");
  recordCustomerUpdate(caseId, "payment-claim", "Customer says they paid.", null, "scenario-claim");
  assert.equal(accountPriority(currentCase()).remaining, 2500);
  const refresh = beginEvidenceRefresh(caseId, merchantBinding);
  finishEvidenceRefresh(caseId, refresh.version, [invoice(true)]);
  assert.equal(accountPriority(currentCase()).remaining, 0);
  recordCustomerUpdate(caseId, "relationship-concern",
    "Customer says the repeated reminders damaged their trust.", null, "scenario-concern");
  assert.equal(accountPriority(currentCase()).group, "urgent");
  assert.equal(accountPriority(currentCase()).remaining, 0);
  assert.throws(() => prepareDraft(caseId));
  recordCustomerUpdate(caseId, "relationship-resolved",
    "Owner and customer resolved the complaint.", null, "scenario-resolution");
  assert.notEqual(accountPriority(currentCase()).group, "urgent");
  assert.equal(accountPriority(currentCase()).remaining, 0);
}));

test("one rehearsal approval runs in order and cannot continue after a customer reply", () => isolated(() => {
  const draft = prepareDraft("birch");
  approveFollowupRehearsal("birch", draft.id, draft.subject, draft.body, true);
  const get = () => readWorkspace().cases.find(item => item.id === "birch")!.followupRehearsal!;
  const plan = get();
  assert.deepEqual(plan.steps.map(step => [step.day, Boolean(step.completedAt)]), [[0,true],[7,false]]);
  assert.throws(() => advanceFollowupRehearsal("birch", plan.id, 14), /next scheduled step/);
  advanceFollowupRehearsal("birch", plan.id, 7);
  advanceFollowupRehearsal("birch", plan.id, 7);
  assert.equal(get().steps.filter(step => step.completedAt).length, 2);
  recordPastedReply("birch", "I mailed a check.", "rehearsal-reply");
  assert.throws(() => advanceFollowupRehearsal("birch", plan.id, 14), /account changes/);
  assert.equal(get().steps.some(step=>step.channel==="call"), false);
  assert.equal(readWorkspace().emailAttempts?.length ?? 0, 0);
}));

test("a recorded payment holds the rest of an approved rehearsal", () => isolated(() => {
  const draft = prepareDraft("birch");
  approveFollowupRehearsal("birch", draft.id, draft.subject, draft.body, true);
  const client = readWorkspace().cases.find(item => item.id === "birch")!;
  recordReceipt("birch", "cash", client.invoices.map(invoice => ({
    invoiceId: invoice.id, amountMinor: invoice.balanceMinor,
  })), "rehearsal-payment");
  assert.throws(() => advanceFollowupRehearsal("birch", client.followupRehearsal!.id, 7), /account changes/);
}));
