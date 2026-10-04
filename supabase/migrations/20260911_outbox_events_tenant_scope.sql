-- Restore the tenant-scope schema change that exists in production history
-- before 20260911_production_hardening, but was missing from repository files.
-- Idempotent for both fresh installs and existing hosted deployments.

ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS org_id UUID;

DO $outbox_org_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.outbox_events'::regclass
      AND conname = 'outbox_events_org_id_fkey'
  ) THEN
    ALTER TABLE public.outbox_events
      ADD CONSTRAINT outbox_events_org_id_fkey
      FOREIGN KEY (org_id)
      REFERENCES public.organizations(id);
  END IF;
END
$outbox_org_fk$;

CREATE INDEX IF NOT EXISTS idx_outbox_events_org_id
  ON public.outbox_events(org_id);
