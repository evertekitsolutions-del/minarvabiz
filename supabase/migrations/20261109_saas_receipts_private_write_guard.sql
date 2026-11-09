-- M7/M10 follow-up: browser Auth roles must not forge receipt rows.
-- These functions already verify auth.uid, a single tenant membership, role,
-- and scoped product or sale before executing. All references are qualified.
-- Only the function owner can physically insert the immutable receipt rows.
REVOKE INSERT ON public.saas_inventory_mutation_receipts FROM authenticated;
REVOKE INSERT ON public.saas_checkout_receipts FROM authenticated;

DROP POLICY IF EXISTS saas_inventory_receipts_create
 ON public.saas_inventory_mutation_receipts;
DROP POLICY IF EXISTS saas_checkout_receipts_create
 ON public.saas_checkout_receipts;

ALTER FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 SECURITY DEFINER;
ALTER FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb)
 SECURITY DEFINER;

-- Authenticated callers may ONLY use these public functions; direct receipt
-- inserts remain blocked. No definer functions are callable by anon/public.
REVOKE ALL ON FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_adjust_stock_once(uuid,uuid,text,numeric,integer,uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_checkout_once(uuid,jsonb,jsonb)
 TO authenticated;
