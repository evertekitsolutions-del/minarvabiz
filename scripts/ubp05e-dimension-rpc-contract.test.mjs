import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const name="20261018_ubp05e_atomic_sale_dimension_rpc.sql";
const migration=path.join(root,"supabase/migrations",name);
const previous=fs.readFileSync(path.join(root,"supabase/migrations/20260924_atomic_sales_payment_stock_rpc.sql"),"utf8");
const manifest=fs.readFileSync(path.join(root,"supabase/MIGRATION_ORDER.txt"),"utf8")
  .split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith("#"));

test("new atomic dimension RPC migration follows exact schema and is replayed once",()=>{
  assert.equal(manifest.filter(n=>n===name).length,1);
  assert.ok(manifest.indexOf(name)>manifest.indexOf("20261018_ubp05c_dimensional_sale_line_storage.sql"));
  assert.ok(fs.existsSync(migration),"UBP-05e SQL is not yet implemented");
});

test("dimension RPC preserves existing auth, stock and financial transaction boundaries",()=>{
  const sql=fs.readFileSync(migration,"utf8");
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.create_sale\s*\(\s*p_sale JSONB,/i);
  assert.match(sql,/SECURITY DEFINER\s+SET search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(sql,/private\.current_user_org_id\(\)/);
  assert.match(sql,/FROM public\.organization_members/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/INSERT INTO public\.sales/);
  assert.match(sql,/INSERT INTO public\.inventory_transactions/);
  assert.match(sql,/INSERT INTO public\.payments/);
  assert.match(sql,/UPDATE public\.customers/);
  assert.match(sql,/v_product_branch/);
  assert.match(sql,/p_allow_negative_stock/);
  assert.match(sql,/RETURN jsonb_build_object\('sale_id'/);
  assert.match(sql,/public\.create_sale\(JSONB,\s*JSONB,\s*BOOLEAN\)/i);
  assert.doesNotMatch(sql,/\b(DROP TABLE|DISABLE ROW LEVEL SECURITY|CREATE POLICY|TRUNCATE)\b/i);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\.create_sale\s*\(/g)||[]).length,1);
  // The new migration must not replace unrelated functions from the earlier file.
  assert.match(previous,/CREATE OR REPLACE FUNCTION public\.record_payment/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.record_payment/i);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.adjust_stock/i);
});

test("dimension RPC is fail-closed and stores audited metadata in the initial INSERT",()=>{
  const sql=fs.readFileSync(migration,"utf8");
  const saleInsert=sql.match(/INSERT INTO public\.sale_items\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\);/i);
  assert.ok(saleInsert,"sale_items INSERT is required");
  assert.match(saleInsert[1],/\bdimension_metadata\b/);
  assert.match(saleInsert[2],/\bv_dimension_metadata\b/);
  assert.match(sql,/public\.ubp_dimension_line_valid\s*\(\s*v_dimension_metadata,\s*v_qty\s*\)/i);
  assert.match(sql,/v_item\s*\?\s*'dimensionMetadata'/);
  assert.match(sql,/(?:v_item|item\.value)\s*\?\s*'dimension_metadata'/);
  assert.match(sql,/v_dimension_metadata\s+IS\s+NOT\s+NULL/);
  assert.match(sql,/RAISE EXCEPTION '.*dimension/i);
  // A retried sale with the same invoice cannot falsely acknowledge different metadata.
  assert.match(sql,/v_existing_invoice\s*=\s*p_sale->>'invoice_number'/);
  assert.match(sql,/IS DISTINCT FROM/i);
  assert.match(sql,/FROM public\.sale_items/i);
});
