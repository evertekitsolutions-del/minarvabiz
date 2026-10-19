# A-SYNC-V2 — multi-cut stock revision (local)

Local checkout previously decremented warehouse/product stock once per
measured cut. Two cuts of the same SKU therefore advanced product and
WMS versions twice, so Sync v2 refused financial proof rather than
claiming an unverifiable single revision.

Checkout now:

- keeps distinct sale-item IDs and immutable `dimension-line-v1` audits
- aggregates demand in integer milli-units per SKU
- applies one product debit and one warehouse-position revision per
  authorized stock location
- still refuses envelopes when more than one eligible stocked location
  exists, or when pre-operation versions cannot be proven

This is **not** S2 PostgreSQL `apply_financial_sync_sale_event` and does
not activate B1 enrollment/revocation (draft PR #473). Unsupported
dimensional cloud writers still fail closed without a synced
acknowledgement. No hosted migration, paid service or installer release.
