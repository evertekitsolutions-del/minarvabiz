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
