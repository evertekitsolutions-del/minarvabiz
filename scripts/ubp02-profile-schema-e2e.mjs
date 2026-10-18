/**
 * UBP-02a Postgres behavior checks against isolated local Supabase only.
 * Called after full authoritative migration replay; transaction always rolls back.
 */
import { execFileSync } from "node:child_process";

const nested = (value, name) => {
  if (!value || typeof value !== "object") return undefined;
  if (Object.hasOwn(value, name)) return value[name];
  for (const child of Object.values(value)) {
    const result = nested(child, name);
    if (result !== undefined) return result;
  }
};
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
const dbUrl = String(nested(status, "DB_URL") || "");
if (!dbUrl) throw new Error("Local Supabase DB_URL unavailable");
const host = new URL(dbUrl).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
  throw new Error("UBP-02a E2E refuses non-local database: " + host);
}

const sql = String.raw`
BEGIN;

DO $check$
DECLARE
  v_org uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_config jsonb;
  v_group text;
  v_tracking text;
  v_attrs jsonb;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organizations'::regclass) OR
     NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.products'::regclass) THEN
    RAISE EXCEPTION 'Existing tenant RLS must remain enabled';
  END IF;

  INSERT INTO public.organizations(id,name) VALUES (v_org,'UBP-02 schema fixture');
  SELECT business_group, feature_config INTO v_group, v_config
    FROM public.organizations WHERE id=v_org;
  IF v_group IS NOT NULL OR v_config <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Legacy organization defaults changed';
  END IF;

  UPDATE public.organizations SET business_group='SERIALIZED',
    business_type_code='serialized_054',
    feature_config='{"additionalCapabilities":["booking"]}'::jsonb
    WHERE id=v_org;

  BEGIN
    UPDATE public.organizations SET business_group='INVALID' WHERE id=v_org;
    RAISE EXCEPTION 'Unexpected acceptance: invalid group';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.organizations SET business_type_code='retail_054' WHERE id=v_org;
    RAISE EXCEPTION 'Unexpected acceptance: preset/group mismatch';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.organizations SET business_type_code=NULL WHERE id=v_org;
    RAISE EXCEPTION 'Unexpected acceptance: missing preset';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.organizations SET feature_config='[]'::jsonb WHERE id=v_org;
    RAISE EXCEPTION 'Unexpected acceptance: feature config array';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.products(id,name,org_id)
    VALUES (v_product,'UBP-02 fixture product',v_org);
  SELECT tracking_mode,attributes INTO v_tracking,v_attrs
    FROM public.products WHERE id=v_product;
  IF v_tracking <> 'none' OR v_attrs <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Legacy product defaults changed';
  END IF;

  UPDATE public.products SET tracking_mode='serial',attributes='{"warranty_months":12}'::jsonb
    WHERE id=v_product;

  BEGIN
    UPDATE public.products SET tracking_mode='IMEI' WHERE id=v_product;
    RAISE EXCEPTION 'Unexpected acceptance: invalid tracking mode';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.products SET attributes='[]'::jsonb WHERE id=v_product;
    RAISE EXCEPTION 'Unexpected acceptance: product attributes array';
  EXCEPTION WHEN check_violation THEN NULL; END;

  IF (SELECT count(*) FROM pg_indexes
      WHERE schemaname='public'
        AND indexname IN ('idx_ubp_products_org_barcode','idx_ubp_products_org_sku','idx_ubp_sales_org_date')) <> 3 THEN
    RAISE EXCEPTION 'UBP-02 hot-path indexes missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='organizations'
      AND cmd IN ('UPDATE','INSERT','ALL') AND roles @> ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'Organization profile inadvertently opened for client writes';
  END IF;
END;
$check$;

ROLLBACK;
`;
const output = execFileSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
  input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"],
});
if (!/ROLLBACK/.test(output)) throw new Error("UBP-02 validation was not rolled back");
console.log("UBP-02 isolated Postgres checks PASS: legacy defaults, group/tracking constraints, RLS, indexes; fixture ROLLBACK");
