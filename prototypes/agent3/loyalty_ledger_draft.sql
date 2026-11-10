-- Agent 3 prototype only. NOT approved for production application.
-- Default-off, no outbound delivery and no stock mutation.
-- Tenant ownership is resolved from existing authenticated membership integration
-- before enabling RPCs; this draft intentionally grants no client DML.
create schema if not exists agent3_prototype;
create table if not exists agent3_prototype.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  customer_id uuid not null,
  source_key text not null check (length(source_key) between 1 and 160),
  kind text not null check (kind in ('accrual','redemption','reversal')),
  points_delta integer not null check (points_delta <> 0),
  source_event_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, source_key),
  check ((kind = 'accrual' and points_delta > 0)
      or (kind = 'redemption' and points_delta < 0)
      or (kind = 'reversal' and source_event_id is not null))
);
create index if not exists loyalty_events_balance_idx
  on agent3_prototype.loyalty_events (tenant_id, customer_id, created_at, id);
alter table agent3_prototype.loyalty_events enable row level security;
alter table agent3_prototype.loyalty_events force row level security;
revoke all on schema agent3_prototype from public, anon, authenticated;
revoke all on agent3_prototype.loyalty_events from public, anon, authenticated;

-- Append-only for all non-owner roles, including future accidentally granted roles.
create or replace function agent3_prototype.reject_loyalty_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'loyalty events are immutable' using errcode = '23514';
end $$;
drop trigger if exists loyalty_immutable on agent3_prototype.loyalty_events;
create trigger loyalty_immutable before update or delete
on agent3_prototype.loyalty_events for each row
execute function agent3_prototype.reject_loyalty_mutation();

create table if not exists agent3_prototype.loyalty_tier_rules (
  tenant_id uuid not null,
  tier text not null check (tier in ('Silver','Gold','VIP')),
  min_lifetime_points bigint not null check (min_lifetime_points >= 0),
  primary key (tenant_id,tier),
  unique (tenant_id,min_lifetime_points)
);
alter table agent3_prototype.loyalty_tier_rules enable row level security;
alter table agent3_prototype.loyalty_tier_rules force row level security;
revoke all on agent3_prototype.loyalty_tier_rules from public,anon,authenticated;

create table if not exists agent3_prototype.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  channel text not null check (channel in ('whatsapp','sms')),
  event_key text not null,
  consent_snapshot_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'held' check (status in ('held','cancelled')),
  created_at timestamptz not null default now(),
  unique (tenant_id,channel,event_key)
);
alter table agent3_prototype.notification_outbox enable row level security;
alter table agent3_prototype.notification_outbox force row level security;
revoke all on agent3_prototype.notification_outbox from public,anon,authenticated;
-- No dispatch status or network worker: sending cannot occur from this prototype.
-- NEXT: integrate real tenant/branch membership, consent history, security-definer
-- RPC with fixed search_path, row locks, nonnegative balance, retry and race tests.
