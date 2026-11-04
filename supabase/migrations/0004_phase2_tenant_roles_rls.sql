-- MK Adisyon Web / Phase 2 Module 3
-- Canonical roles, branch-scoped authorization and audited platform support.

begin;

create table public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  check (expires_at > created_at)
);

create index platform_support_sessions_active_idx
on public.platform_support_sessions (admin_user_id, tenant_id, branch_id, expires_at)
where revoked_at is null;

alter table public.platform_support_sessions enable row level security;
revoke all on public.platform_support_sessions from anon, authenticated;
grant select on public.platform_support_sessions to authenticated;

create or replace function private.ensure_system_roles(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.roles (tenant_id, code, name, is_system)
  select target_tenant_id, role_data.code, role_data.name, true
  from (values
    ('owner', 'İşletme Sahibi'),
    ('manager', 'İşletme Yöneticisi'),
    ('waiter', 'Garson'),
    ('kitchen', 'Mutfak'),
    ('cashier', 'Kasiyer'),
    ('viewer', 'Görüntüleyici')
  ) as role_data(code, name)
  on conflict (tenant_id, code) do update
  set name = excluded.name, is_system = true;

  delete from public.role_permissions role_permission
  using public.roles role
  where role_permission.tenant_id = target_tenant_id
    and role_permission.role_id = role.id
    and role.is_system
    and role.code in ('owner', 'manager', 'waiter', 'kitchen', 'cashier', 'viewer');

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select target_tenant_id, role.id, permission.id
  from public.roles role
  cross join public.permissions permission
  where role.tenant_id = target_tenant_id
    and role.is_system
    and (
      role.code = 'owner'
      or (
        role.code = 'manager'
        and permission.code in (
          'tables.read', 'orders.create', 'orders.update', 'orders.cancel',
          'kitchen.read', 'kitchen.update', 'payments.create',
          'payments.refund', 'cash.open', 'cash.close', 'reports.read',
          'settings.manage', 'catalog.manage', 'users.manage'
        )
      )
      or (
        role.code = 'waiter'
        and permission.code in (
          'tables.read', 'orders.create', 'orders.update', 'orders.cancel'
        )
      )
      or (
        role.code = 'kitchen'
        and permission.code in ('kitchen.read', 'kitchen.update')
      )
      or (
        role.code = 'cashier'
        and permission.code in (
          'tables.read', 'payments.create', 'payments.refund',
          'cash.open', 'cash.close', 'reports.read'
        )
      )
      or (
        role.code = 'viewer'
        and permission.code in ('tables.read', 'kitchen.read', 'reports.read')
      )
    )
  on conflict do nothing;
end;
$$;

create or replace function private.ensure_system_roles_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_system_roles(new.id);
  return new;
end;
$$;

drop trigger if exists ensure_system_roles_after_tenant_insert
on public.tenants;
create trigger ensure_system_roles_after_tenant_insert
after insert on public.tenants
for each row execute function private.ensure_system_roles_for_tenant();

do $$
declare
  tenant_record record;
begin
  for tenant_record in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_record.id);
  end loop;
end $$;

revoke all on function private.ensure_system_roles(uuid) from public, authenticated;
revoke all on function private.ensure_system_roles_for_tenant() from public, authenticated;

-- Platform administrators do not inherit tenant mutation permissions.
create or replace function private.has_tenant_permission(
  target_tenant_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    join public.membership_roles membership_role
      on membership_role.tenant_id = membership.tenant_id
      and membership_role.membership_id = membership.id
    join public.role_permissions role_permission
      on role_permission.tenant_id = membership_role.tenant_id
      and role_permission.role_id = membership_role.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and permission.code = target_permission
  );
$$;

create or replace function private.has_branch_membership(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    join public.membership_branches membership_branch
      on membership_branch.tenant_id = membership.tenant_id
      and membership_branch.membership_id = membership.id
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership_branch.branch_id = target_branch_id
  );
$$;

create or replace function private.is_platform_support_active(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() and exists (
    select 1
    from public.platform_support_sessions support_session
    where support_session.admin_user_id = (select auth.uid())
      and support_session.tenant_id = target_tenant_id
      and support_session.branch_id = target_branch_id
      and support_session.revoked_at is null
      and support_session.expires_at > now()
  );
$$;

create or replace function private.has_branch_access(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_branch_membership(target_tenant_id, target_branch_id)
    or private.is_platform_support_active(target_tenant_id, target_branch_id);
$$;

create or replace function private.has_branch_permission(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_branch_membership(target_tenant_id, target_branch_id)
    and private.has_tenant_permission(target_tenant_id, target_permission);
$$;

create or replace function private.owns_membership(
  target_tenant_id uuid,
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.id = target_membership_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_order_access(
  target_tenant_id uuid,
  target_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders target_order
    where target_order.tenant_id = target_tenant_id
      and target_order.id = target_order_id
      and private.has_branch_access(target_tenant_id, target_order.branch_id)
  );
$$;

create or replace function private.has_order_permission(
  target_tenant_id uuid,
  target_order_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders target_order
    where target_order.tenant_id = target_tenant_id
      and target_order.id = target_order_id
      and private.has_branch_permission(
        target_tenant_id,
        target_order.branch_id,
        target_permission
      )
  );
$$;

create or replace function private.has_ticket_access(
  target_tenant_id uuid,
  target_ticket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.kitchen_tickets ticket
    where ticket.tenant_id = target_tenant_id
      and ticket.id = target_ticket_id
      and private.has_branch_access(target_tenant_id, ticket.branch_id)
  );
$$;

create or replace function private.has_ticket_permission(
  target_tenant_id uuid,
  target_ticket_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.kitchen_tickets ticket
    where ticket.tenant_id = target_tenant_id
      and ticket.id = target_ticket_id
      and private.has_branch_permission(
        target_tenant_id,
        ticket.branch_id,
        target_permission
      )
  );
$$;

create or replace function private.has_cash_session_access(
  target_tenant_id uuid,
  target_cash_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cash_sessions cash_session
    where cash_session.tenant_id = target_tenant_id
      and cash_session.id = target_cash_session_id
      and private.has_branch_access(target_tenant_id, cash_session.branch_id)
  );
$$;

create or replace function private.has_cash_session_permission(
  target_tenant_id uuid,
  target_cash_session_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cash_sessions cash_session
    where cash_session.tenant_id = target_tenant_id
      and cash_session.id = target_cash_session_id
      and private.has_branch_permission(
        target_tenant_id,
        cash_session.branch_id,
        target_permission
      )
  );
$$;

grant execute on function private.has_branch_membership(uuid, uuid) to authenticated;
grant execute on function private.is_platform_support_active(uuid, uuid) to authenticated;
grant execute on function private.has_branch_access(uuid, uuid) to authenticated;
grant execute on function private.has_branch_permission(uuid, uuid, text) to authenticated;
grant execute on function private.owns_membership(uuid, uuid) to authenticated;
grant execute on function private.has_order_access(uuid, uuid) to authenticated;
grant execute on function private.has_order_permission(uuid, uuid, text) to authenticated;
grant execute on function private.has_ticket_access(uuid, uuid) to authenticated;
grant execute on function private.has_ticket_permission(uuid, uuid, text) to authenticated;
grant execute on function private.has_cash_session_access(uuid, uuid) to authenticated;
grant execute on function private.has_cash_session_permission(uuid, uuid, text) to authenticated;

create or replace function public.open_platform_support_session(
  target_tenant_id uuid,
  target_branch_id uuid,
  support_reason text,
  duration_minutes integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session_id uuid;
  support_expires_at timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception 'Platform administrator access required'
      using errcode = '42501';
  end if;

  if char_length(trim(support_reason)) not between 10 and 500 then
    raise exception 'Support reason must contain 10-500 characters'
      using errcode = '22023';
  end if;

  if duration_minutes not between 15 and 240 then
    raise exception 'Support duration must be between 15 and 240 minutes'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.branches as target_branch
    join public.tenants as target_tenant
      on target_tenant.id = target_branch.tenant_id
    where target_branch.tenant_id = target_tenant_id
      and target_branch.id = target_branch_id
      and target_branch.is_active
      and target_tenant.is_active
  ) then
    raise exception 'Active tenant branch not found'
      using errcode = 'P0002';
  end if;

  support_expires_at := now() + make_interval(mins => duration_minutes);

  insert into public.platform_support_sessions (
    admin_user_id,
    tenant_id,
    branch_id,
    reason,
    expires_at
  ) values (
    (select auth.uid()),
    target_tenant_id,
    target_branch_id,
    trim(support_reason),
    support_expires_at
  ) returning id into support_session_id;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    target_tenant_id,
    (select auth.uid()),
    'platform.support.opened',
    'platform_support_session',
    support_session_id,
    jsonb_build_object(
      'branch_id', target_branch_id,
      'reason', trim(support_reason),
      'expires_at', support_expires_at
    )
  );

  return support_session_id;
end;
$$;

create or replace function public.close_platform_support_session(
  target_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session public.platform_support_sessions%rowtype;
begin
  if not private.is_platform_admin() then
    raise exception 'Platform administrator access required'
      using errcode = '42501';
  end if;

  update public.platform_support_sessions
  set revoked_at = now()
  where id = target_session_id
    and admin_user_id = (select auth.uid())
    and revoked_at is null
  returning * into support_session;

  if support_session.id is null then
    raise exception 'Active support session not found'
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    support_session.tenant_id,
    (select auth.uid()),
    'platform.support.closed',
    'platform_support_session',
    support_session.id,
    jsonb_build_object('branch_id', support_session.branch_id)
  );
end;
$$;

create or replace function public.record_tenant_context(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_branch_access(target_tenant_id, target_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select
    target_tenant_id,
    (select auth.uid()),
    'tenant.context.selected',
    'branch',
    target_branch_id,
    jsonb_build_object(
      'branch_id', target_branch_id,
      'support_mode', private.is_platform_support_active(
        target_tenant_id,
        target_branch_id
      )
    )
  where not exists (
    select 1 from public.audit_logs audit_log
    where audit_log.actor_user_id = (select auth.uid())
      and audit_log.tenant_id = target_tenant_id
      and audit_log.action = 'tenant.context.selected'
      and audit_log.entity_id = target_branch_id
      and audit_log.created_at > now() - interval '15 minutes'
  );
end;
$$;

revoke all on function public.open_platform_support_session(uuid, uuid, text, integer) from public;
revoke all on function public.close_platform_support_session(uuid) from public;
revoke all on function public.record_tenant_context(uuid, uuid) from public;
grant execute on function public.open_platform_support_session(uuid, uuid, text, integer) to authenticated;
grant execute on function public.close_platform_support_session(uuid) to authenticated;
grant execute on function public.record_tenant_context(uuid, uuid) to authenticated;

create policy platform_support_sessions_select_own
on public.platform_support_sessions for select to authenticated
using (
  admin_user_id = (select auth.uid())
  and private.is_platform_admin()
);

-- Branch metadata is visible only for assigned members or platform admins.
drop policy if exists branches_select_tenant on public.branches;
create policy branches_select_scoped
on public.branches for select to authenticated
using (
  private.is_platform_admin()
  or private.has_branch_membership(tenant_id, id)
);

drop policy if exists membership_branches_select_tenant
on public.membership_branches;
create policy membership_branches_select_scoped
on public.membership_branches for select to authenticated
using (
  private.is_platform_admin()
  or private.has_tenant_permission(tenant_id, 'users.manage')
  or private.owns_membership(tenant_id, membership_id)
);

-- Replace tenant-wide reads with branch-scoped reads for operational data.
drop policy if exists dining_areas_select_tenant on public.dining_areas;
create policy dining_areas_select_branch on public.dining_areas
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists restaurant_tables_select_tenant on public.restaurant_tables;
create policy restaurant_tables_select_branch on public.restaurant_tables
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists kitchen_stations_select_tenant on public.kitchen_stations;
create policy kitchen_stations_select_branch on public.kitchen_stations
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists menu_categories_select_tenant on public.menu_categories;
create policy menu_categories_select_branch on public.menu_categories
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists products_select_tenant on public.products;
create policy products_select_branch on public.products
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists orders_select_tenant on public.orders;
create policy orders_select_branch on public.orders
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists order_items_select_tenant on public.order_items;
create policy order_items_select_branch on public.order_items
for select to authenticated
using (private.has_order_access(tenant_id, order_id));

drop policy if exists kitchen_tickets_select_tenant on public.kitchen_tickets;
create policy kitchen_tickets_select_branch on public.kitchen_tickets
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists kitchen_ticket_items_select_tenant on public.kitchen_ticket_items;
create policy kitchen_ticket_items_select_branch on public.kitchen_ticket_items
for select to authenticated
using (private.has_ticket_access(tenant_id, ticket_id));

drop policy if exists cash_registers_select_tenant on public.cash_registers;
create policy cash_registers_select_branch on public.cash_registers
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists cash_sessions_select_tenant on public.cash_sessions;
create policy cash_sessions_select_branch on public.cash_sessions
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists payments_select_tenant on public.payments;
create policy payments_select_branch on public.payments
for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

drop policy if exists cash_movements_select_tenant on public.cash_movements;
create policy cash_movements_select_branch on public.cash_movements
for select to authenticated
using (private.has_cash_session_access(tenant_id, cash_session_id));

-- Settings and catalog writes require both branch assignment and permission.
drop policy if exists branches_update_settings on public.branches;
create policy branches_update_settings on public.branches
for update to authenticated
using (private.has_branch_permission(tenant_id, id, 'settings.manage'))
with check (private.has_branch_permission(tenant_id, id, 'settings.manage'));

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'dining_areas', 'restaurant_tables', 'kitchen_stations'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', target_table || '_insert_settings', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_update_settings', target_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_branch_permission(tenant_id, branch_id, ''settings.manage''))',
      target_table || '_insert_branch_settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_branch_permission(tenant_id, branch_id, ''settings.manage'')) with check (private.has_branch_permission(tenant_id, branch_id, ''settings.manage''))',
      target_table || '_update_branch_settings',
      target_table
    );
  end loop;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['menu_categories', 'products']
  loop
    execute format('drop policy if exists %I on public.%I', target_table || '_insert_catalog', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_update_catalog', target_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_branch_permission(tenant_id, branch_id, ''catalog.manage''))',
      target_table || '_insert_branch_catalog',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_branch_permission(tenant_id, branch_id, ''catalog.manage'')) with check (private.has_branch_permission(tenant_id, branch_id, ''catalog.manage''))',
      target_table || '_update_branch_catalog',
      target_table
    );
  end loop;
end $$;

grant insert, update on public.cash_registers to authenticated;
create policy cash_registers_insert_branch_settings
on public.cash_registers for insert to authenticated
with check (private.has_branch_permission(tenant_id, branch_id, 'settings.manage'));
create policy cash_registers_update_branch_settings
on public.cash_registers for update to authenticated
using (private.has_branch_permission(tenant_id, branch_id, 'settings.manage'))
with check (private.has_branch_permission(tenant_id, branch_id, 'settings.manage'));

drop policy if exists orders_insert_authorized on public.orders;
create policy orders_insert_authorized on public.orders
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_branch_permission(tenant_id, branch_id, 'orders.create')
);

drop policy if exists orders_update_authorized on public.orders;
create policy orders_update_authorized on public.orders
for update to authenticated
using (private.has_branch_permission(tenant_id, branch_id, 'orders.update'))
with check (private.has_branch_permission(tenant_id, branch_id, 'orders.update'));

drop policy if exists order_items_insert_authorized on public.order_items;
create policy order_items_insert_authorized on public.order_items
for insert to authenticated
with check (private.has_order_permission(tenant_id, order_id, 'orders.create'));

drop policy if exists order_items_update_authorized on public.order_items;
create policy order_items_update_authorized on public.order_items
for update to authenticated
using (private.has_order_permission(tenant_id, order_id, 'orders.update'))
with check (private.has_order_permission(tenant_id, order_id, 'orders.update'));

drop policy if exists kitchen_tickets_insert_authorized on public.kitchen_tickets;
create policy kitchen_tickets_insert_authorized on public.kitchen_tickets
for insert to authenticated
with check (private.has_branch_permission(tenant_id, branch_id, 'orders.update'));

drop policy if exists kitchen_tickets_update_authorized on public.kitchen_tickets;
create policy kitchen_tickets_update_authorized on public.kitchen_tickets
for update to authenticated
using (private.has_branch_permission(tenant_id, branch_id, 'kitchen.update'))
with check (private.has_branch_permission(tenant_id, branch_id, 'kitchen.update'));

drop policy if exists kitchen_ticket_items_insert_authorized on public.kitchen_ticket_items;
create policy kitchen_ticket_items_insert_authorized on public.kitchen_ticket_items
for insert to authenticated
with check (private.has_ticket_permission(tenant_id, ticket_id, 'orders.update'));

drop policy if exists cash_sessions_insert_authorized on public.cash_sessions;
create policy cash_sessions_insert_authorized on public.cash_sessions
for insert to authenticated
with check (
  opened_by = (select auth.uid())
  and private.has_branch_permission(tenant_id, branch_id, 'cash.open')
);

drop policy if exists cash_sessions_update_authorized on public.cash_sessions;
create policy cash_sessions_update_authorized on public.cash_sessions
for update to authenticated
using (private.has_branch_permission(tenant_id, branch_id, 'cash.close'))
with check (private.has_branch_permission(tenant_id, branch_id, 'cash.close'));

drop policy if exists payments_insert_authorized on public.payments;
create policy payments_insert_authorized on public.payments
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_branch_permission(tenant_id, branch_id, 'payments.create')
);

drop policy if exists cash_movements_insert_authorized on public.cash_movements;
create policy cash_movements_insert_authorized on public.cash_movements
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_cash_session_permission(
    tenant_id,
    cash_session_id,
    'payments.create'
  )
);

commit;
