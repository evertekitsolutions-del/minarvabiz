-- Owner M25 10-stage SQL dress rehearsal. Safe on live Supabase: BEGIN/ROLLBACK.
-- Authenticated ROLE SQL simulations are NOT real signed JWT/browser UAT; no actual
-- customer/card charge, hardware printing, email, courier, SMS or coupon redemption.
-- Requires synthetic tenant A + QA fixtures from M7-M19, not production customer data.
BEGIN;
INSERT INTO public.saas_partner_codes(id,partner_org_id,code,created_by)
VALUES('83f49b3a-64b5-4d43-bccc-65f07717e107',
 '51a5b427-673c-472e-a560-93a125bf556c',
 'QAPARTNERB2026','636f1084-4e6e-493a-95db-bb41350fcc8f');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','636f1084-4e6e-493a-95db-bb41350fcc8f',true);

-- 1: Existing tenant's verified membership & new 30-day trial (NOT fresh signup).
SELECT public.saas_start_tenant_trial_once('commerce','QAPARTNERB2026');
DO $$
BEGIN
 IF (public.saas_subscription_entitled('ecommerce')->>'allowed')<>'true' THEN
 RAISE EXCEPTION 'Step1: commerce trial is not entitled';END IF;
END$$;

-- 2: Supplier PO + confirmed receipt moves a unit into branch stock once.
SELECT public.saas_create_purchase_order(
 'ca741181-aaab-41d1-9a91-a8126bc11321',
 '1200b3f2-9d13-4d84-89fa-aacc71833dcb',
 '4d951f33-a0f1-421d-9995-38c3a83d660b',
 '[{"product_id":"c1414e8d-c600-49ea-b4e8-24c40d1b3849","quantity":1,"unit_cost":10}]'::jsonb);
SELECT public.saas_receive_purchase_order(
 'ca741181-aaab-41d1-9a91-a8126bc11322',
 'ca741181-aaab-41d1-9a91-a8126bc11321');

-- 3: Verify two previously created boutique variants (NOT a new creation).
DO $$
BEGIN
 IF (SELECT count(*) FROM public.products WHERE id IN(
 '01546662-102d-4a1a-9b7d-5c0ef0ebbd67',
 'a065fd01-6f2f-44cf-9d3c-1f90ea7ad6f9')
 AND org_id='eb99bf50-48bf-4b38-8958-77361a194eeb')<>2
 THEN RAISE EXCEPTION 'Step3: two boutique child variants not present';END IF;
END$$;

-- 4: Actual atomic POS sale; thermal and barcode print are separate CI contracts.
SELECT public.create_sale(
 jsonb_build_object('id','ca741181-aaab-41d1-9a91-a8126bc11323'::uuid,
 'invoice_number','QA-M25-20261110-001','branch_id',
 '4d951f33-a0f1-421d-9995-38c3a83d660b'::uuid,
 'subtotal',120,'tax_amount',0,'total',120,'paid_amount',0,'balance_amount',120,
 'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),
 'product_id','c1414e8d-c600-49ea-b4e8-24c40d1b3849'::uuid,
 'product_name','QA-20261109-TenantA-Test-Garment','quantity',1,
 'unit_price',120,'line_total',120))), '[]'::jsonb,false);

-- 5: Fresh laundry garment intake -> tagged -> washing -> ironing -> QC -> ready -> delivered.
SELECT public.saas_laundry_intake(
 'ca741181-aaab-41d1-9a91-a8126bc11324',
 '18667cef-5b17-494f-8812-0f5f4a3df17f',
 'QA M25 Customer','QA M25 Garment','MB-FINALWAVE20261110',1,'QA test only');
DO $$
DECLARE stage text;v_version integer;
BEGIN
 FOREACH stage IN ARRAY ARRAY['tagged','washing','ironing','qc','ready','delivered'] LOOP
  SELECT version INTO v_version FROM public.saas_laundry_garment_jobs
   WHERE id='ca741181-aaab-41d1-9a91-a8126bc11324';
  PERFORM public.saas_laundry_step(
    'ca741181-aaab-41d1-9a91-a8126bc11324',v_version,stage);
 END LOOP;
 IF (SELECT j.stage FROM public.saas_laundry_garment_jobs j
 WHERE id='ca741181-aaab-41d1-9a91-a8126bc11324')<>'delivered' THEN
 RAISE EXCEPTION 'Step5: laundry did not deliver'; END IF;
END$$;

RESET ROLE;
UPDATE public.saas_storefronts SET published=true
 WHERE id='5579b37b-f471-49bf-b935-c1fe1efa9aad';
SET LOCAL ROLE anon;

-- 6: Real draft reservation through guest RPC, followed by merchant invoice/stock confirmation.
SELECT public.saas_storefront_checkout_reserved(
 'ca741181-aaab-41d1-9a91-a8126bc11325',
 'minarva-qa-tenant-a','QA M25 Guest','+919222220025',
 '[{"product_id":"c1414e8d-c600-49ea-b4e8-24c40d1b3849","quantity":1}]'::jsonb);

-- 7: Opt-in marketing capture + coupon eligibility preview.
SELECT public.saas_capture_storefront_lead(
 'ca741181-aaab-41d1-9a91-a8126bc11326','minarva-qa-tenant-a',
 'QA M25 Lead','+919222220026','whatsapp','QA dress rehearsal consent',true);
DO $$
DECLARE promo jsonb;
BEGIN
 promo:=public.saas_preview_store_coupon('minarva-qa-tenant-a','QA10OFF',120);
 IF promo->>'eligible' IS DISTINCT FROM 'true' OR
 (promo->>'discount')::numeric<>12 OR promo->>'preview_only' IS DISTINCT FROM 'true' THEN
 RAISE EXCEPTION 'Step7: promo preview failed';END IF;
 -- IMPORTANT: promo is ONLY a preview, not an actual checkout invoice redemption.
END$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','636f1084-4e6e-493a-95db-bb41350fcc8f',true);
SELECT public.saas_online_order_transition(
 'ca741181-aaab-41d1-9a91-a8126bc11331',
 'ca741181-aaab-41d1-9a91-a8126bc11325',
 'confirmed','4d951f33-a0f1-421d-9995-38c3a83d660b',NULL);
SELECT public.saas_queue_lead_campaign_once(
 'ca741181-aaab-41d1-9a91-a8126bc11327',
 'ca741181-aaab-41d1-9a91-a8126bc11326',
 '91dea498-4aa8-4fb8-8769-70f386fc4d1c');

-- 8: Fresh field service visit, inspection, HTTPS evidence link and synthetic signature.
SELECT public.saas_field_visit_create_once(
 'ca741181-aaab-41d1-9a91-a8126bc11328',
 '4d951f33-a0f1-421d-9995-38c3a83d660b',
 '39b3d73f-c8b3-4803-9904-723bc01bb1dd',
 'QA M25 Service Site','inspection',now()+interval '1 day');
SELECT public.saas_field_visit_event_once(
 'ca741181-aaab-41d1-9a91-a8126bc11329',
 'ca741181-aaab-41d1-9a91-a8126bc11328',
 'checklist','{"items":[{"name":"Power check","passed":true}]}'::jsonb);
SELECT public.saas_field_visit_event_once(
 'ca741181-aaab-41d1-9a91-a8126bc1132a',
 'ca741181-aaab-41d1-9a91-a8126bc11328',
 'evidence','{"kind":"photo","url":"https://example.com/qa-m25-placeholder.jpg"}'::jsonb);
SELECT public.saas_field_visit_event_once(
 'ca741181-aaab-41d1-9a91-a8126bc1132b',
 'ca741181-aaab-41d1-9a91-a8126bc11328',
 'handover','{"consent":true,"signed_name":"QA Synthetic M25","signature_png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pT40AAAAASUVORK5CYII="}'::jsonb);

-- 9: Vendor paid against the exact new GRN, cash register and daybook sourced from real rows.
SELECT public.saas_finance_post_once(
 'ca741181-aaab-41d1-9a91-a8126bc1132c',
 'de99f323-081d-4087-a121-c795cb2c2a15',
 'supplier_payment','ca741181-aaab-41d1-9a91-a8126bc11321',
 10,'QA M25 day closing supplier payment');
DO $$
DECLARE report jsonb;ledger jsonb;v_stock numeric;v_total numeric;
BEGIN
 report:=public.saas_finance_daybook(current_date,current_date,NULL);
 ledger:=public.saas_party_ledger_summary('supplier',
 '1200b3f2-9d13-4d84-89fa-aacc71833dcb');
 IF report->>'financial_statement_status' IS DISTINCT FROM 'provisional_before_tax_reconciliation'
 OR ledger IS NULL THEN
 RAISE EXCEPTION 'Step9: provisional ledger/daybook not available';END IF;
 SELECT stock_quantity INTO v_stock FROM public.products
 WHERE id='c1414e8d-c600-49ea-b4e8-24c40d1b3849';
 SELECT sum(quantity) INTO v_total FROM public.saas_branch_stock
 WHERE product_id='c1414e8d-c600-49ea-b4e8-24c40d1b3849';
 IF v_stock<>v_total THEN RAISE EXCEPTION 'Step9: branch/global stock mismatch';END IF;
END$$;

-- 10: Read-only tenant archive export -> SHA256 / org / count validation.
DO $$
DECLARE snapshot jsonb;validated jsonb;
BEGIN
 snapshot:=public.saas_tenant_backup_export(200);
 validated:=public.saas_tenant_backup_validate(snapshot);
 IF validated->>'valid' IS DISTINCT FROM 'true'
 OR validated->>'restore_applied' IS DISTINCT FROM 'false' OR
 validated->>'sha256' IS DISTINCT FROM snapshot->>'sha256'
 THEN RAISE EXCEPTION 'Step10: tenant backup preflight failed';END IF;
END$$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: M25 synthetic SQL rehearsal 10 checkpoint assertions (partial: no real signup/hardware/coupon redemption/verified payment); live tenant QA data preserved by ROLLBACK' AS result;
