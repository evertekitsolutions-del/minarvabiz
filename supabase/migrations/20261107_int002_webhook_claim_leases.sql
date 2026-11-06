-- INT-002 backend-only concurrent lease claim for durable webhook dispatch.
-- Does not perform HTTP, handle secrets or enable any webhook.
create or replace function public.claim_integration_webhook_deliveries(
  p_limit integer default 10, p_lease_seconds integer default 60
) returns setof public.integration_webhook_delivery_outbox
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 or
     p_lease_seconds is null or p_lease_seconds not between 10 and 300 then
    raise exception 'Invalid webhook lease parameters' using errcode = '22023';
  end if;
  -- A worker can crash after claiming its final permitted attempt. Without
  -- this transition such rows remain leased forever and never enter the
  -- dead-letter queue. Keep the terminal transition fenced by lease expiry.
  update public.integration_webhook_delivery_outbox o
  set status = 'dead', lease_until = null, updated_at = now()
  where o.status = 'leased' and o.lease_until <= now()
    and o.attempt_count >= 20;

  return query
  with eligible as (
    select o.tenant_id, o.company_id, o.branch_key, o.delivery_id
    from public.integration_webhook_delivery_outbox o
    join public.integration_webhook_subscriptions s
      on s.tenant_id = o.tenant_id and s.company_id = o.company_id
      and s.branch_key = o.branch_key and s.subscription_id = o.subscription_id
    where s.enabled = true and o.event_type = any(s.events)
      and o.attempt_count < 20
      and ((o.status = 'pending' and o.next_attempt_at <= now())
        or (o.status = 'leased' and o.lease_until <= now()))
    order by o.next_attempt_at, o.created_at
    for update of o skip locked
    limit p_limit
  )
  update public.integration_webhook_delivery_outbox o
  set status = 'leased', lease_until = now() + make_interval(secs => p_lease_seconds),
      attempt_count = o.attempt_count + 1, updated_at = now()
  from eligible e
  where o.tenant_id = e.tenant_id and o.company_id = e.company_id
    and o.branch_key = e.branch_key and o.delivery_id = e.delivery_id
  returning o.*;
end;
$$;
revoke all on function public.claim_integration_webhook_deliveries(integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_integration_webhook_deliveries(integer,integer) to service_role;
comment on function public.claim_integration_webhook_deliveries(integer,integer)
  is 'Service-role-only SKIP LOCKED lease claim; requires separately authorized worker and network safety checks.';
