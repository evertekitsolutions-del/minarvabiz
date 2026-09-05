-- Minarva Biz commercial licensing lifecycle.
-- Private signing material is NEVER stored in the database.

CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY,
  license_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  product TEXT NOT NULL DEFAULT 'minarvabiz',
  edition TEXT NOT NULL DEFAULT 'hybrid',
  plan TEXT NOT NULL CHECK (plan IN ('trial','basic','professional','business','enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked','expired','deactivated')),
  token TEXT NOT NULL,
  token_sha256 TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  activation_limit INTEGER NOT NULL DEFAULT 1 CHECK (activation_limit > 0),
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_activations (
  id UUID PRIMARY KEY,
  license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  activation_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deactivated','replaced')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (license_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_activations_license ON license_activations(license_id);
CREATE INDEX IF NOT EXISTS idx_license_activations_device ON license_activations(device_id);
CREATE INDEX IF NOT EXISTS idx_license_activations_status ON license_activations(status);

CREATE TABLE IF NOT EXISTS license_events (
  id UUID PRIMARY KEY,
  license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
  activation_id UUID REFERENCES license_activations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('issued','activated','validated','deactivated','replaced','suspended','revoked','expired')),
  device_id TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_events_license_created ON license_events(license_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_events_activation_created ON license_events(activation_id, created_at DESC);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS licenses_public_deny ON licenses;
CREATE POLICY licenses_public_deny ON licenses FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS license_activations_public_deny ON license_activations;
CREATE POLICY license_activations_public_deny ON license_activations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS license_events_public_deny ON license_events;
CREATE POLICY license_events_public_deny ON license_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
