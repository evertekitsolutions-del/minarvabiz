-- License-admin RBAC and actor-attributed append-only audit logging.
-- Historical migrations are intentionally unchanged.

ALTER TABLE public.license_admin_identities
  ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE public.license_admin_identities
SET role = 'viewer'
WHERE role IS NULL;

ALTER TABLE public.license_admin_identities
  ALTER COLUMN role SET DEFAULT 'viewer',
  ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.license_admin_identities'::regclass
      AND conname = 'license_admin_identities_role_check'
  ) THEN
    ALTER TABLE public.license_admin_identities
      ADD CONSTRAINT license_admin_identities_role_check
      CHECK (role IN ('viewer','operator','admin'));
  END IF;
END $$;

ALTER TABLE public.license_admin_sessions
  ADD COLUMN IF NOT EXISTS actor_role TEXT;

UPDATE public.license_admin_sessions
SET actor_role = 'admin'
WHERE source = 'emergency' AND actor_role IS NULL;

UPDATE public.license_admin_sessions AS s
SET actor_role = i.role
FROM public.license_admin_identities AS i
WHERE s.auth_user_id = i.auth_user_id
  AND s.actor_role IS NULL;

UPDATE public.license_admin_sessions
SET actor_role = 'viewer'
WHERE actor_role IS NULL;

ALTER TABLE public.license_admin_sessions
  ALTER COLUMN actor_role SET DEFAULT 'viewer',
  ALTER COLUMN actor_role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.license_admin_sessions'::regclass
      AND conname = 'license_admin_sessions_actor_role_check'
  ) THEN
    ALTER TABLE public.license_admin_sessions
      ADD CONSTRAINT license_admin_sessions_actor_role_check
      CHECK (actor_role IN ('viewer','operator','admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.license_admin_audit_log (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES public.license_admin_sessions(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('viewer','operator','admin')),
  source TEXT NOT NULL CHECK (source IN ('supabase','emergency')),
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('attempted','success','denied','error')),
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT license_admin_audit_actor_id_len CHECK (char_length(actor_id) BETWEEN 1 AND 200),
  CONSTRAINT license_admin_audit_actor_email_len CHECK (char_length(actor_email) BETWEEN 3 AND 254),
  CONSTRAINT license_admin_audit_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT license_admin_audit_action_len CHECK (char_length(action) BETWEEN 1 AND 120),
  CONSTRAINT license_admin_audit_target_type_len CHECK (target_type IS NULL OR char_length(target_type) BETWEEN 1 AND 80),
  CONSTRAINT license_admin_audit_target_id_len CHECK (target_id IS NULL OR char_length(target_id) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_license_admin_audit_session_created
  ON public.license_admin_audit_log(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_license_admin_audit_actor_created
  ON public.license_admin_audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_license_admin_audit_action_created
  ON public.license_admin_audit_log(action, created_at DESC);

ALTER TABLE public.license_admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.license_admin_audit_log
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.license_admin_audit_log
  TO service_role;
