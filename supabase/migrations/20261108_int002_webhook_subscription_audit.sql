-- INT-002: append-only subscription configuration audit; never stores endpoints or secrets.
create table if not exists public.integration_webhook_subscription_audit (
  audit_id bigint generated always as identity primary key,
  tenant_id text not null,
  company_id text not null,
  branch_key text not null,
  subscription_id text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_revision integer,
  new_revision integer,
  old_enabled boolean,
  new_enabled boolean,
  changed_at timestamptz not null default clock_timestamp()
);
create index if not exists integration_webhook_subscription_audit_scope_idx
  on public.integration_webhook_subscription_audit
  (tenant_id, company_id, branch_key, subscription_id, audit_id desc);
alter table public.integration_webhook_subscription_audit enable row level security;
alter table public.integration_webhook_subscription_audit force row level security;
revoke all on public.integration_webhook_subscription_audit from public, anon, authenticated;
grant select on public.integration_webhook_subscription_audit to service_role;
create or replace function public.audit_integration_webhook_subscription()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- DELETE has no NEW row and INSERT has no OLD row. Never dereference
  -- an unassigned trigger record or silently mix scope across revisions.
  if tg_op = 'DELETE' then
    insert into public.integration_webhook_subscription_audit
      (tenant_id, company_id, branch_key, subscription_id, operation,
       old_revision, new_revision, old_enabled, new_enabled)
    values (old.tenant_id, old.company_id, old.branch_key, old.subscription_id,
            tg_op, old.revision, null, old.enabled, null);
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.integration_webhook_subscription_audit
      (tenant_id, company_id, branch_key, subscription_id, operation,
       old_revision, new_revision, old_enabled, new_enabled)
    values (new.tenant_id, new.company_id, new.branch_key, new.subscription_id,
            tg_op, null, new.revision, null, new.enabled);
    return new;
  end if;
  -- An UPDATE must never silently move a subscription or its audit history
  -- between tenants/companies/branches, even for privileged API writers.
  if (old.tenant_id, old.company_id, old.branch_key, old.subscription_id)
     is distinct from
     (new.tenant_id, new.company_id, new.branch_key, new.subscription_id) then
    raise exception 'Webhook subscription scope is immutable' using errcode = '23514';
  end if;
  if new.revision <= old.revision then
    raise exception 'Webhook subscription revision must increase' using errcode = '23514';
  end if;
  insert into public.integration_webhook_subscription_audit
    (tenant_id, company_id, branch_key, subscription_id, operation,
     old_revision, new_revision, old_enabled, new_enabled)
  values (new.tenant_id, new.company_id, new.branch_key, new.subscription_id,
          tg_op, old.revision, new.revision, old.enabled, new.enabled);
  return new;
end;
$$;
revoke all on function public.audit_integration_webhook_subscription()
  from public, anon, authenticated, service_role;
drop trigger if exists integration_webhook_subscription_audit_trg
  on public.integration_webhook_subscriptions;
create trigger integration_webhook_subscription_audit_trg
after insert or update or delete on public.integration_webhook_subscriptions
for each row execute function public.audit_integration_webhook_subscription();
