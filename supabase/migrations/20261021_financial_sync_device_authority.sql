-- PLT-005: source-only, NOT deployed. A digest is NOT proof of device possession.
-- The future financial RPC MUST verify cryptographic device proof and company grants.
CREATE TABLE IF NOT EXISTS public.financial_sync_devices (
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 device_id uuid NOT NULL, enrolled_by uuid NOT NULL REFERENCES auth.users(id),
 label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
 public_key_sha256 text NOT NULL CHECK (public_key_sha256 ~ '^[a-f0-9]{64}$'),
 enrolled_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(org_id,device_id), UNIQUE(org_id,public_key_sha256)
);
CREATE TABLE IF NOT EXISTS public.financial_sync_branch_grants (
 org_id uuid NOT NULL, device_id uuid NOT NULL,
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 granted_by uuid NOT NULL REFERENCES auth.users(id),
 granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(org_id,device_id,branch_id),
 FOREIGN KEY (org_id,device_id) REFERENCES public.financial_sync_devices(org_id,device_id)
);
CREATE INDEX IF NOT EXISTS idx_financial_sync_branch_grants_active
 ON public.financial_sync_branch_grants(org_id,branch_id,device_id) WHERE revoked_at IS NULL;
ALTER TABLE public.financial_sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_sync_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_sync_branch_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_sync_branch_grants FORCE ROW LEVEL SECURITY;
-- No authenticated table policies. All direct client access is prohibited.
REVOKE ALL ON public.financial_sync_devices FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.financial_sync_branch_grants FROM PUBLIC,anon,authenticated;

-- Small internal authority helper; derive org and role exclusively from JWT
-- and authoritative organization_members, never trust request org/user JSON.
CREATE OR REPLACE FUNCTION private.financial_sync_admin_org()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $func$
DECLARE v_actor uuid := auth.uid(); v_org uuid;
BEGIN
 IF v_actor IS NULL THEN
   RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 v_org := private.current_user_org_id();
 IF NOT EXISTS (SELECT 1 FROM public.organization_members m
   WHERE m.org_id=v_org AND m.user_id=v_actor AND m.role IN ('super_admin','admin')) THEN
   RAISE EXCEPTION 'Financial device administration requires admin membership'
     USING ERRCODE='42501';
 END IF;
 RETURN v_org;
END;$func$;
REVOKE ALL ON FUNCTION private.financial_sync_admin_org() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enroll_financial_sync_device(
 p_device_id uuid,p_label text,p_public_key_sha256 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $func$
DECLARE v_org uuid; v_existing public.financial_sync_devices%ROWTYPE;
BEGIN
 v_org := private.financial_sync_admin_org();
 IF p_device_id IS NULL OR p_label IS NULL OR p_label<>btrim(p_label)
   OR char_length(p_label) NOT BETWEEN 1 AND 80
   OR p_public_key_sha256 IS NULL OR p_public_key_sha256 !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'Invalid financial device enrollment' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_existing FROM public.financial_sync_devices
   WHERE org_id=v_org AND device_id=p_device_id FOR UPDATE;
 IF FOUND THEN
   IF v_existing.revoked_at IS NOT NULL OR
      v_existing.label IS DISTINCT FROM p_label OR
      v_existing.public_key_sha256 IS DISTINCT FROM p_public_key_sha256 THEN
     RAISE EXCEPTION 'Conflicting or revoked financial device'
       USING ERRCODE='23505';
   END IF;
   RETURN p_device_id;
 END IF;
 INSERT INTO public.financial_sync_devices(org_id,device_id,enrolled_by,label,public_key_sha256)
 VALUES(v_org,p_device_id,auth.uid(),p_label,p_public_key_sha256);
 RETURN p_device_id;
END;$func$;

CREATE OR REPLACE FUNCTION public.set_financial_sync_branch_grant(
 p_device_id uuid,p_branch_id uuid,p_enabled boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $func$
DECLARE v_org uuid;
BEGIN
 v_org:=private.financial_sync_admin_org();
 IF p_device_id IS NULL OR p_branch_id IS NULL OR p_enabled IS NULL THEN
   RAISE EXCEPTION 'Device, branch and explicit grant required' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.financial_sync_devices d
   WHERE d.org_id=v_org AND d.device_id=p_device_id AND d.revoked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.branches b
   WHERE b.org_id=v_org AND b.id=p_branch_id AND b.is_active=true AND b.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Inactive or foreign financial sync device/branch'
     USING ERRCODE='42501';
 END IF;
 IF p_enabled THEN
   INSERT INTO public.financial_sync_branch_grants
     (org_id,device_id,branch_id,granted_by,revoked_at)
   VALUES(v_org,p_device_id,p_branch_id,auth.uid(),NULL)
   ON CONFLICT(org_id,device_id,branch_id) DO UPDATE
     SET revoked_at=NULL, granted_by=EXCLUDED.granted_by,granted_at=now();
 ELSE
   UPDATE public.financial_sync_branch_grants SET revoked_at=COALESCE(revoked_at,now())
     WHERE org_id=v_org AND device_id=p_device_id AND branch_id=p_branch_id;
 END IF;
 RETURN p_enabled;
END;$func$;

CREATE OR REPLACE FUNCTION public.revoke_financial_sync_device(p_device_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $func$
DECLARE v_org uuid;
BEGIN
 v_org:=private.financial_sync_admin_org();
 IF p_device_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.financial_sync_devices
   WHERE org_id=v_org AND device_id=p_device_id) THEN
   RAISE EXCEPTION 'No financial device in current organization' USING ERRCODE='42501';
 END IF;
 UPDATE public.financial_sync_devices SET revoked_at=COALESCE(revoked_at,now())
  WHERE org_id=v_org AND device_id=p_device_id;
 UPDATE public.financial_sync_branch_grants SET revoked_at=COALESCE(revoked_at,now())
  WHERE org_id=v_org AND device_id=p_device_id;
 RETURN true;
END;$func$;

REVOKE ALL ON FUNCTION public.enroll_financial_sync_device(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_financial_sync_branch_grant(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_financial_sync_device(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_financial_sync_device(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_financial_sync_branch_grant(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_financial_sync_device(uuid) TO authenticated;
