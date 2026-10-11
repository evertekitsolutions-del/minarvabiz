-- HR-004C: tenant-authorized, append-only roster policy review decisions.
-- Review is intentionally NOT enforcement activation. The existing draft
-- CHECK (status='draft') and staff_roster_guard() remain unchanged.
-- Portable PostgreSQL; no new managed service or provider-specific extension.
CREATE TABLE public.staff_roster_policy_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  policy_id UUID NOT NULL REFERENCES public.staff_roster_time_policies(id),
  policy_version INTEGER NOT NULL CHECK (policy_version>0),
  effective_from DATE NOT NULL,
  effective_until DATE,
  iana_zone TEXT NOT NULL,
  dst_fold_policy TEXT NOT NULL CHECK (dst_fold_policy IN ('reject','earlier','later')),
  minimum_rest_minutes INTEGER NOT NULL CHECK (minimum_rest_minutes BETWEEN 0 AND 10080),
  decision TEXT NOT NULL CHECK (decision IN ('approved_pending_activation','rejected')),
  activation_state TEXT NOT NULL DEFAULT 'inactive' CHECK (activation_state='inactive'),
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) BETWEEN 1 AND 1000),
  reviewed_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  supersedes_review_id UUID REFERENCES public.staff_roster_policy_reviews(id),
  CONSTRAINT staff_roster_review_period_valid CHECK (
    effective_until IS NULL OR effective_until>=effective_from
  ),
  CONSTRAINT staff_roster_review_version_unique UNIQUE(policy_id,policy_version),
  CONSTRAINT staff_roster_review_rejection_note CHECK (
    decision<>'rejected' OR review_note IS NOT NULL
  )
);
CREATE INDEX idx_staff_roster_policy_reviews_branch
  ON public.staff_roster_policy_reviews(org_id,branch_id,effective_from,reviewed_at DESC);
ALTER TABLE public.staff_roster_policy_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster_policy_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_roster_policy_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_roster_policy_reviews TO authenticated;
GRANT ALL ON public.staff_roster_policy_reviews TO service_role;
CREATE POLICY staff_roster_policy_reviews_manager_read
  ON public.staff_roster_policy_reviews FOR SELECT TO authenticated
  USING (public.user_has_org_role(
    org_id,ARRAY['super_admin','admin','manager']::TEXT[]
  ));

-- Append-only even for privileged DML. The immutable reviewed snapshot remains
-- reviewable if a manager later edits the draft or an approval is superseded.
CREATE FUNCTION public.staff_roster_policy_review_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $immutable_review$
BEGIN
  RAISE EXCEPTION 'Roster policy review history is append-only'
    USING ERRCODE='23514';
END;
$immutable_review$;
REVOKE ALL ON FUNCTION public.staff_roster_policy_review_immutable()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER staff_roster_policy_review_no_mutation
  BEFORE UPDATE OR DELETE ON public.staff_roster_policy_reviews
  FOR EACH ROW EXECUTE FUNCTION public.staff_roster_policy_review_immutable();

CREATE FUNCTION public.review_staff_roster_time_policy(
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
