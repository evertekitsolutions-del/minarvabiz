-- M22 Razorpay signed-payment receipt inbox; only server-side service_role may write.
-- Signature verification MUST occur against exact raw body in /api/billing/razorpay/webhook
-- before this RPC; sandbox receipts never grant live entitlements or real partner payouts.
CREATE TABLE IF NOT EXISTS public.saas_subscription_checkout_intents(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 plan_code text NOT NULL REFERENCES public.saas_annual_plans(code),
 provider_order_id text NOT NULL UNIQUE CHECK(length(provider_order_id) BETWEEN 8 AND 100),
 expected_amount_paise bigint NOT NULL CHECK(expected_amount_paise>0),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 environment text NOT NULL CHECK(environment IN('sandbox','live')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.saas_subscription_payment_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 intent_id uuid NOT NULL UNIQUE REFERENCES public.saas_subscription_checkout_intents(id),
 provider_event_id text NOT NULL UNIQUE,
 provider_payment_id text NOT NULL UNIQUE,
 provider_order_id text NOT NULL UNIQUE,
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 currency text NOT NULL CHECK(currency='INR'),
 environment text NOT NULL CHECK(environment IN('sandbox','live')),
 raw_body_sha256 text NOT NULL CHECK(raw_body_sha256 ~ '^[0-9a-f]{64}$'),
 verification_method text NOT NULL DEFAULT 'razorpay-raw-body-hmac-sha256'
 CHECK(verification_method='razorpay-raw-body-hmac-sha256'),
 captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_partner_referral_commissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referral_id uuid NOT NULL REFERENCES public.saas_partner_referrals(id),
 partner_org_id uuid NOT NULL REFERENCES public.organizations(id),
 referred_org_id uuid NOT NULL REFERENCES public.organizations(id),
 verified_receipt_id uuid NOT NULL UNIQUE REFERENCES public.saas_subscription_payment_receipts(id),
 environment text NOT NULL CHECK(environment IN('sandbox','live')),
 paid_gross_inr numeric(12,2) NOT NULL CHECK(paid_gross_inr>0),
 commission_rate numeric(5,2) NOT NULL DEFAULT 10 CHECK(commission_rate=10),
 commission_inr numeric(12,2) NOT NULL CHECK(commission_inr>=0),
 payout_state text NOT NULL CHECK(payout_state IN('earned_unpaid','sandbox_not_payable')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(referred_org_id,environment),
 CHECK((environment='sandbox' AND payout_state='sandbox_not_payable')
    OR(environment='live' AND payout_state='earned_unpaid'))
);
CREATE INDEX IF NOT EXISTS saas_subscription_intents_org_idx
 ON public.saas_subscription_checkout_intents(org_id,created_at DESC);
CREATE INDEX IF NOT EXISTS saas_subscription_payment_receipts_org_idx
 ON public.saas_subscription_payment_receipts(org_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS saas_partner_commissions_partner_idx
 ON public.saas_partner_referral_commissions(partner_org_id,recorded_at DESC);
ALTER TABLE public.saas_subscription_checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscription_payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_partner_referral_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_subscription_intents_tenant_read ON public.saas_subscription_checkout_intents
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m WHERE m.org_id=org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_subscription_receipts_tenant_read ON public.saas_subscription_payment_receipts
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m WHERE m.org_id=org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_partner_commissions_tenant_read ON public.saas_partner_referral_commissions
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m
 WHERE (m.org_id=referred_org_id OR m.org_id=partner_org_id) AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_subscription_checkout_intents,
 public.saas_subscription_payment_receipts,public.saas_partner_referral_commissions
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_subscription_checkout_intents,
 public.saas_subscription_payment_receipts,public.saas_partner_referral_commissions TO authenticated;

-- Backend first creates a verified Razorpay Orders API order with fixed plan amount,
-- then registers that provider-issued ID with this strictly service-only function.
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
 SELECT (annual_inr*100)::bigint INTO v_amount FROM public.saas_annual_plans
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
 id,org_id,plan_code,provider_order_id,expected_amount_paise,environment,created_by)
 VALUES(p_intent_id,p_org_id,p_plan_code,p_provider_order_id,v_amount,p_environment,p_actor_user_id);
 IF v_s.state<>'pending_payment' THEN
  UPDATE public.saas_tenant_subscriptions SET state='pending_payment',
   updated_at=now(),version=version+1 WHERE org_id=p_org_id;
  INSERT INTO public.saas_subscription_state_events(org_id,previous_state,next_state,reason,created_by)
  VALUES(p_org_id,v_s.state,'pending_payment','gateway checkout order created',p_actor_user_id);
 END IF;
 RETURN jsonb_build_object('intent_id',p_intent_id,'amount_paise',v_amount,'idempotent',false);
END;$fn$;

-- Called only after a committed HMAC-verified receipt. Never call from a public client.
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
 v_commission:=round(v_paid*0.10,2);
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

CREATE OR REPLACE FUNCTION public.saas_capture_signed_subscription_payment_once(
 p_provider_event_id text,p_provider_payment_id text,p_provider_order_id text,
 p_amount_paise bigint,p_currency text,p_environment text,p_raw_body_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_intent public.saas_subscription_checkout_intents%ROWTYPE;
 v_sub public.saas_tenant_subscriptions%ROWTYPE;
 v_old public.saas_subscription_payment_receipts%ROWTYPE;
 v_receipt_id uuid;v_commission jsonb;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'Verified webhook service role required' USING ERRCODE='42501';END IF;
 IF p_provider_event_id IS NULL OR length(p_provider_event_id) NOT BETWEEN 8 AND 150
 OR p_provider_payment_id !~ '^pay_[A-Za-z0-9]{5,100}$'
 OR p_provider_order_id !~ '^order_[A-Za-z0-9]{5,90}$'
 OR p_amount_paise IS NULL OR p_amount_paise<=0 OR p_currency<>'INR'
 OR p_environment NOT IN('sandbox','live')
 OR p_raw_body_sha256 !~ '^[0-9a-f]{64}$' THEN
 RAISE EXCEPTION 'Invalid gateway receipt envelope' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-payment-order:'||p_provider_order_id,0));
 SELECT * INTO v_old FROM public.saas_subscription_payment_receipts
 WHERE provider_event_id=p_provider_event_id
 OR provider_payment_id=p_provider_payment_id
 OR provider_order_id=p_provider_order_id;
 IF FOUND THEN
  IF v_old.provider_event_id<>p_provider_event_id OR
   v_old.provider_payment_id<>p_provider_payment_id OR
   v_old.provider_order_id<>p_provider_order_id OR
   v_old.amount_paise<>p_amount_paise OR v_old.currency<>p_currency OR
   v_old.environment<>p_environment OR
   v_old.raw_body_sha256<>p_raw_body_sha256 THEN
   RAISE EXCEPTION 'Replay/collision: payment event already processed differently'
    USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('receipt_id',v_old.id,'idempotent',true,'environment',v_old.environment);
 END IF;
 SELECT * INTO v_intent FROM public.saas_subscription_checkout_intents
 WHERE provider_order_id=p_provider_order_id FOR UPDATE;
 IF NOT FOUND OR v_intent.environment<>p_environment OR
 v_intent.currency<>p_currency OR v_intent.expected_amount_paise<>p_amount_paise
 OR v_intent.consumed_at IS NOT NULL OR v_intent.expires_at<now() THEN
 RAISE EXCEPTION 'Payment not tied to an unexpired immutable merchant order/amount'
  USING ERRCODE='42501';END IF;
 SELECT * INTO v_sub FROM public.saas_tenant_subscriptions
 WHERE org_id=v_intent.org_id FOR UPDATE;
 IF NOT FOUND OR v_sub.state<>'pending_payment'
 OR v_sub.plan_code<>v_intent.plan_code THEN
 RAISE EXCEPTION 'Wrong subscription state or amount for captured event' USING ERRCODE='23514';END IF;
 INSERT INTO public.saas_subscription_payment_receipts(
 org_id,intent_id,provider_event_id,provider_payment_id,provider_order_id,
 amount_paise,currency,environment,raw_body_sha256)
 VALUES(v_intent.org_id,v_intent.id,p_provider_event_id,p_provider_payment_id,
  p_provider_order_id,p_amount_paise,p_currency,p_environment,p_raw_body_sha256)
 RETURNING id INTO v_receipt_id;
 UPDATE public.saas_subscription_checkout_intents SET consumed_at=now()
 WHERE id=v_intent.id;
 UPDATE public.saas_tenant_subscriptions SET
 state='active',paid_through=now()+interval '1 year',
 payment_environment=p_environment,grace_ends_at=NULL,version=version+1,updated_at=now()
 WHERE org_id=v_intent.org_id;
 INSERT INTO public.saas_subscription_state_events(org_id,previous_state,next_state,reason)
 VALUES(v_intent.org_id,v_sub.state,'active',
 'HMAC-verified Razorpay captured '||p_environment||' receipt');
 v_commission:=public.record_partner_referral_commission(v_receipt_id);
 RETURN jsonb_build_object('receipt_id',v_receipt_id,'idempotent',false,
 'org_id',v_intent.org_id,'state','active','environment',p_environment,
 'commission',v_commission);
END;$fn$;

REVOKE ALL ON FUNCTION public.saas_register_checkout_intent_once(uuid,uuid,uuid,text,text,text),
 public.record_partner_referral_commission(uuid),
 public.saas_capture_signed_subscription_payment_once(text,text,text,bigint,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_register_checkout_intent_once(uuid,uuid,uuid,text,text,text),
 public.record_partner_referral_commission(uuid),
 public.saas_capture_signed_subscription_payment_once(text,text,text,bigint,text,text,text)
 TO service_role;
