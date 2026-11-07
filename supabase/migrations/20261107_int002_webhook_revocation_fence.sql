-- INT-002: immediately fence undelivered outbox entries when a subscription is
-- disabled, deleted, changes destination, or loses an event. No HTTP requests or feature activation.
-- This is additive; subscriptions and delivered audit rows remain intact.
create or replace function public.fence_integration_webhook_revocation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.integration_webhook_delivery_outbox o
       set status = 'dead', lease_until = null, updated_at = now()
     where o.tenant_id = old.tenant_id and o.company_id = old.company_id
       and o.branch_key = old.branch_key and o.subscription_id = old.subscription_id
       and o.status in ('pending', 'leased');
    return old;
  end if;

  if old.enabled and (not new.enabled or new.events is distinct from old.events
    or new.endpoint is distinct from old.endpoint) then
    update public.integration_webhook_delivery_outbox o
       set status = 'dead', lease_until = null, updated_at = now()
     where o.tenant_id = old.tenant_id and o.company_id = old.company_id
       and o.branch_key = old.branch_key and o.subscription_id = old.subscription_id
       and o.status in ('pending', 'leased')
       and (not new.enabled or new.endpoint is distinct from old.endpoint
         or not (o.event_type = any(new.events)));
  end if;
  return new;
end;
$$;
revoke all on function public.fence_integration_webhook_revocation() from public, anon, authenticated;
drop trigger if exists integration_webhook_revocation_fence on public.integration_webhook_subscriptions;
create trigger integration_webhook_revocation_fence
after update of enabled, events, endpoint or delete on public.integration_webhook_subscriptions
for each row execute function public.fence_integration_webhook_revocation();
comment on function public.fence_integration_webhook_revocation()
is 'Immediately dead-letter queued/leased deliveries on subscription revocation or endpoint change; preserve delivered audit records.';
