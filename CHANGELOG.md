# Changelog

## 1.0.4 — Customer-delivery candidate

### Release hardening
- Added production Render license-admin health/public-key endpoints.
- Added server-side commercial license activation, validation and deactivation APIs.
- Added trial registration endpoint to license-admin.
- Desktop commercial license state now bypasses the trial gate correctly.
- Paid license activation can be performed before or after a trial.
- Added Render cold-start tolerance for first commercial activation.
- Added runtime plan-feature enforcement in desktop domain permissions/navigation.
- Production desktop builds fetch/bundle only the public verification key; private signing material remains server-side.
- Restored strict missing/invalid production key refusal.

### Windows desktop
- Clean Windows installer build/install/launch smoke passes.
- Installed UI click smoke covers Day-end Close, Payments, Returns, Suppliers, Staff Details, Audit Log, Customer Profile, Global Search, Notifications and Reports refresh.
- SQLite remains the primary offline store; legacy JSON production persistence is guarded out.
- Backup/restore, automatic backup, device fingerprinting and secure local license storage remain enabled.

### Online / Supabase
- Authenticated Supabase access token is passed to RLS-protected reads/writes.
- Customer/product IDs are preserved on online inserts.
- Product categories are hydrated, persisted and creatable from the web UI.
- Added missing web route coverage to avoid dead sidebar destinations.
- Tenant-aware RLS/security hardening is represented in repository migrations for reproducible deployments.

### Verified build
- CI, Licensing Smoke, Windows Feature Click Smoke and Windows Deep Installed Smoke all pass on the audited 1.0.4 main baseline.

## 1.0.0-rc (Phases 1–50)

### Core
- Monorepo (Next.js + Electron + shared packages)
- Dashboard matching reference layout with **live** domain metrics
- Sales POS, inventory, service orders, measurements, laundry
- Expenses, purchases, suppliers, staff, incentives
- Returns, audit, backup, day-end close
- Customer payments & outstanding collection
- Licensing (Ed25519), feature gates, multi-branch
- Online / Offline / Hybrid foundations + sync outbox
- Domain snapshot persistence + auto-save
- Shop profile, GST/tax config, receipts & labels
- WhatsApp deep links, notification templates
- Stock take, delivery challan, CSV product import
- Loyalty points foundation
- Role-based nav map, onboarding, system health
- Toast + ErrorBoundary, security headers
- CI workflow, smoke script, desktop packaging config

### Editions
- Online: Next.js + Supabase adapters
- Offline: Electron + SQLite
- Hybrid: outbox + conflict policy
