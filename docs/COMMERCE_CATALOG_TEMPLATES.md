# COM-025 incremental — Offline customer catalog templates

QUIQQER's modular template model is used as **design inspiration only**. No GPL-licensed QUIQQER code is copied, installed or bundled.

Minarva's existing offline shareable customer catalog supports two built-in, safe layouts: `cards` (unchanged default) and `compact`. Both use the same read-only branch-filtered public product projection, escaping and strict local HTML CSP. The seller may download either one from Products without network publication or source mutation. Unknown templates fail closed; arbitrary CSS or JavaScript is never accepted as an option.

This is **not** a website CMS/theme editor, tenant-managed template marketplace, live storefront or public API. Full COM-025/COM-011 completion remains gated by safe tenant-persisted template settings, approvals, accessibility and domain-scoped publication.

Regression coverage: `commerce-catalog-compact-template.test.mjs`.

No migrations, deployment, installer release, paid services, new runtime dependency or GPL/LGPL source reuse. Tracks #325, `docs/COMMERCE_UPSTREAM_ADOPTION_MATRIX.md`.
