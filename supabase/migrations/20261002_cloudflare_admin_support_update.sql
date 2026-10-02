-- Cloudflare-native Support Inbox update path.
-- Authorization remains bound to the authenticated Supabase user, MFA AAL2,
-- active License Admin allowlist entry, and support.manage permission.

CREATE OR REPLACE FUNCTION public.cloudflare_admin_update_support_request(
  p_id UUID,
  p_status TEXT,
  p_assigned_to TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin JSONB;
  v_permissions JSONB;
  v_identity JSONB;
  v_current RECORD;
  v_status TEXT := btrim(COALESCE(p_status, ''));
  v_assigned_to TEXT := NULLIF(btrim(COALESCE(p_assigned_to, '')), '');
  v_admin_notes TEXT := NULLIF(btrim(COALESCE(p_admin_notes, '')), '');
  v_now TIMESTAMPTZ := clock_timestamp();
  v_display_name TEXT;
BEGIN
  v_admin := public.cloudflare_admin_me();
  IF COALESCE((v_admin ->> 'ok')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN v_admin;
  END IF;

  v_permissions := COALESCE(v_admin -> 'permissions', '[]'::jsonb);
  IF NOT (v_permissions ? 'support.manage') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'httpStatus', 403);
  END IF;

  IF p_id IS NULL
     OR v_status NOT IN ('new', 'in_review', 'planned', 'resolved', 'rejected', 'duplicate')
     OR (v_assigned_to IS NOT NULL AND char_length(v_assigned_to) > 320)
     OR (v_admin_notes IS NOT NULL AND char_length(v_admin_notes) > 12000) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  END IF;

  SELECT
    s.id,
    s.status,
    s.assigned_to,
    s.admin_notes
  INTO v_current
  FROM public.support_requests s
  WHERE s.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'httpStatus', 404);
  END IF;

  UPDATE public.support_requests
  SET
    status = v_status,
    assigned_to = v_assigned_to,
    admin_notes = v_admin_notes,
    updated_at = v_now,
    resolved_at = CASE WHEN v_status = 'resolved' THEN v_now ELSE NULL END
  WHERE id = p_id;

  v_identity := v_admin -> 'identity';
  v_display_name := COALESCE(
    NULLIF(v_identity ->> 'displayName', ''),
    NULLIF(v_identity ->> 'email', ''),
    'Minarva Biz Administrator'
  );

  INSERT INTO public.license_admin_audit_log (
    id,
    session_id,
    actor_id,
    actor_email,
    display_name,
    actor_role,
    source,
    action,
    outcome,
    target_type,
    target_id,
    details
  )
  VALUES (
    gen_random_uuid(),
    NULL,
    COALESCE(v_identity ->> 'id', ''),
    COALESCE(v_identity ->> 'email', ''),
    left(v_display_name, 120),
    COALESCE(v_identity ->> 'role', ''),
    'supabase',
    'support.request.update',
    'success',
    'support_request',
    p_id::TEXT,
    jsonb_build_object(
      'previousStatus', v_current.status,
      'status', v_status,
      'assignedTo', v_assigned_to,
      'authority', 'cloudflare'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', p_id,
      'status', v_status,
      'assigned_to', v_assigned_to,
      'admin_notes', v_admin_notes,
      'updated_at', v_now,
      'resolved_at', CASE WHEN v_status = 'resolved' THEN v_now ELSE NULL END
    ),
    'httpStatus', 200
  );
EXCEPTION
  WHEN check_violation OR invalid_text_representation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'httpStatus', 400);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE', 'httpStatus', 503);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_admin_update_support_request(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_update_support_request(UUID, TEXT, TEXT, TEXT)
  TO authenticated;
