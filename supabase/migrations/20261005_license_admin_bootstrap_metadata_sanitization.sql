-- Defense-in-depth cleanup for Cloudflare-reserved License Admin bootstrap identities.
--
-- The BEFORE INSERT reservation guard is authoritative for consuming the one-time
-- capability and stamping trusted app metadata. Current GoTrue signup processing
-- can still persist request metadata after that point, so scrub the transient
-- bootstrap carrier from both auth.users and auth.identities at durable boundaries.

CREATE OR REPLACE FUNCTION private.sanitize_license_admin_bootstrap_user_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data ->> 'minarva_license_admin_bootstrap', '') = 'true' THEN
    UPDATE auth.users
    SET raw_user_meta_data =
      COALESCE(raw_user_meta_data, '{}'::jsonb)
      - 'bootstrap_token'
      - 'account_type'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sanitize_license_admin_bootstrap_user_metadata()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_license_admin_bootstrap_sanitize ON auth.users;
CREATE TRIGGER on_auth_user_license_admin_bootstrap_sanitize
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.sanitize_license_admin_bootstrap_user_metadata();


CREATE OR REPLACE FUNCTION private.sanitize_license_admin_bootstrap_identity_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = NEW.user_id
      AND COALESCE(u.raw_app_meta_data ->> 'minarva_license_admin_bootstrap', '') = 'true'
  ) THEN
    NEW.identity_data :=
      COALESCE(NEW.identity_data, '{}'::jsonb)
      - 'bootstrap_token'
      - 'account_type';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sanitize_license_admin_bootstrap_identity_metadata()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_identity_license_admin_bootstrap_sanitize ON auth.identities;
CREATE TRIGGER on_auth_identity_license_admin_bootstrap_sanitize
BEFORE INSERT ON auth.identities
FOR EACH ROW
EXECUTE FUNCTION private.sanitize_license_admin_bootstrap_identity_metadata();

COMMENT ON FUNCTION private.sanitize_license_admin_bootstrap_user_metadata() IS
  'Removes one-time License Admin bootstrap carrier fields from durable Auth user metadata after the trusted reservation guard stamps app metadata.';
COMMENT ON FUNCTION private.sanitize_license_admin_bootstrap_identity_metadata() IS
  'Prevents one-time License Admin bootstrap carrier fields from being copied into durable Supabase identity metadata.';
