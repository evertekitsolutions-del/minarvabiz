-- Runtime routing for zero-cost / provider-neutral support infrastructure.
-- Only the service role may read/write this table. Public clients never see provider endpoints directly.

CREATE TABLE IF NOT EXISTS public.support_runtime_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_runtime_config_value_object CHECK (jsonb_typeof(value) = 'object')
);

ALTER TABLE public.support_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_runtime_config TO service_role;

INSERT INTO public.support_runtime_config(key, value)
VALUES (
  'ai_provider',
  jsonb_build_object(
    'kind', 'cloudflare-workers-ai',
    'enabled', false,
    'endpoint', null,
    'textModel', '@cf/zai-org/glm-4.7-flash',
    'visionModel', '@cf/google/gemma-4-26b-a4b-it',
    'phase', 'zero-cost-pre-25-customers'
  )
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.support_runtime_config IS
  'Private runtime service routing. Supports switching providers without rebuilding Minarva Biz clients.';
