-- Revocable short-lived license-administrator sessions.
-- Historical migrations are intentionally unchanged.

CREATE TABLE IF NOT EXISTS public.license_admin_sessions (
  id UUID PRIMARY KEY,
  actor_id TEXT NOT NULL,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('supabase', 'emergency')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('totp', 'emergency')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  CONSTRAINT license_admin_sessions_actor_id_len CHECK (char_length(actor_id) BETWEEN 1 AND 200),
  CONSTRAINT license_admin_sessions_actor_email_len CHECK (char_length(actor_email) BETWEEN 3 AND 254),
  CONSTRAINT license_admin_sessions_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT license_admin_sessions_source_auth CHECK (
    (source = 'supabase' AND auth_method = 'totp' AND auth_user_id IS NOT NULL)
    OR
    (source = 'emergency' AND auth_method = 'emergency' AND auth_user_id IS NULL)
  ),
  CONSTRAINT license_admin_sessions_expiry CHECK (expires_at > created_at),
  CONSTRAINT license_admin_sessions_max_duration CHECK (
    (source = 'supabase' AND expires_at <= created_at + interval '1 hour')
    OR
    (source = 'emergency' AND expires_at <= created_at + interval '15 minutes')
  )
);

CREATE INDEX IF NOT EXISTS idx_license_admin_sessions_actor_active
  ON public.license_admin_sessions(actor_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_license_admin_sessions_expires_at
  ON public.license_admin_sessions(expires_at);

ALTER TABLE public.license_admin_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.license_admin_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.license_admin_sessions TO service_role;
