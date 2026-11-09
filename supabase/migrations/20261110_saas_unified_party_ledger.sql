-- M12/M15 read-only, tenant-scoped customer/vendor ledger and GST report.
-- Payments already reflected in per-document paid_amount are NOT counted again.
-- Cross-document advances are separate credits. Online Postgres is authority.
CREATE OR REPLACE FUNCTION public.saas_party_ledger(
 p_party_type text,p_party_id uuid,p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(
 entry_at timestamptz,source_type text,source_id uuid,
 reference text,debit numeric,credit numeric
) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_org uuid;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF (SELECT auth.uid()) IS NULL OR v_org IS NULL OR p_party_id IS NULL
  OR p_party_type NOT IN ('customer','supplier')
  OR NOT public.user_has_org_role(v_org,ARRAY[
   'super_admin','admin','manager','accountant'
  ]) THEN RAISE EXCEPTION 'Ledger access denied' USING ERRCODE='42501'; END IF;
 IF p_branch_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.branches b WHERE b.id=p_branch_id
   AND b.org_id=v_org AND b.deleted_at IS NULL
 ) THEN RAISE EXCEPTION 'Branch is not in authorized tenant'
  USING ERRCODE='42501'; END IF;
 IF p_party_type='customer' THEN
  IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=p_party_id
   AND c.org_id=v_org AND c.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Customer is not in authorized tenant' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT s.sale_date,'boutique_pos'::text,s.id,s.invoice_number,
   s.total::numeric,0::numeric
  FROM public.sales s WHERE s.org_id=v_org AND s.customer_id=p_party_id
   AND s.status NOT IN ('cancelled','void')
   AND (p_branch_id IS NULL OR s.branch_id=p_branch_id)
  UNION ALL
  SELECT s.sale_date,'pos_collection',s.id,s.invoice_number,0::numeric,s.paid_amount
  FROM public.sales s WHERE s.org_id=v_org AND s.customer_id=p_party_id
   AND s.paid_amount>0 AND s.status NOT IN ('cancelled','void')
   AND (p_branch_id IS NULL OR s.branch_id=p_branch_id)
  UNION ALL
  SELECT l.created_at,'laundry_charge',l.id,
   coalesce(l.order_number,l.id::text),l.total_customer_charge,0::numeric
  FROM public.laundry_orders l WHERE l.org_id=v_org AND l.customer_id=p_party_id
   AND l.deleted_at IS NULL AND l.status NOT IN ('cancelled','void')
   AND (p_branch_id IS NULL OR l.branch_id=p_branch_id)
  UNION ALL
  SELECT l.created_at,'laundry_collection',l.id,
   coalesce(l.order_number,l.id::text),0::numeric,l.paid_amount
  FROM public.laundry_orders l WHERE l.org_id=v_org AND l.customer_id=p_party_id
   AND l.deleted_at IS NULL AND l.paid_amount>0 AND l.status NOT IN ('cancelled','void')
   AND (p_branch_id IS NULL OR l.branch_id=p_branch_id)
  UNION ALL
  SELECT p.paid_at,'unallocated_advance',p.id,
   coalesce(p.reference_type,'customer_advance'),0::numeric,p.amount
  FROM public.payments p WHERE p.org_id=v_org AND p.customer_id=p_party_id
   AND p.reference_type IN ('advance','customer_advance')
   AND (p_branch_id IS NULL OR p.branch_id=p_branch_id);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=p_party_id
   AND s.org_id=v_org) THEN
   RAISE EXCEPTION 'Supplier is not in authorized tenant' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT p.date::timestamptz,'supplier_purchase',p.id,p.doc_number,
   0::numeric,p.total
  FROM public.purchases p WHERE p.org_id=v_org AND p.supplier_id=p_party_id
   AND p.deleted_at IS NULL
   AND (p_branch_id IS NULL OR p.branch_id=p_branch_id)
  UNION ALL
  SELECT p.date::timestamptz,'supplier_payment',p.id,p.doc_number,
   p.paid,0::numeric
  FROM public.purchases p WHERE p.org_id=v_org AND p.supplier_id=p_party_id
   AND p.deleted_at IS NULL AND p.paid>0
   AND (p_branch_id IS NULL OR p.branch_id=p_branch_id);
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_party_ledger(text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_party_ledger(text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_gst_sales_summary(
 p_from timestamptz,p_to timestamptz,p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_org uuid; v_result jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF (SELECT auth.uid()) IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager','accountant']
 ) THEN RAISE EXCEPTION 'GST report access denied' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to>p_from+interval '1 year'
 THEN RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023';END IF;
 IF p_branch_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.branches b WHERE b.org_id=v_org AND b.id=p_branch_id
   AND b.deleted_at IS NULL
 ) THEN RAISE EXCEPTION 'Unauthorized branch' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object(
  'sales_count',count(*)::int,'gross',coalesce(sum(s.total),0),
  'tax',coalesce(sum(s.tax_amount),0),
  'net',coalesce(sum(s.total-s.tax_amount),0),
  'credit_outstanding',coalesce(sum(s.balance_amount),0)
 ) INTO v_result
 FROM public.sales s WHERE s.org_id=v_org
  AND s.sale_date>=p_from AND s.sale_date<p_to
  AND s.status NOT IN ('cancelled','void')
  AND (p_branch_id IS NULL OR s.branch_id=p_branch_id);
 RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_gst_sales_summary(timestamptz,timestamptz,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_gst_sales_summary(timestamptz,timestamptz,uuid)
 TO authenticated;
