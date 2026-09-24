-- Named license-administrator identities backed by Supabase Auth.
-- Historical migrations are intentionally unchanged.
-- Provisioning flow:
--   1. Create the administrator in Supabase Authentication > Users.
--   2. Insert that auth user UUID, email, and display name into this table.
--   3. Keep status='active' only for administrators who should be able to sign in.

CREATE TABLE IF NOT EXISTS public.license_admin_identities (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT license_admin_identities_email_len CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT license_admin_identities_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_license_admin_identities_email_lower
  ON public.license_admin_identities ((lower(email)));

ALTER TABLE public.license_admin_identities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.license_admin_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.license_admin_identities TO service_role;
