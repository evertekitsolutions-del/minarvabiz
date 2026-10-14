# Minarva Biz — Point-wise audit policy

## Scope and denominator

The authoritative registries contain **329 product items and 111 AI items**, giving **440 distinct capabilities**. Each is one unit; each unit has five acceptance gates worth one point each. Thus `440 × 5 = 2,200` point opportunities. This is an equal-weight measurement methodology, not a historical reconstruction of the earlier 51% estimate. The 23 multi-capability delivery outcomes are separately governed by `docs/PRODUCT_DELIVERY_BACKLOG.json` and are **not added again** (no double counting).

## Evidence gates

| Gate | Points per item | Minimum evidence |
|---|---:|---|
| Source | 1 | Merged production code with reviewed source URL |
| Tests | 1 | Passing relevant automated behavioral tests, including negative cases |
| CI | 1 | Exact-head and postmerge green checks at the applicable commit |
| Deployment | 1 | Running target build/release and verified real environment evidence (or proven inapplicable to this capability) |
| UAT | 1 | Real end-to-end customer acceptance in all applicable Online, Windows Offline, Hybrid modes; permission/tenant risks assessed |

An assessor adds URLs, `verifiedBy`, and `verifiedAt` to `docs/MASTER_VISION_EVIDENCE.json`. The script validates evidence shape and dependencies and reports the **documented evidence points**. It cannot independently certify a URL, a customer's UAT, or the truthfulness of the assessor. Evidence must be reviewed before merge. A non-empty evidence record does not itself imply full customer readiness.

## Important interpretation

- `0.00%` with an empty register means **0 of 2,200 evidence points documented in this new measurement register**, *NOT* “0% of software built.”
- The historical ~51% was an unaudited estimate and is not a valid measured baseline.
- Until capability-level source, tests, CI, deployment and UAT are audited, **real implementation completion percentage remains UNKNOWN**.
- Track unknown separately from missing or failed functionality. Do not award zero-quality or “not built” verdict to unassessed capabilities.
- Re-run `node --test scripts/master-vision-measurement.test.mjs` and `node scripts/master-vision-measurement.mjs --json`.
- `node scripts/master-vision-measurement.mjs > docs/MASTER_VISION_POINTWISE_REPORT.md` generates the complete pointwise list.
- Reconcile the registry periodically with `docs/MASTER_PRODUCT_PLAN.md`: required new features must be assigned IDs before percentages can be described as full Master Vision.

## Anti-gaming and audit trail

No credit for PR count, screenshots with no provenance, green CI without related tests, inaccessible preview links, unchecked demo data or unsupported edition behavior. Any accepted evidence requires assessor identity and date. Source-only PR work may earn source and test points after review, but does not automatically earn deployment or customer UAT credit. Point-score changes must include evidence diffs in PR reviews.
