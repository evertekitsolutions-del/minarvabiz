# SVC-011 — Service warranty expiry follow-up

Source milestone: warranty and claim tracking in the installed Windows Offline app.

The Services & Orders → Service warranties panel now displays a read-only follow-up
worksheet for **expired** warranties and warranties ending within **30, 60 or 90
calendar days** (inclusive). The worksheet includes source order, asset,
customer ID, coverage end date, days remaining and status. Authorized users
can export the filtered branch-scoped rows to formula-safe CSV.

The report receives only the existing \`reports.view\`-authorized, active-branch
result from \`listServiceWarranties()\`. Dates use UTC civil-day arithmetic
while the effective "today" is taken from the user's local business date.
No customer phone/email is exported. CSV is downloaded only by an explicit
click; no WhatsApp/email/SMS message is sent.

The new function does not create or modify contracts, claims, payments, stock,
entitlements, customer notifications or cloud records. Cloud production Web
remains read-only and these locally stored warranty rows have no cloud sync.
No migration, new dependency, paid API, production write or installer release.

Validation: run
\`node --test packages/business-logic/src/__tests__/service-warranty-expiry.test.mjs\`,
existing SVC-011 warranty tests, package TS typechecks and mandatory exact-head
GitHub CI. Customer Windows app/manual follow-up acceptance remains outstanding.
