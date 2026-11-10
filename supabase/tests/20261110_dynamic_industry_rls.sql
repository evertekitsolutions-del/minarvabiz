-- Read-only assertion after P0 dynamic industry migration.
-- This static RLS check does NOT replace real signed JWT A/B/staff API tests.
do $$
declare n integer;
begin
 select count(*) into n from pg_tables
 where schemaname='public' and tablename='saas_tenant_industry_profiles' and rowsecurity;
 if n<>1 then raise exception 'Industry preferences must use RLS'; end if;
 select count(*) into n from pg_policies
 where schemaname='public' and tablename='saas_tenant_industry_profiles'
 and policyname in ('saas_industry_member_read','saas_industry_admin_update')
 and roles @> array['authenticated']::name[];
 if n<>2 then raise exception 'Tenant policy set incomplete, found %',n; end if;
 select count(*) into n from pg_policies
 where schemaname='public' and tablename='saas_tenant_industry_profiles'
 and ((coalesce(qual,'') ~ '([a-z_]+)\.org_id\s*=\s*\1\.org_id')
  or (coalesce(with_check,'') ~ '([a-z_]+)\.org_id\s*=\s*\1\.org_id'));
 if n<>0 then raise exception 'Unsafe tautological industry org policy'; end if;
 if exists(select 1 from pg_policies where schemaname='public'
   and tablename='saas_tenant_industry_profiles' and cmd in ('INSERT','DELETE'))
 then raise exception 'Industry profiles must not permit tenant INSERT/DELETE'; end if;
 select count(*) into n from public.organizations o left join
 public.saas_tenant_industry_profiles p on p.org_id=o.id where p.org_id is null;
 if n<>0 then raise exception '% organizations lack industry profile',n; end if;
end $$;
