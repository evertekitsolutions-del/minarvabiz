-- Cover the license_admin_sessions -> auth.users foreign key.
-- Kept as a separate additive migration because the session table migration
-- has already been applied in production.

CREATE INDEX IF NOT EXISTS idx_license_admin_sessions_auth_user_id
  ON public.license_admin_sessions(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
