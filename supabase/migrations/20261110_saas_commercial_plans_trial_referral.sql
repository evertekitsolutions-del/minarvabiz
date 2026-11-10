-- M20/M21 Annual INR pricing, 30-day tenant trial, partner attribution and module entitlements.
-- No direct authenticated mutations; all transitions audited through controlled RPCs.
CREATE TABLE IF NOT EXISTS public.saas_annual_plans (
 code text PRIMARY KEY CHECK(code IN('base','growth','website','commerce')),
 display_name text NOT NULL,
 annual_inr numeric(12,2) NOT NULL CHECK(annual_inr>0),
 entitlements text[] NOT NULL,
 is_available boolean NOT NULL DEFAULT true
);
INSERT INTO public.saas_annual_plans(code,display_name,annual_inr,entitlements)
VALUES
 ('base','Base — Billing, Stock, Accounts',2299,ARRAY['billing','stock','accounts']),
 ('growth','Growth — CRM, Staff, Services',4499,ARRAY['billing','stock','accounts','crm','staff','services']),
 ('website','Business — Website & Marketing',6699,ARRAY['billing','stock','accounts','crm','staff','services','website','marketing']),
 ('commerce','Full — E-Commerce & Marketing',8899,ARRAY['billing','stock','accounts','crm','staff','services','website','marketing','ecommerce'])
ON CONFLICT (code) DO NOTHING;
ALTER TABLE public.saas_annual_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_annual_plans_public_read ON public.saas_annual_plans
 FOR SELECT TO anon,authenticated USING(is_available=true);
REVOKE ALL ON public.saas_annual_plans FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_annual_plans TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.saas_partner_codes(
 id uuid PRIMARY KEY,
 partner_org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{6,16}$'),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_partner_referrals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referred_org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
 partner_org_id uuid NOT NULL REFERENCES public.organizations(id),
 partner_code_id uuid NOT NULL REFERENCES public.saas_partner_codes(id),
 attributed_at timestamptz NOT NULL DEFAULT now(),
 CHECK(referred_org_id<>partner_org_id)
);
CREATE TABLE IF NOT EXISTS public.saas_tenant_subscriptions(
 org_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 plan_code text NOT NULL REFERENCES public.saas_annual_plans(code),
 state text NOT NULL DEFAULT 'trial'
 CHECK(state IN('trial','pending_payment','active','grace_period','expired','cancelled')),
 trial_started_at timestamptz NOT NULL DEFAULT now(),
 trial_ends_at timestamptz NOT NULL,
 paid_through timestamptz,
 grace_ends_at timestamptz,
 payment_environment text NOT NULL DEFAULT 'none'
 CHECK(payment_environment IN('none','sandbox','live')),
 version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(trial_ends_at=trial_started_at+interval '30 days')
);
CREATE TABLE IF NOT EXISTS public.saas_subscription_state_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 previous_state text NOT NULL,
 next_state text NOT NULL,
 reason text NOT NULL,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_subscription_state_events_org_idx
 ON public.saas_subscription_state_events(org_id,created_at DESC);

ALTER TABLE public.saas_partner_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_partner_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscription_state_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_partner_codes_tenant_read ON public.saas_partner_codes
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m WHERE m.org_id=partner_org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_partner_referrals_tenant_read ON public.saas_partner_referrals
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m WHERE (m.org_id=referred_org_id OR m.org_id=partner_org_id) AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_tenant_subscriptions_tenant_read ON public.saas_tenant_subscriptions
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m WHERE m.org_id=org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_subscription_state_events_tenant_read ON public.saas_subscription_state_events
 FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.organization_members m WHERE m.org_id=org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_partner_codes,public.saas_partner_referrals,
 public.saas_tenant_subscriptions,public.saas_subscription_state_events
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_partner_codes,public.saas_partner_referrals,
 public.saas_tenant_subscriptions,public.saas_subscription_state_events TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_register_partner_code_once(
 p_id uuid,p_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());v_code text:=upper(btrim(coalesce(p_code,'')));
 v_old public.saas_partner_codes%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_org IS NULL OR v_user IS NULL
 OR NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin']) THEN
 RAISE EXCEPTION 'Only organization admins may create partner codes' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR v_code !~ '^[A-Z0-9]{6,16}$'
 THEN RAISE EXCEPTION 'Partner code must be 6-16 alphanumeric characters' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-code:'||v_org::text,0));
 SELECT * INTO v_old FROM public.saas_partner_codes WHERE partner_org_id=v_org OR id=p_id;
 IF FOUND THEN
  IF v_old.id<>p_id OR v_old.partner_org_id<>v_org OR v_old.code<>v_code
   THEN RAISE EXCEPTION 'Partner code already registered differently' USING ERRCODE='23505';END IF;
  RETURN pg_catalog.jsonb_build_object('code_id',p_id,'code',v_code,'idempotent',true);
 END IF;
 INSERT INTO public.saas_partner_codes(id,partner_org_id,code,created_by)
 VALUES(p_id,v_org,v_code,v_user);
 RETURN pg_catalog.jsonb_build_object('code_id',p_id,'code',v_code,'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_start_tenant_trial_once(
 p_plan_code text,p_partner_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());v_partner_code text:=nullif(upper(btrim(coalesce(p_partner_code,''))),'');
 v_partner public.saas_partner_codes%ROWTYPE;v_prior public.saas_tenant_subscriptions%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_org IS NULL OR v_user IS NULL OR
 NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin']) THEN
 RAISE EXCEPTION 'Only tenant admins can start subscription trials' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.saas_annual_plans WHERE code=p_plan_code AND is_available)
 THEN RAISE EXCEPTION 'Unknown annual plan' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenant-subscription:'||v_org::text,0));
 SELECT * INTO v_prior FROM public.saas_tenant_subscriptions WHERE org_id=v_org;
 IF FOUND THEN
  IF v_prior.plan_code<>p_plan_code THEN
   RAISE EXCEPTION 'Trial already started; use verified billing plan change workflow'
   USING ERRCODE='23505'; END IF;
  RETURN pg_catalog.jsonb_build_object('org_id',v_org,'state',v_prior.state,
  'trial_ends_at',v_prior.trial_ends_at,'idempotent',true);
 END IF;
 IF v_partner_code IS NOT NULL THEN
  SELECT * INTO v_partner FROM public.saas_partner_codes WHERE code=v_partner_code;
  IF NOT FOUND OR v_partner.partner_org_id=v_org THEN
   RAISE EXCEPTION 'Partner code invalid or self-referral' USING ERRCODE='22023';END IF;
 END IF;
 INSERT INTO public.saas_tenant_subscriptions(org_id,plan_code,trial_ends_at,created_by)
 VALUES(v_org,p_plan_code,pg_catalog.now()+interval '30 days',v_user);
 INSERT INTO public.saas_subscription_state_events(org_id,previous_state,next_state,reason,created_by)
 VALUES(v_org,'new','trial','30-day tenant signup trial',v_user);
 IF v_partner_code IS NOT NULL THEN
  INSERT INTO public.saas_partner_referrals(referred_org_id,partner_org_id,partner_code_id)
  VALUES(v_org,v_partner.partner_org_id,v_partner.id);
 END IF;
 RETURN pg_catalog.jsonb_build_object('org_id',v_org,'state','trial','trial_days',30,
  'trial_ends_at',(SELECT trial_ends_at FROM public.saas_tenant_subscriptions WHERE org_id=v_org),
  'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_transition_tenant_subscription_state(
 p_target text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());v_sub public.saas_tenant_subscriptions%ROWTYPE;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_org IS NULL OR v_user IS NULL OR
 NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin']) THEN
 RAISE EXCEPTION 'Subscription admin required' USING ERRCODE='42501';END IF;
 SELECT * INTO v_sub FROM public.saas_tenant_subscriptions WHERE org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Start tenant trial before subscribing' USING ERRCODE='23514';END IF;
 IF v_sub.state=p_target THEN
  RETURN pg_catalog.jsonb_build_object('state',p_target,'idempotent',true);
 END IF;
 IF NOT((v_sub.state='trial' AND p_target='pending_payment')
 OR(v_sub.state='expired' AND p_target='pending_payment')
 OR(v_sub.state='grace_period' AND p_target='pending_payment')
 OR(v_sub.state IN('active','pending_payment','grace_period') AND p_target='cancelled'))
 THEN RAISE EXCEPTION 'Verified paid receipt required for activation; illegal transition' USING ERRCODE='42501';END IF;
 UPDATE public.saas_tenant_subscriptions SET state=p_target,version=version+1,updated_at=now()
 WHERE org_id=v_org;
 INSERT INTO public.saas_subscription_state_events(org_id,previous_state,next_state,reason,created_by)
 VALUES(v_org,v_sub.state,p_target,'tenant-initiated subscription state',v_user);
 RETURN pg_catalog.jsonb_build_object('state',p_target,'previous',v_sub.state,'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_subscription_entitled(
 p_feature text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_sub public.saas_tenant_subscriptions%ROWTYPE;
 v_features text[];v_valid boolean;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 SELECT * INTO v_sub FROM public.saas_tenant_subscriptions WHERE org_id=v_org;
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,'state','no_subscription');END IF;
 SELECT entitlements INTO v_features FROM public.saas_annual_plans WHERE code=v_sub.plan_code;
 v_valid:=(v_sub.state='trial' AND now()<v_sub.trial_ends_at)
 OR(v_sub.state='active' AND v_sub.paid_through>now()
  AND v_sub.payment_environment='live');
 RETURN jsonb_build_object('allowed',coalesce(v_valid,false) AND p_feature=ANY(v_features),
 'state',v_sub.state,'plan_code',v_sub.plan_code,'payment_environment',v_sub.payment_environment,
 'trial_ends_at',v_sub.trial_ends_at,'paid_through',v_sub.paid_through);
END;$fn$;

-- Production clock-only transitions; service_role cannot artificially extend paid time.
CREATE OR REPLACE FUNCTION public.saas_advance_due_subscription_state(
 p_org_id uuid,p_target text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_sub public.saas_tenant_subscriptions%ROWTYPE;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 OR p_org_id IS NULL THEN
  RAISE EXCEPTION 'Billing scheduler service role required' USING ERRCODE='42501';END IF;
 SELECT * INTO v_sub FROM public.saas_tenant_subscriptions WHERE org_id=p_org_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found' USING ERRCODE='23514';END IF;
 IF v_sub.state='active' AND p_target='grace_period' AND v_sub.paid_through<=now() THEN
  UPDATE public.saas_tenant_subscriptions SET state='grace_period',
    grace_ends_at=now()+interval '7 days',version=version+1,updated_at=now()
   WHERE org_id=p_org_id;
 ELSIF v_sub.state='grace_period' AND p_target='expired' AND v_sub.grace_ends_at<=now() THEN
  UPDATE public.saas_tenant_subscriptions SET state='expired',version=version+1,updated_at=now()
   WHERE org_id=p_org_id;
 ELSIF v_sub.state IN('trial','pending_payment') AND p_target='expired'
 AND v_sub.trial_ends_at<=now() AND v_sub.paid_through IS NULL THEN
  UPDATE public.saas_tenant_subscriptions SET state='expired',version=version+1,updated_at=now()
   WHERE org_id=p_org_id;
 ELSE RAISE EXCEPTION 'State change not yet due' USING ERRCODE='23514';END IF;
 INSERT INTO public.saas_subscription_state_events(org_id,previous_state,next_state,reason)
 VALUES(p_org_id,v_sub.state,p_target,'verified clock-based expiry scheduler');
 RETURN jsonb_build_object('org_id',p_org_id,'state',p_target);
END;$fn$;

REVOKE ALL ON FUNCTION public.saas_register_partner_code_once(uuid,text),
 public.saas_start_tenant_trial_once(text,text),
 public.saas_transition_tenant_subscription_state(text),
 public.saas_subscription_entitled(text),
 public.saas_advance_due_subscription_state(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_register_partner_code_once(uuid,text),
 public.saas_start_tenant_trial_once(text,text),
 public.saas_transition_tenant_subscription_state(text),
 public.saas_subscription_entitled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_advance_due_subscription_state(uuid,text) TO service_role;
