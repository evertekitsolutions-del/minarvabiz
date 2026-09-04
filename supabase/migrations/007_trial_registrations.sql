-- Minarva Biz commercial trial registrations.
-- Raw registration data is intentionally kept server-side; the desktop client only stores its own local registration state.
CREATE TABLE IF NOT EXISTS trial_registrations (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  address TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  trial_started_at TIMESTAMPTZ NOT NULL,
  trial_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_registrations_email ON trial_registrations (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_registrations_phone ON trial_registrations (phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_registrations_device ON trial_registrations (device_id);
CREATE INDEX IF NOT EXISTS idx_trial_registrations_status ON trial_registrations (status);
CREATE INDEX IF NOT EXISTS idx_trial_registrations_created_at ON trial_registrations (created_at DESC);

ALTER TABLE trial_registrations ENABLE ROW LEVEL SECURITY;

-- No public/browser role may read or insert trial registrations.
-- The server endpoint uses the Supabase secret key and performs its own validation.
DROP POLICY IF EXISTS trial_registrations_public_deny ON trial_registrations;
CREATE POLICY trial_registrations_public_deny
  ON trial_registrations
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
