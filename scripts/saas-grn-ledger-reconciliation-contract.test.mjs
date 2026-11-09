import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("supplier ledger reconciles cloud GRN payable without new posting",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_supplier_payables_unified_ledger.sql","utf8");
 assert.match(sql,/saas_supplier_payables pay/);
 assert.match(sql,/JOIN public\.saas_purchase_orders po/);
 assert.match(sql,/po\.status='received'/);
 assert.match(sql,/pay\.org_id=v_org/);
 assert.match(sql,/public\.saas_party_ledger\(/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/v_total_credit-v_total_debit/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?public\.(?:sales|purchases|saas_supplier_payables)/i);
});
test("tenant report UI reads v2 ledger and reports payable sign",()=>{
 const text=readFileSync("apps/web/src/app/(app)/reports/saas-ledger-panel.tsx","utf8");
 assert.match(text,/"saas_party_ledger_v2"/);
 assert.match(text,/kind==="supplier"\?credits-debits:debits-credits/);
 assert.match(text,/Payable balance/);
 assert.match(text,/resolveOnlineAuthorization/);
});
