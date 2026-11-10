-- M12/M15 cloud tenant cash/bank, expense, customer receipt and vendor payable
-- settlement. Append-only immutable finance receipts; accounting source ledgers
-- derive amounts from canonical sales/payments/GRN supplier payables.
CREATE TABLE IF NOT EXISTS public.saas_finance_accounts(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 kind text NOT NULL CHECK(kind IN('cash','bank')),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
 opening_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK(opening_balance=0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_finance_accounts_org_idx
 ON public.saas_finance_accounts(org_id,branch_id,kind);
CREATE TABLE IF NOT EXISTS public.saas_finance_entries(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 account_id uuid NOT NULL REFERENCES public.saas_finance_accounts(id),
 kind text NOT NULL CHECK(kind IN('customer_receipt','customer_advance','supplier_payment','expense')),
 reference_id uuid,
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 signed_delta numeric(14,2) NOT NULL CHECK(signed_delta<>0),
 note text NOT NULL DEFAULT '',
 request_body jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_finance_entries_org_idx
 ON public.saas_finance_entries(org_id,branch_id,created_at DESC);
CREATE INDEX IF NOT EXISTS saas_finance_entries_account_idx
 ON public.saas_finance_entries(account_id,created_at DESC);
ALTER TABLE public.saas_finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_finance_accounts_tenant_read
 ON public.saas_finance_accounts FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.organization_members m
  WHERE m.org_id=saas_finance_accounts.org_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY saas_finance_entries_tenant_read
 ON public.saas_finance_entries FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.organization_members m
  WHERE m.org_id=saas_finance_entries.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_finance_accounts,public.saas_finance_entries
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_finance_accounts,public.saas_finance_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_finance_open_account_once(
 p_account_id uuid,p_branch_id uuid,p_kind text,p_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());v_old public.saas_finance_accounts%ROWTYPE;
 v_name text:=pg_catalog.btrim(p_name);
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager','accountant']) THEN
  RAISE EXCEPTION 'Finance manager access required' USING ERRCODE='42501';
 END IF;
 IF p_account_id IS NULL OR p_branch_id IS NULL OR p_kind NOT IN('cash','bank')
 OR length(v_name) NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'Invalid finance account input' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id=p_branch_id
  AND b.org_id=v_org AND b.is_active IS TRUE AND b.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Account branch outside tenant' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-finance-account:'||p_account_id::text,0));
 SELECT * INTO v_old FROM public.saas_finance_accounts WHERE id=p_account_id;
 IF FOUND THEN
  IF v_old.org_id<>v_org OR v_old.branch_id<>p_branch_id
   OR v_old.kind<>p_kind OR v_old.name<>v_name THEN
   RAISE EXCEPTION 'Finance account ID already used with different details'
    USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('account_id',p_account_id,'idempotent',true);
 END IF;
 INSERT INTO public.saas_finance_accounts(
  id,org_id,branch_id,kind,name,created_by)
 VALUES(p_account_id,v_org,p_branch_id,p_kind,v_name,v_user);
 RETURN pg_catalog.jsonb_build_object('account_id',p_account_id,'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_finance_post_once(
 p_entry_id uuid,p_account_id uuid,p_kind text,
 p_reference_id uuid,p_amount numeric,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid:=(SELECT auth.uid());
 v_account public.saas_finance_accounts%ROWTYPE;
 v_prior public.saas_finance_entries%ROWTYPE;
 v_payable public.saas_supplier_payables%ROWTYPE;
 v_sale public.sales%ROWTYPE;
 v_customer public.customers%ROWTYPE;
 v_payload jsonb;v_amount numeric(14,2);
 v_delta numeric(14,2);v_balance numeric;
 v_note text:=pg_catalog.btrim(coalesce(p_note,''));
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager','accountant']) THEN
  RAISE EXCEPTION 'Finance posting operator not authorized' USING ERRCODE='42501';
 END IF;
 IF p_entry_id IS NULL OR p_account_id IS NULL OR
  p_kind NOT IN('customer_receipt','customer_advance','supplier_payment','expense')
  OR p_amount IS NULL OR p_amount<=0 OR p_amount>99999999 OR
  round(p_amount,2)<>p_amount OR length(v_note)>600 OR
  (p_kind='expense' AND v_note='') OR
  (p_kind<>'expense' AND p_reference_id IS NULL) THEN
  RAISE EXCEPTION 'Invalid finance posting input' USING ERRCODE='22023';
 END IF;
 v_amount:=p_amount;
 v_payload:=pg_catalog.jsonb_build_object('account_id',p_account_id,
  'kind',p_kind,'reference_id',p_reference_id,'amount',v_amount,'note',v_note);
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('saas-finance-post:'||p_entry_id::text,0));
 SELECT * INTO v_prior FROM public.saas_finance_entries WHERE id=p_entry_id;
 IF FOUND THEN
  IF v_prior.org_id<>v_org OR v_prior.request_body IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION 'Finance entry ID reused with different payload' USING ERRCODE='23505';
  END IF;
  RETURN pg_catalog.jsonb_build_object('entry_id',p_entry_id,'idempotent',true);
 END IF;
 SELECT * INTO v_account FROM public.saas_finance_accounts
 WHERE id=p_account_id AND org_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account outside authorized tenant' USING ERRCODE='42501';END IF;
 v_delta:=CASE WHEN p_kind IN('customer_receipt','customer_advance') THEN v_amount ELSE -v_amount END;
 SELECT coalesce(sum(e.signed_delta),0) INTO v_balance
 FROM public.saas_finance_entries e WHERE e.account_id=p_account_id AND e.org_id=v_org;
 IF v_account.kind='cash' AND v_balance+v_delta<0 THEN
  RAISE EXCEPTION 'Cash account balance cannot become negative' USING ERRCODE='23514';
 END IF;
 IF p_kind='supplier_payment' THEN
  SELECT * INTO v_payable FROM public.saas_supplier_payables s
   WHERE s.order_id=p_reference_id AND s.org_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_payable.total-v_payable.paid<v_amount
   OR NOT EXISTS(SELECT 1 FROM public.saas_purchase_orders po
    WHERE po.id=v_payable.order_id AND po.org_id=v_org
      AND po.status='received' AND po.branch_id=v_account.branch_id) THEN
   RAISE EXCEPTION 'Supplier GRN payable not available or insufficient'
    USING ERRCODE='23514';
  END IF;
  UPDATE public.saas_supplier_payables
   SET paid=paid+v_amount WHERE order_id=p_reference_id AND org_id=v_org;
 ELSIF p_kind='customer_receipt' THEN
  SELECT * INTO v_sale FROM public.sales s
  WHERE s.id=p_reference_id AND s.org_id=v_org AND s.deleted_at IS NULL
   AND s.branch_id=v_account.branch_id AND s.status NOT IN('cancelled','void') FOR UPDATE;
  IF NOT FOUND OR v_sale.customer_id IS NULL
   OR v_sale.balance_amount<v_amount THEN
    RAISE EXCEPTION 'Customer sale missing or amount exceeds outstanding balance'
    USING ERRCODE='23514';
  END IF;
  UPDATE public.sales SET paid_amount=paid_amount+v_amount,
   balance_amount=balance_amount-v_amount,version=version+1,updated_at=now()
   WHERE id=p_reference_id AND org_id=v_org;
  UPDATE public.customers
   SET outstanding_balance=outstanding_balance-v_amount,
   total_spending=total_spending+v_amount,version=version+1,updated_at=now()
   WHERE id=v_sale.customer_id AND org_id=v_org AND deleted_at IS NULL;
  INSERT INTO public.payments(id,org_id,branch_id,customer_id,
    amount,method,reference_type,reference_id,notes,created_by)
  VALUES(p_entry_id,v_org,v_account.branch_id,v_sale.customer_id,
   v_amount,v_account.kind,'sale',p_reference_id,v_note,v_user);
 ELSIF p_kind='customer_advance' THEN
  SELECT * INTO v_customer FROM public.customers c
   WHERE c.id=p_reference_id AND c.org_id=v_org
    AND c.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance customer outside tenant' USING ERRCODE='42501';END IF;
  INSERT INTO public.payments(id,org_id,branch_id,customer_id,
   amount,method,reference_type,reference_id,notes,created_by)
  VALUES(p_entry_id,v_org,v_account.branch_id,v_customer.id,
   v_amount,v_account.kind,'advance',v_customer.id,v_note,v_user);
  UPDATE public.customers SET outstanding_balance=outstanding_balance-v_amount,
   version=version+1,updated_at=now()
   WHERE id=v_customer.id AND org_id=v_org;
 END IF;
 INSERT INTO public.saas_finance_entries(
 id,org_id,branch_id,account_id,kind,reference_id,
 amount,signed_delta,note,request_body,created_by)
 VALUES(p_entry_id,v_org,v_account.branch_id,p_account_id,p_kind,p_reference_id,
 v_amount,v_delta,v_note,v_payload,v_user);
 RETURN pg_catalog.jsonb_build_object('entry_id',p_entry_id,
 'account_id',p_account_id,'signed_delta',v_delta,'account_balance',v_balance+v_delta,
 'idempotent',false);
END;$fn$;

CREATE OR REPLACE FUNCTION public.saas_finance_daybook(
 p_from date,p_to date,p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_daybook jsonb;v_accounts jsonb;
 v_sales numeric;v_tax numeric;v_cogs numeric;v_laundry numeric;
 v_laundry_cogs numeric;v_tailoring numeric;v_tailoring_cost numeric;
 v_expenses numeric;v_grn numeric;v_supplier_paid numeric;
 v_collections numeric;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF (SELECT auth.uid()) IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
 v_org,ARRAY['super_admin','admin','manager','accountant']) THEN
  RAISE EXCEPTION 'Daybook accountant access required' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>366 THEN
  RAISE EXCEPTION 'Daybook date range must be <= 366 days' USING ERRCODE='22023';
 END IF;
 IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b
   WHERE b.id=p_branch_id AND b.org_id=v_org AND b.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Daybook branch outside tenant' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(sum(s.total),0),coalesce(sum(s.tax_amount),0)
 INTO v_sales,v_tax FROM public.sales s WHERE s.org_id=v_org
 AND s.sale_date::date BETWEEN p_from AND p_to
 AND s.deleted_at IS NULL AND s.status NOT IN('cancelled','void')
 AND (p_branch_id IS NULL OR s.branch_id=p_branch_id);
 SELECT coalesce(sum(si.quantity*si.cost_price),0) INTO v_cogs
 FROM public.sale_items si JOIN public.sales s ON s.id=si.sale_id AND s.org_id=si.org_id
 WHERE s.org_id=v_org AND s.sale_date::date BETWEEN p_from AND p_to
 AND s.deleted_at IS NULL AND s.status NOT IN('cancelled','void')
 AND (p_branch_id IS NULL OR s.branch_id=p_branch_id);
 SELECT coalesce(sum(l.total_customer_charge),0),coalesce(sum(l.total_supplier_cost),0)
 INTO v_laundry,v_laundry_cogs FROM public.laundry_orders l
 WHERE l.org_id=v_org AND l.deleted_at IS NULL AND l.status NOT IN('cancelled','void')
 AND l.created_at::date BETWEEN p_from AND p_to
 AND (p_branch_id IS NULL OR l.branch_id=p_branch_id);
 SELECT coalesce(sum(o.advance+o.balance),0),
  coalesce(sum(o.external_material_cost+o.order_expenses_total),0)
 INTO v_tailoring,v_tailoring_cost FROM public.orders o
 WHERE o.org_id=v_org AND o.deleted_at IS NULL AND o.status NOT IN('cancelled','void')
 AND o.order_date::date BETWEEN p_from AND p_to
 AND (p_branch_id IS NULL OR o.branch_id=p_branch_id);
 SELECT coalesce(sum(amount) FILTER (WHERE kind='expense'),0),
 coalesce(sum(amount) FILTER (WHERE kind='supplier_payment'),0),
 coalesce(sum(amount) FILTER (WHERE kind IN('customer_receipt','customer_advance')),0)
 INTO v_expenses,v_supplier_paid,v_collections
 FROM public.saas_finance_entries
 WHERE org_id=v_org AND created_at::date BETWEEN p_from AND p_to
 AND (p_branch_id IS NULL OR branch_id=p_branch_id);
 SELECT coalesce(sum(g.total),0) INTO v_grn
 FROM public.saas_supplier_payables g
 JOIN public.saas_purchase_orders po ON po.id=g.order_id AND po.org_id=g.org_id
 WHERE g.org_id=v_org AND po.received_at::date BETWEEN p_from AND p_to
 AND (p_branch_id IS NULL OR po.branch_id=p_branch_id);
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'id',a.id,'kind',a.kind,'name',a.name,'branch_id',a.branch_id,
 'balance',a.opening_balance+coalesce(
 (SELECT sum(e.signed_delta) FROM public.saas_finance_entries e
 WHERE e.account_id=a.id AND e.org_id=v_org),0))
 ORDER BY a.kind,a.name),'[]'::jsonb)
 INTO v_accounts FROM public.saas_finance_accounts a
 WHERE a.org_id=v_org AND (p_branch_id IS NULL OR a.branch_id=p_branch_id);
 v_daybook:=pg_catalog.jsonb_build_object(
  'from',p_from,'to',p_to,'org_id',v_org,'branch_id',p_branch_id,
  'sales_gross',v_sales,'sales_gst_recorded',v_tax,
  'sales_net',v_sales-v_tax,'sales_cogs',v_cogs,
  'laundry_revenue',v_laundry,'laundry_supplier_cost',v_laundry_cogs,
  'tailoring_revenue',v_tailoring,'tailoring_direct_cost',v_tailoring_cost,
  'operating_expenses',v_expenses,
  'operating_surplus_estimate',
   (v_sales-v_tax+v_laundry+v_tailoring-v_cogs-v_laundry_cogs-v_tailoring_cost-v_expenses),
  'vendor_grn_payables_created',v_grn,'supplier_payments',v_supplier_paid,
  'customer_collections_posted',v_collections,'cash_bank_accounts',v_accounts,
  'financial_statement_status','provisional_before_tax_reconciliation');
 RETURN v_daybook;
END;$fn$;
REVOKE ALL ON FUNCTION public.saas_finance_open_account_once(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_finance_post_once(uuid,uuid,text,uuid,numeric,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.saas_finance_daybook(date,date,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_finance_open_account_once(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_finance_post_once(uuid,uuid,text,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_finance_daybook(date,date,uuid) TO authenticated;
