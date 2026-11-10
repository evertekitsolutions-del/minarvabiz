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

-- Additional fail-closed checks: no client DML, no dispatch state, tenant-scoped keys.
do $$
declare r text; n integer;
begin
 foreach r in array array['anon','authenticated'] loop
   if has_schema_privilege(r,'agent3_prototype','USAGE') then
     raise exception 'client role % can use prototype schema',r;
   end if;
   if has_table_privilege(r,'agent3_prototype.loyalty_events','INSERT,UPDATE,DELETE,SELECT')
      or has_table_privilege(r,'agent3_prototype.loyalty_tier_rules','INSERT,UPDATE,DELETE,SELECT')
      or has_table_privilege(r,'agent3_prototype.notification_outbox','INSERT,UPDATE,DELETE,SELECT') then
     raise exception 'client role % can access prototype tables',r;
   end if;
 end loop;
 select count(*) into n from pg_constraint
 where conrelid='agent3_prototype.notification_outbox'::regclass
 and contype='c' and pg_get_constraintdef(oid) like '%held%cancelled%';
 if n <> 1 then raise exception 'outbox not held/cancelled only'; end if;
end $$;
-- Constraint negative tests. Each subtransaction rolls back only the invalid row.
do $$
begin
 begin
  insert into agent3_prototype.loyalty_events(tenant_id,branch_id,customer_id,source_key,kind,points_delta)
  values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','qa-invalid-redemption','redemption',10);
  raise exception 'positive redemption accepted';
 exception when check_violation then null; end;
 begin
  insert into agent3_prototype.loyalty_events(tenant_id,branch_id,customer_id,source_key,kind,points_delta)
  values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','qa-invalid-reversal','reversal',10);
  raise exception 'reversal without source accepted';
 exception when check_violation then null; end;
 begin
  insert into agent3_prototype.notification_outbox(tenant_id,customer_id,channel,event_key,consent_snapshot_id,status)
  values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',
  'sms','qa-no-send','00000000-0000-0000-0000-000000000004','sent');
  raise exception 'dispatchable outbox status accepted';
 exception when check_violation then null; end;
end $$;

rollback;
