\set ON_ERROR_STOP on
-- Synthetic-tenant PostgreSQL 17 test ONLY. All writes roll back.
BEGIN;
UPDATE public.organization_members SET role='manager'
WHERE user_id='a0000000-0000-0000-0000-000000000003'
  AND org_id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000003',true);
DO $manager_setup$
DECLARE first JSONB;
BEGIN
  first:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2027-01-01','America/New_York','earlier',660,0,DATE '2027-01-31');
  IF first->>'accepted'<>'true' THEN
    RAISE EXCEPTION 'Manager candidate creation failed: %',first;
  END IF;
  PERFORM set_config('minarva.lifecycle.policy1',first->'record'->>'id',true);
END;
$manager_setup$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',true);
DO $admin_lifecycle$
DECLARE
  first UUID:=current_setting('minarva.lifecycle.policy1')::UUID;
  approval UUID;
  second UUID;
  approval2 UUID;
  result JSONB;
  failed BOOLEAN;
BEGIN
  result:=public.review_staff_roster_time_policy(first,1,'approved_pending_activation','Reviewed');
  IF result->>'accepted'<>'true' OR result->>'enforcement_active'<>'false' THEN
    RAISE EXCEPTION 'First inactive review failed: %',result;
  END IF;
  approval:=(result->'review'->>'id')::UUID;
  result:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-01-01');
  IF result->>'accepted'<>'true'
    OR result->'review'->>'id'<>approval::TEXT
    OR result->>'selection_state'<>'pending_activation_only'
    OR result->>'enforcement_active'<>'false' THEN
    RAISE EXCEPTION 'Effective start was not selected pending-only: %',result;
  END IF;
  result:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-02-01');
  IF result->>'accepted'<>'false' THEN
    RAISE EXCEPTION 'Expired review was selected: %',result;
  END IF;
  result:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2027-01-16','America/New_York','later',700,0,DATE '2027-02-17');
  IF result->>'accepted'<>'true' THEN
    RAISE EXCEPTION 'Second draft failed unexpectedly: %',result;
  END IF;
  second:=(result->'record'->>'id')::UUID;
  failed:=false;
  BEGIN
    PERFORM public.review_staff_roster_time_policy(second,1,'approved_pending_activation',NULL);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Unresolved overlap was not blocked'; END IF;
  -- No silent cancellation. The original approval must remain immutable
  -- while a separate, explicitly reasoned termination makes the period free.
  failed:=false;
  BEGIN
    PERFORM public.resolve_staff_roster_policy_review(approval,1,'cancelled',' ');
  EXCEPTION WHEN invalid_parameter_value THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Blank resolution reason was accepted'; END IF;
  result:=public.resolve_staff_roster_policy_review(
    approval,2,'revoked','Corrected branch approval');
  IF result->>'accepted'<>'false' OR result->>'reason'<>'stale_review' THEN
    RAISE EXCEPTION 'Stale resolution accepted: %',result;
  END IF;
  result:=public.resolve_staff_roster_policy_review(
    approval,1,'revoked','Corrected branch approval');
  IF result->>'accepted'<>'true' OR result->>'enforcement_active'<>'false'
    OR result->'resolution'->>'resolution'<>'revoked' THEN
    RAISE EXCEPTION 'Immutable resolution was not recorded: %',result;
  END IF;
  result:=public.resolve_staff_roster_policy_review(
    approval,1,'revoked','Duplicate request');
  IF result->>'reason'<>'already_resolved' THEN
    RAISE EXCEPTION 'Duplicate revocation was not idempotently rejected: %',result;
  END IF;
  result:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-01-01');
  IF result->>'accepted'<>'false' OR result->>'reason'<>'no_reviewed_candidate' THEN
    RAISE EXCEPTION 'Revoked review was still selected: %',result;
  END IF;
  result:=public.review_staff_roster_time_policy(
    second,1,'approved_pending_activation','Explicitly resolved overlap');
  IF result->>'accepted'<>'true' THEN
    RAISE EXCEPTION 'Replacement review still blocked by revoked history: %',result;
  END IF;
  approval2:=(result->'review'->>'id')::UUID;
  result:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-02-17');
  IF result->'review'->>'id'<>approval2::TEXT THEN
    RAISE EXCEPTION 'Correct second interval boundary not selected: %',result;
  END IF;
  result:=public.resolve_staff_roster_policy_review(
    approval2,1,'cancelled','Plan withdrawn before activation');
  IF result->>'accepted'<>'true' OR result->'resolution'->>'resolution'<>'cancelled' THEN
    RAISE EXCEPTION 'Cancellation failed: %',result;
  END IF;
  result:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-02-17');
  IF result->>'accepted'<>'false' THEN
    RAISE EXCEPTION 'Cancelled policy became current candidate: %',result;
  END IF;
  -- A new unreviewed draft revision invalidates a former approval.
  result:=public.save_staff_roster_time_policy_draft(
    'c1000000-0000-4000-8000-000000000001',
    DATE '2027-01-16','America/New_York','later',720,1,DATE '2027-02-17');
  IF result->>'accepted'<>'true' THEN RAISE EXCEPTION 'Draft revision update failed'; END IF;
  result:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-01-20');
  IF result->>'accepted'<>'false' THEN
    RAISE EXCEPTION 'Stale draft revision still selected: %',result;
  END IF;
  IF (SELECT COUNT(*) FROM public.staff_roster_policy_reviews
      WHERE id IN(approval,approval2) AND activation_state='inactive')<>2 THEN
    RAISE EXCEPTION 'Historic approvals missing or silently activated';
  END IF;
  PERFORM set_config('minarva.lifecycle.review1',approval::TEXT,true);
END;
$admin_lifecycle$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000003',true);
DO $manager_denial$
DECLARE denied BOOLEAN:=false; candidate JSONB;
BEGIN
  BEGIN
    PERFORM public.resolve_staff_roster_policy_review(
      current_setting('minarva.lifecycle.review1')::UUID,1,
      'revoked','Manager attempted resolution');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Manager could revoke admin-approved policy'; END IF;
  candidate:=public.select_staff_roster_policy_candidate(
    'c1000000-0000-4000-8000-000000000001',DATE '2027-01-20');
  IF candidate->>'accepted'<>'false' THEN
    RAISE EXCEPTION 'Manager read a resolved candidate as active';
  END IF;
END;
$manager_denial$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000002',true);
DO $cashier_denial$
DECLARE denied BOOLEAN:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.staff_roster_policy_resolutions) THEN
    RAISE EXCEPTION 'Cashier can read privileged resolution ledger';
  END IF;
  BEGIN
    PERFORM public.select_staff_roster_policy_candidate(
      'c1000000-0000-4000-8000-000000000001',DATE '2027-01-20');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cashier could select policy candidate'; END IF;
END;
$cashier_denial$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'b0000000-0000-0000-0000-000000000001',true);
DO $tenant_denial$
DECLARE denied BOOLEAN:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.staff_roster_policy_resolutions) THEN
    RAISE EXCEPTION 'Other tenant can read resolution history';
  END IF;
  BEGIN
    PERFORM public.resolve_staff_roster_policy_review(
      current_setting('minarva.lifecycle.review1')::UUID,1,'revoked','Other tenant');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other tenant revoked foreign approval'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.select_staff_roster_policy_candidate(
      'c1000000-0000-4000-8000-000000000001',DATE '2027-01-20');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Other tenant selected foreign branch'; END IF;
END;
$tenant_denial$;
RESET ROLE;
DO $privileged_immutable$
DECLARE denied BOOLEAN:=false;
BEGIN
  IF (SELECT count(*) FROM public.staff_roster_policy_resolutions)<>2
    OR (SELECT count(*) FROM public.audit_logs
        WHERE action='roster.time_policy.review.revoked')<>1
    OR (SELECT count(*) FROM public.audit_logs
        WHERE action='roster.time_policy.review.cancelled')<>1 THEN
    RAISE EXCEPTION 'Termination ledger or audit trail missing';
  END IF;
  BEGIN
    UPDATE public.staff_roster_policy_resolutions SET resolution='cancelled';
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Privileged resolution history update succeeded'; END IF;
  denied:=false;
  BEGIN
    DELETE FROM public.staff_roster_policy_resolutions;
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Privileged resolution deletion succeeded'; END IF;
  IF (SELECT count(*) FROM public.staff_roster_policy_resolutions)<>2 THEN
    RAISE EXCEPTION 'Immutable ledger was modified';
  END IF;
END;
$privileged_immutable$;
ROLLBACK;
SELECT 'HR-004C immutable reviewed-policy lifecycle PostgreSQL 17 E2E PASS' AS result;
