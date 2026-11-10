# Minarva Biz SaaS commercial release — owner checklist (2026-11-10)

## Verified cloud routing
Cloudflare account Workers subdomain \`anilalbert7\`, script \`minarvabiz-customer-web-preview\`. Cloudflare custom domain mappings (not a substitute for a public-browser HTTP verification):
- Main marketing / platform: https://minarvabiz.com
- Alternate: https://www.minarvabiz.com
- Workers dev hostname: https://minarvabiz-customer-web-preview.anilalbert7.workers.dev
- Annual plans: https://minarvabiz.com/pricing
- Partner programme: https://minarvabiz.com/partners
- Signup / 30-day trial: https://minarvabiz.com/register
- Existing tenant admin subscription: https://minarvabiz.com/billing
- Razorpay server-only order API: https://minarvabiz.com/api/billing/checkout
- Razorpay webhook: https://minarvabiz.com/api/billing/razorpay/webhook
- Supabase project: https://supabase.com/dashboard/project/wmjgefbaliuwmaxyzxkq

## Annual commercial terms
Four official pre-GST annual prices:
- Base ₹2,299 — Billing, Stock, Accounts
- Growth ₹4,499 — CRM, Staff, Services
- Website ₹6,699 — Website, Marketing
- Full E-Commerce ₹8,899 — Website, Marketing, E-Commerce

Server checkout calculates exact 18% GST above these prices. No browser-calculated payment amount is trusted. Partner first eligible paid conversion commission is exactly 10% of pre-GST paid annual price, not tax. Sandbox proofs are \`sandbox_not_payable\`; only live confirmed receipts become \`earned_unpaid\`. There is no automatic partner payout or refund/chargeback netting pipeline yet. Live merchant activation requires finance/legal review of refund and tax invoice policy.

## Secrets required before any real-money checkout
Set as **server/Worker secrets**, never \`NEXT_PUBLIC_*\`:
1. \`SUPABASE_SERVICE_ROLE_KEY\` — project server-only key, required for trusted payment commit.
2. \`RAZORPAY_KEY_ID\` and \`RAZORPAY_KEY_SECRET\` — matching Razorpay merchant keys.
3. \`RAZORPAY_WEBHOOK_SECRET\` — separate secret chosen in the Razorpay webhook configuration.

Set \`RAZORPAY_ENVIRONMENT=sandbox\` for sandbox and use \`rzp_test_*\` keys. After independent QA passes, use \`RAZORPAY_ENVIRONMENT=live\` with \`rzp_live_*\` keys and **explicitly** enable \`MINARVA_LIVE_BILLING_ENABLED=true\`. Without these settings all payment routes fail closed (503), no fake payment success.

Existing public Supabase settings: \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\` (publishable only). Test the dashboard grants; never expose service role via client code, logs or embedded HTML.

Register the exact webhook URL above in Razorpay Dashboard and subscribe to **payment.captured**. Raw request bytes, \`X-Razorpay-Signature\`, \`x-razorpay-event-id\` and durable unique payment IDs are required. Browser "payment success" does **not** authorize subscriptions; only committed signed provider webhook receipts do.

## Release acceptance gates not yet proved
- **M24 / #774:** Real, separately authenticated Tenant A and Tenant B JWTs plus one cashier/staff JWT, actual negative cross-tenant HTTP/API tests (not SQL \`SET ROLE\` simulation). Prepare the secrets for \`scripts/saas-two-tenant-signed-jwt-proof.mjs\`: \`MINARVA_QA_SUPABASE_URL\`, \`MINARVA_QA_PUBLISHABLE_KEY\`, \`MINARVA_QA_TENANT_A_JWT\`, \`MINARVA_QA_TENANT_B_JWT\`, \`MINARVA_QA_TENANT_A_ORG\`, \`MINARVA_QA_TENANT_B_ORG\`, \`MINARVA_QA_STAFF_JWT\`. Use short-lived tokens only in secrets manager; rotate/revoke after test.
- **Supabase security advisors:** 17 existing anonymously executable SECURITY DEFINER RPCs, 55 authenticated definer warnings and leaked-password protection need independent triage. Existing Cloudflare edge-secret-gated endpoints must not be blindly revoked because offline licensing depends on them.
- **M25:** The SQL \`BEGIN...ROLLBACK\` rehearsal covers all ten checkpoints but is a *synthetic server-side proxy*. It does **not** create a fresh real-user signup, actual printer/phone output, redeemed coupon discount on an invoice, real courier fulfillment, audited GST subscription invoice, live payment, or independent browser end-to-end closing.
- Browser M25 must test real signup/email verification, 30-day clock, PO/GRN, Boutique SKU variants, POS/print PDF, Laundry stage to delivered, reserved order to unpaid invoice to delivered, actual promo redemption and invoice math, Field Service consent/signed evidence, balanced daybook and backup preflight.
- No production release or real-money activation until owner authorizes after these blockers, even if all GitHub CI checks pass. Source CI and Cloudflare native build alone do not imply whole-product production readiness.
