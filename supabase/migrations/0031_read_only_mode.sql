-- MK Adisyon Web / Read-only mode when the trial or subscription has ended
-- A business whose current subscription is not trial/active, or whose end date
-- has passed, can still see everything but nothing can be written: orders,
-- payments, menu, staff, settings, QR orders. Platform administrators are
-- exempt, so they can fix data and activate the next period.
-- The rule lives in triggers on the business tables, so it holds for every
-- path: screens, functions, QR menu and direct API calls.
-- A business without any subscription row (legacy data) stays writable.

begin;

create or replace function private.tenant_is_writable(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select subscription.status in ('trial', 'active')
      and (subscription.ends_at is null or subscription.ends_at > now())
    from private.current_subscription(target_tenant_id) subscription
    where subscription.id is not null
  ), true);
$$;

revoke all on function private.tenant_is_writable(uuid) from public, anon;
grant execute on function private.tenant_is_writable(uuid) to authenticated, anon;

create or replace function private.block_writes_when_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant uuid;
begin
  if tg_op = 'DELETE' then
    target_tenant := old.tenant_id;
  else
    target_tenant := new.tenant_id;
  end if;
  if not private.tenant_is_writable(target_tenant) and not private.is_platform_admin() then
    raise exception using errcode = 'P0001', message = 'tenant_read_only';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.block_writes_when_read_only() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'orders',
    'order_items',
    'order_item_options',
    'order_status_history',
    'kitchen_tickets',
    'kitchen_ticket_items',
    'payments',
    'payment_allocations',
    'payment_refunds',
    'cash_sessions',
    'cash_movements',
    'products',
    'menu_categories',
    'option_groups',
    'option_choices',
    'product_option_groups',
    'restaurant_tables',
    'dining_areas',
    'kitchen_stations',
    'shifts',
    'shift_templates',
    'shift_attendance',
    'staff_profiles',
    'staff_private',
    'staff_pay',
    'payroll_entries',
    'tenant_invitations',
    'tenant_settings',
    'branch_qr_settings',
    'waiter_calls',
    'customer_order_requests',
    'order_item_voids'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each row execute function private.block_writes_when_read_only()',
      table_name || '_read_only', table_name
    );
  end loop;
end $$;

create or replace function public.get_plan_usage(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  subscription_row public.subscriptions;
begin
  if (select auth.uid()) is null
    or not private.has_branch_membership(target_tenant_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'plan_usage_denied';
  end if;
  subscription_row := private.current_subscription(target_tenant_id);
  return jsonb_build_object(
    'planCode', subscription_row.plan_code,
    'writable', private.tenant_is_writable(target_tenant_id),
    'status', subscription_row.status,
    'endsAt', subscription_row.ends_at,
    'userLimit', subscription_row.user_limit,
    'branchLimit', subscription_row.branch_limit,
    'tableLimit', subscription_row.table_limit,
    'stationLimit', subscription_row.station_limit,
    'tablesUsed', (select count(*) from public.restaurant_tables where tenant_id = target_tenant_id),
    'stationsUsed', (
      select count(*) from public.kitchen_stations
      where tenant_id = target_tenant_id and branch_id = target_branch_id
    )
  );
end;
$$;

commit;
