-- PLT-005 device auth E2E: local-only isolated Supabase. Always rollback.
BEGIN;
DO $check$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class
  WHERE oid='public.financial_sync_devices'::regclass
  AND relrowsecurity AND relforcerowsecurity) OR
  NOT EXISTS(SELECT 1 FROM pg_class
  WHERE oid='public.financial_sync_branch_grants'::regclass
  AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION 'Financial devices and grants must force RLS';
 END IF;
 IF has_table_privilege('authenticated','public.financial_sync_devices','SELECT')
 OR has_table_privilege('authenticated','public.financial_sync_devices','INSERT')
 OR has_table_privilege('authenticated','public.financial_sync_devices','UPDATE')
 OR has_table_privilege('authenticated','public.financial_sync_branch_grants','SELECT')
 OR has_table_privilege('authenticated','public.financial_sync_branch_grants','INSERT')
 OR has_table_privilege('anon','public.financial_sync_devices','SELECT')
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename IN('financial_sync_devices','financial_sync_branch_grants')) THEN
  RAISE EXCEPTION 'Direct financial device access unexpectedly granted';
 END IF;
END $check$;
INSERT INTO auth.users(id,email) VALUES
 ('da000000-0000-4000-8000-000000000001','device-admin-1@example.test'),
 ('da000000-0000-4000-8000-000000000002','device-admin-2@example.test'),
 ('da000000-0000-4000-8000-000000000003','device-cashier@example.test');
UPDATE public.organization_members SET role='cashier'
 WHERE user_id='da000000-0000-4000-8000-000000000003';
INSERT INTO public.branches(id,name,org_id)
 SELECT 'db000000-0000-4000-8000-000000000001','Device tenant A branch',org_id
 FROM public.organization_members
 WHERE user_id='da000000-0000-4000-8000-000000000001';
INSERT INTO public.branches(id,name,org_id)
 SELECT 'db000000-0000-4000-8000-000000000002','Other tenant branch',org_id
 FROM public.organization_members
 WHERE user_id='da000000-0000-4000-8000-000000000002';

SELECT set_config('request.jwt.claims',
 '{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE device uuid:='dc000000-0000-4000-8000-000000000001';
 branch uuid:='db000000-0000-4000-8000-000000000001';
BEGIN
 IF public.enroll_financial_sync_device(device,'Desktop workstation',repeat('a',64))<>device THEN
  RAISE EXCEPTION 'Device enrollment failed';
 END IF;
 IF public.enroll_financial_sync_device(device,'Desktop workstation',repeat('a',64))<>device THEN
  RAISE EXCEPTION 'Identical enrollment retry changed result';
 END IF;
 BEGIN
  PERFORM public.enroll_financial_sync_device(device,'Forged label',repeat('b',64));
  RAISE EXCEPTION 'Conflicting device rekey was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF NOT public.set_financial_sync_branch_grant(device,branch,true) THEN
  RAISE EXCEPTION 'Authorized branch grant rejected'; END IF;
 BEGIN
  PERFORM public.set_financial_sync_branch_grant(device,
   'db000000-0000-4000-8000-000000000002',true);
  RAISE EXCEPTION 'Foreign branch grant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  EXECUTE 'UPDATE public.financial_sync_devices SET revoked_at=now()';
  RAISE EXCEPTION 'Direct financial device mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT public.revoke_financial_sync_device(device) THEN
  RAISE EXCEPTION 'Authorized revoke failed'; END IF;
 BEGIN
  PERFORM public.set_financial_sync_branch_grant(device,branch,true);
  RAISE EXCEPTION 'Revoked device regrant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.enroll_financial_sync_device(device,'Desktop workstation',repeat('a',64));
  RAISE EXCEPTION 'Revoked device reused';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$
DECLARE org uuid;
BEGIN
 SELECT org_id INTO org FROM public.organization_members
 WHERE user_id='da000000-0000-4000-8000-000000000001';
 IF (SELECT count(*) FROM public.financial_sync_devices WHERE org_id=org)<>1 OR
    (SELECT count(*) FROM public.financial_sync_branch_grants
      WHERE org_id=org AND revoked_at IS NULL)<>0 THEN
  RAISE EXCEPTION 'Device revocation failed to disable branch grants';
 END IF;
END $test$;
SELECT set_config('request.jwt.claims',
 '{"sub":"da000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 BEGIN
  PERFORM public.enroll_financial_sync_device(
  'dc000000-0000-4000-8000-000000000002','Cashier device',repeat('b',64));
  RAISE EXCEPTION 'Cashier enrolled financial device';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.revoke_financial_sync_device(
  'dc000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Cashier revoked financial device';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PLT005 FINANCIAL DEVICE AUTHORITY E2E PASS';
