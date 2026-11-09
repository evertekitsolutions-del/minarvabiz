import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("M12/M15: unified ledger is RLS invoker read-only source union",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_unified_party_ledger_readonly.sql","utf8");
 assert.match(sql,/security_invoker=true/);
 for(const table of ["public.sales","public.laundry_orders","public.orders","public.payments","public.purchases"])
  assert.ok(sql.includes(table),table);
 assert.match(sql,/saas_party_ledger_summary/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|UPDATE|DELETE)/);
});
