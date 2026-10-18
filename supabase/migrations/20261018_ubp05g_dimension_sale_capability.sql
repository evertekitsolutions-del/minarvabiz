-- UBP-05g: optional protocol negotiation. Install after UBP-05e atomic
-- create_sale replacement. No billing activation until this migration is
-- deployed and authenticated clients negotiate the exact version.
CREATE OR REPLACE FUNCTION public.ubp_dimension_sale_capability()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $ubp$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_user
      AND role = ANY (ARRAY['super_admin','admin','manager','cashier']::text[])
  ) THEN
    RAISE EXCEPTION 'Authenticated sale permission required'
      USING ERRCODE = '42501';
  END IF;
  -- A protocol marker must never be returned on a partial or incompatible
  -- database migration. Catalog inspection is a deployment readiness gate,
  -- not a replacement for authoritative checks inside create_sale.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.sale_items'::regclass
      AND attname = 'dimension_metadata'
      AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.sale_items'::regclass
      AND tgname = 'sale_items_dimension_metadata_write_once'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
    WHERE oid = to_regprocedure('public.create_sale(jsonb,jsonb,boolean)')
      AND prosecdef
      AND position('ubp_dimension_line_valid' IN prosrc) > 0
      AND position('v_dimension_metadata' IN prosrc) > 0
  ) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('protocol','dimension-sale-v1','schemaVersion',1);
END;
$ubp$;

REVOKE ALL ON FUNCTION public.ubp_dimension_sale_capability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ubp_dimension_sale_capability() TO authenticated;

COMMENT ON FUNCTION public.ubp_dimension_sale_capability() IS
  'Authenticated, read-only protocol readiness. Not proof of tenant stock, invoice, or financial authority.';
