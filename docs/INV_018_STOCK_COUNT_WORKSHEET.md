# INV-018 — Physical Stock Count Worksheet (first cut)

The shared Web/Windows **Products & Inventory** screen now offers **Export count sheet** for an inventory.adjust-authorized operator. Exports a UTF-8 CSV with snapshot UTC, product ID, SKU, name, barcode, unit, book/system quantity and **blank physical count, variance and notes** columns. The full active-branch product catalogue is used, not an arbitrarily filtered UI table. Archived products are excluded. CSV text fields neutralize spreadsheet formulas.

This is a printable physical counting worksheet, not a completed count or stock adjustment. After checking real physical quantities and investigating discrepancies, operators must use the existing audited Stock adjustment action separately. There is no automatic stock posting, import of count results, count-session lock, multi-user count assignments, scanned count workflow or automatic reconciliation yet. INV-018 is **partial**, until those flows and cross-device authority are implemented.

No new database, provider dependency, paid API, migration or production release. Retains the existing local-first store and backup/sync model.
