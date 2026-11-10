import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_storefront_design_variants.sql","utf8");
const merchant=readFileSync("apps/web/src/app/(app)/storefront/page.tsx","utf8");
const editor=readFileSync("apps/web/src/app/(app)/storefront/saas-storefront-design-panel.tsx","utf8");
const buyer=readFileSync("apps/web/src/app/store/[slug]/page.tsx","utf8");
const meta=readFileSync("apps/web/src/app/store/[slug]/layout.tsx","utf8");
test("M16 publicly sanitized variant metadata follows tenant-owned product",()=>{
 for(const r of [
  /variant_parent_id/,/variant_parent_name/,/variant_size/,/variant_color/,/variant_fabric/,
  /saas_storefront_variant_metadata/,/v_product\.parent_product_id/,
  /BEFORE INSERT OR UPDATE ON public\.saas_storefront_listings/,
  /NEW\.org_id/,
  /saas_storefront_design_receipts/,
  /ENABLE ROW LEVEL SECURITY/,
  /user_has_org_role/,/Design idempotency collision/,
  /length\(v_title\)>65/,/length\(v_description\)>160/,
  /v_banner !~ '\^https:/,/accent_color/,
 ])assert.match(sql,r);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE) ON public\.saas_storefront_design_receipts/);
});
test("M16 editor and public responsive SKU variants are backend verified",()=>{
 assert.match(merchant,/SaasStorefrontDesignPanel/);
 assert.match(editor,/saas_storefront_update_design_once/);
 assert.match(editor,/saas_storefront_design_receipts/);
 assert.match(editor,/getOutboxScope/);
 for(const r of [
  /variantChoice/,/variant_parent_id/,/variant_parent_name/,
  /variant_size/,/variant_color/,/variant_fabric/,
  /selectVariant\(/,/min-h-\[44px\]/,
  /store\.banner_url/,/store\.seo_description/,/store\.accent_color/,
 ])assert.match(buyer,r);
 for(const r of [
  /generateMetadata/,/published:"eq.true"/,/seo_title/,/seo_description/,
  /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
 ])assert.match(meta,r);
 assert.doesNotMatch(meta,/SERVICE_ROLE|SECRET_KEY/);
});
