\set ON_ERROR_STOP on
-- Run ONLY against an empty, disposable PostgreSQL database:
-- psql -X -v ON_ERROR_STOP=1 -f scripts/b1-sync-device-enrollment-e2e.sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.organization_members (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  PRIMARY KEY(org_id,user_id)
);
CREATE FUNCTION public.user_has_org_role(target_org_id uuid,allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.org_id=target_org_id AND om.user_id=auth.uid()
      AND om.role=ANY(allowed_roles))
$$;
REVOKE ALL ON FUNCTION public.user_has_org_role(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid,text[]) TO authenticated;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.organization_members TO authenticated;
CREATE POLICY b1_members_read ON public.organization_members FOR SELECT
 TO authenticated USING (
   user_id=auth.uid()
   OR public.user_has_org_role(org_id,ARRAY['super_admin','admin']::text[])
 );
CREATE TABLE public.branches (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz
);
GRANT SELECT ON public.branches TO authenticated;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_tenant_read ON public.branches FOR SELECT TO authenticated
  USING (public.user_has_org_role(org_id,
    ARRAY['super_admin','admin','manager','cashier','tailor','staff']::text[]));

INSERT INTO public.organizations(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002');
INSERT INTO auth.users(id) VALUES
 ('a0000000-0000-4000-8000-000000000001'),
 ('a0000000-0000-4000-8000-000000000002'),
 ('b0000000-0000-4000-8000-000000000001');
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','admin'),
 ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','cashier'),
 ('20000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','admin');
INSERT INTO public.branches(id,org_id,is_active) VALUES
 ('aa000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('aa000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',false),
 ('bb000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true);

\i supabase/migrations/20261017_b1_sync_device_enrollment.sql

CREATE SCHEMA test;
CREATE FUNCTION test.ok(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE(condition,false) THEN
   RAISE EXCEPTION 'ASSERTION FAILED: %', label;
 END IF;
END
$$;
CREATE FUNCTION test.denied(statement text, expected_code text, label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 BEGIN
   EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE = expected_code THEN RETURN; END IF;
   RAISE EXCEPTION 'Wrong error for %: % (%)', label, SQLERRM, SQLSTATE;
 END;
 RAISE EXCEPTION 'ASSERTION FAILED: statement succeeded: %',label;
END
$$;
GRANT USAGE ON SCHEMA test TO authenticated;
GRANT EXECUTE ON FUNCTION test.ok(boolean,text),test.denied(text,text,text)
  TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);
INSERT INTO public.sync_device_enrollments
  (org_id,device_id,actor_user_id,ed25519_public_key) VALUES
  ('10000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002',
   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
SELECT test.denied($q$
  INSERT INTO public.sync_device_enrollments
    (org_id,device_id,actor_user_id,ed25519_public_key,status)
  VALUES ('10000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','active')
$q$,'23514','no direct active registration');
SELECT test.denied($q$
  INSERT INTO public.sync_device_enrollments
    (org_id,device_id,actor_user_id,ed25519_public_key)
  VALUES ('10000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000001',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
$q$,'42501','actor must be same-tenant member');
SELECT test.denied($q$
  INSERT INTO public.sync_device_branch_grants(org_id,device_id,branch_id)
  VALUES ('10000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000001')
$q$,'23514','no grants for pending devices');
SELECT test.denied($q$
  UPDATE public.sync_device_enrollments
    SET status='active'
    WHERE org_id='10000000-0000-4000-8000-000000000001'
$q$,'42501','no authenticated approval');
RESET ROLE;

-- Simulates authorized backend only; real approval still requires signed
-- proof-of-possession, not included in this schema milestone.
SET ROLE service_role;
UPDATE public.sync_device_enrollments SET status='active'
 WHERE device_id='da000000-0000-4000-8000-000000000001';
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);
SELECT test.denied($q$
  INSERT INTO public.sync_device_branch_grants(org_id,device_id,branch_id)
  VALUES ('10000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000001',
   'bb000000-0000-4000-8000-000000000001')
$q$,'23514','cross-tenant branch cannot pass active branch check');
SELECT test.denied($q$
  INSERT INTO public.sync_device_branch_grants(org_id,device_id,branch_id)
  VALUES ('10000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000002')
$q$,'23514','inactive same-tenant branch denied');
INSERT INTO public.sync_device_branch_grants(org_id,device_id,branch_id)
 VALUES ('10000000-0000-4000-8000-000000000001',
 'da000000-0000-4000-8000-000000000001',
 'aa000000-0000-4000-8000-000000000001');
SELECT test.ok((SELECT count(*) FROM public.sync_device_branch_grants)=1,
 'same-tenant active branch grant');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',false);
SELECT test.ok((SELECT count(*) FROM public.sync_device_enrollments)=0,
 'tenant B must not see tenant A device');
SELECT test.ok((SELECT count(*) FROM public.sync_device_branch_grants)=0,
 'tenant B must not see tenant A grants');
SELECT test.ok((SELECT count(*) FROM public.sync_device_authority_audit)=0,
 'tenant B must not see tenant A audit');
SELECT test.denied($q$
  INSERT INTO public.sync_device_branch_grants(org_id,device_id,branch_id)
  VALUES ('10000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000001')
$q$,'23514','tenant B cannot create A grants');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',false);
SELECT test.ok((SELECT count(*) FROM public.sync_device_enrollments)=1,
 'own enrolled device readable');
SELECT test.denied($q$
  INSERT INTO public.sync_device_enrollments
   (org_id,device_id,actor_user_id,ed25519_public_key)
  VALUES ('10000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000002',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
$q$,'42501','cashier cannot register devices');
SELECT test.denied($q$
  DELETE FROM public.sync_device_enrollments
  WHERE device_id='da000000-0000-4000-8000-000000000001'
$q$,'42501','hard delete unavailable');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);
UPDATE public.sync_device_branch_grants SET revoked_at=clock_timestamp()
 WHERE device_id='da000000-0000-4000-8000-000000000001';
SELECT test.denied($q$
  UPDATE public.sync_device_branch_grants SET revoked_at=NULL
   WHERE device_id='da000000-0000-4000-8000-000000000001'
$q$,'23514','revoked grant cannot be restored');
UPDATE public.sync_device_enrollments SET status='revoked'
 WHERE device_id='da000000-0000-4000-8000-000000000001';
SELECT test.denied($q$
  UPDATE public.sync_device_enrollments SET status='active'
   WHERE device_id='da000000-0000-4000-8000-000000000001'
$q$,'23514','revoked device cannot be restored by authenticated');
SELECT test.ok((SELECT count(*) FROM public.sync_device_authority_audit)=5,
 'immutable audit entries: request/approval/grant/grant revoke/device revoke');
RESET ROLE;
SELECT 'B1 tenant/branch RLS, lifecycle, cross-tenant FK and audit PASS' AS result;


-- One-time enrollment challenge is strictly server-only, tenant-bound and
-- consumed atomically. Proof signature verification occurs in native/server
-- code, never inside this SQL function.
SET ROLE service_role;
INSERT INTO public.sync_device_enrollments
  (org_id, device_id, actor_user_id, ed25519_public_key)
VALUES ('10000000-0000-4000-8000-000000000001',
 'da000000-0000-4000-8000-000000000005',
 'a0000000-0000-4000-8000-000000000002',
 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
INSERT INTO public.sync_device_enrollment_challenges
  (org_id,device_id,challenge_id,actor_user_id,branch_id,nonce)
VALUES (
 '10000000-0000-4000-8000-000000000001',
 'da000000-0000-4000-8000-000000000005',
 'ca000000-0000-4000-8000-000000000005',
 'a0000000-0000-4000-8000-000000000002',
 'aa000000-0000-4000-8000-000000000001',
 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
);
DO $test_challenge$
DECLARE
  accepted boolean;
BEGIN
  -- Wrong scope or nonce cannot burn a valid challenge.
  SELECT private.b1_consume_sync_enrollment_challenge(
    '10000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000005',
    'ca000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000002',
    'aa000000-0000-4000-8000-000000000001',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA'
  ) INTO accepted;
  IF accepted THEN RAISE EXCEPTION 'Incorrect nonce consumed challenge'; END IF;
  SELECT private.b1_consume_sync_enrollment_challenge(
    '10000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000005',
    'ca000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000002',
    'aa000000-0000-4000-8000-000000000001',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  ) INTO accepted;
  IF NOT accepted THEN RAISE EXCEPTION 'First challenge consume failed'; END IF;
  SELECT private.b1_consume_sync_enrollment_challenge(
    '10000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000005',
    'ca000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000002',
    'aa000000-0000-4000-8000-000000000001',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  ) INTO accepted;
  IF accepted THEN RAISE EXCEPTION 'Consumed challenge was replayable'; END IF;
END
$test_challenge$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);
SELECT test.denied($q$
 SELECT * FROM public.sync_device_enrollment_challenges
$q$,'42501','authenticated clients cannot read enrollment nonce');
SELECT test.denied($q$
 INSERT INTO public.sync_device_enrollment_challenges
  (org_id,device_id,challenge_id,actor_user_id,branch_id,nonce)
 VALUES ('10000000-0000-4000-8000-000000000001',
 'da000000-0000-4000-8000-000000000005',
 'ca000000-0000-4000-8000-000000000006',
 'a0000000-0000-4000-8000-000000000002',
 'aa000000-0000-4000-8000-000000000001',
 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
$q$,'42501','authenticated clients cannot mint challenges');
SELECT test.denied($q$
 SELECT private.b1_consume_sync_enrollment_challenge(
  '10000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000005',
  'ca000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002',
  'aa000000-0000-4000-8000-000000000001',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
$q$,'42501','authenticated clients cannot consume challenges');
RESET ROLE;
SELECT 'B1 one-time server-only enrollment challenge PASS' AS result;
