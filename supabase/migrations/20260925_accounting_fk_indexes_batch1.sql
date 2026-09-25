-- Accounting FK index hardening batch 1.
-- Covers foreign-key join/delete checks flagged by Supabase performance advisor.
-- Tables are currently empty in production, so regular CREATE INDEX is safe here.

CREATE INDEX IF NOT EXISTS idx_accounts_branch_id
  ON public.accounts (branch_id);

CREATE INDEX IF NOT EXISTS idx_accounts_parent_id
  ON public.accounts (parent_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id
  ON public.journal_entries (branch_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by
  ON public.journal_entries (created_by);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal_journal_id
  ON public.journal_entries (reversal_journal_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_org_id
  ON public.journal_entry_lines (org_id);
