-- M4 online tenant-scoped export and NON-DESTRUCTIVE restore validation.
-- No write/restore function is granted. Sensitive JSON must be downloaded manually.
CREATE OR REPLACE FUNCTION public.saas_tenant_backup_export(
 p_row_limit integer DEFAULT 1000
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_org uuid;
 v_user uuid:=(SELECT auth.uid());
 v_data jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL
   OR NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin'])
 THEN RAISE EXCEPTION 'Tenant backup administrator required' USING ERRCODE='42501';
 END IF;
 IF p_row_limit IS NULL OR p_row_limit<1 OR p_row_limit>2000 THEN
  RAISE EXCEPTION 'Backup row limit must be 1..2000 per collection' USING ERRCODE='22023';
 END IF;
 v_data:=pg_catalog.jsonb_build_object(
 'branches',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,name,code FROM public.branches b
 WHERE b.org_id=v_org AND b.deleted_at IS NULL ORDER BY b.id LIMIT p_row_limit) r),'[]'::jsonb),
 'products',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,name,sku,barcode,stock_quantity,selling_price,cost_price,version
 FROM public.products p WHERE p.org_id=v_org AND p.deleted_at IS NULL ORDER BY p.id LIMIT p_row_limit) r),'[]'::jsonb),
 'customers',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,name,phone,email,outstanding_balance,version
 FROM public.customers c WHERE c.org_id=v_org AND c.deleted_at IS NULL ORDER BY c.id LIMIT p_row_limit) r),'[]'::jsonb),
 'sales',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,customer_id,invoice_number,total,paid_amount,balance_amount,status
 FROM public.sales s WHERE s.org_id=v_org AND s.deleted_at IS NULL ORDER BY s.id LIMIT p_row_limit) r),'[]'::jsonb),
 'laundry_orders',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,customer_id,garment,quantity,total_customer_charge,paid_amount,status
 FROM public.laundry_orders l WHERE l.org_id=v_org AND l.deleted_at IS NULL ORDER BY l.id LIMIT p_row_limit) r),'[]'::jsonb),
 'tailoring_orders',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,customer_id,order_number,price,advance,balance,status
 FROM public.orders o WHERE o.org_id=v_org AND o.deleted_at IS NULL ORDER BY o.id LIMIT p_row_limit) r),'[]'::jsonb),
 'payments',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,customer_id,reference_id,reference_type,method,amount,paid_at
 FROM public.payments p WHERE p.org_id=v_org ORDER BY p.id LIMIT p_row_limit) r),'[]'::jsonb),
 'inventory_transactions',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))
 FROM (SELECT id,org_id,branch_id,product_id,movement_type,quantity,balance_after,reference_id
 FROM public.inventory_transactions t WHERE t.org_id=v_org ORDER BY t.id LIMIT p_row_limit) r),'[]'::jsonb)
 );
 RETURN pg_catalog.jsonb_build_object(
  'format','minarva-tenant-archive','schema_version',1,'org_id',v_org,
  'created_at',pg_catalog.now(),'row_limit',p_row_limit,'records',v_data,
  'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_data::text,'UTF8')),'hex'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_tenant_backup_export(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_tenant_backup_export(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_tenant_backup_validate(
 p_archive jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_org uuid;
 v_key text;
 v_allowed text[]:=ARRAY['branches','products','customers','sales',
 'laundry_orders','tailoring_orders','payments','inventory_transactions'];
 v_records jsonb;v_rows jsonb;
 v_hash text;v_row jsonb;
 v_count bigint;v_ids bigint;v_invalid bigint;
 v_totals jsonb:='{}'::jsonb;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF (SELECT auth.uid()) IS NULL OR v_org IS NULL
   OR NOT public.user_has_org_role(v_org,ARRAY['super_admin','admin']) THEN
  RAISE EXCEPTION 'Tenant backup validation administrator required' USING ERRCODE='42501';
 END IF;
 IF p_archive IS NULL OR pg_catalog.jsonb_typeof(p_archive)<>'object'
   OR p_archive->>'format' IS DISTINCT FROM 'minarva-tenant-archive'
   OR p_archive->>'schema_version' IS DISTINCT FROM '1'
   OR p_archive->>'org_id' IS DISTINCT FROM v_org::text
   OR pg_catalog.jsonb_typeof(p_archive->'records')<>'object' THEN
  RAISE EXCEPTION 'Invalid format or cross-tenant backup' USING ERRCODE='42501';
 END IF;
 v_records:=p_archive->'records';
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_records))<>8 THEN
  RAISE EXCEPTION 'Archive collections missing or unexpected' USING ERRCODE='22023';
 END IF;
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_records::text,'UTF8')),'hex');
 IF v_hash IS DISTINCT FROM p_archive->>'sha256' THEN
  RAISE EXCEPTION 'Archive digest mismatch' USING ERRCODE='23514';
 END IF;
 FOREACH v_key IN ARRAY v_allowed LOOP
  v_rows:=v_records->v_key;
  IF pg_catalog.jsonb_typeof(v_rows)<>'array'
   OR pg_catalog.jsonb_array_length(v_rows)>2000 THEN
   RAISE EXCEPTION 'Invalid or oversized archive collection %',v_key USING ERRCODE='22023';
  END IF;
  SELECT count(*),count(DISTINCT x->>'id'),
    count(*) FILTER(WHERE
      pg_catalog.jsonb_typeof(x)<>'object' OR
      x->>'org_id' IS DISTINCT FROM v_org::text OR
      (x->>'id') IS NULL OR x->>'id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  INTO v_count,v_ids,v_invalid
  FROM pg_catalog.jsonb_array_elements(v_rows) x;
  IF v_invalid>0 OR v_count<>v_ids THEN
   RAISE EXCEPTION 'Invalid tenant ID or duplicate rows in %',v_key USING ERRCODE='23514';
  END IF;
  v_totals:=v_totals||pg_catalog.jsonb_build_object(v_key,v_count);
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('valid',true,'non_destructive',true,
  'org_id',v_org,'schema_version',1,'sha256',v_hash,
  'row_counts',v_totals,'restore_applied',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_tenant_backup_validate(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_tenant_backup_validate(jsonb) TO authenticated;
