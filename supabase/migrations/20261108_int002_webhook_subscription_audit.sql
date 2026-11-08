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
  insert into public.integration_webhook_subscription_audit
    (tenant_id, company_id, branch_key, subscription_id, operation,
     old_revision, new_revision, old_enabled, new_enabled)
  values (coalesce(new.tenant_id,old.tenant_id),
          coalesce(new.company_id,old.company_id),
          coalesce(new.branch_key,old.branch_key),
          coalesce(new.subscription_id,old.subscription_id),
          tg_op,
          case when tg_op = 'INSERT' then null else old.revision end,
          case when tg_op = 'DELETE' then null else new.revision end,
          case when tg_op = 'INSERT' then null else old.enabled end,
          case when tg_op = 'DELETE' then null else new.enabled end);
  return coalesce(new,old);
end;
$$;
revoke all on function public.audit_integration_webhook_subscription()
  from public, anon, authenticated, service_role;
drop trigger if exists integration_webhook_subscription_audit_trg
  on public.integration_webhook_subscriptions;
create trigger integration_webhook_subscription_audit_trg
after insert or update or delete on public.integration_webhook_subscriptions
for each row execute function public.audit_integration_webhook_subscription();
