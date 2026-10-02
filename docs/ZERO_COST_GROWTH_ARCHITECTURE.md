# Minarva Biz Zero-Cost Growth Architecture

## Product direction

Minarva Biz is not a boutique-only application. Boutique is the first vertical of a future multi-industry business operating platform with Online, Offline Windows and Hybrid editions.

The architecture must support future migration to Minarva-owned server infrastructure without rewriting the product core.

## Phase 1 commercial constraint

Until at least **25 paying customers** are reached:

- no mandatory recurring paid infrastructure dependency;
- no automatic upgrade to a paid cloud plan;
- no AI request may silently fall through to a paid provider;
- free-tier exhaustion must fail closed or degrade gracefully;
- Windows Offline customers must keep core billing/business functions locally usable even when cloud services are unavailable.

25 customers is a review checkpoint, not an automatic permission to spend.

## Portability rules

New infrastructure integrations must sit behind replaceable boundaries:

- AI: provider-neutral support adapter;
- database: PostgreSQL-compatible central model + SQLite local-first desktop;
- object storage/backups: S3-compatible abstraction;
- APIs: standard HTTPS/JSON contracts;
- deployment: container/self-host-friendly services where practical;
- tenant model: organization -> company -> branch -> warehouse/store.

Do not fork the application by industry. Industry differences should become modules, feature flags, templates or Industry Packs over one shared commercial core.

## Current zero-cost stack

- Windows Offline: Electron + SQLite;
- source/release/update artifacts: GitHub;
- central PostgreSQL/Auth/support metadata: Supabase Free while within limits;
- customer-facing serverless web during transition: free-compatible hosting only;
- AI: Cloudflare Workers AI Free via a provider-neutral adapter;
- AI fallback after free quota: Help Center + private Support Inbox, **not paid inference**;
- License API front door: Cloudflare Worker; health, production public verification key and signed update manifest are origin-independent. Invalid license-validation requests are rejected at the edge without an origin call; valid validation and the remaining mutation/signing paths stay on the transition origin until trusted signing/database secrets are migrated behind a server-side boundary.
- License Admin transition target: remove dependence on free services that prohibit production/commercial use.
- Licensing client front door: Cloudflare License Edge; the current Render License Admin remains a temporary origin behind that stable boundary until signing/admin logic is migrated.

## AI routing

The Support Center never hard-codes a permanent AI vendor into Windows clients.

Runtime routing is stored in the private `support_runtime_config` table. Today it can point at Cloudflare Workers AI. Later it can point at:

- a Minarva-owned GPU inference server;
- an internal model gateway;
- another provider approved after commercial review.

Paid fallback is opt-in only via `MINARVA_ALLOW_PAID_AI_FALLBACK=true`.

## Future owned-server target

When customer revenue justifies owned infrastructure, migration should be incremental:

1. reverse proxy / load balancer;
2. application/API containers;
3. PostgreSQL primary + replica/backups;
4. S3-compatible object storage (for example MinIO);
5. job/queue workers;
6. observability and alerting;
7. off-site disaster-recovery backup;
8. optional self-hosted AI inference/GPU service.

The migration target must preserve the public application contracts so Windows/web clients do not need a ground-up rewrite.

## Cost-governance rule

Any new feature that introduces a recurring service must answer these questions before merge:

1. Is there a viable free/self-hosted path for the first 25 customers?
2. Does quota exhaustion cause a charge, or does it fail closed?
3. Can the provider be replaced without rewriting business logic?
4. Can the data be exported/migrated?
5. Will Offline edition still work for core business operations if the provider fails?

If the answer is not acceptable, the dependency should not become mandatory in Phase 1.
