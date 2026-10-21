# FIN-019 — Loan EMI / Repayment Schedule (planning slice)

Date: 2026-10-21. Inspiration: common ERPNext/Odoo loan repayment schedules. Original Minarva Biz shared TypeScript; no upstream GPL/LGPL code, addon or asset was copied.

## Customer-visible workflow

Shared Web/Windows **Accounting → Loans** tab. Enter a loan reference, principal, nominal annual interest rate (0–100%, precision up to four decimals), whole-month term (1–360), and first payment date. Click **Preview loan repayments** to see fixed-rate approximate EMI, dated opening principal, payment, reducing-balance monthly interest, principal component and closing principal. Export UTF-8 formula-safe CSV.

Money is parsed into exact integer cents. Monthly nominal interest uses the rate divided by twelve and half-up cent rounding. The nonfinal installment is based on a rounded ordinary EMI formula and is never below the monthly interest plus a principal cent. The final payment clears remaining principal exactly. The schedule rechecks total paid = original principal + total interest. Payment days anchor on the first due date, clamped at end-of-month but restored on longer months. Fees, compounding outside the monthly cycle, floating interest and lender-specific daily accrued interest are **not** calculated.

## Boundaries and full capability follow-up

This is a **calculator**, not a durable loan register or actual EMI debit. No bank feed, payment mandate, interest charge, loan journal, actual balance, rate changes, refinancing, grace period, overdue interest, opening balance import, approvals, audit/outbox, production DB migration, or Windows installer release. Real contractual lender statements may differ from the estimate.

The complete FIN-019 capability still needs authoritative ledger integration, loan/advance accounts, borrower/supplier relationships, dated disbursals, repayment transaction posting, variable rates, loan settlement and Offline/Hybrid reconciliation.

## Verification

- `node --test packages/business-logic/src/__tests__/loan-repayment-plan.test.mjs`
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- Exact-head PR Web/Windows CI, coverage, installed smoke, security and main post-merge gates.

No new runtime dependency, paid service, live tenant data write or production migration. Roll back by reverting PR. No overall Master Vision completion percentage increase claimed.
