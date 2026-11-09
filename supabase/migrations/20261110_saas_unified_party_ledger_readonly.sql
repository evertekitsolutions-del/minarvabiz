-- M12/M15: RLS-invoker-only unified customer/vendor subledger.
-- No new payable postings and NO synthetic balancing entries.
-- Exposes actual source events with stable identities; advanced reconciliation is separate.
CREATE OR REPLACE VIEW public.saas_unified_party_ledger
WITH (security_invoker=true) AS
SELECT s.org_id,s.branch_id,'customer'::text AS party_type,
       s.customer_id AS party_id,'boutique_sale'::text AS source_type,
       s.id AS source_id,s.sale_date AS occurred_at,
       s.invoice_number AS reference,
       s.total::numeric(14,2) AS debit,
       0::numeric(14,2) AS credit,
       'sales'::text AS source_table
FROM public.sales s WHERE s.customer_id IS NOT NULL
UNION ALL
SELECT l.org_id,l.branch_id,'customer',l.customer_id,'laundry_order',
       l.id,l.created_at,l.order_number,
       l.total_customer_charge::numeric(14,2),0::numeric(14,2),'laundry_orders'
FROM public.laundry_orders l
WHERE l.customer_id IS NOT NULL AND l.deleted_at IS NULL
UNION ALL
SELECT o.org_id,o.branch_id,'customer',o.customer_id,'tailoring_order',
       o.id,o.order_date,o.order_number,
       greatest(coalesce(o.price,0)-coalesce(o.discount,0)-coalesce(o.bulk_discount,0),0)::numeric(14,2),
       0::numeric(14,2),'orders'
FROM public.orders o WHERE o.customer_id IS NOT NULL AND o.deleted_at IS NULL
UNION ALL
SELECT p.org_id,p.branch_id,'customer',p.customer_id,'customer_payment',
       p.id,p.paid_at,coalesce(p.reference_type,'payment')||':'||coalesce(p.reference_id::text,p.id::text),
       0::numeric(14,2),p.amount::numeric(14,2),'payments'
FROM public.payments p WHERE p.customer_id IS NOT NULL AND p.amount>0
UNION ALL
SELECT a.org_id,a.branch_id,'supplier',a.supplier_id,'purchase',
       a.id,a.created_at,a.doc_number,
       0::numeric(14,2),a.total::numeric(14,2),'purchases'
FROM public.purchases a
WHERE a.supplier_id IS NOT NULL AND a.deleted_at IS NULL
UNION ALL
SELECT a.org_id,a.branch_id,'supplier',a.supplier_id,'purchase_embedded_payment',
       a.id,a.created_at,a.doc_number,
       coalesce(a.paid,0)::numeric(14,2),0::numeric(14,2),'purchases'
FROM public.purchases a
WHERE a.supplier_id IS NOT NULL AND a.deleted_at IS NULL AND coalesce(a.paid,0)>0;

REVOKE ALL ON public.saas_unified_party_ledger FROM PUBLIC,anon;
GRANT SELECT ON public.saas_unified_party_ledger TO authenticated;

-- Aggregation is read-only and filtered by exact tenant and party, never cross-org.
CREATE OR REPLACE FUNCTION public.saas_party_ledger_summary(
 p_party_type text,p_party_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_total_debit numeric;v_total_credit numeric;v_rows bigint;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_org IS NULL OR p_party_id IS NULL OR p_party_type NOT IN ('customer','supplier') THEN
  RAISE EXCEPTION 'Invalid tenant ledger scope' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(sum(debit),0),coalesce(sum(credit),0),count(*)
 INTO v_total_debit,v_total_credit,v_rows
 FROM public.saas_unified_party_ledger
 WHERE org_id=v_org AND party_type=p_party_type AND party_id=p_party_id;
 RETURN jsonb_build_object('party_type',p_party_type,'party_id',p_party_id,
    'debit',v_total_debit,'credit',v_total_credit,
    'balance',v_total_debit-v_total_credit,'entries',v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_party_ledger_summary(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_party_ledger_summary(text,uuid) TO authenticated;
