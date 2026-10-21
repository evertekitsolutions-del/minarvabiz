# Open Mercato MIT source reuse — Global Core international RFQ inputs

**Date:** 2026-10-21. **Upstream commit:** `eb3193df03b9ce0b196be417fe265c1dc47c0868`

## Implementation: source reuse, not just conceptual inspiration

The upstream Open Mercato MIT-licensed TypeScript files have been **copied verbatim**, with a short attribution header, into:
- `packages/business-logic/src/vendor/open-mercato/number.ts` — original `packages/shared/src/lib/number.ts`
- `packages/business-logic/src/vendor/open-mercato/unitCodes.ts` — original `packages/shared/src/lib/units/unitCodes.ts`

Exact source locations:
- https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/shared/src/lib/number.ts
- https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/shared/src/lib/units/unitCodes.ts

The root MIT License of the Open Mercato **core** was checked at the same upstream revision and copyright permission/notice preserved in `THIRD_PARTY_NOTICES.md`. No Open Mercato Enterprise, paid AI agent, cloud account, npm runtime dependency, DB schema or GPL upstream material is included.

## Working integration

- The **shared RFQ Web/Windows screen** now permits choosing en-IN, en-US, de-DE, fr-FR quantity input conventions before preview, including `1 234,5`, `1.234,5`, `1,234.5`, and ordinary decimal-comma `1,25`.
- The upstream parser is wrapped by `normalizeLocalizedRfqQuantity` which **rejects** zero/negative, exponent notation, overprecision beyond three decimal places, unsafe integer milli-units and malformed inputs. The existing RFQ domain remains the final strict canonical validator.
- The upstream unit-code helper canonicalizes ERP category `qty` to `pc` in **display/CSV only**; it does not mutate a Product or stock unit.
- The UI warns users that a **single** comma or period is a **decimal** delimiter: `1,234` is `1.234` rather than `1234`; grouped values must use unambiguous multiple marks or whitespace. Never silently infer a monetary thousands delimiter.

## Boundaries and tests

- **Planning RFQ only**. No supplier communication, purchase order or cost invoice posting; no stock, ledger, cloud, outbox, authentication or data writes.
- The existing purchase/order/payment/stock monetary validator is **not replaced** with a lenient locale parser. Locale parser is for typed nonfinancial quantities only; money remains exact-cent/approved input validation.
- This is the **first targeted Open Mercato core code reuse slice**, not adoption of the entire SaaS nor full Master Vision completion.
- `node --test packages/business-logic/src/__tests__/localized-rfq-input.test.mjs`
- `node --test packages/business-logic/src/__tests__/rfq-draft-preview.test.mjs`
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- Require exact-head CI, Windows installed smoke, coverage, source attribution review and postmerge checks before merge. Do not release production without owner's explicit authorization.

## Further Option A reuse candidates (not included in this PR)

Use source/dependency/license and existing Minarva duplication review before import: catalog pricing (Open Mercato Core), business rules, product units, currencies, warranties and reservations. Prefer standalone MIT utility helpers first; substantial provider-managed modules require tenant, DB and Offline/Hybrid authorization design. Source copying is not customer UAT.
