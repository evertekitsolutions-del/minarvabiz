-- OPTIONAL standalone HTML workspace schema; apply only to an isolated test project.
-- Not an ERP migration. No existing minarva_biz_data/production tables are accessed.
begin;
create table public.html_pos_workspaces (
  owner_id uuid primary key references auth.users(id),
  revision bigint not null check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.html_pos_receipts (
  owner_id uuid not null references auth.users(id), operation_id uuid not null,
  revision bigint not null, payload jsonb not null, primary key(owner_id, operation_id)
);
alter table public.html_pos_workspaces enable row level security;
alter table public.html_pos_receipts enable row level security;
create policy own_workspace on public.html_pos_workspaces to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_receipts on public.html_pos_receipts to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.html_pos_workspaces, public.html_pos_receipts from anon, authenticated;
grant select, insert, update on public.html_pos_workspaces to authenticated;
grant select, insert on public.html_pos_receipts to authenticated;
create function public.html_pos_commit(p_expected bigint, p_operation uuid, p_data jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; prior public.html_pos_receipts; result_revision bigint; user_id uuid := auth.uid();
begin
  if user_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_expected is null or p_expected < 0 or p_operation is null or p_data is null
     or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid request' using errcode = '22023'; end if;
  -- Serialize even the first write, when no workspace row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(user_id::text, 0));
  select * into prior from public.html_pos_receipts where owner_id = user_id and operation_id = p_operation;
  if found then
    if prior.payload <> p_data or prior.revision <> p_expected + 1 then
      raise exception 'Operation payload mismatch' using errcode = '22023';
    end if;
    return prior.revision;
  end if;
  select revision into current_revision from public.html_pos_workspaces where owner_id = user_id for update;
  if coalesce(current_revision, 0) <> p_expected then
    raise exception 'Cloud revision conflict; preserve and review local data' using errcode = '40001';
  end if;
  result_revision := p_expected + 1;
  insert into public.html_pos_workspaces(owner_id, revision, data) values(user_id, result_revision, p_data)
    on conflict(owner_id) do update set revision = excluded.revision, data = excluded.data, updated_at = now();
  insert into public.html_pos_receipts values(user_id, p_operation, result_revision, p_data);
  return result_revision;
end $$;
revoke all on function public.html_pos_commit(bigint, uuid, jsonb) from public, anon;
grant execute on function public.html_pos_commit(bigint, uuid, jsonb) to authenticated;
commit;
