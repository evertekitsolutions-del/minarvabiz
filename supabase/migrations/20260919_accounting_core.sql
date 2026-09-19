-- Minarva Biz Step 4A: double-entry accounting core.
-- Operational documents remain separate; posted journals form the financial ledger.

CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_id UUID REFERENCES public.accounts(id),
  system_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_org_code
  ON public.accounts(org_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_org_system_key
  ON public.accounts(org_id, system_key)
  WHERE system_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  journal_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  total_debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  posted_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  reversal_journal_id UUID REFERENCES public.journal_entries(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_org_number
  ON public.journal_entries(org_id, journal_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date_status
  ON public.journal_entries(entry_date, status);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_entry_lines(account_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','journal_entries','journal_entry_lines']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_current_user_org_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_current_user_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_current_user_org_id()',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_org_access ON public.%I', t, t);
    policy_expr := format(
      'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (SELECT auth.uid()))',
      t
    );
    EXECUTE format(
      'CREATE POLICY %I_org_access ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t, t, policy_expr, policy_expr
    );
  END LOOP;
END $$;
