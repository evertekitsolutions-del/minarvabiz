# A-FIRST-CUSTOMER — Windows purchase amount preflight

The Windows Add Purchase form used `parseFloat(raw) || 0` for both total and paid amounts. Prefix values such as `"100xyz"` would silently become valid amounts, creating financial records that did not match operator input. Some invalid paid amounts silently became zero and could change an intended paid purchase into a payable.

The renderer now reuses the existing shared MIT-attributed amount validator with safe integer cents, two-decimal precision, strict format and no numeric-prefix coercion. A purchase total is required; an empty paid amount intentionally means zero. Existing server/domain validation of payable/supplier, cash account, permissions, accounting and outbox remains authoritative. Regression tests execute the real Windows handler with fake persistence/transaction boundaries and confirm that malformed amounts produce zero writes, while valid cents and blank optional payments are preserved.

No new dependency, production migration, paid service or Windows installer release.
