\set ON_ERROR_STOP on
-- Isolated PostgreSQL 17 fixture only. Auth/users/tenants are synthetic.
-- All writes and session role changes are rolled back.
BEGIN;
UPDATE public.organization_members SET role='manager'
WHERE user_id='a0000000-0000-0000-0000-000000000003'
  AND org_id='10000000-0000-0000-0000-000000000001';

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $manager$
DECLARE result JSONB;
BEGIN
  result:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2026-11-01','America/New_York','earlier',660,0,
    DATE '2026-11-30');
  IF result->>'accepted'<>'true' THEN
    RAISE EXCEPTION 'Manager could not draft review candidate: %',result;
  END IF;
  BEGIN
    PERFORM public.review_staff_roster_time_policy(
      (result->'record'->>'id')::UUID,1,'approved_pending_activation',NULL);
    RAISE EXCEPTION 'Manager wrongfully approved their own draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$manager$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',true);
DO $admin$
DECLARE
  policy_uuid UUID;
  saved JSONB;
  first_review UUID;
  latest_review UUID;
  failed BOOLEAN;
BEGIN
  SELECT id INTO STRICT policy_uuid FROM public.staff_roster_time_policies
    WHERE effective_from=DATE '2026-11-01'
      AND org_id='10000000-0000-0000-0000-000000000001';
  saved:=public.review_staff_roster_time_policy(
    policy_uuid,1,'approved_pending_activation',
    'Reviewed branch timezone and rest for future activation');
  IF saved->>'accepted'<>'true'
    OR saved->>'enforcement_active'<>'false'
    OR saved->'review'->>'activation_state'<>'inactive'
    OR (saved->'review'->>'policy_version')::INTEGER<>1 THEN
    RAISE EXCEPTION 'Admin review decision did not record inactive snapshot: %',saved;
  END IF;
  PERFORM pg_catalog.set_config('minarva.hr004_test_policy_id',policy_uuid::TEXT,true);
  first_review:=(saved->'review'->>'id')::UUID;
  saved:=public.review_staff_roster_time_policy(
    policy_uuid,1,'approved_pending_activation',NULL);
  IF saved->>'accepted'<>'false'
    OR saved->>'reason'<>'already_reviewed' THEN
    RAISE EXCEPTION 'Same revision was reviewed twice: %',saved;
  END IF;
  saved:=public.review_staff_roster_time_policy(
    policy_uuid,2,'rejected','Needs additional validation');
  IF saved->>'accepted'<>'false'
    OR saved->>'reason'<>'stale_draft' THEN
    RAISE EXCEPTION 'Stale client review advanced revision: %',saved;
  END IF;
  failed:=false;
  BEGIN
    PERFORM public.review_staff_roster_time_policy(
      policy_uuid,1,'rejected','  ');
  EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Empty rejection explanation accepted'; END IF;
  IF (SELECT count(*) FROM public.staff_roster_policy_reviews
    WHERE policy_id=policy_uuid)<>1 THEN
    RAISE EXCEPTION 'Rejected/stale review request wrote history';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_roster_policy_reviews
     WHERE id=first_review AND activation_state<>'inactive') THEN
    RAISE EXCEPTION 'Review silently activated scheduling enforcement';
  END IF;

  -- The approval snapshot is immutable after an authorized draft correction.
  -- Later reviews supersede earlier history rather than rewriting it.
  saved:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2026-11-01','America/New_York','later',720,1,
    DATE '2026-11-30');
  IF saved->>'accepted'<>'true' THEN
    RAISE EXCEPTION 'Manager draft revision failed: %',saved;
  END IF;
  saved:=public.review_staff_roster_time_policy(
    policy_uuid,2,'approved_pending_activation','Corrected DST fold choice');
  IF saved->>'accepted'<>'true'
    OR saved->'review'->>'supersedes_review_id'<>first_review::TEXT THEN
    RAISE EXCEPTION 'Re-reviewed revision did not supersede history: %',saved;
  END IF;
  latest_review:=(saved->'review'->>'id')::UUID;
  IF (SELECT dst_fold_policy FROM public.staff_roster_policy_reviews
    WHERE id=first_review)<>'earlier'
    OR (SELECT dst_fold_policy FROM public.staff_roster_policy_reviews
    WHERE id=latest_review)<>'later' THEN
    RAISE EXCEPTION 'Past approval snapshot was rewritten after draft revision';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs WHERE
      action='roster.time_policy.review.approved_pending_activation')<>2 THEN
    RAISE EXCEPTION 'Immutable policy approvals not properly audited';
  END IF;

  saved:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2026-11-15','America/New_York','reject',360,0,
    DATE '2026-12-15');
  IF saved->>'accepted'<>'true' THEN
    RAISE EXCEPTION 'Second overlapping draft creation refused unexpectedly';
  END IF;
  failed:=false;
  BEGIN
    PERFORM public.review_staff_roster_time_policy(
      (saved->'record'->>'id')::UUID,1,'approved_pending_activation','Overlap');
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN
    RAISE EXCEPTION 'Colliding branch policy approved without resolution';
  END IF;
  saved:=public.review_staff_roster_time_policy(
    (saved->'record'->>'id')::UUID,1,'rejected','Overlaps another approval candidate');
  IF saved->>'accepted'<>'true' OR saved->'review'->>'decision'<>'rejected' THEN
    RAISE EXCEPTION 'Explicit rejection was not saved in history: %',saved;
  END IF;
END;
$admin$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000002',true);
DO $cashier$
DECLARE rejected BOOLEAN:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.staff_roster_policy_reviews) THEN
    RAISE EXCEPTION 'Cashier can read confidential policy reviews';
  END IF;
  BEGIN
    PERFORM public.review_staff_roster_time_policy(
      'c1000000-0000-4000-8000-000000000001',1,'rejected','No');
  EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cashier accessed policy reviewer RPC'; END IF;
END;
$cashier$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'b0000000-0000-0000-0000-000000000001',true);
DO $other_tenant$
DECLARE denied BOOLEAN:=false; policy_id UUID;
BEGIN
  IF EXISTS(SELECT 1 FROM public.staff_roster_policy_reviews) THEN
    RAISE EXCEPTION 'Cross-tenant policy review history visible';
  END IF;
  -- Fixture root supplies the known UUID through deterministic key lookup
  -- rather than relying on any real production tenant identity.
  SELECT id INTO policy_id FROM public.staff_roster_time_policies
    WHERE org_id='10000000-0000-0000-0000-000000000001' LIMIT 1;
  -- PostgreSQL RLS correctly hides it from this tenant.
  IF policy_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cross-tenant draft visible before review';
  END IF;
  BEGIN
    PERFORM public.review_staff_roster_time_policy(
      current_setting('minarva.hr004_test_policy_id',true)::UUID,1,
      'approved_pending_activation','Cross-tenant');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Foreign organization could review missing policy';
  END IF;
END;
$other_tenant$;

RESET ROLE;
DO $privileged_history_guard$
DECLARE denied BOOLEAN:=false;
BEGIN
  BEGIN
    UPDATE public.staff_roster_policy_reviews
      SET activation_state='active';
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Privileged review history update bypassed append-only guard';
  END IF;
  denied:=false;
  BEGIN
    DELETE FROM public.staff_roster_policy_reviews;
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Privileged deletion erased review history';
  END IF;
  IF (SELECT count(*) FROM public.staff_roster_policy_reviews)<>3 THEN
    RAISE EXCEPTION 'Review history count changed after prohibited mutation';
  END IF;
END;
$privileged_history_guard$;
ROLLBACK;
SELECT 'HR-004C versioned inactive policy reviews PostgreSQL 17 E2E PASS' AS result;
