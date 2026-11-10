-- GST-compliant pricing correction: all four annual plans are advertised EXCLUSIVE of 18% GST.
-- Signed provider order must be plan base + 18% GST; partner 10% calculated only on pre-GST paid plan amount.
ALTER TABLE public.saas_subscription_checkout_intents
 ADD COLUMN IF NOT EXISTS base_amount_paise bigint,
 ADD COLUMN IF NOT EXISTS gst_amount_paise bigint;
CREATE OR REPLACE FUNCTION public.saas_register_checkout_intent_once(
 p_intent_id uuid,p_org_id uuid,p_actor_user_id uuid,
 p_plan_code text,p_provider_order_id text,p_environment text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_s public.saas_tenant_subscriptions%ROWTYPE;
 v_old public.saas_subscription_checkout_intents%ROWTYPE;
 v_amount bigint;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'Payment server role required' USING ERRCODE='42501';END IF;
 IF p_intent_id IS NULL OR p_org_id IS NULL OR p_actor_user_id IS NULL OR
 p_environment NOT IN('sandbox','live') OR
 p_provider_order_id !~ '^order_[A-Za-z0-9]{5,90}$' THEN
 RAISE EXCEPTION 'Invalid checkout intent' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_members m
 WHERE m.org_id=p_org_id AND m.user_id=p_actor_user_id
 AND m.role IN('super_admin','admin')) THEN
 RAISE EXCEPTION 'Checkout actor not an administrator of that tenant' USING ERRCODE='42501';END IF;
 SELECT * INTO v_s FROM public.saas_tenant_subscriptions WHERE org_id=p_org_id FOR UPDATE;
 IF NOT FOUND OR v_s.state NOT IN('pending_payment','trial','expired','grace_period')
  OR v_s.plan_code<>p_plan_code THEN
 RAISE EXCEPTION 'Subscription must request payment for its exact plan' USING ERRCODE='23514';END IF;
 SELECT (annual_inr*118)::bigint INTO v_amount FROM public.saas_annual_plans
 WHERE code=p_plan_code AND is_available=true;
 IF v_amount IS NULL THEN RAISE EXCEPTION 'Unknown annual plan' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-subscription-order:'||p_org_id::text,0));
 SELECT * INTO v_old FROM public.saas_subscription_checkout_intents
 WHERE id=p_intent_id OR provider_order_id=p_provider_order_id;
 IF FOUND THEN
  IF v_old.id<>p_intent_id OR v_old.org_id<>p_org_id OR
   v_old.plan_code<>p_plan_code OR v_old.environment<>p_environment OR
   v_old.provider_order_id<>p_provider_order_id OR
   v_old.expected_amount_paise<>v_amount THEN
   RAISE EXCEPTION 'Checkout intent ID/order collision' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('intent_id',p_intent_id,'idempotent',true,
   'amount_paise',v_amount);
 END IF;
 INSERT INTO public.saas_subscription_checkout_intents(
 id,org_id,plan_code,provider_order_id,expected_amount_paise,
 base_amount_paise,gst_amount_paise,environment,created_by)
 VALUES(p_intent_id,p_org_id,p_plan_code,p_provider_order_id,v_amount,
 (v_amount*100/118)::bigint,v_amount-(v_amount*100/118)::bigint,
 p_environment,p_actor_user_id);
 IF v_s.state<>'pending_payment' THEN
  UPDATE public.saas_tenant_subscriptions SET state='pending_payment',
   updated_at=now(),version=version+1 WHERE org_id=p_org_id;
  INSERT INTO public.saas_subscription_state_events(org_id,previous_state,next_state,reason,created_by)
  VALUES(p_org_id,v_s.state,'pending_payment','gateway checkout order created',p_actor_user_id);
 END IF;
 RETURN jsonb_build_object('intent_id',p_intent_id,'amount_paise',v_amount,'idempotent',false);
END;$fn$;
CREATE OR REPLACE FUNCTION public.record_partner_referral_commission(
 p_payment_receipt_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_receipt public.saas_subscription_payment_receipts%ROWTYPE;
 v_ref public.saas_partner_referrals%ROWTYPE;
 v_old public.saas_partner_referral_commissions%ROWTYPE;
 v_paid numeric(12,2);v_commission numeric(12,2);v_status text;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'Billing service role required' USING ERRCODE='42501';END IF;
 SELECT * INTO v_receipt FROM public.saas_subscription_payment_receipts
 WHERE id=p_payment_receipt_id;
 IF NOT FOUND OR v_receipt.verification_method<>'razorpay-raw-body-hmac-sha256'
 THEN RAISE EXCEPTION 'Verified payment receipt required' USING ERRCODE='42501';END IF;
 SELECT * INTO v_ref FROM public.saas_partner_referrals
 WHERE referred_org_id=v_receipt.org_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('referral',false,'commission_inr',0);END IF;
 SELECT * INTO v_old FROM public.saas_partner_referral_commissions
 WHERE referred_org_id=v_receipt.org_id AND environment=v_receipt.environment;
 IF FOUND THEN RETURN jsonb_build_object('referral',true,'commission_inr',v_old.commission_inr,
   'commission_id',v_old.id,'idempotent',true);END IF;
 v_paid:=round(v_receipt.amount_paise::numeric/100,2);
 SELECT round(p.annual_inr*0.10,2) INTO v_commission
 FROM public.saas_subscription_checkout_intents i
 JOIN public.saas_annual_plans p ON p.code=i.plan_code
 WHERE i.id=v_receipt.intent_id;
 v_status:=CASE WHEN v_receipt.environment='live' THEN 'earned_unpaid'
  ELSE 'sandbox_not_payable' END;
 INSERT INTO public.saas_partner_referral_commissions(
 referral_id,partner_org_id,referred_org_id,verified_receipt_id,
 environment,paid_gross_inr,commission_rate,commission_inr,payout_state)
 VALUES(v_ref.id,v_ref.partner_org_id,v_ref.referred_org_id,p_payment_receipt_id,
 v_receipt.environment,v_paid,10,v_commission,v_status);
 RETURN jsonb_build_object('referral',true,'commission_inr',v_commission,
 'payout_state',v_status,'idempotent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_register_checkout_intent_once(uuid,uuid,uuid,text,text,text),
 public.record_partner_referral_commission(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_register_checkout_intent_once(uuid,uuid,uuid,text,text,text),
 public.record_partner_referral_commission(uuid) TO service_role;
