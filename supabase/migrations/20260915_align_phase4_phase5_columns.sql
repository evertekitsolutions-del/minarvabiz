alter table public.orders
  add column if not exists assigned_staff_id uuid,
  add column if not exists measurement_profile_id uuid,
  add column if not exists material_details text,
  add column if not exists customer_supplied_material boolean not null default false,
  add column if not exists shop_supplied_material boolean not null default true,
  add column if not exists created_by uuid;

alter table public.products
  add column if not exists discount numeric;

alter table public.laundry_orders
  add column if not exists order_number text,
  add column if not exists customer_name text,
  add column if not exists mode text not null default 'outsourced',
  add column if not exists supplier_name text,
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists balance_amount numeric not null default 0;

create index if not exists orders_assigned_staff_idx on public.orders(assigned_staff_id);
create index if not exists laundry_orders_order_number_idx on public.laundry_orders(order_number);
