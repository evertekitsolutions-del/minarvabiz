import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BOUTIQUE_OPTION_SCHEMA, normalizeBoutiqueOptions,
} from "../packages/business-logic/src/open-mercato-boutique-options.ts";

test("MIT Open Mercato options normalize brand/fabric/color/size and searchable custom values", () => {
  assert.deepEqual(BOUTIQUE_OPTION_SCHEMA.map(x => x.code), ["brand","fabric","color","size"]);
  const updated = normalizeBoutiqueOptions([
    { code:"color", values:[{label:"Blue"},{label:" blue "},{label:"Maroon"}] },
    { code:"size",values:[{label:"42"},{label:"XL"}] },
  ]);
  const colors = updated.find(x=>x.code==="color");
  assert.deepEqual(colors?.values.map(x=>x.label), ["blue","Maroon"]);
  const sizes = updated.find(x=>x.code==="size");
  assert.deepEqual(sizes?.values.map(x=>x.label),["S","M","L","XL","42"]);
});

test("atomic invoker variant RPC verifies tenant, receipts and parent stock trigger", () => {
  const sql = readFileSync("supabase/migrations/20261109_saas_boutique_variant_family.sql","utf8");
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/public\.current_user_authorization\(\)/);
  assert.match(sql,/user_has_org_role/);
  assert.match(sql,/CREATE TRIGGER boutique_variant_stock_reconcile/);
  assert.match(sql,/INSERT INTO public\.inventory_transactions/);
  assert.match(sql,/Parent stock does not equal sum of its verified variants/);
  assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS products_org_active_barcode_unique/);
});

test("product UI waits for cloud-confirmed family and preserves stable retry IDs", () => {
  const page=readFileSync("apps/web/src/app/(app)/products/page.tsx","utf8");
  const matrix=readFileSync("apps/web/src/app/(app)/products/boutique-variant-matrix.tsx","utf8");
  const service=readFileSync("apps/web/src/lib/online-boutique-variant-family.ts","utf8");
  assert.match(page, /<BoutiqueVariantMatrix/);
  assert.match(page, /Price \(GST inclusive\)/);
  assert.match(matrix,/normalizeBoutiqueOptions/);
  assert.match(matrix,/pendingParentId\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(matrix,/await createBoutiqueVariantFamilyOnline\(/);
  assert.match(matrix,/Parent stock = sum of variants/);
  assert.match(service,/const \[products, movements\] = await Promise\.all/);
  assert.match(service,/getSessionToken\(\) !== token/);
  assert.match(service,/store\.hydrateCore/);
});
