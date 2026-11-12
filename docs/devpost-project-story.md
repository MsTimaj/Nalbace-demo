# Nalbace — Devpost project story

## Inspiration

Small business owners need to know when a customer relationship needs attention. An invoice balance alone can’t tell them that. A customer can pay in full and still have an unresolved complaint. Nalbace gives owners one place to review payment evidence and what customers actually said.

## What it does

Nalbace connects PayPal test invoices to a daily review queue. Owners can see why each account needs attention, open the original customer message, and decide what to do next. Disputes and unresolved relationship concerns stay visible even after payment. An owner can set a separate threshold for overdue invoices.

## How we built it

We built a phone-first workspace with Next.js, TypeScript, and SQLite. PayPal Invoicing supplies payment evidence. We tested an approved reminder through Amazon SES, matched the customer’s reply through Gmail, and captured a dispute from a consented Retell test call. The Claude integration can suggest how to interpret a reply and point to an exact quote for owner review. Payment facts and contact permissions are enforced separately from the model’s suggestions.

## What we tested

A synthetic $25 PayPal invoice returned paid with zero due, and the app blocked further reminder preparation. A routed test email reply reached the correct case and held follow-up for owner review. A separate test call preserved the customer’s dispute statement for the owner. The latest reply interpretation behavior was tested offline. The source demo runs locally with synthetic records and external sending disabled by default.
