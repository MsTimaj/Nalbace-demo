import type {ClientCase} from "../domain/cases.ts";
import {emailDisplay} from "../domain/email-display.ts";
import {financials, remainingInvoices} from "../domain/case-rules.ts";

export default function FollowupPlanPreview({client}: {client: ClientCase}) {
  const latestReply = client.pastedReplies?.at(-1);
  const latestUpdate = client.customerUpdates?.at(-1);
  const {pendingMinor} = financials(client);
  const unpaid = remainingInvoices(client);
  const hasCallPermission = client.contactPermission?.voiceAllowed === true;

  return <section className="card">
    <h2>Review before approving</h2>
    <dl>
      <div><dt>Unpaid invoices</dt><dd>{unpaid.map(invoice => `#${invoice.number}`).join(", ")}</dd></div>
      <div><dt>Payment evidence</dt><dd>{client.source === "fixture" ? "Sample invoices" : `PayPal checked ${new Date(client.evidenceAt).toLocaleString()}`}</dd></div>
      <div><dt>Pending check</dt><dd>{pendingMinor > 0 ? "Awaiting clearance" : "None recorded"}</dd></div>
    </dl>
    {latestReply && <><h3>Latest customer reply</h3><p>{emailDisplay(latestReply.text).message}</p></>}
    {latestUpdate && <><h3>Latest owner note</h3><p>{latestUpdate.note}</p></>}
    {!latestReply && !latestUpdate && <p className="hint">No customer replies or owner updates saved.</p>}
    <p className="hint">Expecting a check or aware of a dispute? Return to Client review to record it before approving.</p>
    {client.source !== "fixture" && <><h3>Follow-up sequence</h3>
    <ol>
      <li>Review and approve the email below. Before sending, Nalbace rechecks the balance and contact permission.</li>
      <li>{hasCallPermission ? "A call may be reviewed separately after at least seven days if the invoice is still overdue and the customer has not replied." : "Email only. Calling permission is not recorded for this customer."}</li>
    </ol></>}
  </section>;
}
