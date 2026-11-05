-- MK Adisyon Web / Waiter calls
-- A customer scanning the table QR can ask for the waiter or for the bill.
-- Staff with tables.read in the branch see pending calls live and acknowledge
-- them. The public function is rate limited and never reveals anything but the
-- outcome of the request.

begin;

create table public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  table_id uuid not null,
  kind text not null check (kind in ('waiter', 'bill')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade,
  foreign key (tenant_id, table_id)
    references public.restaurant_tables(tenant_id, id) on delete cascade
);

create index waiter_calls_pending_idx
on public.waiter_calls (tenant_id, branch_id, created_at desc)
where acknowledged_at is null;

alter table public.waiter_calls enable row level security;
revoke all on public.waiter_calls from anon, authenticated;
grant select on public.waiter_calls to authenticated;

create policy waiter_calls_select
on public.waiter_calls for select to authenticated
using (private.has_branch_permission(tenant_id, branch_id, 'tables.read'));

-- ---------------------------------------------------------------------------
-- Public: customer calls the waiter or asks for the bill
-- ---------------------------------------------------------------------------

create or replace function public.call_waiter(
  target_token text,
  target_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_record record;
  menu_enabled boolean;
  recent_calls integer;
begin
  if target_token is null or target_token !~ '^[0-9a-f]{64}$'
    or target_kind not in ('waiter', 'bill') then
    raise exception using errcode = 'P0001', message = 'invalid_call';
  end if;

  select t.id, t.tenant_id, t.branch_id, t.operational_status
  into table_record
  from public.restaurant_tables t
  join public.branches b
    on b.tenant_id = t.tenant_id and b.id = t.branch_id and b.is_active
  join public.tenants tenant on tenant.id = t.tenant_id and tenant.is_active
  where t.qr_token = target_token
  for update of t;
  if not found then
    raise exception using errcode = 'P0001', message = 'qr_not_found';
  end if;

  select coalesce(s.menu_enabled, true) into menu_enabled
  from (select 1) as one
  left join public.branch_qr_settings s
    on s.tenant_id = table_record.tenant_id and s.branch_id = table_record.branch_id;
  if not menu_enabled then
    raise exception using errcode = 'P0001', message = 'qr_not_found';
  end if;

  -- The table row is locked, so calls for one table are serialised.
  if exists (
    select 1 from public.waiter_calls call
    where call.tenant_id = table_record.tenant_id and call.table_id = table_record.id
      and call.kind = target_kind and call.acknowledged_at is null
  ) then
    return jsonb_build_object('status', 'already_pending');
  end if;

  select count(*) into recent_calls
  from public.waiter_calls call
  where call.tenant_id = table_record.tenant_id and call.table_id = table_record.id
    and call.created_at > now() - interval '10 minutes';
  if recent_calls >= 6 then
    raise exception using errcode = 'P0001', message = 'call_rate_limited';
  end if;

  insert into public.waiter_calls (tenant_id, branch_id, table_id, kind)
  values (table_record.tenant_id, table_record.branch_id, table_record.id, target_kind);
  return jsonb_build_object('status', 'sent');
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff acknowledge a call
-- ---------------------------------------------------------------------------

create or replace function public.acknowledge_waiter_call(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_call_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'tables.read') then
    raise exception using errcode = '42501', message = 'call_denied';
  end if;

  update public.waiter_calls
  set acknowledged_at = now(), acknowledged_by = actor_id
  where tenant_id = target_tenant_id and branch_id = target_branch_id
    and id = target_call_id and acknowledged_at is null;
  -- Already handled by a colleague is fine: the goal state is reached.
  return jsonb_build_object('id', target_call_id, 'acknowledged', true);
end;
$$;

revoke all on function public.call_waiter(text, text) from public;
revoke all on function public.acknowledge_waiter_call(uuid, uuid, uuid) from public, anon;
grant execute on function public.call_waiter(text, text) to anon, authenticated;
grant execute on function public.acknowledge_waiter_call(uuid, uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'waiter_calls'
    ) then
    alter publication supabase_realtime add table public.waiter_calls;
  end if;
end $$;

commit;
