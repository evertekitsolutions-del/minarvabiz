alter table public.purchases
  add column if not exists payment_method text not null default 'other';

create index if not exists purchases_payment_method_idx
  on public.purchases(payment_method);
