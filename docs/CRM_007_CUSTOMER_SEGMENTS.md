# CRM-007 — Customer Segments in the shared Customer List

Adds a segment column and selectable Champion, Loyal, Promising, New, At risk, Lost and Hibernating filters in Web and Windows Customers. Reuses the existing deterministic \`getCustomerIntelligenceSnapshot\` engine; no paid AI, new scoring service, migrations or new provider dependency.

Only non-deleted issued/partial POS invoices and delivered service orders count for the segment. Drafts, cancelled and returned transactions do not count. Customer segment scores compare the full active-branch customer cohort, so the search field and balance filter do not distort the cohort. Customers with no qualifying transactions appear as New. Only customers.manage roles may read scored cohort; the shared UI falls back without confidential scoring when unavailable.

This is practical RFM segmentation, not a full marketing automation suite, lifetime revenue reconciliation or a contact-consent system. Outbound messages and consent-dependent workflows are not added in this cut; CRM-017 remains separate. Status CRM-007: implemented in local first-party data mode; hosted tenant/role authority still needs its server integration gate.
