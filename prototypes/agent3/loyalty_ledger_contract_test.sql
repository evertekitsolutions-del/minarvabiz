-- Execute only against a disposable PostgreSQL database after loading the draft.
begin;
do $$
declare n int;
begin
 select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace
 where s.nspname='agent3_prototype' and c.relname in
 ('loyalty_events','loyalty_tier_rules','notification_outbox') and c.relrowsecurity and c.relforcerowsecurity;
 if n <> 3 then raise exception 'RLS/force RLS missing: %',n; end if;
 if has_table_privilege('anon','agent3_prototype.loyalty_events','INSERT')
 or has_table_privilege('authenticated','agent3_prototype.loyalty_events','SELECT')
 or has_table_privilege('anon','agent3_prototype.notification_outbox','INSERT')
 then raise exception 'unexpected public role privilege'; end if;
end $$;
insert into agent3_prototype.loyalty_events(tenant_id,branch_id,customer_id,source_key,kind,points_delta)
values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
'00000000-0000-0000-0000-000000000003','qa-once','accrual',25);
do $$
begin
 begin
 insert into agent3_prototype.loyalty_events(tenant_id,branch_id,customer_id,source_key,kind,points_delta)
 values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003','qa-once','accrual',25);
 raise exception 'duplicate accepted';
 exception when unique_violation then null; end;
 begin
 update agent3_prototype.loyalty_events set points_delta=100 where source_key='qa-once';
 raise exception 'mutation accepted';
 exception when check_violation then null; end;
end $$;
rollback;
