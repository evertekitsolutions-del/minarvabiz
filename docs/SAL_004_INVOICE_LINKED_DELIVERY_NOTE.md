# SAL-004 — Invoice-linked A4 Delivery Note (first cut)

Adds **Delivery note** next to A4/Thermal in shared Sales History for saved posted/partial invoices only, in both Web and Windows. Uses the existing printer bridge and browser print dialog; no additional renderer or paid dependency. Printed details come from host-persisted sale, not an arbitrary UI object, and the item names/SKUs/notes are HTML escaped. Original quantities and dimension metadata are preserved; price, tax and financial totals are intentionally excluded.

**Important:** This is a NON-FINANCIAL INVOICE-LINKED PACKING NOTE, not a statutory GST delivery challan, independent consignment note, transport e-way bill or proof of delivery. Clicking it does not alter inventory, post accounting, mark goods dispatched, create a delivery number in a ledger or acknowledge receipt. Formal dispatch lifecycle, partial deliveries, independent numbering, legal HSN/GST particulars, customer signature and authorization remain to build before SAL-004 can be marked complete.

Requires the existing sales.create permission and checks active branch. Existing invoice history and offline/online/hybrid systems supply the source of truth; no database migrations or customer deployment.
