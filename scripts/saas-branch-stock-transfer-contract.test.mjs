import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_branch_stock_atomic_transfers.sql","utf8");
const ui=readFileSync("apps/web/src/app/(app)/warehouse/saas-branch-transfer-panel.tsx","utf8");

test("M7 SQL implements atomic idempotent tenant branch conservation",()=>{
 for(const expr of [
  /CREATE TABLE IF NOT EXISTS public\.saas_branch_stock\(/,
  /CREATE TABLE IF NOT EXISTS public\.saas_branch_stock_seeds\(/,
  /CREATE TABLE IF NOT EXISTS public\.saas_branch_stock_transfers\(/,
  /CREATE TABLE IF NOT EXISTS public\.saas_branch_stock_movements\(/,
  /ENABLE ROW LEVEL SECURITY/g,
  /FOR SELECT TO authenticated/,
  /REVOKE ALL ON public\.saas_branch_stock/,
  /GRANT SELECT ON public\.saas_branch_stock/,
  /SECURITY DEFINER SET search_path=''/g,
  /public\.current_user_authorization\(\)/,
  /public\.user_has_org_role\(/,
  /pg_advisory_xact_lock/,
  /FOR UPDATE/,
  /v_allocated IS DISTINCT FROM v_product\.stock_quantity/,
  /UPDATE public\.saas_branch_stock SET quantity=quantity-p_quantity/,
  /ON CONFLICT\(product_id,branch_id\) DO UPDATE/,
  /'transfer_out',-p_quantity,v_source/,
  /'transfer_in',p_quantity,v_dest/,
  /Non-conserving stock transfer rejected/,
  /Transfer ID reused with a different tenant\/request/,
  /GRANT EXECUTE ON FUNCTION public\.saas_transfer_branch_stock_once/,
 ])assert.match(sql,expr);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.products\s+SET\s+stock_quantity/i);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE) ON public\.saas_branch_stock/);
});

test("M7 web online UI requires live tenant, immutable retry IDs, read-after-write",()=>{
 const page=readFileSync("apps/web/src/app/(app)/warehouse/page.tsx","utf8");
 for(const expr of [
  /resolveOnlineAuthorization/,
  /getOutboxScope/,
  /can\("inventory.adjust"\)/,
  /crypto\.randomUUID\(\)/,
  /"saas_initialize_branch_stock_once"/,
  /"saas_transfer_branch_stock_once"/,
  /"saas_branch_stock_seeds"/,
  /"saas_branch_stock_movements"/,
  /movements\.data\?\.length!==2/,
  /stillSigned\(a\.token,a\.userId\)/,
  /pending/,
 ])assert.match(ui,expr);
 assert.match(page,/getRuntimeMode\(\)/);
 assert.match(page,/SaasBranchTransferPanel/);
 assert.match(page,/WarehousePanel/);
});
