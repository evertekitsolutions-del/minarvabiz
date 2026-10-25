# OSS reuse — 20 October 2026

Base: `954a71e3aa47c9b0d0c8ab174f776f127ab400aa`. Scope: accelerate the existing
Windows/Online/Hybrid product, preserving its shared domain and outbox authority.

## First integrated component

Open Mercato core `0.9.0`, commit
`4374c48def1654927805c4b760f0e7f8648280f2`,
`packages/core/src/modules/catalog/lib/priceValidation.ts`, MIT.
Source: https://github.com/open-mercato/open-mercato/blob/4374c48def1654927805c4b760f0e7f8648280f2/packages/core/src/modules/catalog/lib/priceValidation.ts

The amount validator is adapted into the shared service-order price draft.
The previously Web-only preflight now serves Windows too. This is a small
component adoption, **not installation of the complete catalog module**.
Minarva retains two-decimal amounts, leading-dot input, safe integer cents and
explicit blank-field rules. Unlike upstream, internal whitespace is rejected;
four-decimal catalog prices are not silently rounded into financial entries.

Windows service/wholesale forms reject malformed amounts, invalid quantities,
excess discounts/advances and unsafe totals before calling the existing domain
transaction. T-shirt price and print detail now use the same validated draft.
Existing domain authorization, accounting, persistence and sync are unchanged.
No network call, extra database, runtime dependency or recurring charge is added.

MIT copyright and SPDX-style attribution are retained in the source; the
complete MIT license is in `THIRD_PARTY_NOTICES.md`, which Windows packaging
copies into release resources. Keeping the full notice in one canonical file
avoids source-comment-only lines lowering executable-code coverage.
The pure local adapter can be replaced without a data migration. Future updates
must review the pinned upstream file and rerun the shared and renderer tests;
no automatic upstream updates. No platform-wide security clearance is claimed.

## Larger module decisions

| Source | Potential use | Decision |
| --- | --- | --- |
| Open Mercato core | Catalog pricing, customers/CRM, sales, workflows, warranty claims | Best technical candidate for selective MIT reuse. Its ORM, generated registries and module runtime are not drop-in Minarva dependencies. Inspect missing journeys first; do not duplicate existing billing, auth or sync. |
| Aimeos core | B-COMMERCE catalog, cart, checkout and commerce API | PHP and LGPLv3; retain as a possible separately hosted adapter. Adding PHP/server operations now would not accelerate the Windows offline acceptance path. No Aimeos code imported. |
| QUIQQER (owner-confirmed; formerly typed “Uniqqer”) | Products, tax groups, customers, currencies, ERP/order/payments/shipping/invoices/discounts | **Behaviour reference only**: https://github.com/QUIQQER/core is GPL-3.0-or-later; modules also use custom QEL or proprietary licenses. Never copy or translate code, identifiers, templates or distinctive text. Clean-room native TypeScript specification; no code imported. |

References inspected:
- https://github.com/open-mercato/open-mercato (core MIT; enterprise code not adopted)
- https://github.com/aimeos/aimeos-core and its LICENSE (LGPLv3)
- https://github.com/QUIQQER/core (PHP; GPL-3.0+)

Open Mercato CRM/catalog modules remain candidates, not accepted or installed
features. Commerce still depends on the existing sync/stock reconciliation
acceptance gates. Importing a complete second business framework would create
two ownership models for customers, invoices and stock.

## Owner-confirmed source boundaries (2026-10-20)

- **Open Mercato** `v0.9.0` / `4374c48def1654927805c4b760f0e7f8648280f2`: MIT TypeScript only; pure functions/calculators/state machines/validators and independent interfaces may be adapted after rechecking pin, per-package LICENSE, CHANGELOG and BACKWARD_COMPATIBILITY. **Never import** its MikroORM, tenant authority, DI/runtime, `@open-mercato/enterprise`, `.ai/specs/enterprise` or unlicensed `@open-mercato/eslint-plugin-ds`. MIT copyright/notice and exact path required.
- **Aimeos** `https://github.com/aimeos/aimeos-core`: PHP LGPL-3.0-or-later; behaviour reference only. The hypothetical standalone hosted adapter requires explicit owner approval, PHP hosting and license compliance. Do not copy code into web/desktop.
- **QUIQQER** `https://github.com/QUIQQER/core`: PHP GPL-3.0-or-later; package-specific GPL, QEL and proprietary modules. Owner confirmed this is the third source, **not Uniqqer**. Clean-room behaviour study only; zero code/template/identifier copying.
- Record direct adoption and reference-only review in `docs/DEPENDENCY_REUSE_LOG.md`; do not add a second customer, invoice, stock or ledger authority. Implementation and acceptance queue is `docs/OWNER_DIRECTIVE_2026-10-20.md`.

## Verification and remaining acceptance

The regression harness executes the actual Windows create-order handler with
UI/persistence boundaries replaced, and verifies no posting on invalid input.
Shared pricing tests cover accepted Web behavior. This is not installed Windows
UAT. Exact-head CI, Web/Desktop typechecks and packaged Windows acceptance remain
separate evidence gates. No production migration, deployment or installer release.
Rollback: revert this PR; no persisted schema changes. No completion percentage
or whole-module acceptance is earned by this component reuse.

## Coverage gate follow-up

The first rebased exact-head run failed the changed-code 80% coverage gate (49.30%) even though behavior tests passed. The bundled complete MIT license remains intact in THIRD_PARTY_NOTICES, while the source retains copyright attribution. Direct tests now execute input-type, negative, unsafe-range, optional-empty, wholesale/uniform, overflow and amount-limit branches. No coverage exclusions or threshold reductions were made. Confirm the next exact-head CI before merge.
