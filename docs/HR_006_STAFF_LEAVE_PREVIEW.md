# HR-006 — Staff Leave Request Calendar Preview

Date: 2026-10-21. Original TypeScript based on conventional ERPNext/Odoo HR Leave workflow concepts only. No upstream GPL/LGPL source reused.

## Customer-visible slice

Open shared **Staff Management → Staff leave request planner**. Choose one active branch-authorized staff member, category (annual/sick/unpaid/other), start/end dates, optional reason and Saturday/Sunday inclusion, then preview working-day count. A half-day is supported for one-day requests. Export a CSV worksheet with staff, dates, category, units and notes.

The calendar is deterministic across timezones using UTC date-only arithmetic, covers 1–180 calendar days, validates leap dates and excludes weekends by default. CSV escapes quotes and protects against spreadsheet formula injection.

## Limitations / next work

This **does not save or approve leave**, deduct balances, inspect attendance conflicts, load public holidays, assign a replacement worker, send a message or post payroll deductions. The operator should check pre-existing leave, attendance, staffing requirements and legal/statutory accrual policy manually. Full HR-006 needs durable tenant/branch-scoped leave requests, entitlement categories, holiday calendars, approval roles and audit, conflict/overlap detection, attendance and payroll integration, and Offline/Hybrid sync with duplicate prevention.

## Verification

- `node --test packages/business-logic/src/__tests__/staff-leave-preview.test.mjs`
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- Required exact-head PR CI: Web/Windows, coverage, tenant integration, license/security and installed UI smoke; post-merge main checks.

No new paid service, runtime dependency, production migration, release, staff DB write, automatic messaging or Master Vision completion assertion. Roll back source with a PR revert.
