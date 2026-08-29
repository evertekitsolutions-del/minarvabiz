# Changelog

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
- Online: Next.js + Supabase-ready adapters
- Offline: Electron + file-JSON / SQLite DDL
- Hybrid: outbox + conflict policy
