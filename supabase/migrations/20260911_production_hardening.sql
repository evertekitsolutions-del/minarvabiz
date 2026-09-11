-- Minarva Biz production database hardening; idempotent and safe for fresh or existing deployments.

-- Tighten SECURITY DEFINER helpers exposed through public schema.
ALTER FUNCTION public.user_org_ids() SET search_path = public;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM anon;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO service_role;

-- Helpers that do not need caller-controlled search_path.
ALTER FUNCTION public.is_authenticated() SET search_path = public;
ALTER FUNCTION public.set_trial_registrations_updated_at() SET search_path = public;

-- Outbox is a server-synchronized table; expose it only through tenant-scoped authenticated access.
ALTER TABLE IF EXISTS public.outbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_events_auth_all ON public.outbox_events;
DROP POLICY IF EXISTS outbox_events_org_select ON public.outbox_events;
DROP POLICY IF EXISTS outbox_events_org_write ON public.outbox_events;
CREATE POLICY outbox_events_org_select ON public.outbox_events
  FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()));
CREATE POLICY outbox_events_org_write ON public.outbox_events
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()));

-- Cover common foreign keys used by joins and cascades.
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON public.customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_laundry_orders_customer_id ON public.laundry_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_measurement_profiles_customer_id ON public.measurement_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_expenses_order_id ON public.order_expenses(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_purchases_order_id ON public.purchases(order_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);

-- Remove redundant duplicate unique indexes introduced by the two historical trial migrations.
DROP INDEX IF EXISTS public.idx_trial_registrations_device;
DROP INDEX IF EXISTS public.idx_trial_registrations_email;
DROP INDEX IF EXISTS public.idx_trial_registrations_phone;
