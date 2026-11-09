# MINARVA BIZ

**Online SaaS + Mobile App — product-wide owner decision, 2026-11-09.**

This repository is pivoting the **entire** Minarva Biz product to an authenticated, multi-tenant **online SaaS** service, accessible on browsers and via an installable mobile-first PWA. All industry solutions remain part of the product; boutique, tailoring, laundry and ironing are the urgent first-customer journeys.

Read [Owner's SaaS-only directive](docs/OWNER_DIRECTIVE_2026-11-09_SAAS_ONLY.md) and [Agent instructions](AGENTS.md) before development. Earlier Offline/Hybrid roadmaps and Windows release notes are **historical only**; they are not current product deliverables.

## Customer SaaS journey

Main customer-facing website → Register → Choose trial/subscription plan → Verify account → Tenant created → Tenant-specific login link → Sign in → ERP dashboard → Mobile access.

Important: **the flow is still under construction**. Do not claim a completed live subscription or customer-ready app based on screenshots, source commits or CI alone. Do not enable paid checkout until owner-approved payment verification is tested. Customer login links are not authentication tokens.

## Current technical direction

| Layer | Chosen implementation |
|---|---|
| Web | `apps/web` — Next.js, browser ERP |
| Mobile | Responsive installable PWA first; native Android packaging if later needed |
| Database and identity | Supabase PostgreSQL + Supabase Auth + strict RLS |
| Hosting | Cloudflare Workers/Pages only |
| Public website | Signup, plans, activation and links to tenant login |
| SaaS back office | Tenant/company/branch scoped ERP, durable writes, idempotent finance and inventory |
| First workflows | Boutique, tailoring, laundry, ironing, POS, stock, payments and reports |

**Vercel/Render prohibited.** No production database changes, deployment, paid services or real customer mutations without separate approval.

## Quick start (web-only active target)

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @minarvabiz/web typecheck
pnpm --filter @minarvabiz/web build
```

Old Electron, SQLite and Hybrid source remains only to preserve historical work and assist separately approved customer recovery. **Do not delete old backups, original customer data, license records or evidence.** Do not continue Windows packaging/release work.

## Delivery and QA

- Agents A/B/C build core SaaS, industry workflows and website/subscription/mobile respectively.
- Independent QA agent identifies and reports bugs only; Delivery Director coordinates and verifies.
- Release acceptance requires actual tenant signup/subscription/auth, durable product/stock and financial writes, independent QA, security/RLS isolation, Cloudflare deployment and mobile device testing.
- Distinguish source complete, CI green, deployed and customer accepted. The project is not assumed error-free.

## License and third-party code

Minarva Biz is proprietary commercial software owned by Evertek IT Solutions. Repository visibility does not grant open-source redistribution rights. Reused OSS must have a compatible license and preserved attribution; see [Proprietary software notice](LICENSE) and [Third-party notices](THIRD_PARTY_NOTICES.md).
