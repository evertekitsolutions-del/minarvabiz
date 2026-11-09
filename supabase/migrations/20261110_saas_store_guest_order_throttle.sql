-- M17: throttle repeated anonymous guest drafts without touching payment or inventory.
-- Trigger runs only for new inserts; replay of the same order ID returns before INSERT.
CREATE INDEX IF NOT EXISTS saas_store_guest_rate_lookup
 ON public.saas_storefront_draft_orders(storefront_id,buyer_phone,created_at DESC);

CREATE OR REPLACE FUNCTION public.saas_store_guest_order_throttle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_recent integer;
BEGIN
  -- Serialize concurrent requests for the same storefront and buyer phone.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('guest-rate:' || NEW.storefront_id::text || ':' || NEW.buyer_phone,0)
  );
  SELECT count(*) INTO v_recent
    FROM public.saas_storefront_draft_orders
   WHERE storefront_id=NEW.storefront_id
     AND buyer_phone=NEW.buyer_phone
     AND created_at > pg_catalog.now() - interval '1 hour';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Too many orders. Please contact the store or retry later.'
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_store_guest_order_throttle() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_store_guest_order_throttle_insert
 ON public.saas_storefront_draft_orders;
CREATE TRIGGER saas_store_guest_order_throttle_insert
 BEFORE INSERT ON public.saas_storefront_draft_orders
 FOR EACH ROW EXECUTE FUNCTION public.saas_store_guest_order_throttle();
