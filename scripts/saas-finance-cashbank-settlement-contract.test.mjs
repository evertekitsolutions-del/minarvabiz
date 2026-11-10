import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_cashbank_ledger_settlement.sql","utf8");
const ui=readFileSync("apps/web/src/app/(app)/accounting/saas-finance-accounting-panel.tsx","utf8");
test("M12/15 cloud cash/bank postings are immutable, tenant scoped and idempotent",()=>{
 for(const r of [
 /CREATE TABLE IF NOT EXISTS public\.saas_finance_accounts/,
 /CREATE TABLE IF NOT EXISTS public\.saas_finance_entries/,
 /ENABLE ROW LEVEL SECURITY/g,
 /REVOKE ALL ON public\.saas_finance_accounts/,
 /saas_finance_open_account_once/,
 /saas_finance_post_once/,
 /saas_finance_daybook/,
 /pg_advisory_xact_lock/,
 /v_prior\.request_body IS DISTINCT FROM v_payload/,
 /v_account\.kind='cash' AND v_balance\+v_delta<0/,
 /'supplier_payment'/,
 /SET paid=paid\+v_amount/,
 /SET paid_amount=paid_amount\+v_amount/,
 /outstanding_balance=outstanding_balance-v_amount/,
 /'advance'/,
 /operating_surplus_estimate/,
 /financial_statement_status/,
 /provisional_before_tax_reconciliation/,
 ])assert.match(sql,r);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE) ON public\.saas_finance/);
});
test("M12/15 online account UI uses immutable reference IDs and confirms each posting",()=>{
 const page=readFileSync("apps/web/src/app/(app)/accounting/page.tsx","utf8");
 assert.match(page,/getRuntimeMode\(\)==="demo"/);
 assert.match(page,/SaasFinanceAccountingPanel/);
 for(const r of [
 /can\("accounting.manage"\)/,/getOutboxScope/,
 /pendingEntry\.current\?\?=/,/saas_finance_open_account_once/,
 /saas_finance_post_once/,/saas_finance_daybook/,
 /saas_finance_entries/,/id=eq\."\+id/,
 /Post to cash \/ bank/,/Provisional operating surplus/,
 ])assert.match(ui,r);
});
