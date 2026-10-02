-- Cloudflare-native read-only License Admin support inbox.
-- Reuses cloudflare_admin_me() for MFA/allowlist/RBAC authorization.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_list_support_requests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin JSONB;
  v_permissions JSONB;
  v_requests JSONB;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'support.read') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'request_type', s.request_type,
        'status', s.status,
        'priority', s.priority,
        'title', s.title,
        'description', s.description,
        'module', s.module,
        'organization_name', s.organization_name,
        'contact_email', s.contact_email,
        'app_version', s.app_version,
        'edition', s.edition,
        'platform', s.platform,
        'ai_summary', s.ai_summary,
        'screenshot_summary', s.screenshot_summary,
        'transcript', s.transcript,
        'metadata', s.metadata,
        'assigned_to', s.assigned_to,
        'admin_notes', s.admin_notes,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'resolved_at', s.resolved_at
      )
      ORDER BY s.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_requests
  FROM (
    SELECT *
    FROM public.support_requests
    ORDER BY created_at DESC
    LIMIT 200
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'requests', v_requests
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_list_support_requests()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_list_support_requests()
  TO authenticated;
