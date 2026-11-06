-- INT-002: acknowledge a claimed delivery using its exact lease as a fencing token.
-- Service-role worker only. Never stores request secrets or raw response bodies.
create or replace function public.complete_integration_webhook_delivery(
  p_tenant_id text, p_company_id text, p_branch_key text,
  p_delivery_id uuid, p_lease_until timestamptz, p_succeeded boolean
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_tenant_id is null or p_company_id is null or p_branch_key is null
    or p_delivery_id is null or p_lease_until is null or p_succeeded is null then
    raise exception 'Missing webhook delivery acknowledgement parameters' using errcode = '22023';
  end if;
  update public.integration_webhook_delivery_outbox o
  set status = case when p_succeeded then 'delivered'
                    when o.attempt_count >= 20 then 'dead'
                    else 'pending' end,
      delivered_at = case when p_succeeded then now() else null end,
      lease_until = null,
      next_attempt_at = case when p_succeeded then o.next_attempt_at
        else now() + make_interval(secs => least(3600, (power(2::numeric, least(o.attempt_count, 10)) * 5)::integer)) end,
      updated_at = now()
  where o.tenant_id = p_tenant_id and o.company_id = p_company_id
    and o.branch_key = p_branch_key and o.delivery_id = p_delivery_id
    and o.status = 'leased' and o.lease_until = p_lease_until
    and o.lease_until > now()
    -- Consent revocation must fence success: a disabled subscription or
    -- removed event cannot be recorded as successfully delivered.
    and (not p_succeeded or exists (
      select 1 from public.integration_webhook_subscriptions s
      where s.tenant_id = o.tenant_id and s.company_id = o.company_id
        and s.branch_key = o.branch_key and s.subscription_id = o.subscription_id
        and s.enabled = true and o.event_type = any(s.events)
    ));
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;
revoke all on function public.complete_integration_webhook_delivery(text,text,text,uuid,timestamptz,boolean)
  from public, anon, authenticated;
grant execute on function public.complete_integration_webhook_delivery(text,text,text,uuid,timestamptz,boolean)
  to service_role;
comment on function public.complete_integration_webhook_delivery(text,text,text,uuid,timestamptz,boolean)
  is 'Fenced webhook lease acknowledgement: success or bounded exponential retry/dead-letter. Worker must verify signed HTTP response independently.';
