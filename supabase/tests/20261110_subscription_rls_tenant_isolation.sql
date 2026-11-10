-- Run after migration. This policy-definition regression check does not
-- replace independently signed JWT cross-tenant negative HTTP/API tests.
do $$
declare v_count int;
begin
 select count(*) into v_count
 from pg_policies
 where schemaname='public'
 and tablename in (
  'saas_tenant_subscriptions','saas_subscription_checkout_intents',
  'saas_subscription_payment_receipts','saas_subscription_state_events',
  'laundry_service_rate_cards')
 and (
  coalesce(qual,'') ~ '([a-z_]+)\\.org_id\\s*=\\s*\\1\\.org_id'
  or coalesce(with_check,'') ~ '([a-z_]+)\\.org_id\\s*=\\s*\\1\\.org_id'
 );
 if v_count > 0 then
  raise exception 'Found % unscoped same-alias tenant policies',v_count;
 end if;
 for v_count in
  select count(*) from pg_policies
  where schemaname='public' and
   ((tablename='saas_tenant_subscriptions'
      and qual like '%saas_tenant_subscriptions.org_id%')
    or (tablename='saas_subscription_checkout_intents'
      and qual like '%saas_subscription_checkout_intents.org_id%')
    or (tablename='saas_subscription_payment_receipts'
      and qual like '%saas_subscription_payment_receipts.org_id%')
    or (tablename='saas_subscription_state_events'
      and qual like '%saas_subscription_state_events.org_id%'))
 loop
  if v_count<>4 then raise exception 'Four tenant-scoped subscription policies required; found %',v_count;end if;
 end loop;
end $$;
