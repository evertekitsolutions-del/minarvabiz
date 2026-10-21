# FIN-017 — Accounting Day Book

The existing Web/Windows Reports panel now offers a **Day Book** tab for accounting.view users. It shows posted and void accounting journals by entry date with journal reference, summary, account breakdown, debit and credit totals, and date-filtered CSV/Excel/PDF exports. Aggregated daily totals are available from the underlying domain function. A draft entry is excluded.

The data source is the first-party double-entry ledger. A voided journal and the separately posted reversing journal are both audit events; they still balance and may have non-zero Day Book turnover without implying cash flow or profit. Every included entry is individually verified for debit/credit equality and original stored totals. Any corruption fails closed rather than producing plausible but wrong aggregates. Active branch scope is enforced in the local domain reader.

No new schema, paid provider, financial writer, migration, cloud deployment or Windows release. **FIN-017 first cut** supports posted journal day book; later statutory localization/closing-book adjustments remain outside this read-only report.
