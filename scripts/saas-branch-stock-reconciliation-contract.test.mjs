import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("supabase/migrations/20261110_saas_branch_stock_pos_grn_reconciliation.sql","utf8");
test("M7 stock adjust, POS, GRN events reconcile one branch and exactly the global stock delta",()=>{
 for(const re of [
  /CREATE OR REPLACE FUNCTION public\.adjust_stock\(/,
  /v_effective_branch:=coalesce\(p_branch_id,v_product_branch\)/,
  /WHERE b\.id=v_effective_branch AND b\.org_id=v_org/,
  /v_new:=round\(v_current\+v_delta,3\)/,
  /CREATE OR REPLACE FUNCTION public\.saas_adjust_stock_once\(/,
  /p_branch_id IS NULL OR p\.branch_id IS NULL OR p\.branch_id=p_branch_id/,
  /pg_advisory_xact_lock/,
  /CREATE TRIGGER saas_reconcile_branch_stock_movement_trg/,
  /AFTER INSERT ON public\.inventory_transactions/,
  /IF v_stock IS DISTINCT FROM NEW\.balance_after/,
  /v_aggregate IS DISTINCT FROM v_stock-v_delta/,
  /IF NEW\.quantity IS NULL OR NEW\.quantity=0/,
  /NEW\.branch_id IS NULL/,
  /NEW\.movement_type/,
  /WHEN 'purchase' THEN v_delta:=abs\(NEW\.quantity\)/,
  /WHEN 'sale' THEN v_delta:=-abs\(NEW\.quantity\)/,
  /WHEN 'adjustment' THEN v_delta:=NEW\.quantity/,
  /UPDATE public\.saas_branch_stock SET/,
  /quantity>=-v_delta/,
  /'stock_out'/,
  /saas_branch_stock_movements\(/,
  /CREATE CONSTRAINT TRIGGER saas_guard_branch_stock_total_trg/,
  /DEFERRABLE INITIALLY DEFERRED/,
  /Product stock change missing branch stock movement/,
 ])assert.match(source,re);
 assert.doesNotMatch(source,/GRANT (INSERT|UPDATE|DELETE) ON public\.saas_branch_stock/);
 assert.doesNotMatch(source,/UPDATE public\.products SET stock_quantity=stock_quantity\+/);
});

test("Existing uninitialized online/offline stock remains compatible",()=>{
 assert.match(source,/IF NOT EXISTS\(SELECT 1 FROM public\.saas_branch_stock_seeds s/);
 assert.match(source,/RETURN NEW;/);
 assert.match(source,/REVOKE ALL ON FUNCTION public\.saas_reconcile_branch_stock_movement/);
});
