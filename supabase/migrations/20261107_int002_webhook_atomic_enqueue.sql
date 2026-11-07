-- INT-002: atomic, scoped, idempotent event enqueue. No outbound network or secret access.
-- Invoke only from an authenticated, authorized backend with service-role authority.
create or replace function public.enqueue_integration_webhook_delivery(
  p_tenant_id text, p_company_id text, p_branch_key text,
  p_subscription_id text, p_delivery_id uuid, p_event_id text,
  p_event_type text, p_payload jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_delivery_id is null or p_event_id is null or
     length(p_event_id) not between 1 and 160 or
     p_event_type not in ('customer.created','invoice.created','invoice.paid','stock.low') or
     p_payload is null or jsonb_typeof(p_payload) <> 'object' or
     pg_column_size(p_payload) > 65536 then
    raise exception 'Invalid webhook delivery request' using errcode = '22023';
  end if;
  insert into public.integration_webhook_delivery_outbox
    (tenant_id, company_id, branch_key, subscription_id, delivery_id, event_id, event_type, payload)
  select s.tenant_id, s.company_id, s.branch_key, s.subscription_id,
         p_delivery_id, p_event_id, p_event_type, p_payload
  from public.integration_webhook_subscriptions s
  where s.tenant_id = p_tenant_id
    and s.company_id = p_company_id
    and s.branch_key = p_branch_key
    and s.subscription_id = p_subscription_id
    and s.enabled = true
    and p_event_type = any(s.events)
  on conflict (tenant_id, company_id, branch_key, subscription_id, event_id)
    do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;
revoke all on function public.enqueue_integration_webhook_delivery(text,text,text,text,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_integration_webhook_delivery(text,text,text,text,uuid,text,text,jsonb)
  to service_role;
comment on function public.enqueue_integration_webhook_delivery(text,text,text,text,uuid,text,text,jsonb)
  is 'Backend-only atomic opt-in webhook enqueue; false for disabled/unsubscribed/duplicate events; never dispatches.';
