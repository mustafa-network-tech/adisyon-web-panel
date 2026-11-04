-- MK Adisyon Web / Phase 1 RLS draft
-- IMPORTANT: This file has not been applied to any local or remote database.

begin;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function private.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

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
  select private.is_platform_admin() or exists (
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

revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_tenant_member(uuid) to authenticated;
grant execute on function private.has_tenant_permission(uuid, text) to authenticated;

alter table public.tenants enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.membership_branches enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.dining_areas enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.kitchen_stations enable row level security;
alter table public.menu_categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.kitchen_ticket_items enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.permissions to authenticated;
grant select on public.tenants, public.branches, public.profiles,
  public.tenant_memberships, public.membership_branches, public.roles,
  public.role_permissions, public.membership_roles, public.tenant_settings,
  public.dining_areas, public.restaurant_tables, public.kitchen_stations,
  public.menu_categories, public.products, public.orders, public.order_items,
  public.kitchen_tickets, public.kitchen_ticket_items, public.cash_registers,
  public.cash_sessions, public.payments, public.cash_movements,
  public.subscriptions, public.audit_logs to authenticated;

grant insert, update on public.orders, public.order_items,
  public.kitchen_tickets, public.kitchen_ticket_items,
  public.cash_sessions, public.payments, public.cash_movements to authenticated;

grant insert, update on public.branches, public.tenant_settings,
  public.dining_areas, public.restaurant_tables, public.kitchen_stations,
  public.menu_categories, public.products, public.tenant_memberships,
  public.membership_branches, public.roles, public.role_permissions,
  public.membership_roles to authenticated;

create policy tenants_select_member
on public.tenants for select to authenticated
using (private.is_tenant_member(id) or private.is_platform_admin());

create policy tenants_update_settings
on public.tenants for update to authenticated
using (private.has_tenant_permission(id, 'settings.manage'))
with check (private.has_tenant_permission(id, 'settings.manage'));

create policy profiles_select_self_or_shared_tenant
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.is_platform_admin()
  or exists (
    select 1
    from public.tenant_memberships mine
    join public.tenant_memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = profiles.id
      and theirs.status = 'active'
  )
);

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy permissions_select_authenticated
on public.permissions for select to authenticated
using ((select auth.uid()) is not null);

create policy memberships_select_self_or_manager
on public.tenant_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_tenant_permission(tenant_id, 'users.manage')
);

create policy memberships_insert_manager
on public.tenant_memberships for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

create policy memberships_update_manager
on public.tenant_memberships for update to authenticated
using (private.has_tenant_permission(tenant_id, 'users.manage'))
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches', 'membership_branches', 'roles', 'role_permissions',
    'membership_roles', 'tenant_settings', 'dining_areas', 'restaurant_tables',
    'kitchen_stations', 'menu_categories', 'products', 'orders', 'order_items',
    'kitchen_tickets', 'kitchen_ticket_items', 'cash_registers', 'cash_sessions',
    'payments', 'cash_movements', 'subscriptions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_tenant_member(tenant_id) or private.is_platform_admin())',
      table_name || '_select_tenant',
      table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches', 'tenant_settings', 'dining_areas', 'restaurant_tables',
    'kitchen_stations'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_tenant_permission(tenant_id, ''settings.manage''))',
      table_name || '_insert_settings',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_tenant_permission(tenant_id, ''settings.manage'')) with check (private.has_tenant_permission(tenant_id, ''settings.manage''))',
      table_name || '_update_settings',
      table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['menu_categories', 'products']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_tenant_permission(tenant_id, ''catalog.manage''))',
      table_name || '_insert_catalog',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_tenant_permission(tenant_id, ''catalog.manage'')) with check (private.has_tenant_permission(tenant_id, ''catalog.manage''))',
      table_name || '_update_catalog',
      table_name
    );
  end loop;
end $$;

create policy orders_insert_authorized
on public.orders for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_tenant_permission(tenant_id, 'orders.create')
);

create policy orders_update_authorized
on public.orders for update to authenticated
using (private.has_tenant_permission(tenant_id, 'orders.update'))
with check (private.has_tenant_permission(tenant_id, 'orders.update'));

create policy order_items_insert_authorized
on public.order_items for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'orders.create'));

create policy order_items_update_authorized
on public.order_items for update to authenticated
using (private.has_tenant_permission(tenant_id, 'orders.update'))
with check (private.has_tenant_permission(tenant_id, 'orders.update'));

create policy kitchen_tickets_insert_authorized
on public.kitchen_tickets for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'orders.update'));

create policy kitchen_tickets_update_authorized
on public.kitchen_tickets for update to authenticated
using (private.has_tenant_permission(tenant_id, 'kitchen.update'))
with check (private.has_tenant_permission(tenant_id, 'kitchen.update'));

create policy kitchen_ticket_items_insert_authorized
on public.kitchen_ticket_items for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'orders.update'));

create policy cash_sessions_insert_authorized
on public.cash_sessions for insert to authenticated
with check (
  opened_by = (select auth.uid())
  and private.has_tenant_permission(tenant_id, 'cash.open')
);

create policy cash_sessions_update_authorized
on public.cash_sessions for update to authenticated
using (private.has_tenant_permission(tenant_id, 'cash.close'))
with check (private.has_tenant_permission(tenant_id, 'cash.close'));

create policy payments_insert_authorized
on public.payments for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_tenant_permission(tenant_id, 'payments.create')
);

create policy cash_movements_insert_authorized
on public.cash_movements for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_tenant_permission(tenant_id, 'payments.create')
);

create policy membership_branches_manage
on public.membership_branches for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

create policy roles_manage_insert
on public.roles for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

create policy roles_manage_update
on public.roles for update to authenticated
using (private.has_tenant_permission(tenant_id, 'users.manage'))
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

create policy role_permissions_manage
on public.role_permissions for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

create policy membership_roles_manage
on public.membership_roles for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

create policy subscriptions_select_owner_or_platform
on public.subscriptions as restrictive for select to authenticated
using (
  private.has_tenant_permission(tenant_id, 'settings.manage')
  or private.is_platform_admin()
);

create policy audit_logs_select_authorized
on public.audit_logs for select to authenticated
using (
  private.is_platform_admin()
  or (tenant_id is not null and private.has_tenant_permission(tenant_id, 'reports.read'))
);

-- No direct INSERT policy is defined for audit_logs and no client UPDATE/DELETE
-- policies exist for orders, payments or cash movements. Critical financial
-- state changes will be exposed through reviewed transaction functions.

commit;
