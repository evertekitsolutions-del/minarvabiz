-- P0 tenant industry profile: presentation configuration, NOT module entitlements.
-- Additive and fail-closed; preserves existing businesses and financial records.
create table if not exists public.saas_tenant_industry_profiles (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  primary_vertical text,
  enabled_verticals text[] not null default '{}'::text[],
  enabled_modules text[] not null default '{}'::text[],
  country_code text not null default 'IN',
  currency_code text not null default 'INR',
  language_code text not null default 'en',
  updated_at timestamptz not null default clock_timestamp(),
  constraint saas_industry_primary_valid check (primary_vertical is null or primary_vertical = any(array[
    'fmcg_supermarket','pharmacy_medical','electronics_computer','bakery_cafe_restaurant',
    'boutique_apparel','laundry_tailoring','general_trading_b2b','multi_vertical'
  ])),
  constraint saas_industry_verticals_valid check (
    enabled_verticals <@ array['fmcg_supermarket','pharmacy_medical',
    'electronics_computer','bakery_cafe_restaurant','boutique_apparel',
    'laundry_tailoring','general_trading_b2b']::text[]
    and cardinality(enabled_verticals) <= 7
    and (primary_vertical is null or primary_vertical = 'multi_vertical'
      or primary_vertical = any(enabled_verticals))
  ),
  constraint saas_industry_modules_valid check (enabled_modules <@ array[
    'crm','online_store','marketing','loyalty','field_service'
  ]::text[]),
  constraint saas_industry_region_valid check (
    country_code ~ '^[A-Z]{2}$'
    and currency_code = any(array['INR','OMR','AED','SAR','USD','EUR'])
    and language_code = any(array['en','ar'])
  )
);
alter table public.saas_tenant_industry_profiles enable row level security;
revoke all on public.saas_tenant_industry_profiles from public,anon;
grant select,update on public.saas_tenant_industry_profiles to authenticated;
drop policy if exists saas_industry_member_read on public.saas_tenant_industry_profiles;
create policy saas_industry_member_read on public.saas_tenant_industry_profiles
for select to authenticated using (exists (
 select 1 from public.organization_members m
 where m.org_id = saas_tenant_industry_profiles.org_id
 and m.user_id = (select auth.uid())
));
drop policy if exists saas_industry_admin_update on public.saas_tenant_industry_profiles;
create policy saas_industry_admin_update on public.saas_tenant_industry_profiles
for update to authenticated
using (public.user_has_org_role(org_id,array['super_admin','admin']))
with check (public.user_has_org_role(org_id,array['super_admin','admin']));
-- Org ID cannot be reassigned, even by an administrator of multiple tenants.
create or replace function private.saas_industry_profile_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.org_id is distinct from old.org_id then
   raise exception 'Tenant profile ownership cannot be reassigned' using errcode='42501';
 end if;
 new.updated_at := clock_timestamp();
 return new;
end; $$;
drop trigger if exists saas_industry_touch on public.saas_tenant_industry_profiles;
create trigger saas_industry_touch before update on public.saas_tenant_industry_profiles
for each row execute function private.saas_industry_profile_touch();

-- Existing businesses are unclassified, never silently assigned boutique or a tax rule.
insert into public.saas_tenant_industry_profiles(org_id)
select id from public.organizations on conflict(org_id) do nothing;

-- Preserve legacy bootstrap security/special license-admin bypass exactly. Signup
-- user_metadata is only a PRESENTATION preference and never grants entitlements.
create or replace function private.bootstrap_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 new_org_id uuid;
 display_name text;
 shop_name text;
 requested_industry text;
 verticals text[] := '{}'::text[];
 requested_region text;
 requested_currency text;
 requested_language text;
begin
 if coalesce(new.raw_app_meta_data ->> 'minarva_license_admin_bootstrap','')='true' then
   return new;
 end if;
 display_name:=nullif(coalesce(new.raw_user_meta_data->>'full_name',''),'');
 if display_name is null then
   display_name:=split_part(coalesce(new.email,'Minarva Biz User'),'@',1);
 end if;
 shop_name:=nullif(coalesce(new.raw_user_meta_data->>'shop_name',''),'');
 if shop_name is null then shop_name:=display_name||'''s Minarva Biz'; end if;
 insert into public.organizations(name) values(shop_name) returning id into new_org_id;
 insert into public.profiles(id,full_name,role) values(new.id,display_name,'admin')
 on conflict(id) do update set full_name=excluded.full_name,updated_at=now();
 insert into public.organization_members(org_id,user_id,role)
 values(new_org_id,new.id,'admin') on conflict(org_id,user_id) do nothing;
 insert into public.branches(name,code,is_headquarters,is_active,org_id)
 values('Main Branch','HQ',true,true,new_org_id);

 requested_industry:=new.raw_user_meta_data->>'requested_industry';
 if requested_industry is null or requested_industry <> all(array[
   'fmcg_supermarket','pharmacy_medical','electronics_computer',
   'bakery_cafe_restaurant','boutique_apparel','laundry_tailoring',
   'general_trading_b2b','multi_vertical'
 ]) then requested_industry:=null; end if;
 if requested_industry='multi_vertical' then
   select coalesce(array_agg(distinct x), '{}'::text[]) into verticals
   from jsonb_array_elements_text(case
    when jsonb_typeof(new.raw_user_meta_data->'requested_verticals')='array'
    then new.raw_user_meta_data->'requested_verticals'
    else '[]'::jsonb end) x
   where x=any(array['fmcg_supermarket','pharmacy_medical','electronics_computer',
     'bakery_cafe_restaurant','boutique_apparel','laundry_tailoring','general_trading_b2b']);
 elsif requested_industry is not null then
   verticals:=array[requested_industry];
 end if;
 requested_region:=new.raw_user_meta_data->>'requested_country';
 if requested_region is null or requested_region !~ '^[A-Z]{2}$'
 then requested_region:='IN'; end if;
 requested_currency:=new.raw_user_meta_data->>'requested_currency';
 if requested_currency is null or requested_currency <> all(array[
   'INR','OMR','AED','SAR','USD','EUR']) then requested_currency:='INR'; end if;
 requested_language:=new.raw_user_meta_data->>'requested_language';
 if requested_language is distinct from 'ar' then requested_language:='en'; end if;
 insert into public.saas_tenant_industry_profiles(
   org_id,primary_vertical,enabled_verticals,country_code,currency_code,language_code)
 values(new_org_id,requested_industry,verticals,requested_region,requested_currency,requested_language);
 return new;
end; $$;
