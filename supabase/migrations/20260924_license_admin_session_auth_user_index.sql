-- Cover the license-admin session -> auth.users foreign key used for revocation/cascade checks.
-- Added after the session-registry migration was applied; historical migration remains unchanged.

CREATE INDEX IF NOT EXISTS idx_license_admin_sessions_auth_user_id
  ON public.license_admin_sessions(auth_user_id);
