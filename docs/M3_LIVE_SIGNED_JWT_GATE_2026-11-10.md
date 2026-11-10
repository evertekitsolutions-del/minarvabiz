# M3/M24 — Live signed-JWT cross-tenant audit gate

Status on 2026-11-10: **BLOCKED** (not failed). Live project `wmjgefbaliuwmaxyzxkq` has one Auth principal, one organization, and one organization membership. Therefore it cannot supply A/B independently authenticated organization administrators plus a third independent staff user. Do not substitute service_role, impersonated SQL claims or fabricated JWTs.

## Run when proper isolated QA identities are available

Provision two **non-production-fixture** test organizations using normal Supabase Auth signup/invite flows and three distinct real accounts: Tenant A admin, Tenant B admin, and staff/cashier in either tenant. Do not use real customer data. Securely inject only into a private CI job or local runner:

- `MINARVA_QA_SUPABASE_URL`
- `MINARVA_QA_PUBLISHABLE_KEY`
- `MINARVA_QA_TENANT_A_JWT`
- `MINARVA_QA_TENANT_B_JWT`
- `MINARVA_QA_STAFF_JWT`
- `MINARVA_QA_TENANT_A_ORG`
- `MINARVA_QA_TENANT_B_ORG`

Run `node scripts/saas-two-tenant-signed-jwt-proof.mjs`. The script validates all three sessions with `/auth/v1/user`, proves organization membership via authenticated RPC, runs 3 rounds of bounded concurrent HTTP API reads across sensitive entities (purchase invoices and lines, sales, subscriptions, payment receipts/events, core modules) and validates forbidden staff RPC calls.

A PASS means this tested matrix had no leak for its tested users, routes and time window — **not an absolute guarantee** across every possible module or future change. Repeat on deployment, role changes, schema changes and token refresh. Run browser/PWA cross-device session tests separately; multiple HTTP sessions are not equivalent to physical device testing.

## Verified independent static database checks

2026-11-10: all 6 checked sensitive tables have RLS enabled; 4 subscription org-scoping policies exist; zero same-alias `org_id = org_id` RLS predicates found. These static checks are a safety layer, **not a replacement** for the signed-JWT gate.
