# Nalbace — judge walkthrough

Updated November 10, 2026. This guide distinguishes the clean source demo from the development workspace’s verified integration history.

## Start locally

Use Node.js 24. From the repository root:

```sh
cd app
npm ci
npm run dev
```

Open http://127.0.0.1:3000/. Synthetic records need no credentials. Keep the server local: hosted owner authentication and tenant isolation are not implemented. No paid requests, email or calls are enabled by a clean installation. Do not copy the developer’s private environment or databases into a submission.

## Review the sample workflow

1. The light Nalbace splash plays briefly, with Skip intro, then opens Today automatically. It appears once per tab session. Reduced-motion users go directly to the workspace. Brand-film playback is separate from customer Settings.
2. Today separates Urgent owner attention, Review today and No action due. The summary counts accounts once; it does not add drafts and decisions as if they were separate customers. Each row explains why it needs attention.
3. Birch Studio: review outstanding invoices and combined balance. A proposal or local approval is not an externally sent message. AI is disabled by default.
4. Elm Consulting: a recorded check pauses pursuit until owner-confirmed clearance. This is not bank verification.
5. Customer tabs separate Overview, Messages, History and Details. Read customer message opens the source text directly. Record your decision previews the consequence; it never automatically sends or calls.
6. Settings → Account priorities: the owner can choose an overdue-day threshold. The 90-day starting point is a demo choice, not a universal standard. Open disputes and owner-recorded relationship concerns remain urgent even with no balance due. Calendar calculations currently use Eastern Time.
7. Activity separates current issues from confirmed payment evidence and historical events. Unreviewed reply items open Messages directly. Connections describes only configured PayPal sandbox reads; public merchant onboarding is not implemented.

Fixture dates are generated when the database is first created. Existing saved workspaces may differ. Do not delete the development database to reset a recording. Fresh source does not include private test cases or their messages.

## Verified integrations in the private development workspace

- PayPal: synthetic invoice NAL-EMAIL-20261110 was paid for $25 by the test buyer. A fresh provider read returned PAID and zero due; follow-up was blocked. Refresh is explicit; signed payment callbacks remain pending.
- Email: one separately approved app-dispatched SES test was accepted. Authenticated Gmail metadata verified the exact received copy and unique Reply-To route. Fatima’s actual role-play reply was matched, saved and displayed, with follow-up held. This is deliberate bounded polling of the selected reminder, not continuous monitoring. An older, separate app send remains unknown; it was not reset or silently retried.
- Voice: one app-connected second bounded Retell call produced a dispute excerpt and owner-review handoff without changing money. The first call failed prematurely. The earlier phone allowances were exhausted; one separately approved November 12 recording call also completed with a dispute handoff. Asking for a richer dispute reason was improved afterward but was exercised in the November 12 bounded recording call.
- AI: the structured Claude adapter exists. Earlier live evaluations produced four rejected outputs and one usable suggestion. The latest reply interpretation and paid-but-unhappy handling are offline-tested; a useful fresh live interpretation is still pending separately capped approval. Do not portray the new interpretation as already demonstrated.

No payment-confirmation email is implemented. Production merchant onboarding, continuous inbound handling, signed callbacks, hosted authentication/tenant isolation and production eligibility remain incomplete. The live tests used synthetic records and the owner’s explicitly approved test destinations.

## Relationship-health evidence

Automated tests prove that a fully paid account can remain urgent for an open dispute or owner-recorded relationship concern, and that an exact-quote AI suggestion can flag a possible concern for human review without changing the balance. A polite late reply is not automatically an unhappy relationship. Quoted reminder text is excluded from the AI interpretation context. These are bounded offline checks, not an emotion detector or independent customer validation.

## Recording plan — target 2 minutes 40 seconds

- 0:00–0:15: Light brand animation, then problem: busy owners need customer concerns surfaced alongside payment follow-up.
- 0:15–0:40: Today priority queue, one account count, urgent issue first, explainable reason and normal balance color.
- 0:40–1:10: Open the real saved role-play reply from Messages. Show exact words and the owner decision choices. Explain that AI can suggest; the owner judges the relationship and decides the next step. Do not record a new paid AI request without a fresh allowance.
- 1:10–1:35: Show the already verified phone dispute handoff and saved history. Clearly label it as a prior consented test, not a new call happening during the recording.
- 1:35–2:00: Show saved PayPal PAID/zero evidence and stopped follow-up. Explain that payment settlement and relationship resolution are separate.
- 2:00–2:25: Settings priority threshold, service toggles, and contact/usage safeguards. Do not expose operator credentials, private phone, personal inbox or unrelated tabs.
- 2:25–2:40: State present limitations plainly and close with the benefit: clearer follow-up, more room for care.

Use public or synthetic-safe footage. A local recording is not yet an uploaded public YouTube submission. Keep the final film below three minutes and check the official submission requirements again before submitting.

## Automated checks and packaging

Run npm test, npm run typecheck and npm run build from app/. Provider defaults must remain disabled/zero. The final source test count and build result are recorded in the running checklist. The final source-only installation rehearsal in tmp/judge-final-20261110/app passed fresh installation, all 190 tests, TypeScript and production build. Its isolated production server returned 200 for the app and brand-film page, disabled AI/email readiness and 404 for an unknown Host. The server was stopped. No private environment or development database was copied. This rehearsal does not publish the source or decide the license. The final published commit still needs its own installation check.
