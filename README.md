# Nalbace

Keep vital relationships on course. A phone-first local prototype for PayPal invoice follow-up, customer replies and owner review.

## Try the live demo

**[Open Nalbace — no download or account required](https://nalbace-demo.workspace-283029.chatgpt.site)**

Use fictional customers to review a dispute, confirm a sample check and explore email-only or optional-call reminder schedules. Each visitor has a separate browser-local workspace. Reset demo restores the examples. No real email, AI model request, phone call or payment can be made from the public sample. Please do not enter real customer information.

The original local integration build and its setup instructions remain below. The public browser edition is in `public-demo/`; it reuses the interface and deterministic workflow rules with a browser-local simulation adapter. Recorded provider tests are separate from this simulation.

## Download and run

**[Download Nalbace as a ZIP](https://github.com/MsTimaj/Nalbace-demo/archive/refs/heads/main.zip)** · **[Watch the demo video](https://youtu.be/2YvKdX9y88A)**

This release runs on your computer. A no-install browser demo is linked above. The included sample customers need no provider account, API key or payment.

1. Install **Node.js 22.14 or newer**, including npm, from [nodejs.org](https://nodejs.org/en/download).
2. Click **Download Nalbace as a ZIP** above (or GitHub's green **Code → Download ZIP**).
3. Extract the ZIP. Open the extracted `Nalbace-demo-main` folder, then its **app** folder.
4. Open a terminal inside that **app** folder. On Windows, right-click an empty area in that folder and choose **Open in Terminal**.
5. Run these commands, one at a time:

```sh
npm ci
npm run dev
```

6. Wait for the server to report that it is ready, then open **http://127.0.0.1:3000/** in your browser.
7. Leave the terminal running while using the app. Press **Ctrl+C** in the terminal to stop it when finished.

Keep this build on your computer; it does not provide hosted authentication or tenant separation. Sample changes are saved locally and are not shared with other visitors.

### Optional developer checks

From the same **app** folder:

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
