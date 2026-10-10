\set ON_ERROR_STOP on
-- Local PostgreSQL 17 only. All draft writes, audit events and role switches
-- are wrapped in ROLLBACK; no hosted production users are created.
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $manager$
DECLARE
  answer JSONB;
  policy UUID;
  version INTEGER;
  audits INTEGER;
BEGIN
  answer:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2026-11-01','America/New_York','earlier',660,0,NULL);
  IF answer->>'accepted'<>'true' OR answer->'record'->>'status'<>'draft'
    OR (answer->'record'->>'version')::integer<>1 THEN
    RAISE EXCEPTION 'Tenant-authenticated draft creation failed: %',answer;
  END IF;
  policy:=(answer->'record'->>'id')::UUID;
  IF (SELECT count(*) FROM public.staff_roster_time_policies WHERE id=policy)<>1 THEN
    RAISE EXCEPTION 'Manager cannot view own draft through tenant RLS';
  END IF;
  answer:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2026-11-01','America/New_York','later',720,1,DATE '2027-02-28');
  IF answer->>'accepted'<>'true' OR (answer->'record'->>'version')::integer<>2
    OR answer->'record'->>'dst_fold_policy'<>'later' THEN
    RAISE EXCEPTION 'Versioned manager draft correction rejected: %',answer;
  END IF;
  answer:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2026-11-01','America/New_York','reject',0,1,NULL);
  IF answer->>'accepted'<>'false'
    OR (answer->'remote'->>'version')::integer<>2 THEN
    RAISE EXCEPTION 'Stale second-tab draft overwrite was accepted';
  END IF;
  IF (SELECT minimum_rest_minutes FROM public.staff_roster_time_policies WHERE id=policy)<>720 THEN
    RAISE EXCEPTION 'Stale write changed saved rest policy';
  END IF;

  -- Managers cannot draft a different tenant's branch or hide history.
  BEGIN
    PERFORM public.save_staff_roster_time_policy_draft(
      'c2000000-0000-4000-8000-000000000002',
      DATE '2026-11-01','UTC','reject',0,0,NULL);
    RAISE EXCEPTION 'Cross-tenant branch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_staff_roster_time_policy_draft(
      'c1000000-0000-4000-8000-000000000001',
      DATE '2026-11-02','Mars/Olympus_Mons','reject',0,0,NULL);
    RAISE EXCEPTION 'Unknown named zone accepted as a policy';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.save_staff_roster_time_policy_draft(
      'c1000000-0000-4000-8000-000000000001',
      DATE '2026-11-02','UTC','unreviewed',0,0,NULL);
    RAISE EXCEPTION 'Unreviewed DST fold setting accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.save_staff_roster_time_policy_draft(
      'c1000000-0000-4000-8000-000000000001',
      DATE '2026-11-02','UTC','reject',-1,0,NULL);
    RAISE EXCEPTION 'Negative rest setting accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END;
$manager$;

-- Direct table mutation is denied, even for a manager with SELECT access.
DO $blocked$
DECLARE refused BOOLEAN:=false;
BEGIN
  BEGIN
    UPDATE public.staff_roster_time_policies SET status='approved';
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN
    RAISE EXCEPTION 'Authenticated manager bypassed audited draft writer';
  END IF;
END;
$blocked$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000002',true);
DO $cashier$
DECLARE refused BOOLEAN:=false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.staff_roster_time_policies) THEN
    RAISE EXCEPTION 'Cashier can read confidential roster time policy';
  END IF;
  BEGIN
    PERFORM public.save_staff_roster_time_policy_draft(
      'c1000000-0000-4000-8000-000000000001',
      DATE '2026-12-01','UTC','reject',0,0,NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Cashier can create HR time policy'; END IF;
END;
$cashier$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'b0000000-0000-0000-0000-000000000001',true);
DO $other_tenant$
DECLARE refused BOOLEAN:=false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.staff_roster_time_policies) THEN
    RAISE EXCEPTION 'Another tenant sees the first tenant policy';
  END IF;
  BEGIN
    PERFORM public.save_staff_roster_time_policy_draft(
      'c1000000-0000-4000-8000-000000000001',
      DATE '2026-12-01','UTC','reject',0,0,NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Other tenant edited first tenant policy'; END IF;
END;
$other_tenant$;
RESET ROLE;

DO $server_guard$
DECLARE refused BOOLEAN:=false;
BEGIN
  IF (SELECT count(*) FROM public.audit_logs
      WHERE action IN ('roster.time_policy.draft.create','roster.time_policy.draft.update'))<>2 THEN
    RAISE EXCEPTION 'Draft create/update audit trail count mismatch';
  END IF;
  BEGIN
    UPDATE public.staff_roster_time_policies
       SET status='approved', version=3
     WHERE branch_id='c1000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Policy approved before UTC/rest trigger cutover'; END IF;
  refused:=false;
  BEGIN
    UPDATE public.staff_roster_time_policies
       SET dst_fold_policy='reject',version=2
     WHERE branch_id='c1000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN serialization_failure THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Out-of-order draft revision bypassed trigger'; END IF;
  refused:=false;
  BEGIN
    INSERT INTO public.staff_roster_time_policies
      (org_id,branch_id,effective_from,iana_zone,created_by,updated_by)
    VALUES ('10000000-0000-0000-0000-000000000001',
      'c2000000-0000-4000-8000-000000000002',DATE '2026-12-01','UTC',
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN check_violation THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Privileged cross-tenant branch inserted'; END IF;
END;
$server_guard$;
ROLLBACK;
SELECT 'HR-004C tenant roster timezone/rest policy drafts PostgreSQL E2E PASS' AS result;
