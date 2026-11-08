# Corrected standalone HTML POS workspace

This is the corrected implementation of the owner-supplied HTML, checked into the existing repository. It is an **isolated standalone workspace**, not a replacement for the Next.js/Electron ERP, not an installed Windows update, and not a production deployment. It does not connect to the ERP's existing tables, ledger, device enrollment or outbox. Do not label this as full ERP integration.

## Run

Serve the repository over localhost or HTTPS, for example `python -m http.server 8765`, then open `http://localhost:8765/docs/previews/cloud-pos/`. JavaScript modules require HTTP; do not open with `file://`. No Tailwind, font CDN or runtime SDK download is required. Static assets must remain available; there is no service-worker offline installation. Once loaded, billing can save without cloud connectivity. Browser storage eviction is not a backup strategy.

Start with Settings → Add business, then Inventory and Parties. Prices include tax. Discount is a line-total amount. Stock supports three decimal places. Credit sales require a named customer; cash overpayment produces change. Invoice financial fields are stored in integer minor units (INR/AED: two decimals; OMR: three), while catalog prices remain decimal values. Tax rates are configurable; this is not a statutory compliance certification.

## Optional cloud setup

Use a separate test Supabase project. `setup.sql` is an explicit setup script, **not** an automatically applied ERP migration. It has not been applied to a hosted project. Run once using an administrator connection, create an email/password Auth user, and sign in through Settings using the project HTTPS URL and publishable/legacy anon key. Never enter secret or service-role keys.

The backend uses one workspace per authenticated account. Each account can own multiple businesses, and all devices using that same account share its workspace. RLS restricts rows to `auth.uid()`; it is not staff membership/branch RBAC. Anonymous access is revoked. Auth tokens/passwords are not persisted by the app. The local workspace and each cloud account/project have separate IndexedDB keys. Returning to local workspace removes the token from memory, but intentionally preserves account data on the device; it is not a server session-revocation action.

A cloud sign-in reads before writing. Catalog/customer changes show pending status and are sent by Sync now; invoice save attempts sync after the local commit. A network failure retains the immutable operation UUID and payload. Edits pause until retry resolves an in-flight operation. The SQL RPC serializes writes, checks expected revision, and records receipts in the same transaction. A stale device gets a conflict instead of last-write-wins data loss. No automatic reconciliation of divergent invoices/stock is claimed.

Export local backup before conflict review. Review & reload cloud downloads a backup and retains the replaced data inside local backup archives. Re-entering divergent invoices requires manual reconciliation; never double-post payments. Old `minarva_biz_cloud_v1` localStorage and `minarva_biz_data` cloud records are not read or changed. They use different schemas and require a reviewed importer. The sample businesses/products/tax numbers from the original HTML are not seeded.

This owner-managed snapshot store is not a tamper-proof financial ledger: the owning account has data privileges. Production ERP integration must use existing server-authoritative sale, stock, ledger, authorization and event APIs rather than this demo snapshot schema. The setup script is deliberately outside `supabase/migrations`.

## Verification

Run dependency-free domain tests:

```sh
node --test docs/previews/cloud-pos/core.test.mjs
```

Install pinned, test-only dependencies in scratch (no runtime dependency added to the ERP):

```sh
npm install --prefix /tmp/minarva-pos-test --no-save @electric-sql/pglite@0.3.14 fake-indexeddb@6.2.4 jsdom@26.1.0
POS_TEST_MODULES=/tmp/minarva-pos-test/node_modules node --test docs/previews/cloud-pos/core.test.mjs docs/previews/cloud-pos/integration.test.mjs docs/previews/cloud-pos/ui.test.mjs
```

Coverage includes tax-inclusive INR/OMR calculations, odd tax rounding, partial payment/change, negative/invalid inputs, combined product demand, retry idempotency, business isolation, IndexedDB transaction abort/concurrent writers, lost-response replay, conflict preservation, fetch/edit races, actual PostgreSQL (PGlite) RPC/RLS/anonymous rejection and DOM-level add/sale/history/receipt flows with hostile item names.

Local Chromium launch was attempted but this executor denied its process-singleton socket (`Operation not permitted`). DOM tests are **not** browser visual or physical-printer acceptance. Hosted Supabase auth/PostgREST, real concurrent network clients, mobile visual layout, native IndexedDB browser restart, printer paper feed/cut and 80mm driver settings still need acceptance. Print CSS uses explicit 80mm width including padding and hides the app independently of a CSS CDN. Select the printer's 80mm roll, scale 100%, no browser headers/footers; physical paper calibration remains driver-specific.

## Integration / rollback

Existing shared checkout and HTML escaping utilities were inspected. The HTML preview cannot directly import production TypeScript/store contracts; its small standalone adapter stays isolated. No third-party application source was copied and no paid runtime service was introduced. PGlite, fake-indexeddb and jsdom are test tools only.

Full production integration is outstanding: adapt the requested interface to existing ERP APIs, preserve customer/tenant/branch/device identity and numbering, migrate legacy data explicitly, and verify Windows/Web/Hybrid journeys. There is no navigation change or automatic activation. Roll back this source addition by reverting its commit; it has no production data effects. If separately installed in a test database, archive its data before dropping the optional function and two tables.
