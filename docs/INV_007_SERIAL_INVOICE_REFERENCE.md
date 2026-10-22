# INV-007 — Read-only serial/manual-invoice product consistency check

**Date: 22 October 2026**

Adds a **Check invoice product** action next to manually sold serialized inventory in the shared Warehouse serial register.

The checker reads current Sales History under `reports.view` and current active branch, then:

- Finds **exactly one** invoice with the manual serial register's reference (invoice number or sale ID). An absent, duplicate or different-branch invoice fails closed. Legacy invoices with no authoritative branch marker are not treated as trusted.
- Requires a completed or partially paid sale, not a draft, cancelled, returned or deleted one.
- Requires a positive, safe milli-unit quantity of the same Product ID on the sale. Other products or invalid quantities fail closed.
- Displays matching invoice number, sale date, stored customer display name and product count for authorized reporting roles.

**Critical distinction:** This proves only that a posted invoice references the same PRODUCT. Existing invoice lines do **not** contain a verified, uniquely allocated serial/IMEI, and cannot establish that a particular serial was actually delivered. It does NOT automatically update serial custody, verify a warranty entitlement, calculate warranty expiry, issue credit notes, alter stock, or write to cloud. The UI explicitly states the distinction.

**Next production requirements:** trusted serial allocation at the atomic sale transaction, retroactive manual assignment workflow with reconciliation and audit, invoices/credit note/returns and service/RMA serial authority, batch/serial ownership under multi-branch/offline sync, device identity and tenant-safe cloud persistence. Do not unlock fake verified state for missing branch or legacy invoices.

**Gate:** `node --test packages/business-logic/src/__tests__/serial-invoice-reference.test.mjs`, business-logic/UI typechecks, exact-head CI/Windows installed/browser smoke/coverage/security. No database migration, release, paid dependency or Master Vision completion percentage claim.
