-- M12/M15: reconcile M8 SaaS GRN payables with unified supplier ledger.
-- Read-only, tenant scoped; does not duplicate stock movements or book new payables.
CREATE OR REPLACE FUNCTION public.saas_party_ledger_v2(
 p_party_type text, p_party_id uuid, p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(entry_at timestamptz, source_type text, source_id uuid,
                reference text, debit numeric, credit numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_org uuid;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF (SELECT auth.uid()) IS NULL OR v_org IS NULL
 OR p_party_type NOT IN ('customer','supplier') OR p_party_id IS NULL
 OR NOT public.user_has_org_role(v_org, ARRAY[
 'super_admin','admin','manager','accountant']) THEN
   RAISE EXCEPTION 'Tenant accounting access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT l.entry_at,l.source_type,l.source_id,l.reference,l.debit,l.credit
 FROM public.saas_party_ledger(p_party_type,p_party_id,p_branch_id) l;
 IF p_party_type='supplier' THEN
  RETURN QUERY
  SELECT COALESCE(po.received_at,po.created_at),
    'saas_grn_supplier_payable'::text,po.id,
    'GRN-'||substr(po.id::text,1,8),
    0::numeric,pay.total::numeric
  FROM public.saas_supplier_payables pay
  JOIN public.saas_purchase_orders po ON po.id=pay.order_id AND po.org_id=pay.org_id
  WHERE pay.org_id=v_org AND pay.supplier_id=p_party_id
    AND po.status='received'
    AND (p_branch_id IS NULL OR po.branch_id=p_branch_id);
  RETURN QUERY
  SELECT COALESCE(po.received_at,po.created_at),
    'saas_grn_supplier_payment'::text,po.id,
    'GRN-PAY-'||substr(po.id::text,1,8),
    pay.paid::numeric,0::numeric
  FROM public.saas_supplier_payables pay
  JOIN public.saas_purchase_orders po ON po.id=pay.order_id AND po.org_id=pay.org_id
  WHERE pay.org_id=v_org AND pay.supplier_id=p_party_id
    AND po.status='received' AND pay.paid>0
    AND (p_branch_id IS NULL OR po.branch_id=p_branch_id);
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_party_ledger_v2(text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_party_ledger_v2(text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_party_ledger_summary(
 p_party_type text,p_party_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_total_debit numeric;v_total_credit numeric;v_rows bigint;
BEGIN
 SELECT coalesce(sum(t.debit),0),coalesce(sum(t.credit),0),count(*)
 INTO v_total_debit,v_total_credit,v_rows
 FROM public.saas_party_ledger_v2(p_party_type,p_party_id,NULL) t;
 RETURN jsonb_build_object(
  'party_type',p_party_type,'party_id',p_party_id,
  'debit',v_total_debit,'credit',v_total_credit,
  'balance',CASE WHEN p_party_type='supplier'
    THEN v_total_credit-v_total_debit ELSE v_total_debit-v_total_credit END,
  'entries',v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_party_ledger_summary(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_party_ledger_summary(text,uuid) TO authenticated;
