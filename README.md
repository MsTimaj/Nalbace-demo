# Nalbace

Keep vital relationships on course. A phone-first local prototype for PayPal invoice follow-up, customer replies and owner review.

## Run the working sample

Requires Node.js 22.14 or newer and npm. No provider account or payment is needed for the included synthetic customer workflow.

```sh
cd app
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Keep the server on this computer; this build does not provide hosted authentication or tenant separation.

```sh
npm test
npm run typecheck
npm run build
```

## What to try

- Today prioritizes disputes and relationship concerns separately from routine balances.
- Open Elm Consulting: a clearly marked sample reminder and customer reply explain a $400 check awaiting clearance. Enter a fictional check reference and confirm clearance to settle the sample account.
- Messages preserves conversation text; History records owner actions. Details contains customer-wide email and calling preferences.
- Settings contains the automatic sample reminder policy and overdue priority threshold. Enable the sample policy to simulate date-based follow-up; no external message or call is sent. The visible app checks the sample schedule; this is not a background hosted scheduler.
- Activity shows review items and payment history. Connections supports configured PayPal sandbox invoice reads; public merchant onboarding is not implemented.

See [judge walkthrough](docs/judge-walkthrough.md) and [workflow behavior](docs/single-customer-follow-up.md).

## Integration evidence and limits

Development tests verified PayPal sandbox payment readback, an Amazon SES email received in the authorized test inbox, matched Gmail replies, and a Retell AI call returning a dispute for owner review. Those private test records, inbox grants, numbers, credentials and databases are not distributed. The clean sample contains synthetic records rather than pretending these provider requests happened on the judge's machine.

The Claude adapter is implemented; earlier live evaluation yielded one usable suggestion and four rejected outputs. New reply interpretations are offline-tested. Financial facts and contact gates remain deterministic.

All external providers are disabled by default. Optional configuration is documented in app/.env.example; keep credentials in ignored app/.env.local. Never publish keys. The one-use recording-call control requires a private local approval file and operator script, neither included; it is unavailable in a clean checkout.

This is a functional local prototype, not a production service. Hosted authentication/tenant isolation, public merchant onboarding, continuous scheduling/inbound handling, signed callbacks and production legal/provider eligibility remain unfinished. No native installation package or public hosting is required to run the local sample.
