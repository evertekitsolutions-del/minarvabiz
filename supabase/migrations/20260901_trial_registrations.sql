create table if not exists public.trial_registrations (
  id uuid primary key,
  email text not null,
  phone text not null,
  organization_name text not null,
  address text not null,
  device_id text not null,
  status text not null default 'active' check (status in ('active', 'expired', 'registered_email_pending', 'revoked')),
  trial_started_at timestamptz not null,
  trial_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trial_registrations_email_uq on public.trial_registrations (lower(email));
create unique index if not exists trial_registrations_phone_uq on public.trial_registrations (phone);
create unique index if not exists trial_registrations_device_uq on public.trial_registrations (device_id);

alter table public.trial_registrations enable row level security;

revoke all on public.trial_registrations from anon, authenticated;

create or replace function public.set_trial_registrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trial_registrations_updated_at on public.trial_registrations;
create trigger trial_registrations_updated_at
before update on public.trial_registrations
for each row execute function public.set_trial_registrations_updated_at();
