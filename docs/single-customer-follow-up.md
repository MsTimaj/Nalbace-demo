# Customer follow-up workflows

This is the current source of truth for reminder timing, customer calling preferences and dispute outcomes. Updated November 12, 2026.

## Implemented local automatic simulation

In Settings, the owner saves one **Automatic reminder policy**, a business name, a courtesy interval of seven or fourteen days, and optionally a forward-only demo date. Enabling it runs date checks across sample customers without per-invoice approval. The open workspace checks every fifteen seconds. The store applies each step atomically and records the result once. Closing the workspace stops these checks.

Sample emails and calls are simulated. The scheduler excludes PayPal-connected cases and cannot invoke an email, AI or phone provider. Live test dispatch retains its existing disabled defaults, spending limits, exact test destinations and separate approvals.

## Customer account settings

Each customer’s Details has two switches that save immediately and apply across every invoice.

- Email reminders defaults to on. The owner turns it off for a customer who should not receive routine invoice reminders.
- AI phone calls defaults to off, including older customer records without an explicit owner preference. A recorded calling agreement is required to turn it on. Without one, the switch stays off and unavailable. A valid phone and service limits are also checked before calling.

The owner no longer sees the billing-verification checkbox or the controlled-test evidence questionnaire in Details. Existing controlled contact evidence remains available in the local operator setup, outside the owner’s day-to-day screen. Switching preferences does not invent customer consent, replace an existing agreement or clear a dispute/stop. No consent-request email is sent automatically.

There is no call checkbox on the workflow page. Multiple overdue invoices are grouped into one customer sequence, with at most one simulated call. Turning calls on after an email-only sequence has already ended does not extend or restart that sequence.

## Three purposes

| Purpose | Timing | What happens next |
| --- | --- | --- |
| Coming due | Courtesy email exactly seven or fourteen calendar days before the due date, then on the due date if unpaid. | Verified settlement ends payment follow-up. Overdue invoices enter the overdue sequence automatically. |
| Overdue | First email when eligible, second at least seven days later, then one eligible call at least seven days after that. | End the sequence after the last eligible step and surface an owner decision if still unpaid. |
| Disputed | Hold routine email and AI calls. | Save the review and one specific next action. |

The scheduler never catches up missed courtesy dates, sends two steps together, or ignores recent contact. It uses Eastern calendar dates. Mixed upcoming and overdue invoices are held for review before combining them into overdue contact. The current cycle uses the earliest outstanding due date. Sample data has no real payment destination.

Generated reminder text includes the customer name, invoice references, current amount, business identity and matching PayPal-hosted invoice links when normalized evidence contains them. New controlled test email drafts also include matching links. Existing approved message text remains bound to its earlier approval.

## Stops and owner attention

Before every sample step, check receipts, outstanding amount, customer permission, case holds, unread replies, relationship concerns, promised review dates, the customer calling setting and workspace pause settings. A cleared payment settles the sequence. A pending check, payment claim, reply, dispute, stop or open relationship concern holds it.

Routine scheduled accounts do not require individual approval. Today surfaces disputes, severe aging under the owner’s threshold, unreviewed replies, other payment exceptions and completed unpaid sequences. The owner can find scheduled accounts under **No action due**.

## Dispute next actions

**Keep dispute open** offers check invoice/service records, ask the customer for details, correct the invoice in PayPal, or review on a date. Store the selected action and date. The dispute stays urgent and automated pursuit remains held. The header phone shortcut remains available for appropriate manual conversations unless contact is stopped.

**Resolve dispute** offers verify reported payment, record an agreed payment date, or return to routine follow-up. A supporting reference and current payment evidence are required. Payment claims do not change balances. When the automatic sample policy is enabled, a verified settled sample account closes payment follow-up. A payment promise waits until its date before re-entry. A resolved unpaid account selected for routine follow-up enters a fresh cycle subject to contact spacing and all other holds. A stop request cannot be cleared through dispute resolution.

## Evidence and limits

Tests cover exact courtesy dates, fourteen-day configuration, no catch-up, duplicate checks, email-only customers, permission-required calls, one call across multiple invoices, pauses, replies, disputes, settlement, end-of-sequence handoff, queue placement and promised-date re-entry. No new live email, call, paid model request or production activation occurred.

The actual paid provider workflow still requires integration with the live scheduler, authenticated inbound monitoring, production authorization and hosted access controls. The local date-driven simulation is available for the demo.

## Sources

- [QuickBooks reminder timing](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/send-invoice-reminders-automatically-manually/L84cQjpxo_US_en_US)
- [Xero reminder configuration and online invoice links](https://central.xero.com/0/article/Set-up-invoice-reminders)
- [Chaser spaced reminder guidance](https://www.chaserhq.com/blog/whats-the-best-way-to-ask-customers-for-payments)
- [Chaser dispute suppression](https://help.chaserhq.com/configuring-advanced-chase-criteria)
- [HubSpot customer activity timelines](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline)

The selected schedule is a product default informed by those sources. Businesses can choose seven or fourteen days before due, and the demo uses conservative seven-day spacing afterward.
