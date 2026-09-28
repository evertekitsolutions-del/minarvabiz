-- AI Support Center inbox for technical escalations, bugs, feature requests and suggestions.
-- Public clients never access this table directly; Vercel/License Admin use service-role access.

CREATE TABLE IF NOT EXISTS public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN ('technical_escalation','bug','feature_request','suggestion')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','planned','resolved','rejected','duplicate')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 12000),
  module TEXT NULL CHECK (module IS NULL OR char_length(module) <= 120),
  organization_name TEXT NULL CHECK (organization_name IS NULL OR char_length(organization_name) <= 200),
  contact_email TEXT NULL CHECK (contact_email IS NULL OR char_length(contact_email) <= 320),
  app_version TEXT NULL CHECK (app_version IS NULL OR char_length(app_version) <= 80),
  edition TEXT NULL CHECK (edition IS NULL OR char_length(edition) <= 40),
  platform TEXT NULL CHECK (platform IS NULL OR char_length(platform) <= 120),
  client_hash TEXT NULL CHECK (client_hash IS NULL OR client_hash ~ '^[0-9a-f]{64}$'),
  ai_summary TEXT NULL CHECK (ai_summary IS NULL OR char_length(ai_summary) <= 4000),
  screenshot_summary TEXT NULL CHECK (screenshot_summary IS NULL OR char_length(screenshot_summary) <= 4000),
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to TEXT NULL CHECK (assigned_to IS NULL OR char_length(assigned_to) <= 320),
  admin_notes TEXT NULL CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL,
  CONSTRAINT support_requests_transcript_array CHECK (jsonb_typeof(transcript) = 'array'),
  CONSTRAINT support_requests_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_support_requests_status_created
  ON public.support_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_type_created
  ON public.support_requests(request_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_version_created
  ON public.support_requests(app_version, created_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_requests TO service_role;

COMMENT ON TABLE public.support_requests IS
  'Private Minarva Biz support/feedback inbox. Public clients submit only through rate-limited server APIs.';
