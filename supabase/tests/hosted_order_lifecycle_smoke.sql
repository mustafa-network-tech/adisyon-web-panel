-- Hosted development smoke test for Phase 2 Module 5.
-- Run after 0006_phase2_order_lifecycle.sql. All fixtures are rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'Module 5 smoke assertion failed: %', message;
  end if;
end;
$$;

create or replace function pg_temp.operation_failed(statement text, marker text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception when others then
  return position(marker in sqlerrm) > 0;
end;
$$;

grant execute on function pg_temp.assert_true(boolean, text) to authenticated;
grant execute on function pg_temp.operation_failed(text, text) to authenticated;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  'e5100000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'module5-waiter@transaction.test',
  crypt('TransactionOnly123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Module 5 Waiter"}', now(), now()
);

insert into public.tenants (id, slug, name) values
  ('e5200000-0000-0000-0000-000000000001', 'module5-a', 'Module 5 Tenant A'),
  ('e5200000-0000-0000-0000-000000000002', 'module5-b', 'Module 5 Tenant B');

insert into public.branches (id, tenant_id, slug, name) values
  ('e5300000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'merkez', 'Merkez A'),
  ('e5300000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'merkez', 'Merkez B');

insert into public.tenant_memberships (id, tenant_id, user_id, status) values (
  'e5400000-0000-0000-0000-000000000001',
  'e5200000-0000-0000-0000-000000000001',
  'e5100000-0000-0000-0000-000000000001', 'active'
);
insert into public.membership_branches (tenant_id, membership_id, branch_id) values (
  'e5200000-0000-0000-0000-000000000001',
  'e5400000-0000-0000-0000-000000000001',
  'e5300000-0000-0000-0000-000000000001'
);
insert into public.membership_roles (tenant_id, membership_id, role_id)
select 'e5200000-0000-0000-0000-000000000001',
  'e5400000-0000-0000-0000-000000000001', role.id
from public.roles role
where role.tenant_id = 'e5200000-0000-0000-0000-000000000001'
  and role.code = 'waiter';

insert into public.dining_areas (id, tenant_id, branch_id, name) values
  ('e5500000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 'Salon A'),
  ('e5500000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000002', 'Salon B');
insert into public.restaurant_tables (id, tenant_id, branch_id, area_id, label) values
  ('e5600000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 'e5500000-0000-0000-0000-000000000001', 'A01'),
  ('e5600000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000002', 'e5500000-0000-0000-0000-000000000002', 'B01');
insert into public.kitchen_stations (id, tenant_id, branch_id, name) values
  ('e5700000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 'Sıcak A'),
  ('e5700000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000002', 'Sıcak B');
insert into public.menu_categories (id, tenant_id, branch_id, name) values
  ('e5800000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 'Yemek A'),
  ('e5800000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000002', 'Yemek B');
insert into public.products (
  id, tenant_id, branch_id, category_id, kitchen_station_id,
  name, price_minor, tax_rate
) values
  ('e5900000-0000-0000-0000-000000000001', 'e5200000-0000-0000-0000-000000000001', 'e5300000-0000-0000-0000-000000000001', 'e5800000-0000-0000-0000-000000000001', 'e5700000-0000-0000-0000-000000000001', 'Ürün A', 10000, 10),
  ('e5900000-0000-0000-0000-000000000002', 'e5200000-0000-0000-0000-000000000002', 'e5300000-0000-0000-0000-000000000002', 'e5800000-0000-0000-0000-000000000002', 'e5700000-0000-0000-0000-000000000002', 'Ürün B', 20000, 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5100000-0000-0000-0000-000000000001', true);

select public.open_order(
  'e5200000-0000-0000-0000-000000000001',
  'e5300000-0000-0000-0000-000000000001',
  'e5600000-0000-0000-0000-000000000001',
  2,
  '[{"productId":"e5900000-0000-0000-0000-000000000001","quantity":2,"notes":"Az pişmiş"}]'::jsonb,
  'e5a00000-0000-0000-0000-000000000001'
);
select public.open_order(
  'e5200000-0000-0000-0000-000000000001',
  'e5300000-0000-0000-0000-000000000001',
  'e5600000-0000-0000-0000-000000000001',
  2,
  '[{"productId":"e5900000-0000-0000-0000-000000000001","quantity":2,"notes":"Az pişmiş"}]'::jsonb,
  'e5a00000-0000-0000-0000-000000000001'
);

select pg_temp.assert_true(
  (select count(*) from public.orders) = 1,
  'open retry must create one order'
);
select pg_temp.assert_true(
  (select count(*) from public.order_items) = 1,
  'open retry must create one snapshot item'
);
select pg_temp.assert_true(
  (select unit_price_minor = 10000 and quantity = 2 and notes = 'Az pişmiş'
   from public.order_items limit 1),
  'initial item snapshot must preserve price, quantity and notes'
);

select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.append_order_items(
      'e5200000-0000-0000-0000-000000000001',
      'e5300000-0000-0000-0000-000000000001',
      (select id from public.orders limit 1), 99,
      '[{"productId":"e5900000-0000-0000-0000-000000000001","quantity":1,"notes":""}]'::jsonb,
      'e5a00000-0000-0000-0000-000000000099'
    )
  $statement$, 'order_version_conflict'),
  'stale expected version must fail'
);

reset role;
update public.products set price_minor = 12500
where id = 'e5900000-0000-0000-0000-000000000001';
set local role authenticated;

select public.append_order_items(
  'e5200000-0000-0000-0000-000000000001',
  'e5300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1), 1,
  '[{"productId":"e5900000-0000-0000-0000-000000000001","quantity":1,"notes":"Yeni fiyat"}]'::jsonb,
  'e5a00000-0000-0000-0000-000000000002'
);

select pg_temp.assert_true(
  (select count(*) from public.order_items where unit_price_minor = 10000) = 1
  and (select count(*) from public.order_items where unit_price_minor = 12500) = 1,
  'catalog edits must not mutate historical snapshots'
);
select pg_temp.assert_true(
  (select version from public.orders limit 1) = 2,
  'append must increment optimistic version'
);

select public.submit_order(
  'e5200000-0000-0000-0000-000000000001',
  'e5300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1), 2,
  'e5a00000-0000-0000-0000-000000000003'
);
select public.submit_order(
  'e5200000-0000-0000-0000-000000000001',
  'e5300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1), 2,
  'e5a00000-0000-0000-0000-000000000003'
);

select pg_temp.assert_true(
  (select count(*) from public.kitchen_tickets) = 1,
  'submit retry must create one kitchen ticket'
);
select pg_temp.assert_true(
  (select count(*) from public.kitchen_ticket_items) = 2,
  'ticket must contain both snapshot lines'
);
select pg_temp.assert_true(
  (select bool_and(sent_quantity = quantity) from public.order_items),
  'submitted quantities must be marked exactly once'
);
select pg_temp.assert_true(
  (select status = 'submitted' and version = 3 from public.orders limit 1),
  'submit must transition status and version'
);
select pg_temp.assert_true(
  (select count(*) from public.order_status_history) = 2,
  'open and submitted status history must be persisted'
);

select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.submit_order(
      'e5200000-0000-0000-0000-000000000001',
      'e5300000-0000-0000-0000-000000000001',
      (select id from public.orders limit 1), 3,
      'e5a00000-0000-0000-0000-000000000004'
    )
  $statement$, 'order_has_no_pending_items'),
  'a new submit key must not duplicate already sent items'
);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.open_order(
      'e5200000-0000-0000-0000-000000000002',
      'e5300000-0000-0000-0000-000000000002',
      'e5600000-0000-0000-0000-000000000002', 1,
      '[{"productId":"e5900000-0000-0000-0000-000000000002","quantity":1,"notes":""}]'::jsonb,
      'e5a00000-0000-0000-0000-000000000005'
    )
  $statement$, 'order_create_denied'),
  'tenant A waiter must not open an order in tenant B'
);
select pg_temp.assert_true(
  (select count(*) from public.orders where tenant_id = 'e5200000-0000-0000-0000-000000000002') = 0,
  'tenant B orders must be invisible'
);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    insert into public.orders (
      tenant_id, branch_id, table_id, order_number, created_by
    ) values (
      'e5200000-0000-0000-0000-000000000001',
      'e5300000-0000-0000-0000-000000000001',
      null, 999,
      'e5100000-0000-0000-0000-000000000001'
    )
  $statement$, 'permission denied'),
  'direct order inserts must remain closed'
);

reset role;
select pg_temp.assert_true(
  (select count(*) from public.audit_logs
   where tenant_id = 'e5200000-0000-0000-0000-000000000001'
     and action in ('order.opened', 'order.items_appended', 'order.submitted')) = 3,
  'lifecycle audit events must be persisted'
);
select pg_temp.assert_true(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('orders', 'order_items', 'order_status_history', 'kitchen_tickets')) = 4,
  'order lifecycle tables must be in the Realtime publication'
);

select 'HOSTED_MODULE5_SMOKE_OK' as result;

rollback;
