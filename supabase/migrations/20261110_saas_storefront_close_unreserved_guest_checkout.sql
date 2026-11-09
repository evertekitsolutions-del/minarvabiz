-- M17 security: close legacy anonymous checkout without a stock reservation.
-- The new saas_storefront_checkout_reserved SECURITY DEFINER RPC invokes this
-- legacy function internally; revoking public EXECUTE does not revoke that call.
-- Additive permissions-only migration: no customer rows or historical data changed.
DO $migration$
DECLARE v_signature text;
BEGIN
 FOR v_signature IN
  SELECT p.oid::regprocedure::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='saas_storefront_place_order'
 LOOP
  EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_signature ||
    ' FROM PUBLIC, anon, authenticated';
 END LOOP;
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='saas_storefront_place_order'
 ) THEN
  RAISE EXCEPTION 'Legacy storefront RPC missing; cannot verify checkout closure';
 END IF;
END;
$migration$;
