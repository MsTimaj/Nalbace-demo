# Nalbace - local build

Local sample workspace with a separate **read-only PayPal sandbox evidence panel**. This is not a production deployment.

## Automatic sample follow-up

Set the business-wide reminder policy once in Settings. It checks sample customers by Eastern calendar date while the workspace is open, with an optional forward-only demo date. The customer’s **AI calls for this customer** setting controls all their invoices. Calling also requires recorded permission. Simulated contacts and end-of-sequence outcomes appear on Overview and in Messages.

The scheduler processes sample records only and cannot contact a real customer. PayPal-connected controlled tests retain their separate sending, calling, spending and approval gates. See docs/single-customer-follow-up.md in the project workspace for the current policy and evidence.

## Run

Requires Node.js 22.14 or later; Node.js 24 is recommended. SQLite is experimental in the supported Node runtime and is used only for this local synthetic milestone. From this directory:

```text
npm install
npm run dev
```

Open http://127.0.0.1:3000. The server binds to loopback. Do not expose it to a network or use real customer records; hosted authentication/tenant isolation are not integrated.

```text
npm test
npm run typecheck
npm run build
```

## Implemented

- The visible app refreshes saved workspace changes every five seconds and when returning to the tab. This is local saved-state synchronization, not automatic PayPal payment detection. Use Refresh PayPal evidence to update provider facts; payment webhooks remain pending. Reads cannot overwrite newer owner actions, and a changed case invalidates the displayed draft. The paid sandbox test case has a visible confirmation on Today.

- Mobile-first Today, client review, receipt allocation, exact-message review, local approval, pause, history and connection status.
- Synthetic recurring invoices, a pending check and a waiting account, saved in `.data/local-demo.sqlite` on this computer. This temporary repository keeps application state independent of future model providers; managed Postgres/Auth remain planned.
- Server-side financial/approval gates: exact cents, explicit receipt allocation, pending-check holds, owner/merchant matching in the gate, changed-case/draft invalidation, receipt retry keys, expiry and blocked external dispatch.
- Connections can deliberately refresh the first 20 PayPal sandbox invoices and reread individual invoice evidence. The server uses a fixed sandbox host, fresh token permissions, timeouts, blocked redirects and sanitized errors. Credentials and raw provider responses are never returned to the browser. Unknown/unsupported balances stay unknown; external payment records stay distinct from PayPal-reported payments. Sandbox evidence is separate from sample cases and does not authorize contact.
- Selected sandbox invoices can be explicitly linked to a separate test client in Today. Case refresh reads the exact linked invoice set, invalidates approvals and rejects stale concurrent results. App changes cannot silently switch a case to another configured sandbox app. Missing/failed/stale evidence blocks draft preparation and approval.
- Changed PayPal balances with unmatched cash/check receipts require owner reconciliation. Cleared receipts can be explicitly matched to exact external payment records; a payment cannot be matched twice, and matched amounts are not subtracted again. Missing stable payment IDs or incomplete evidence remain on hold. Receipt correction now preserves voided originals and holds pursuit; exact provider-match corrections require fresh evidence and explicit review. Refund/reversal workflows remain incomplete.
- Owner-recorded customer updates handle payment claims, confirmed promises, disputes and stop requests in the same case history. Claims never change balances; promises wait; disputes and stops hold ordinary pursuit. These manual notes do not simulate receiving provider messages.

## Not connected

AI drafting and owner-pasted reply interpretation are implemented behind an off-by-default server switch plus saved workspace controls. Drafting chooses an approach; the application assembles message facts. Reply interpretation proposes a tentative intent, an exact supporting quote and an owner-facing question; it never changes money, dates, permissions or holds. Five previously authorized live evaluation calls were used (one usable, four rejected); fixes and the new reply path have only synthetic verification. No further live evaluation is enabled.

Keep `NALBACE_AI_ENABLED=false` and `NALBACE_AI_MAX_REQUESTS=0` until a new explicit allowance and model/price check. Connections controls default to paused/zero and cannot activate server usage. The lower lifetime 0-20 request cap applies, failures count, only one request can be pending in the workspace, and one request per client per 24 hours is allowed. No automatic retries, reset, paid fallback or monthly renewal. Context is bounded, output at most 600 tokens, timeout 20 seconds. Request counts are not a production dollar ceiling.

Contact permissions are owner-recorded reviews, not proof of identity or authentication. Saving a pasted reply immediately holds pursuit even if AI is unavailable. Original text and any AI suggestion stay separate; manual customer updates remain available without AI. Local sample contacts remain synthetic.

A controlled Resend email dispatcher is implemented and **disabled**. `.env.example` lists the optional settings; no sender/key/test allowance has been configured. It requires fresh unchanged bound PayPal evidence, exact owner approval, verified billing contact/email permission, one exact configured test recipient and an atomic lifetime allowance of 1-3 attempts. The lower allowance includes unknown outcomes. Every attempt uses a durable key and exact stored message. No automatic resend; provider acceptance is not confirmed delivery. A separate send button appears only if configured and the visible message still matches its approval. This is not production delivery or validated real email integration.

Hosted owner authentication/Postgres, signed delivery and PayPal callbacks, real inbound email/reply correlation and voice remain pending. No paid service was activated, no additional AI request was made and no real message/call was sent in this continuation. Use synthetic records and this computer only.

The one demo owner is selected on the server. This is not an authentication system. The pure gate checks trusted input snapshots, not proof that a browser caller is an owner. Real authentication, row policies, deployed durable workers/data, verified callbacks and provider permissions must be integrated before expanding access. The current email attempt ledger is a controlled local test path, not a multi-tenant production outbox.

The seven-day routine-contact interval is an intentionally conservative sample policy, not a legal limit or validated production cadence. Dates are generated when the fixture database is first created; the workspace does not reset itself or refresh fixture evidence.

## PayPal setup

Use the PayPal Developer Dashboard with **Sandbox**, not Live. A business test account acts as merchant; a separate personal test account acts as buyer. Use the existing defaults if present. Create/select an app named Nalbace tied to the sandbox business account. Keep account passwords and app credentials out of chat, source control, screenshots and the browser bundle.

The ignored `.env.local` file holds sandbox client credentials using the names in `.env.example`. Enable Invoicing in the Nalbace sandbox app. In Connections, choose **Refresh sandbox invoices** to make an explicit read request. Calls do not run automatically. Do not use live credentials.

October 24 verification: sandbox authorization, invoice listing and individual detail reads succeeded against the configured account. One synthetic $25 invoice (`NAL-READ-20261024`) was created for the integration check, then made payable for the supplied Personal sandbox buyer with buyer/merchant email notifications disabled. Fatima then paid it using the Personal sandbox buyer. A fresh application read verified `PAID`, zero due and a PayPal-reported $25 payment; a new follow-up draft was blocked. The app itself exposes only reads. Production settlement and payment callbacks have not been tested. The test invoice reference is saved in ignored `.data/sandbox-read-check.json`.

## Verification limits

Automated domain, persistence and adapter tests cover the first safety slice. Browser-control access is disabled in the current Work settings, so interactive browser/layout/accessibility verification has not been completed. A successful build and HTTP response are not a full usability or security audit.

The authoritative build plan and PDF are in the parent project's `docs/` and `output/pdf/` directories.


## Customer settings and local test administration

Customer Connections now concerns invoice access. Settings presents AI assistance, email reminders, optional phone follow-up and plan status as Nalbace-managed services, with accurate unavailable/paused labels. No paid plan, automated inbox intake or real phone call is implied. The owner AI preference changes only pause state; it preserves the server/workspace request ceiling and consumed usage.

Developer-only setup is at http://127.0.0.1:3000/operator. It holds provider metadata, one-time AI test allowance, pending-request resolution and the optional Gmail test adapter. Gmail callbacks return there. The page does not expose secret values, and it has the existing exact local Host checks. This is a presentation separation, not role-based authorization: there is no separate administrator login or hosted access control. Keep the app local and synthetic. A future hosted release requires authenticated owner/operator authorization on pages AND APIs.

The normal owner screens do not link to the local administration page. Credentials remain in ignored local configuration; no vendor signup or activation is required by this screen change. Hosted production budget enforcement remains pending; the local monthly ledger below supplements the unchanged one-time test limits.

The approved brand assets use the silver-edged mark in headers and silver-bordered tile in browser/phone shortcut metadata. `/design-review` shows the approved treatment. Current exports and usage notes are in `../brand/nalbace/selected` and `../brand/nalbace/README.md`; the package is `../brand/nalbace/nalbace-brand-suite.zip`. The next-session handoff is `../docs/next-session-handoff-2026-10-26.md`. Account setup is deferred; no service is activated by these brand changes.


## Monthly spending ledger and normalized reply intake

`src/server/spending.ts` adds `.data/spending.sqlite`, separate from invoice money. Monetary values are integer micro USD. AI generation and email dispatch now also require an enabled, unexpired pinned rate card, a positive per-action ceiling, a deployment-wide monthly ceiling, a per-business monthly ceiling and the relevant service units. All defaults remain disabled/zero in `.env.example`; no `.env.local` activation was made. Existing lifetime request/attempt controls still apply.

Reservations are atomic across processes sharing the same SQLite file. UTC month rollover does not delete history: unresolved costs/units carry forward, verified completed charges stay in their original period. Successful provider returns conservatively retain the full ceiling until trusted operator billing reconciliation; failed/unknown requests never automatically refund it. Units are not refunded by cost reconciliation. An over-ceiling billing report latches an incident that blocks all new spending. Reconciliation is an internal server operation with no browser endpoint; validating billing evidence is an operator responsibility. Fixed vendor subscriptions, hosting, salaries and taxes are not automatically accounted for by this variable-action ledger. Independent hosted instances would require a shared transactional budget service/database.

`/api/spending` is a local-only readout used on `/operator`; it cannot set budgets. Real phone transport does not exist, so voice-second reservations are infrastructure only, not live hangup enforcement. Actual rate ceilings must cover the selected provider's maximum possible bill; the ledger cannot force an outside vendor to honor an arbitrary number.

`src/server/inbound-replies.ts` defines the authentication/normalization boundary and passes verified envelopes into transactional reply correlation. It matches the delivery provider/account binding, outbound provider ID and expected sender, deduplicates events, holds follow-up and invalidates approvals without modifying payment facts. Unmatched events are flagged for local operator review. This has synthetic tests, not a connected inbox: a concrete provider verifier/threading adapter and a receiving endpoint remain pending. Sender text matching is not independent identity verification. No public callback was exposed by this change.

## SES controlled sandbox adapter — November 10
The SES v2 adapter is coded and offline-tested, but disabled/unconfigured. Use the dedicated NALBACE_SES credential fields in .env.example, never root keys. It fixes the endpoint to Ohio, disables SDK retries, and reuses approval, fresh PayPal evidence, self-test permission, durable attempt and monthly spending gates. SES has no SendEmail idempotency token; unknown outcomes block resending. No real SES message or signed callback/inbound mailbox integration has been tested. See ../docs/ses-connection-check-2026-11-10.md for access proposal and validation limits.

## November 10 verification update — supersedes older status above

A second synthetic $25 PayPal payment was verified through a fresh application read: PAID, zero due, no reminder needed. Selected 320px/390px screens were reviewed; this was not a comprehensive accessibility audit.

The private development environment has restricted SES credentials. A separately authorized corrected-configuration diagnostic was accepted and the owner confirmed inbox receipt. The earlier app attempt remains unknown. Normal sending/spending remain disabled with zero attempt allowance. No payment confirmation email or live inbox integration is implemented. Earlier statements that no SES email had been tested are historical.

See [the judge walkthrough](../docs/judge-walkthrough.md) for credential-free review. Fresh checkouts contain no private integration history or credentials.

## November 10 voice-context review
The collapsed Phone follow-up section can prepare a saved local fact review only for an eligible linked sandbox case with fresh matching invoice evidence and structured self-test voice permission. Paid cases show no call needed. Saved snapshots are fingerprinted and expire with the evidence. No call approval, spending reservation, Retell dispatch or authenticated outcome pipeline is connected by this feature. The separate status/stop adapter remains offline-tested infrastructure; the local UI cannot place a call. 127 tests and optimized production build/TypeScript passed at this checkpoint.

## November 10 voice dispatch foundation
Internal voice delivery now rereads bound PayPal invoice facts, checks exact purpose/profile/test recipient and configuration stability, reserves monthly money and 60 seconds, then reserves one attempt before a single fixed-host Retell request. Unknown outcomes retain liability and hold pursuit with no retry. The actual local flags remain disabled/not-ready/zero, and no browser dispatch endpoint exists. The saved Retell draft now references the minimal app-facts variable; it is unpublished and has not had a new grounded live evaluation. A one-step monitor uses provider reads/stop calls but is not a supervised independent watchdog or automatic PayPal poller. Signature-verified callbacks, publication/agent verification and actual outbound call remain pending. 144 offline tests plus optimized build/TypeScript pass; no new paid request or call occurred during this work.

### November 10 bounded voice monitor entry point
148 offline tests and production build pass. `scripts/voice-watchdog.ts` supervises an existing accepted attempt in a separate process with finite polling; it cannot dispatch a call. It is not yet launched/leased before dispatch or live validated. Voice integration remains disabled. Retell rental number created but the $2 invoice payment failed and service is deactivated; no call made. See submission-running-checklist for exact evidence and remaining gates.

### November 10 exact-agent guard and isolated setup
151 offline tests and production build/TypeScript pass. Voice dispatch now authenticates readback of the exact pinned published agent and response-engine configuration before reserving a call. Drift in prompt, greeting, general tools, states, knowledge bases, voice or duration blocks dispatch. No call/activation performed. A separate source-only install with no credentials or prior databases passed npm ci, tests, build and synthetic HTTP startup; final public-commit rehearsal remains pending.

### November 10 connected controlled-phone path
158 offline tests and production build/TypeScript pass. Private loopback phone/consent setup, separate synthetic invoice case, purpose approval and call action are wired. Dispatch needs a fresh independent supervisor lease; separate worker samples payment state, checks stops and pulls bound ended-call outcomes. Exact published provider version0 preflight passed, selected rate-profile model pinned. Actual private recipient is still missing and voice flags remain disabled/zero. No phone call or live end-to-end supervision verified yet. No public webhook or authentication/tenant isolation is claimed. See master checklist for evidence and limitations.

### November 10 first phone attempt and freshness correction
First app-connected approved call accepted, monitored and ended, but failed owner rehearsal because stop control fired too early (24.985 seconds). Active PayPal freshness was not renewed by unchanged checks. Corrected with exact-call/case/provider-bound active-check timestamp; regression preserves the 60-second duration stop. 159 tests and production build/TypeScript pass. No successful conversation or fixed live retest claimed. Single attempt consumed, follow-up held, voice and spending disabled; no automatic retry. Save form now provides persistent confirmation and clear continuation.

### November 10 second controlled phone test
Explicitly approved one-use retest grant preserved first attempt/history and blocked stop/dispute/payment-claim overrides. 161 tests and production build/TypeScript pass. Second app-connected phone call ended by agent hangup after28.719seconds; bound authenticated transcript pull saved dispute hold without changing the $25 synthetic balance. One owner-controlled live handoff verified. No third call authorized; voice and spending disabled afterward. Full email/reply/rehearsal and production authentication/readiness remain unfinished.

### November10 owner review and editable client details
170 tests pass. Added guarded dispute resolution (owner note/reference, fresh evidence, pause retained), device tel: calling independent of AI, and visible contact editing. Contact changes revoke changed-channel permission and require verification; financial evidence/stops/disputes stay intact. Final client header keeps name/email in reading order and number-left/Call-right; fresh browser console clean after unique-key fix. New dispute-reason voice prompt is provider-draft only, calls off, not live tested. Existing-call excerpts are labelled transcribed evidence for review. No new call or email was sent.


## Controlled reply inbox (separate read-only adapter)

SES remains the sender. A separate Google OAuth web-server client can authorize the Nalbace Gmail reply mailbox; it is not a customer requirement and does not reuse ChatGPT's Gmail connection or the older send-only adapter. Configure `NALBACE_INBOX_CLIENT_ID`, `NALBACE_INBOX_CLIENT_SECRET`, `NALBACE_INBOX_ACCOUNT` and a separate 32-byte base64 `NALBACE_INBOX_STORAGE_KEY` privately. The exact callback is `http://127.0.0.1:3000/api/inbox-connection/callback`. The Google client must be separate from any send-only client. Keep testing mode and authorize only the configured business mailbox.

Google permission is `gmail.readonly` plus identity/email. This grants broader mailbox-read capability than the adapter actually uses; it cannot be represented as permission to one thread only. Public deployment/verification requirements remain unresolved. The implementation performs only a deliberate selected-reminder check, not background synchronization: profile validation, a list capped at five, then bounded plain-text reads. Ten checks per day, one per reminder per minute; 15-second individual reads and a shared 30-second read deadline. No send/delete/mark-read/attachment download, no automatic AI interpretation.

New reminder attempts using a base Gmail Reply-To receive a stable per-attempt plus-address during atomic reservation. Matching requires one accepted reminder, exact reply route and sender header; this does not independently authenticate the human sender or verify payment. A match holds pursuit and invalidates approvals before review. Unknown old sends remain unknown and are not retried or relabelled. Existing paid/disputed cases must not be recycled for another contact test. A fresh explicitly authorized bounded self-test is still required to verify real sending, reply receipt and stopping behavior together.
