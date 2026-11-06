-- INT-002: disabled-by-default webhook subscription persistence (no delivery activation).
-- Service role is the only database writer until an authenticated RBAC API is reviewed.
create table if not exists public.integration_webhook_subscriptions (
  tenant_id text not null check (tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  company_id text not null check (company_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  branch_key text not null default '' check (branch_key = '' or branch_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  subscription_id text not null check (subscription_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  endpoint text not null check (length(endpoint) between 1 and 2048),
  events text[] not null check (cardinality(events) between 1 and 4 and events <@ array['customer.created','invoice.created','invoice.paid','stock.low']::text[]),
  enabled boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, company_id, branch_key, subscription_id)
);
alter table public.integration_webhook_subscriptions enable row level security;
alter table public.integration_webhook_subscriptions force row level security;
revoke all on public.integration_webhook_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.integration_webhook_subscriptions to service_role;
comment on table public.integration_webhook_subscriptions is
  'INT-002 opt-in subscription configuration; service-role only, no outbound dispatcher or public API.';
