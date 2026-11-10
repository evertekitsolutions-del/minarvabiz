-- M24 independent SQL-role simulation. READ-ONLY except transaction-local
-- role changes rolled back. This is not real signed JWT two-tenant UAT (#774).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $matrix$
DECLARE t record;v_count bigint;v_checked integer:=0;v_denied integer:=0;v_tables integer:=0;
BEGIN
 FOR t IN SELECT c.relname,c.relrowsecurity FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname LOOP
  v_tables:=v_tables+1;
  IF NOT t.relrowsecurity THEN
    RAISE EXCEPTION 'Missing RLS on public table: %',t.relname;
  END IF;
  BEGIN
   EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I',t.relname) INTO v_count;
   v_checked:=v_checked+1;
   IF v_count>0 AND t.relname NOT IN(
    'saas_annual_plans','saas_storefronts','saas_storefront_listings') THEN
     RAISE EXCEPTION 'Nonmember can see private rows: % count %',t.relname,v_count;
   END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=v_denied+1;
  END;
 END LOOP;
 IF v_tables<90 OR v_checked<60 THEN
  RAISE EXCEPTION 'Incomplete RLS sweep: tables %, queryable %, denied %',
  v_tables,v_checked,v_denied;
 END IF;
END;$matrix$;
RESET ROLE;

-- Drop the real QA admin's app role in the CURRENT transaction only.
-- Crucial: SET ROLE occurs as a separate SQL statement BEFORE each DO,
-- so the DO is compiled with authenticated privileges, not postgres.
UPDATE public.organization_members SET role='cashier'
 WHERE org_id='eb99bf50-48bf-4b38-8958-77361a194eeb'
 AND user_id='636f1084-4e6e-493a-95db-bb41350fcc8f';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','636f1084-4e6e-493a-95db-bb41350fcc8f',true);
DO $cashier$
DECLARE v_current_role text;
BEGIN
 BEGIN PERFORM public.saas_register_partner_code_once(gen_random_uuid(),'NOSUCHPARTNER');
  RAISE EXCEPTION 'cashier created partner code';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.saas_start_tenant_trial_once('base',NULL);
  RAISE EXCEPTION 'cashier started trial';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.saas_transition_tenant_subscription_state('active');
  RAISE EXCEPTION 'cashier activated subscription';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.saas_create_campaign_template_once(gen_random_uuid(),
 '5579b37b-f471-49bf-b935-c1fe1efa9aad','Invalid Campaign',
 'whatsapp','This must never be saved');RAISE EXCEPTION 'cashier created campaign';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.saas_finance_post_once(gen_random_uuid(),
 'de99f323-081d-4087-a121-c795cb2c2a15','expense',NULL,1,'QA');
 RAISE EXCEPTION 'cashier posted finance';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.organization_members SET role='admin'
  WHERE user_id='636f1084-4e6e-493a-95db-bb41350fcc8f';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT role INTO v_current_role FROM public.organization_members
 WHERE user_id='636f1084-4e6e-493a-95db-bb41350fcc8f';
 IF v_current_role<>'cashier' THEN RAISE EXCEPTION 'cashier self-promoted';END IF;
 BEGIN PERFORM public.saas_capture_signed_subscription_payment_once(
 'evt_INVALIDATTEMPT','pay_INVALIDATTEMPT','order_INVALIDATTEMPT',
 229900,'INR','live',repeat('f',64));RAISE EXCEPTION 'cashier forged payment';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END;$cashier$;
RESET ROLE;
UPDATE public.organization_members SET role='staff'
 WHERE org_id='eb99bf50-48bf-4b38-8958-77361a194eeb'
 AND user_id='636f1084-4e6e-493a-95db-bb41350fcc8f';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','636f1084-4e6e-493a-95db-bb41350fcc8f',true);
DO $staff$
DECLARE v_role text;
BEGIN
 BEGIN PERFORM public.saas_start_tenant_trial_once('commerce',NULL);
 RAISE EXCEPTION 'staff started ecommerce';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.saas_field_visit_create_once(gen_random_uuid(),
 '4d951f33-a0f1-421d-9995-38c3a83d660b',
 '39b3d73f-c8b3-4803-9904-723bc01bb1dd',
 'Invalid service visit','inspection',now()+interval '1 day');
 RAISE EXCEPTION 'staff created field visit';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.organization_members SET role='admin'
 WHERE user_id='636f1084-4e6e-493a-95db-bb41350fcc8f';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT role INTO v_role FROM public.organization_members
 WHERE user_id='636f1084-4e6e-493a-95db-bb41350fcc8f';
 IF v_role<>'staff' THEN RAISE EXCEPTION 'staff self-promoted';END IF;
END;$staff$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: every public table RLS, nonmember private data isolation, cashier/staff privilege-escalation denial; simulated JWT only; all role edits ROLLED BACK' result;
