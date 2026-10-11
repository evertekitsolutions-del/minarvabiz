-- HR-004C: immutable termination of approved-pending-activation reviews and
-- effective-dated read-only candidate selection. NOT scheduling activation.
-- Reuse existing tenant-reviewed snapshots, audit and branch advisory locks.
-- This is an additive PostgreSQL migration; existing snapshots stay intact.
CREATE TABLE public.staff_roster_policy_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  review_id UUID NOT NULL UNIQUE REFERENCES public.staff_roster_policy_reviews(id),
  resolution TEXT NOT NULL CHECK (resolution IN ('revoked','cancelled')),
  reason TEXT NOT NULL CHECK (
    length(btrim(reason)) BETWEEN 5 AND 1000 AND reason=btrim(reason)
  ),
  resolved_by UUID NOT NULL REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_staff_roster_policy_resolutions_branch
  ON public.staff_roster_policy_resolutions(org_id,branch_id,resolved_at DESC);
ALTER TABLE public.staff_roster_policy_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster_policy_resolutions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_roster_policy_resolutions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_roster_policy_resolutions TO authenticated;
GRANT ALL ON public.staff_roster_policy_resolutions TO service_role;
CREATE POLICY staff_roster_policy_resolutions_manager_read
  ON public.staff_roster_policy_resolutions FOR SELECT TO authenticated
  USING (public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager']::TEXT[]
  ));

-- Defense in depth: even a privileged direct INSERT cannot forge the tenant,
-- branch, decision or review identity of a termination event.
CREATE FUNCTION public.staff_roster_policy_resolution_validate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $validate$
DECLARE source_review public.staff_roster_policy_reviews;
BEGIN
  SELECT * INTO source_review FROM public.staff_roster_policy_reviews
    WHERE id=NEW.review_id;
  IF NOT FOUND OR source_review.org_id<>NEW.org_id
     OR source_review.branch_id<>NEW.branch_id
     OR source_review.decision<>'approved_pending_activation' THEN
    RAISE EXCEPTION 'Resolution must reference a matching pending approval'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$validate$;
REVOKE ALL ON FUNCTION public.staff_roster_policy_resolution_validate()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER staff_roster_policy_resolution_validate_insert
  BEFORE INSERT ON public.staff_roster_policy_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.staff_roster_policy_resolution_validate();
CREATE TRIGGER staff_roster_policy_resolution_no_mutation
  BEFORE UPDATE OR DELETE ON public.staff_roster_policy_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.staff_roster_policy_review_immutable();

-- A resolution never deletes or updates the original approved snapshot.
-- The same branch advisory lock used by review() serializes revocation versus
-- concurrent approval of another draft with a conflicting effective period.
CREATE FUNCTION public.resolve_staff_roster_policy_review(
  p_review_id UUID,p_expected_policy_version INTEGER,
  p_resolution TEXT,p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $resolve$
DECLARE
  authority RECORD;
  review_row public.staff_roster_policy_reviews;
  resolution_row public.staff_roster_policy_resolutions;
BEGIN
  SELECT * INTO STRICT authority FROM public.current_user_authorization();
  IF authority.auth_role NOT IN ('super_admin','admin') THEN
    RAISE EXCEPTION 'Only organization administrators can resolve reviewed policies'
      USING ERRCODE='42501';
  END IF;
  IF p_review_id IS NULL OR p_expected_policy_version IS NULL
     OR p_expected_policy_version<1
     OR p_resolution IS NULL OR p_resolution NOT IN ('revoked','cancelled')
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000
  THEN
    RAISE EXCEPTION 'Invalid reviewed policy resolution request'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO review_row FROM public.staff_roster_policy_reviews
    WHERE id=p_review_id AND org_id=authority.auth_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reviewed policy does not belong to organization'
      USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    authority.auth_org_id::TEXT||':'||review_row.branch_id::TEXT||':review',0
  ));
  SELECT * INTO STRICT review_row FROM public.staff_roster_policy_reviews
    WHERE id=p_review_id AND org_id=authority.auth_org_id FOR UPDATE;
  IF review_row.policy_version<>p_expected_policy_version THEN
    RETURN jsonb_build_object('accepted',false,'reason','stale_review');
  END IF;
  IF review_row.decision<>'approved_pending_activation' THEN
    RETURN jsonb_build_object('accepted',false,'reason','not_pending_approval');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.staff_roster_policy_reviews later
    WHERE later.policy_id=review_row.policy_id
      AND later.policy_version>review_row.policy_version
  ) THEN
    RETURN jsonb_build_object('accepted',false,'reason','superseded_review');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.staff_roster_policy_resolutions existing
    WHERE existing.review_id=p_review_id
  ) THEN
    RETURN jsonb_build_object('accepted',false,'reason','already_resolved');
  END IF;
  INSERT INTO public.staff_roster_policy_resolutions (
    org_id,branch_id,review_id,resolution,reason,resolved_by
  ) VALUES (
    authority.auth_org_id,review_row.branch_id,p_review_id,
    p_resolution,btrim(p_reason),authority.auth_user_id
  ) RETURNING * INTO resolution_row;
  INSERT INTO public.audit_logs (
    org_id,user_id,action,table_name,record_id,old_value,new_value
  ) VALUES (
    authority.auth_org_id,authority.auth_user_id,
    'roster.time_policy.review.'||p_resolution,
    'staff_roster_policy_resolutions',resolution_row.id,
    pg_catalog.to_jsonb(review_row),pg_catalog.to_jsonb(resolution_row)
  );
  RETURN jsonb_build_object('accepted',true,
    'resolution',pg_catalog.to_jsonb(resolution_row),'enforcement_active',false);
END;
$resolve$;
REVOKE ALL ON FUNCTION public.resolve_staff_roster_policy_review(
  UUID,INTEGER,TEXT,TEXT) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_staff_roster_policy_review(
  UUID,INTEGER,TEXT,TEXT) TO authenticated;

-- Read-only selection of the one currently reviewed, unresolved candidate
-- whose branch-local business DATE falls within its snapshot's period.
-- A newer REJECTION supersedes an earlier approval; a newer unreviewed draft
-- also blocks that historical approval from being selected for cutover.
-- Never use this response as scheduling enforcement until the independent
-- server-guard migration and real customer acceptance are approved.
CREATE FUNCTION public.select_staff_roster_policy_candidate(
  p_branch_id UUID,p_for_date DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $select_policy$
DECLARE
  authority RECORD;
  candidate public.staff_roster_policy_reviews;
  matches INTEGER;
BEGIN
  SELECT * INTO STRICT authority FROM public.current_user_authorization();
  IF authority.auth_role NOT IN ('super_admin','admin','manager') THEN
    RAISE EXCEPTION 'Roster policy selection requires manager authorization'
      USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL OR p_for_date IS NULL
     OR p_for_date NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-31' THEN
    RAISE EXCEPTION 'Invalid roster policy selection date or branch'
      USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id=p_branch_id AND b.org_id=authority.auth_org_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch is unavailable for this organization'
      USING ERRCODE='42501';
  END IF;
  -- Count first: never silently choose an arbitrary approval if historical
  -- imports, a future bug or direct privileged writes create an overlap.
  SELECT count(*)::INTEGER INTO matches
    FROM public.staff_roster_policy_reviews r
    JOIN public.staff_roster_time_policies d
      ON d.id=r.policy_id AND d.org_id=r.org_id AND d.branch_id=r.branch_id
    WHERE r.org_id=authority.auth_org_id AND r.branch_id=p_branch_id
      AND r.decision='approved_pending_activation'
      AND r.activation_state='inactive'
      AND r.policy_version=d.version
      AND r.effective_from<=p_for_date
      AND (r.effective_until IS NULL OR p_for_date<=r.effective_until)
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_roster_policy_resolutions resolved
        WHERE resolved.review_id=r.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_roster_policy_reviews later
        WHERE later.policy_id=r.policy_id AND later.policy_version>r.policy_version
      );
  IF matches>1 THEN
    RAISE EXCEPTION 'Ambiguous reviewed branch policies; explicit resolution required'
      USING ERRCODE='23514';
  END IF;
  IF matches=0 THEN
    RETURN jsonb_build_object('accepted',false,'reason','no_reviewed_candidate',
      'enforcement_active',false);
  END IF;
  SELECT r.* INTO STRICT candidate
    FROM public.staff_roster_policy_reviews r
    JOIN public.staff_roster_time_policies d ON d.id=r.policy_id
    WHERE r.org_id=authority.auth_org_id AND r.branch_id=p_branch_id
      AND r.decision='approved_pending_activation'
      AND r.activation_state='inactive' AND r.policy_version=d.version
      AND d.org_id=r.org_id AND d.branch_id=r.branch_id
      AND r.effective_from<=p_for_date
      AND (r.effective_until IS NULL OR p_for_date<=r.effective_until)
      AND NOT EXISTS (SELECT 1 FROM public.staff_roster_policy_resolutions resolved
                      WHERE resolved.review_id=r.id)
      AND NOT EXISTS (SELECT 1 FROM public.staff_roster_policy_reviews later
                      WHERE later.policy_id=r.policy_id AND later.policy_version>r.policy_version);
  RETURN jsonb_build_object('accepted',true,'review',to_jsonb(candidate),
    'selection_state','pending_activation_only','enforcement_active',false);
END;
$select_policy$;
REVOKE ALL ON FUNCTION public.select_staff_roster_policy_candidate(
  UUID,DATE) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.select_staff_roster_policy_candidate(
  UUID,DATE) TO authenticated;

-- Preserve the original review RPC's identity, audit and stale-version
-- checks. Only its overlap predicate changes to exclude terminated/superseded
-- historical approvals. No changes to the roster guard or draft constraints.
CREATE OR REPLACE FUNCTION public.review_staff_roster_time_policy(
  p_policy_id UUID,
  p_expected_version INTEGER,
  p_decision TEXT,
  p_review_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $review$
DECLARE
  authority RECORD;
  draft public.staff_roster_time_policies;
  previous_review public.staff_roster_policy_reviews;
  review_row public.staff_roster_policy_reviews;
  normalized_note TEXT;
BEGIN
  -- Identity and tenancy derive from the verified Auth JWT + membership,
  -- never from an untrusted client-supplied org, branch or role.
  SELECT * INTO STRICT authority FROM public.current_user_authorization();
  IF authority.auth_role NOT IN ('super_admin','admin') THEN
    RAISE EXCEPTION 'Only organization administrators can review roster policies'
      USING ERRCODE='42501';
  END IF;
  normalized_note := NULLIF(pg_catalog.btrim(p_review_note), '');
  IF p_policy_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
    OR p_decision IS NULL
    OR p_decision NOT IN ('approved_pending_activation','rejected')
    OR (p_review_note IS NOT NULL AND pg_catalog.length(p_review_note)>1000)
    OR (p_decision='rejected' AND normalized_note IS NULL) THEN
    RAISE EXCEPTION 'Invalid roster policy review request'
      USING ERRCODE='22023';
  END IF;
  -- Serialize all reviews for this organization's branch, including distinct
  -- draft identities with overlapping effective periods.
  SELECT * INTO draft FROM public.staff_roster_time_policies
    WHERE id=p_policy_id AND org_id=authority.auth_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster policy does not belong to this organization'
      USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    authority.auth_org_id::TEXT||':'||draft.branch_id::TEXT||':review',0
  ));
  -- A concurrent manager draft edit must not alter a reviewed snapshot.
  SELECT * INTO STRICT draft FROM public.staff_roster_time_policies
    WHERE id=p_policy_id AND org_id=authority.auth_org_id FOR UPDATE;
  IF draft.version<>p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted',false,'reason','stale_draft',
      'current_version',draft.version
    );
  END IF;
  IF draft.status<>'draft' OR NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.id=draft.branch_id
      AND b.org_id=authority.auth_org_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only current-branch drafts may be reviewed'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO previous_review
    FROM public.staff_roster_policy_reviews
    WHERE policy_id=draft.id AND org_id=authority.auth_org_id
    ORDER BY policy_version DESC LIMIT 1;
  IF FOUND AND previous_review.policy_version>=p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted',false,'reason','already_reviewed',
      'current_review_id',previous_review.id
    );
  END IF;
  IF p_decision='approved_pending_activation' AND EXISTS (
    -- No two different draft identities can stage colliding branch periods;
    -- history of the *same* draft is preserved via supersedes_review_id.
    SELECT 1 FROM public.staff_roster_policy_reviews other
    WHERE other.org_id=authority.auth_org_id
      AND other.branch_id=draft.branch_id
      AND other.policy_id<>draft.id
      AND other.decision='approved_pending_activation'
      -- A terminated approval or a later decision on the same draft
      -- is historical evidence, not an unresolved competing candidate.
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_roster_policy_resolutions stop
        WHERE stop.review_id=other.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_roster_policy_reviews newer
        WHERE newer.policy_id=other.policy_id
          AND newer.policy_version>other.policy_version
      )
      AND other.effective_from<=COALESCE(draft.effective_until,DATE '9999-12-31')
      AND draft.effective_from<=COALESCE(other.effective_until,DATE '9999-12-31')
  ) THEN
    RAISE EXCEPTION 'Overlapping branch policy reviews require explicit resolution'
      USING ERRCODE='23514';
  END IF;
  INSERT INTO public.staff_roster_policy_reviews (
    org_id,branch_id,policy_id,policy_version,effective_from,effective_until,
    iana_zone,dst_fold_policy,minimum_rest_minutes,decision,review_note,
    reviewed_by,supersedes_review_id
  ) VALUES (
    draft.org_id,draft.branch_id,draft.id,draft.version,
    draft.effective_from,draft.effective_until,draft.iana_zone,
    draft.dst_fold_policy,draft.minimum_rest_minutes,p_decision,
    normalized_note,authority.auth_user_id,previous_review.id
  ) RETURNING * INTO review_row;
  INSERT INTO public.audit_logs (
    org_id,user_id,action,table_name,record_id,old_value,new_value
  ) VALUES (
    authority.auth_org_id,authority.auth_user_id,
    'roster.time_policy.review.'||p_decision,
    'staff_roster_policy_reviews',review_row.id,
    CASE WHEN previous_review.id IS NULL THEN NULL
         ELSE pg_catalog.to_jsonb(previous_review) END,
    pg_catalog.to_jsonb(review_row)
  );
  RETURN pg_catalog.jsonb_build_object(
    'accepted',true,'review',pg_catalog.to_jsonb(review_row),
    'enforcement_active',false
  );
END;
$review$;
REVOKE ALL ON FUNCTION public.review_staff_roster_time_policy(
  UUID,INTEGER,TEXT,TEXT
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_staff_roster_time_policy(
  UUID,INTEGER,TEXT,TEXT
) TO authenticated;

