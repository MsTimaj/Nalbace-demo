import type {ClientCase} from "./cases.ts";
import type {WorkspaceControls} from "./workspace-controls.ts";
import {financials, remainingInvoices} from "./case-rules.ts";
import {hasUnreviewedReply} from "./reply-review.ts";
import {relationshipConcernOpen} from "./account-priority.ts";
import {customerAllowsAiCalls} from "./customer-calling.ts";

export function easternDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}

export function calendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid calendar date.");
  const timestamp = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid calendar date.");
  }
  return timestamp / 86400000;
}

// Local sample simulation only. This function cannot invoke a provider.
export function runAutomaticFollowup(client: ClientCase, controls: WorkspaceControls, date: string) {
  const policy = controls.reminderPolicy;
  if (!policy?.enabled || client.source !== "fixture") return;
  const today = calendarDay(date);
  const invoices = remainingInvoices(client);
  const previous = client.automaticFollowup;
  const balance = financials(client);
  if (balance.remainingMinor === 0) {
    if (previous) Object.assign(previous, {status: "settled", reason: "Payment settled. No reminder needed."});
    return;
  }
  const latestResolution = client.disputeReviews?.at(-1);
  const latestPromise = client.customerUpdates?.filter(update => update.kind === "promise").at(-1);
  const restartDate = latestResolution?.resolution === "resolved" ? latestResolution.at : latestPromise?.at;
  const invoiceIds = invoices.map(invoice => invoice.id).sort();
  const cycle = JSON.stringify([invoiceIds, restartDate ?? "initial"]);
  const dueDay = Math.min(...invoices.map(invoice => calendarDay(invoice.dueDate)));
  const stage = today > dueDay ? "overdue" : "coming-due";
  if (!previous || previous.cycle !== cycle || previous.stage !== stage) {
    client.automaticFollowup = {
      cycle, startedOn: date, stage, invoiceIds, completed: [], status: "scheduled", reason: "Waiting for the next scheduled step.",
    };
  }
  const plan = client.automaticFollowup!;
  if (plan.finishedOn) return;
  const hold = (reason: string) => Object.assign(plan, {status: "held", reason});
  if (client.reconciliationRequired || balance.pendingMinor > 0) return void hold("Payment needs verification or a check is awaiting clearance.");
  if (client.hold !== "none" || hasUnreviewedReply(client) || relationshipConcernOpen(client)) return void hold("Owner review required. Routine contact is paused.");
  if (easternDate(new Date(client.nextActionAt)) > date) return void hold("Waiting until the agreed review date.");
  if (client.emailFollowupEnabled === false) return void hold("Email reminders are off for this customer.");
  if (!client.verifiedContact || client.contactPermission?.emailAllowed === false) return void hold("Review the billing contact and email permission.");
  if (stage === "overdue" && invoices.some(invoice => calendarDay(invoice.dueDate) >= today)) return void hold("Review mixed due dates before combining overdue invoices.");
  if (plan.status === "owner-review") return;

  const callAllowed = customerAllowsAiCalls(client) && client.contactPermission?.voiceAllowed === true && /^\+[1-9]\d{6,14}$/.test(client.contactPermission.phone);
  let key: string;
  let channel: "email" | "call" = "email";
  if (stage === "coming-due") {
    key = today === dueDay ? "due" : "before";
    if (today !== dueDay && today !== dueDay - policy.beforeDays) return void hold("Waiting for the courtesy reminder date. Missed reminders are not caught up.");
  } else {
    const first = plan.completed.find(step => step.key === "first");
    const second = plan.completed.find(step => step.key === "second");
    const call = plan.completed.find(step => step.key === "call");
    if (!first) key = "first";
    else if (!second) {
      if (today - calendarDay(first.on) < 7) return void hold("Next reminder is seven days after the first email.");
      key = "second";
    } else if (callAllowed && !call) {
      if (today - calendarDay(second.on) < 7) return void hold("Next permitted call is seven days after the second email.");
      key = "call";
      channel = "call";
    } else {
      plan.status = "owner-review";
      plan.finishedOn = date;
      plan.reason = "Sequence finished. Balance remains unpaid. Owner decision needed.";
      return;
    }
  }
  if (plan.completed.some(step => step.key === key)) return;
  const allContacts = [...(previous?.completed ?? []), ...plan.completed];
  const contactDays = allContacts.map(step => calendarDay(step.on));
  if (client.lastContactAt) contactDays.push(calendarDay(easternDate(new Date(client.lastContactAt))));
  const latest = contactDays.sort((a, b) => b - a)[0];
  if (latest !== undefined && today - latest < 7) return void hold("Recent contact. Wait at least seven days before another reminder.");
  if (controls.emailPaused || (channel === "call" && controls.voicePaused)) return void hold("Follow-up is paused in Settings.");
  const links = invoices.flatMap(invoice => invoice.evidence?.paymentUrl ? [invoice.evidence.paymentUrl] : []);
  const amount = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(balance.remainingMinor / 100);
  const text = channel === "call" ? `AI call rehearsal for ${client.name}. Balance ${amount}.` :
    `Hello ${client.name},\n\n${policy.businessName} is following up on ${invoices.map(invoice => "#" + invoice.number).join(", ")}, totaling ${amount}. ${stage === "coming-due" ? "Your payment is due on " + invoices[0].dueDate + "." : "Please let us know if payment is on its way or you need help with the invoice."}\n\n${links.map(link => "View and pay invoice: " + link).join("\n")}\n\nThank you,\n${policy.businessName}`;
  plan.completed.push({key, on: date, channel, text});
  plan.status = stage === "overdue" && (key === "call" || (key === "second" && !callAllowed)) ? "owner-review" : "scheduled";
  if (plan.status === "owner-review") plan.finishedOn = date;
  plan.reason = plan.status === "owner-review" ? "Sequence finished. Balance remains unpaid. Owner decision needed." : "Waiting for the next scheduled step.";
}
