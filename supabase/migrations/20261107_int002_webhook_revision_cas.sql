-- INT-002: atomic optimistic concurrency for the service-role webhook adapter.
-- Endpoint/DNS checks and authenticated RBAC remain mandatory at the API boundary.
create or replace function public.save_integration_webhook_subscription(
  p_tenant_id text, p_company_id text, p_branch_key text,
  p_subscription_id text, p_endpoint text, p_events text[],
  p_enabled boolean, p_expected_revision integer
) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare v_revision integer;
begin
  if p_expected_revision is null or p_expected_revision < 0
     or p_tenant_id is null or p_company_id is null or p_branch_key is null
     or p_subscription_id is null or p_endpoint is null or p_events is null
     or p_enabled is null then
    raise exception 'Invalid webhook subscription mutation' using errcode = '22023';
  end if;
  -- Insert-only on revision zero; concurrent inserts resolve through the PK.
  if p_expected_revision = 0 then
    insert into public.integration_webhook_subscriptions
      (tenant_id, company_id, branch_key, subscription_id, endpoint, events, enabled, revision)
    values (p_tenant_id, p_company_id, p_branch_key, p_subscription_id,
            p_endpoint, p_events, p_enabled, 1)
    on conflict do nothing
    returning revision into v_revision;
  else
    update public.integration_webhook_subscriptions
    set endpoint = p_endpoint, events = p_events, enabled = p_enabled,
        revision = revision + 1, updated_at = now()
    where tenant_id = p_tenant_id and company_id = p_company_id
      and branch_key = p_branch_key and subscription_id = p_subscription_id
      and revision = p_expected_revision
    returning revision into v_revision;
  end if;
  if v_revision is null then
    raise exception 'Webhook subscription revision conflict' using errcode = '40001';
  end if;
  return v_revision;
end;
$$;
revoke all on function public.save_integration_webhook_subscription(text,text,text,text,text,text[],boolean,integer)
  from public, anon, authenticated;
grant execute on function public.save_integration_webhook_subscription(text,text,text,text,text,text[],boolean,integer)
  to service_role;
comment on function public.save_integration_webhook_subscription(text,text,text,text,text,text[],boolean,integer)
  is 'Service-role only atomic scoped revision CAS; API must authorize caller and validate HTTPS/DNS before calling.';
