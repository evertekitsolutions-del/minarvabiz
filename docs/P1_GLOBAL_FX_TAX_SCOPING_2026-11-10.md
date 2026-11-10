# P1 — Global FX and jurisdictional tax (staged, OFF)

Owner request 2026-11-10: support USD, EUR, AED, OMR without destabilizing live INR billing.

## Present implementation boundary
- `packages/business-logic/src/global-fx-tax-preview.ts` provides **pure, side-effect-free** calculations only.
- Explicit currency minor units: INR/USD/EUR/AED use 2; OMR uses 3.
- A per-transaction external FX snapshot stores base, quote, decimal quote-per-base, UTC capture time and source; deterministic half-away-from-zero rounding uses `bigint`.
- Tax preview requires **explicit rate in basis points and inclusive/exclusive state**. No national VAT/GST rules are assumed or inferred.
- Test contract: `node --experimental-strip-types --test scripts/global-fx-tax-preview.test.mjs` (Node 24).
- No database migration, plan pricing changes, new payment routes, or public feature enablement. **INR/Razorpay logic remains unchanged.**

## Follow-on implementation gates (separate PRs)
1. Introduce server-enforced feature flag `MINARVA_GLOBAL_BILLING_ENABLED=false` and tenant-specific authoritative base currency. Never trust client-selected tenant/currency.
2. Add additive, RLS-protected immutable FX snapshot and jurisdiction tax-rule tables with effective dates, explicit authoritative source/provider, rate freshness policy, currency precision, and per-line evidence.
3. Resolve tax registration and VAT/GST calculation by verified legal entity jurisdiction, place of supply, treatment, exemptions, invoice date and tax-point rules. Do not use one tax percentage per country.
4. Bind each quote/invoice/refund and ledger entry to the original immutable snapshot. Preserve its source amount, converted amount, exact rounding adjustment, and event ID for idempotency.
5. Dual-tenant signed-JWT negative tests and finance reconciliation for INR, USD, EUR, AED, OMR; verify OMR 3-decimal exports, returns/partial payments and change-rate non-retroactivity.
6. Jurisdictional legal/accounting review before enabling a market. Do not treat the pure math preview as tax compliance or a live multicurrency billing launch.

### Safety
Any attempted cross-tenant snapshot reference must fail at DB/RLS and business-service authorization layers. Importers must never overwrite historical FX/tax snapshots. This file is a build-scoped P1 start, not a production-ready tax engine.
