-- INT-002 durable delivery outbox. No network dispatch or secret material is stored here.
create table if not exists public.integration_webhook_delivery_outbox (
  tenant_id text not null,
  company_id text not null,
  branch_key text not null default '',
  subscription_id text not null,
  delivery_id uuid not null,
  event_id text not null check (length(event_id) between 1 and 160),
  event_type text not null check (event_type in ('customer.created','invoice.created','invoice.paid','stock.low')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  status text not null default 'pending' check (status in ('pending','leased','delivered','dead')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, company_id, branch_key, delivery_id),
  unique (tenant_id, company_id, branch_key, subscription_id, event_id),
  foreign key (tenant_id, company_id, branch_key, subscription_id)
    references public.integration_webhook_subscriptions (tenant_id, company_id, branch_key, subscription_id)
    on delete restrict,
  check ((status = 'leased') = (lease_until is not null)),
  check (status <> 'delivered' or delivered_at is not null)
);
create index if not exists integration_webhook_outbox_due_idx
  on public.integration_webhook_delivery_outbox (next_attempt_at, created_at)
  where status = 'pending';
alter table public.integration_webhook_delivery_outbox enable row level security;
alter table public.integration_webhook_delivery_outbox force row level security;
revoke all on public.integration_webhook_delivery_outbox from public, anon, authenticated;
grant select, insert, update on public.integration_webhook_delivery_outbox to service_role;
comment on table public.integration_webhook_delivery_outbox is
  'INT-002 durable, scoped, idempotent webhook delivery records; no dispatcher activated.';
