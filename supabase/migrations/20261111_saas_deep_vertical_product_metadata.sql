-- P0: tenant-authorized, atomic product + industry metadata writes.
-- This is product-level metadata, NOT per-batch stock reservation or serial consumption.
-- Regulated medicine sales, per-unit serial billing and non-INR tax invoices remain gated.
create table if not exists public.saas_product_vertical_details (
  product_id uuid primary key references public.products(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  industry_id text not null check (industry_id = any(array[
    'fmcg_supermarket','pharmacy_medical','electronics_computer',
    'bakery_cafe_restaurant','boutique_apparel','laundry_tailoring','general_trading_b2b'
  ])),
  batch_number text,
  expiry_date date,
  drug_formulation text,
  drug_schedule text,
  serial_imei text,
  warranty_months integer check (warranty_months between 0 and 240),
  mrp_price numeric(18,3) check (mrp_price >= 0),
  recipe_reference text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint saas_vertical_batch_length check (batch_number is null or char_length(batch_number) between 1 and 120),
  constraint saas_vertical_serial_length check (serial_imei is null or char_length(serial_imei) between 5 and 120),
  constraint saas_vertical_text_lengths check (
    (drug_formulation is null or char_length(drug_formulation) between 1 and 240) and
    (drug_schedule is null or char_length(drug_schedule) between 1 and 120) and
    (recipe_reference is null or char_length(recipe_reference) between 1 and 240))
);
create unique index if not exists saas_vertical_tenant_serial_uq
on public.saas_product_vertical_details(org_id, lower(serial_imei)) where serial_imei is not null;
create index if not exists saas_vertical_tenant_expiry_idx
on public.saas_product_vertical_details(org_id,expiry_date) where expiry_date is not null;
alter table public.saas_product_vertical_details enable row level security;
revoke all on public.saas_product_vertical_details from public,anon;
grant select,insert,update on public.saas_product_vertical_details to authenticated;
drop policy if exists saas_vertical_member_select on public.saas_product_vertical_details;
create policy saas_vertical_member_select on public.saas_product_vertical_details
 for select to authenticated using (exists (
  select 1 from public.organization_members m where m.org_id = saas_product_vertical_details.org_id
   and m.user_id = (select auth.uid())
 ));
drop policy if exists saas_vertical_role_insert on public.saas_product_vertical_details;
create policy saas_vertical_role_insert on public.saas_product_vertical_details for insert to authenticated
 with check (public.user_has_org_role(org_id,array['super_admin','admin','manager']));
drop policy if exists saas_vertical_role_update on public.saas_product_vertical_details;
create policy saas_vertical_role_update on public.saas_product_vertical_details for update to authenticated
 using (public.user_has_org_role(org_id,array['super_admin','admin','manager']))
 with check (public.user_has_org_role(org_id,array['super_admin','admin','manager']));

create or replace function public.saas_save_vertical_product(
 p_product_id uuid,p_product jsonb,p_details jsonb,p_expected_version integer
) returns jsonb
language plpgsql security invoker set search_path to ''
as $$
declare
 v_user uuid := (select auth.uid());
 v_org uuid;
 v_enabled text[];
 v_vertical text := nullif(btrim(p_details->>'industry_id'),'');
 v_category uuid;
 v_cost numeric;
 v_sell numeric;
 v_stock numeric;
 v_min_stock numeric;
 v_version integer;
 v_batch text := nullif(btrim(p_details->>'batch_number'),'');
 v_expiry date := nullif(p_details->>'expiry_date','')::date;
 v_formulation text := nullif(btrim(p_details->>'drug_formulation'),'');
 v_schedule text := nullif(btrim(p_details->>'drug_schedule'),'');
 v_serial text := nullif(btrim(p_details->>'serial_imei'),'');
 v_warranty integer := nullif(p_details->>'warranty_months','')::integer;
 v_mrp numeric := nullif(p_details->>'mrp_price','')::numeric;
 v_recipe text := nullif(btrim(p_details->>'recipe_reference'),'');
 v_name text := nullif(btrim(p_product->>'name'),'');
 v_unit text := nullif(btrim(p_product->>'unit'),'');
begin
 if v_user is null or p_product_id is null
  or jsonb_typeof(p_product) is distinct from 'object'
  or jsonb_typeof(p_details) is distinct from 'object' then
   raise exception 'Signed-in user and structured product fields required' using errcode='42501';
 end if;
 select auth_org_id into v_org from public.current_user_authorization();
 if v_org is null or not exists (
  select 1 from public.organization_members m
  where m.org_id=v_org and m.user_id=v_user
   and m.role=any(array['super_admin','admin','manager']::text[])
 ) then raise exception 'Tenant product role denied' using errcode='42501'; end if;
 select enabled_verticals into v_enabled from public.saas_tenant_industry_profiles
 where org_id=v_org;
 if v_enabled is null or v_vertical is null or not(v_vertical=any(v_enabled)) then
  raise exception 'Product industry not enabled for tenant' using errcode='42501';
 end if;
 if v_name is null or v_unit is null
   or char_length(v_name)>500 or char_length(v_unit)>40
   or jsonb_typeof(p_product->'is_active') is distinct from 'boolean' then
  raise exception 'Invalid product name, unit or status' using errcode='22023'; end if;
 v_category := nullif(p_product->>'category_id','')::uuid;
 v_cost := (p_product->>'cost_price')::numeric;
 v_sell := (p_product->>'selling_price')::numeric;
 v_stock := (p_product->>'stock_quantity')::numeric;
 v_min_stock := (p_product->>'minimum_stock')::numeric;
 if v_cost is null or v_sell is null or v_stock is null or v_min_stock is null
   or least(v_cost,v_sell,v_stock,v_min_stock)<0
   or greatest(v_stock,v_min_stock)>999999999
   or greatest(v_cost,v_sell)>999999999999 then
  raise exception 'Invalid product price or stock input' using errcode='22023'; end if;
 if v_category is not null and not exists (
  select 1 from public.categories c where c.id=v_category and c.org_id=v_org and c.deleted_at is null
 ) then raise exception 'Category belongs to another tenant' using errcode='42501'; end if;
 if v_vertical in ('pharmacy_medical','fmcg_supermarket','bakery_cafe_restaurant')
   and (v_batch is null or v_expiry is null) then
   raise exception 'Batch number and expiry date are required for this industry'
    using errcode='23514';
 end if;
 if v_vertical='pharmacy_medical' and (v_formulation is null or v_schedule is null) then
  raise exception 'Medicine formulation and schedule are required' using errcode='23514';
 end if;
 if v_vertical='electronics_computer' and (v_serial is null or v_warranty is null) then
  raise exception 'Serial / IMEI and warranty months are required' using errcode='23514';
 end if;
 if v_mrp is not null and (v_mrp<0 or v_sell>v_mrp) then
  raise exception 'Selling price cannot exceed MRP' using errcode='23514';
 end if;
 if p_expected_version is null then
  perform public.create_product_with_opening_stock(
    p_product_id,v_name,
    nullif(btrim(p_product->>'sku'),''),
    nullif(btrim(p_product->>'barcode'),''),
    v_category,v_unit,v_cost,v_sell,v_stock,v_min_stock,
    (p_product->>'is_active')::boolean
  );
  v_version:=1;
 else
  if p_expected_version<1 then raise exception 'Invalid product revision' using errcode='22023'; end if;
  update public.products p set
   name=v_name,sku=nullif(btrim(p_product->>'sku'),''),
   barcode=nullif(btrim(p_product->>'barcode'),''),
   category_id=v_category,unit=v_unit,cost_price=v_cost,
   selling_price=v_sell,minimum_stock=v_min_stock,
   is_active=(p_product->>'is_active')::boolean,
   version=p.version+1,updated_at=clock_timestamp()
  where p.id=p_product_id and p.org_id=v_org and p.deleted_at is null
   and p.version=p_expected_version and p.stock_quantity=v_stock
  returning p.version into v_version;
  if v_version is null then
   raise exception 'Stale product revision or stock changed' using errcode='40001';
  end if;
 end if;
 insert into public.saas_product_vertical_details(
  product_id,org_id,industry_id,batch_number,expiry_date,
  drug_formulation,drug_schedule,serial_imei,warranty_months,mrp_price,recipe_reference
 ) values (
  p_product_id,v_org,v_vertical,v_batch,v_expiry,
  v_formulation,v_schedule,v_serial,v_warranty,v_mrp,v_recipe
 )
 on conflict(product_id) do update set
  industry_id=excluded.industry_id,batch_number=excluded.batch_number,
  expiry_date=excluded.expiry_date,drug_formulation=excluded.drug_formulation,
  drug_schedule=excluded.drug_schedule,serial_imei=excluded.serial_imei,
  warranty_months=excluded.warranty_months,mrp_price=excluded.mrp_price,
  recipe_reference=excluded.recipe_reference,updated_at=clock_timestamp()
 where saas_product_vertical_details.org_id=excluded.org_id;
 if not found then
  raise exception 'Cross-tenant product metadata update denied' using errcode='42501';
 end if;
 return jsonb_build_object('id',p_product_id,'org_id',v_org,
  'version',v_version,'industry_id',v_vertical,'stock_quantity',v_stock);
end;
$$;
revoke all on function public.saas_save_vertical_product(uuid,jsonb,jsonb,integer) from public,anon;
grant execute on function public.saas_save_vertical_product(uuid,jsonb,jsonb,integer) to authenticated;
