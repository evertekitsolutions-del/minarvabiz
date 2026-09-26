-- One-time first license-administrator bootstrap and tenant-trigger guard.
-- License-admin auth users must never create customer tenant data.

CREATE OR REPLACE FUNCTION private.bootstrap_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_org_id UUID;
  display_name TEXT;
  shop_name TEXT;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data ->> 'account_type', '') = 'license_admin' THEN
    RETURN NEW;
  END IF;

  display_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), '');
  IF display_name IS NULL THEN
    display_name := split_part(COALESCE(NEW.email, 'Minarva Biz User'), '@', 1);
  END IF;

  shop_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'shop_name', ''), '');
  IF shop_name IS NULL THEN
    shop_name := display_name || '''s Minarva Biz';
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (shop_name)
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, display_name, 'admin')
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = now();

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.branches (name, code, is_headquarters, is_active, org_id)
  VALUES ('Main Branch', 'HQ', true, true, new_org_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_first_license_admin(
  p_email TEXT,
  p_display_name TEXT
)
RETURNS TABLE(status TEXT, auth_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  normalized_email TEXT;
  normalized_name TEXT;
  matched_user auth.users%ROWTYPE;
BEGIN
  normalized_email := lower(trim(COALESCE(p_email, '')));
  normalized_name := trim(COALESCE(p_display_name, ''));

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(normalized_email) > 254
     OR char_length(normalized_name) < 1
     OR char_length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'invalid bootstrap administrator details';
  END IF;

  IF EXISTS (SELECT 1 FROM public.license_admin_identities) THEN
    RETURN QUERY SELECT 'closed'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT *
  INTO matched_user
  FROM auth.users
  WHERE lower(email) = normalized_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF matched_user.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF COALESCE(matched_user.raw_user_meta_data ->> 'account_type', '') <> 'license_admin' THEN
    RETURN QUERY SELECT 'not_eligible'::TEXT, matched_user.id;
    RETURN;
  END IF;

  INSERT INTO public.license_admin_identities (
    auth_user_id,
    email,
    display_name,
    status,
    role
  )
  VALUES (
    matched_user.id,
    normalized_email,
    normalized_name,
    'active',
    'admin'
  );

  RETURN QUERY SELECT 'created'::TEXT, matched_user.id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_license_admin(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_license_admin(TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.bootstrap_first_license_admin(TEXT, TEXT) IS
  'One-time service-role-only bootstrap for the first named Minarva Biz license administrator.';
