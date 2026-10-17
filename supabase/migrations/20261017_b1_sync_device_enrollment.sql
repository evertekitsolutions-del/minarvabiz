-- B1: tenant-scoped sync device registry. Schema only; NO financial replay enablement.
-- An approved row/grant is NOT a device authentication credential: all clients
-- must still prove possession of a separately signed, scoped enrollment token.
-- Apply only after database acceptance on a disposable PostgreSQL instance.

CREATE TABLE public.sync_device_enrollments (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  device_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  ed25519_public_key text NOT NULL
    CHECK (ed25519_public_key ~ '^[A-Za-z0-9_-]{43}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  PRIMARY KEY (org_id, device_id),
  CONSTRAINT b1_device_status_timestamps CHECK (
    (status = 'pending' AND activated_at IS NULL AND revoked_at IS NULL)
    OR (status = 'active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);
CREATE INDEX b1_devices_actor ON public.sync_device_enrollments (actor_user_id, org_id);
CREATE INDEX b1_devices_live ON public.sync_device_enrollments (org_id, status)
  WHERE status = 'active';

-- Composite key prevents granting a branch from a different organization,
-- including legacy unscoped (org_id IS NULL) branches.
ALTER TABLE public.branches
  ADD CONSTRAINT b1_branches_org_id_id_unique UNIQUE (org_id, id);
CREATE TABLE public.sync_device_branch_grants (
  org_id uuid NOT NULL,
  device_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  PRIMARY KEY (org_id, device_id, branch_id),
  FOREIGN KEY (org_id, device_id)
    REFERENCES public.sync_device_enrollments(org_id, device_id),
  FOREIGN KEY (org_id, branch_id) REFERENCES public.branches(org_id, id)
);
CREATE INDEX b1_branch_grants_branch ON public.sync_device_branch_grants
  (org_id, branch_id) WHERE revoked_at IS NULL;

CREATE TABLE public.sync_device_authority_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL,
  device_id uuid NOT NULL,
  branch_id uuid,
  event_type text NOT NULL CHECK (event_type IN
    ('device_requested', 'device_approved', 'device_revoked', 'branch_granted', 'branch_revoked')),
  actor_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX b1_sync_audit_device ON public.sync_device_authority_audit
  (org_id, device_id, occurred_at DESC);

ALTER TABLE public.sync_device_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_device_branch_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_device_authority_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_device_enrollments,
  public.sync_device_branch_grants, public.sync_device_authority_audit
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.sync_device_enrollments TO authenticated;
GRANT UPDATE (status) ON public.sync_device_enrollments TO authenticated;
GRANT SELECT, INSERT ON public.sync_device_branch_grants TO authenticated;
GRANT UPDATE (revoked_at) ON public.sync_device_branch_grants TO authenticated;
GRANT SELECT ON public.sync_device_authority_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_device_enrollments,
  public.sync_device_branch_grants, public.sync_device_authority_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sync_device_authority_audit_id_seq
  TO service_role;

CREATE POLICY b1_device_read ON public.sync_device_enrollments FOR SELECT
  TO authenticated USING (
    public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
    OR (actor_user_id = (SELECT auth.uid()) AND public.user_has_org_role(
      org_id, ARRAY['super_admin','admin','manager','cashier','tailor','staff']::text[]))
  );
CREATE POLICY b1_device_request ON public.sync_device_enrollments FOR INSERT
  TO authenticated WITH CHECK (
    status = 'pending'
    AND public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = sync_device_enrollments.org_id
        AND om.user_id = sync_device_enrollments.actor_user_id
    )
  );
-- The only authenticated UPDATE is a one-way revocation. Activation requires
-- a trusted server principal AFTER proof of possession and signature issuance.
CREATE POLICY b1_device_revoke ON public.sync_device_enrollments FOR UPDATE
  TO authenticated
  USING (public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[]))
  WITH CHECK (
    status = 'revoked'
    AND public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
  );
CREATE POLICY b1_grant_read ON public.sync_device_branch_grants FOR SELECT
  TO authenticated USING (
    public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
    OR EXISTS (
      SELECT 1 FROM public.sync_device_enrollments d
      WHERE d.org_id = sync_device_branch_grants.org_id
        AND d.device_id = sync_device_branch_grants.device_id
        AND d.actor_user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY b1_grant_create ON public.sync_device_branch_grants FOR INSERT
  TO authenticated WITH CHECK (
    public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
    AND revoked_at IS NULL
  );
CREATE POLICY b1_grant_revoke ON public.sync_device_branch_grants FOR UPDATE
  TO authenticated
  USING (public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[]))
  WITH CHECK (
    revoked_at IS NOT NULL
    AND public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
  );
CREATE POLICY b1_audit_read ON public.sync_device_authority_audit FOR SELECT
  TO authenticated USING (
    public.user_has_org_role(org_id, ARRAY['super_admin','admin']::text[])
  );

CREATE FUNCTION private.b1_guard_device_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.activated_at IS NOT NULL
       OR NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL THEN
      RAISE EXCEPTION 'Device requests must start pending' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.device_id IS DISTINCT FROM OLD.device_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.ed25519_public_key IS DISTINCT FROM OLD.ed25519_public_key THEN
    RAISE EXCEPTION 'Device enrollment identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'revoked'
     OR (OLD.status = 'active' AND NEW.status <> 'revoked')
     OR (OLD.status = 'pending' AND NEW.status NOT IN ('active','revoked')) THEN
    RAISE EXCEPTION 'Invalid device status transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' THEN
    IF current_user NOT IN ('service_role','postgres') THEN
      RAISE EXCEPTION 'Device approval requires verified server authority'
        USING ERRCODE = '42501';
    END IF;
    NEW.activated_at := pg_catalog.clock_timestamp();
    NEW.revoked_at := NULL;
    NEW.revoked_by := NULL;
  ELSE
    NEW.activated_at := OLD.activated_at;
    NEW.revoked_at := pg_catalog.clock_timestamp();
    NEW.revoked_by := auth.uid();
  END IF;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.b1_guard_device_enrollment()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER b1_guard_device_enrollment BEFORE INSERT OR UPDATE
  ON public.sync_device_enrollments FOR EACH ROW
  EXECUTE FUNCTION private.b1_guard_device_enrollment();

CREATE FUNCTION private.b1_guard_branch_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.device_id IS DISTINCT FROM OLD.device_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'Branch grant is immutable or already revoked' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.revoked_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;
  IF NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'New branch grant cannot start revoked' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sync_device_enrollments d
    JOIN public.branches b ON b.org_id = d.org_id
    WHERE d.org_id = NEW.org_id AND d.device_id = NEW.device_id
      AND d.status = 'active'
      AND b.id = NEW.branch_id AND b.is_active AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active enrollment and active same-tenant branch required'
      USING ERRCODE = '23514';
  END IF;
  NEW.created_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.b1_guard_branch_grant()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER b1_guard_branch_grant BEFORE INSERT OR UPDATE
  ON public.sync_device_branch_grants FOR EACH ROW
  EXECUTE FUNCTION private.b1_guard_branch_grant();

CREATE FUNCTION private.b1_audit_sync_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  event_name text;
  audit_branch_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'sync_device_enrollments' THEN
    event_name := CASE WHEN TG_OP = 'INSERT' THEN 'device_requested'
      WHEN NEW.status = 'active' THEN 'device_approved'
      ELSE 'device_revoked' END;
    audit_branch_id := NULL;
  ELSE
    audit_branch_id := NEW.branch_id;
    event_name := CASE WHEN TG_OP = 'INSERT' THEN 'branch_granted'
      ELSE 'branch_revoked' END;
  END IF;
  INSERT INTO public.sync_device_authority_audit
    (org_id, device_id, branch_id, event_type, actor_user_id)
  VALUES (NEW.org_id, NEW.device_id, audit_branch_id,
    event_name, auth.uid());
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.b1_audit_sync_authority()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER b1_audit_device_enrollment AFTER INSERT OR UPDATE
  ON public.sync_device_enrollments FOR EACH ROW
  EXECUTE FUNCTION private.b1_audit_sync_authority();
CREATE TRIGGER b1_audit_branch_grant AFTER INSERT OR UPDATE
  ON public.sync_device_branch_grants FOR EACH ROW
  EXECUTE FUNCTION private.b1_audit_sync_authority();

-- No DELETE policies. No public approval RPC. No signed authority exchange,
-- sync replay, financial write route or production feature switch is enabled.
