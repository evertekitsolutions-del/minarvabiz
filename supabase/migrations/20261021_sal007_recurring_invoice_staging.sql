-- SAL-007: SOURCE-ONLY staging primitives, NOT a production deployment approval.
-- No authenticated/anon SQL access or RPC is granted. Commercial activation
-- requires authenticated host ownership, immutable invoice writer, RLS review.
-- Planner keys are opaque, stable `scheduleId:sequence` strings (max 132+).
-- A draft's posted_invoice_id remains UUID to reference a real financial sale.
-- Source and schedule identity constraints are validated by a future trusted RPC.
CREATE TABLE IF NOT EXISTS public.recurring_invoice_schedule_staging (
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  id text NOT NULL CHECK (
    length(id) BETWEEN 1 AND 128 AND id = btrim(id)
    AND id !~ '[[:cntrl:]]'
  ),
  customer_id uuid NOT NULL,
  source_sale_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','paused','cancelled')),
  version bigint NOT NULL CHECK (version > 0),
  schedule_json jsonb NOT NULL CHECK (jsonb_typeof(schedule_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  UNIQUE (org_id, company_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS recurring_invoice_schedule_staging_scope
  ON public.recurring_invoice_schedule_staging(org_id, company_id, branch_id, status);
CREATE TABLE IF NOT EXISTS public.recurring_invoice_draft_staging (
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  id text NOT NULL CHECK (
    length(id) BETWEEN 1 AND 261 AND id = btrim(id)
    AND id !~ '[[:cntrl:]]'
  ),
  schedule_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','posted')),
  posted_invoice_id uuid,
  posted_at timestamptz,
  approved_by uuid,
  CHECK (
    (status = 'pending_review' AND posted_invoice_id IS NULL
     AND posted_at IS NULL AND approved_by IS NULL)
    OR (status = 'posted' AND posted_invoice_id IS NOT NULL
     AND posted_at IS NOT NULL AND approved_by IS NOT NULL)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  UNIQUE(org_id, schedule_id, sequence),
  FOREIGN KEY (org_id, company_id, branch_id, schedule_id)
    REFERENCES public.recurring_invoice_schedule_staging(org_id, company_id, branch_id, id)
    ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS recurring_invoice_draft_staging_posted_unique
  ON public.recurring_invoice_draft_staging(org_id, posted_invoice_id)
  WHERE posted_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recurring_invoice_draft_staging_due
  ON public.recurring_invoice_draft_staging(org_id, company_id, branch_id, due_date);
ALTER TABLE public.recurring_invoice_schedule_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoice_schedule_staging FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoice_draft_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoice_draft_staging FORCE ROW LEVEL SECURITY;
-- Default-deny: no user-visible policies or routines are added.
REVOKE ALL ON public.recurring_invoice_schedule_staging FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.recurring_invoice_draft_staging FROM PUBLIC, anon, authenticated;
