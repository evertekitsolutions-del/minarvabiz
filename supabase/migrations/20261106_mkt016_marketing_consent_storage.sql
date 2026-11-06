-- MKT-016: additive, opt-in marketing consent storage; not deployed by this PR.
-- All access is denied to client roles until an authenticated service/RPC
-- validates tenant/company/branch membership and records a CAS transition.
CREATE TABLE IF NOT EXISTS public.marketing_consent_current (
  tenant_id text NOT NULL CHECK (length(trim(tenant_id)) > 0),
  company_id text NOT NULL CHECK (length(trim(company_id)) > 0),
  branch_id text NOT NULL CHECK (length(trim(branch_id)) > 0),
  customer_id text NOT NULL CHECK (length(trim(customer_id)) > 0),
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  purpose text NOT NULL CHECK (purpose IN ('promotional','loyalty')),
  action text NOT NULL CHECK (action IN ('opt_in','opt_out')),
  revision bigint NOT NULL CHECK (revision > 0),
  event_id text NOT NULL,
  source text NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, company_id, branch_id, customer_id, channel, purpose)
);
CREATE TABLE IF NOT EXISTS public.marketing_consent_audit (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  customer_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  purpose text NOT NULL CHECK (purpose IN ('promotional','loyalty')),
  action text NOT NULL CHECK (action IN ('opt_in','opt_out')),
  revision bigint NOT NULL CHECK (revision > 0),
  event_id text NOT NULL,
  source text NOT NULL,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, customer_id, channel, purpose, revision),
  UNIQUE (tenant_id, company_id, branch_id, event_id)
);
ALTER TABLE public.marketing_consent_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_current FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_consent_current FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_consent_audit FROM PUBLIC, anon, authenticated;
-- No permissive policies. Do not expose service_role credentials to clients.
-- A future trusted transactional writer must atomically CAS current + append audit,
-- validate actor permissions, and re-read consent immediately before provider send.

-- Trusted server-only atomic writer. EXECUTE grants are the database gate;
-- SECURITY DEFINER changes current_user to the function owner. The host MUST authenticate the actor,
-- resolve tenant/company/branch/customer authorization, and derive all arguments
-- from that trusted context before calling this service_role-only function.
-- Never expose the service_role key in browser/desktop clients.
CREATE OR REPLACE FUNCTION public.record_marketing_consent_event(
  p_tenant_id text, p_company_id text, p_branch_id text,
  p_customer_id text, p_channel text, p_purpose text,
  p_action text, p_revision bigint, p_event_id text,
  p_source text, p_recorded_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  prior public.marketing_consent_current%ROWTYPE;
  audit_prior public.marketing_consent_audit%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR btrim(p_tenant_id) = '' OR
     p_company_id IS NULL OR btrim(p_company_id) = '' OR
     p_branch_id IS NULL OR btrim(p_branch_id) = '' OR
     p_customer_id IS NULL OR btrim(p_customer_id) = '' OR
     p_event_id IS NULL OR btrim(p_event_id) = '' OR
     p_source IS NULL OR btrim(p_source) = '' OR
     p_channel IS NULL OR p_channel NOT IN ('email','sms','whatsapp') OR
     p_purpose IS NULL OR p_purpose NOT IN ('promotional','loyalty') OR
     p_action IS NULL OR p_action NOT IN ('opt_in','opt_out') OR
     p_revision IS NULL OR p_revision < 1 OR p_recorded_at IS NULL
  THEN
    RAISE EXCEPTION 'invalid or unauthorized consent event' USING ERRCODE = '42501';
  END IF;

  -- Serializes concurrent first writes as well as subsequent revisions.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    concat_ws(E'\\x1f',p_tenant_id,p_company_id,p_branch_id,
      p_customer_id,p_channel,p_purpose), 0));

  SELECT * INTO audit_prior FROM public.marketing_consent_audit
    WHERE tenant_id=p_tenant_id AND company_id=p_company_id
      AND branch_id=p_branch_id AND event_id=p_event_id;
  IF FOUND THEN
    IF audit_prior.customer_id=p_customer_id AND
       audit_prior.channel=p_channel AND audit_prior.purpose=p_purpose AND
       audit_prior.action=p_action AND audit_prior.revision=p_revision AND
       audit_prior.source=p_source AND audit_prior.recorded_at=p_recorded_at
    THEN RETURN 'replayed'; END IF;
    RAISE EXCEPTION 'conflicting consent event id' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO prior FROM public.marketing_consent_current
    WHERE tenant_id=p_tenant_id AND company_id=p_company_id
      AND branch_id=p_branch_id AND customer_id=p_customer_id
      AND channel=p_channel AND purpose=p_purpose FOR UPDATE;
  IF FOUND THEN
    IF p_revision <> prior.revision+1 OR p_recorded_at < prior.recorded_at THEN
      RAISE EXCEPTION 'stale consent revision' USING ERRCODE = '40001';
    END IF;
    UPDATE public.marketing_consent_current SET
      action=p_action, revision=p_revision, event_id=p_event_id,
      source=p_source, recorded_at=p_recorded_at
    WHERE tenant_id=p_tenant_id AND company_id=p_company_id
      AND branch_id=p_branch_id AND customer_id=p_customer_id
      AND channel=p_channel AND purpose=p_purpose;
  ELSE
    IF p_revision <> 1 THEN
      RAISE EXCEPTION 'initial consent revision must be 1' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.marketing_consent_current VALUES
      (p_tenant_id,p_company_id,p_branch_id,p_customer_id,p_channel,
       p_purpose,p_action,p_revision,p_event_id,p_source,p_recorded_at);
  END IF;
  INSERT INTO public.marketing_consent_audit
    (tenant_id,company_id,branch_id,customer_id,channel,purpose,action,
     revision,event_id,source,recorded_at)
  VALUES (p_tenant_id,p_company_id,p_branch_id,p_customer_id,p_channel,
          p_purpose,p_action,p_revision,p_event_id,p_source,p_recorded_at);
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.record_marketing_consent_event(
  text,text,text,text,text,text,text,bigint,text,text,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketing_consent_event(
  text,text,text,text,text,text,text,bigint,text,text,timestamptz
) TO service_role;

-- Consent history is append-only, including for accidental service-role writes.
-- Corrections must be new consent events, never rewritten history.
CREATE OR REPLACE FUNCTION public.reject_marketing_consent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'marketing consent audit is append-only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.reject_marketing_consent_audit_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS marketing_consent_audit_immutable ON public.marketing_consent_audit;
CREATE TRIGGER marketing_consent_audit_immutable
BEFORE UPDATE OR DELETE ON public.marketing_consent_audit
FOR EACH ROW EXECUTE FUNCTION public.reject_marketing_consent_audit_mutation();
