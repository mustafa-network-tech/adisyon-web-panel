-- Hosted development smoke test for Phase 2 Module 6.
-- Run after 0007_phase2_kitchen_workflow.sql. All fixtures are rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'Module 6 smoke assertion failed: %', message;
  end if;
end;
$$;

create or replace function pg_temp.operation_failed(statement text, marker text)
returns boolean language plpgsql as $$
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
) values
  ('d6100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module6-manager@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 6 Manager"}', now(), now()),
  ('d6100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module6-viewer@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 6 Viewer"}', now(), now());

insert into public.tenants (id, slug, name)
values ('d6200000-0000-0000-0000-000000000001', 'module6-smoke', 'Module 6 Smoke');
insert into public.branches (id, tenant_id, slug, name)
values ('d6300000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'merkez', 'Merkez');

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('d6400000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'd6100000-0000-0000-0000-000000000001', 'active'),
  ('d6400000-0000-0000-0000-000000000002', 'd6200000-0000-0000-0000-000000000001', 'd6100000-0000-0000-0000-000000000002', 'active');
insert into public.membership_branches (tenant_id, membership_id, branch_id) values
  ('d6200000-0000-0000-0000-000000000001', 'd6400000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001'),
  ('d6200000-0000-0000-0000-000000000001', 'd6400000-0000-0000-0000-000000000002', 'd6300000-0000-0000-0000-000000000001');
insert into public.membership_roles (tenant_id, membership_id, role_id)
select role_map.tenant_id, role_map.membership_id, role.id
from (values
  ('d6200000-0000-0000-0000-000000000001'::uuid, 'd6400000-0000-0000-0000-000000000001'::uuid, 'manager'),
  ('d6200000-0000-0000-0000-000000000001'::uuid, 'd6400000-0000-0000-0000-000000000002'::uuid, 'viewer')
) as role_map(tenant_id, membership_id, role_code)
join public.roles role
  on role.tenant_id = role_map.tenant_id and role.code = role_map.role_code;

insert into public.dining_areas (id, tenant_id, branch_id, name)
values ('d6500000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'Salon');
insert into public.restaurant_tables (id, tenant_id, branch_id, area_id, label)
values ('d6600000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'd6500000-0000-0000-0000-000000000001', 'M01');
insert into public.kitchen_stations (id, tenant_id, branch_id, name) values
  ('d6700000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'Sıcak'),
  ('d6700000-0000-0000-0000-000000000002', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'Soğuk');
insert into public.menu_categories (id, tenant_id, branch_id, name)
values ('d6800000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'Menü');
insert into public.products (
  id, tenant_id, branch_id, category_id, kitchen_station_id,
  name, price_minor, tax_rate
) values
  ('d6900000-0000-0000-0000-000000000001', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'd6800000-0000-0000-0000-000000000001', 'd6700000-0000-0000-0000-000000000001', 'Sıcak Ürün', 10000, 10),
  ('d6900000-0000-0000-0000-000000000002', 'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001', 'd6800000-0000-0000-0000-000000000001', 'd6700000-0000-0000-0000-000000000002', 'Soğuk Ürün', 8000, 10);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd6100000-0000-0000-0000-000000000001', true);
select public.open_order(
  'd6200000-0000-0000-0000-000000000001',
  'd6300000-0000-0000-0000-000000000001',
  'd6600000-0000-0000-0000-000000000001', 2,
  '[{"productId":"d6900000-0000-0000-0000-000000000001","quantity":1,"notes":"Orta"},{"productId":"d6900000-0000-0000-0000-000000000002","quantity":2,"notes":""}]'::jsonb,
  'd6a00000-0000-0000-0000-000000000001'
);
select public.submit_order(
  'd6200000-0000-0000-0000-000000000001',
  'd6300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1), 1,
  'd6a00000-0000-0000-0000-000000000002'
);
select pg_temp.assert_true(
  (select count(*) from public.kitchen_tickets) = 2,
  'submission must create one ticket per station'
);

select set_config('request.jwt.claim.sub', 'd6100000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.transition_kitchen_ticket(
      'd6200000-0000-0000-0000-000000000001',
      'd6300000-0000-0000-0000-000000000001',
      (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
      'new', 'preparing', 'd6a00000-0000-0000-0000-000000000003'
    )
  $statement$, 'kitchen_transition_denied'),
  'read-only viewer must not transition tickets'
);

select set_config('request.jwt.claim.sub', 'd6100000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.transition_kitchen_ticket(
      'd6200000-0000-0000-0000-000000000001',
      'd6300000-0000-0000-0000-000000000001',
      (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
      'new', 'ready', 'd6a00000-0000-0000-0000-000000000004'
    )
  $statement$, 'invalid_kitchen_transition'),
  'status jumps must be rejected'
);

select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001',
  'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
  'new', 'preparing', 'd6a00000-0000-0000-0000-000000000005'
);
select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001',
  'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
  'new', 'preparing', 'd6a00000-0000-0000-0000-000000000005'
);
select pg_temp.assert_true(
  (select status = 'preparing' and started_at is not null
   from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
  'start transition must be timestamped and idempotent'
);
select pg_temp.assert_true(
  (select status = 'in_progress' and version = 3 from public.orders limit 1),
  'first preparing ticket must move order to in progress once'
);

select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
  'preparing', 'ready', 'd6a00000-0000-0000-0000-000000000006'
);
select pg_temp.assert_true(
  (select status = 'in_progress' and version = 3 from public.orders limit 1),
  'one ready ticket must not mark a multi-station order ready'
);
select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000002'),
  'new', 'preparing', 'd6a00000-0000-0000-0000-000000000007'
);
select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000002'),
  'preparing', 'ready', 'd6a00000-0000-0000-0000-000000000008'
);
select pg_temp.assert_true(
  (select status = 'ready' and version = 4 from public.orders limit 1),
  'all ready tickets must mark the order ready'
);
select pg_temp.assert_true(
  (select bool_and(ready_at is not null) from public.kitchen_tickets),
  'ready transitions must be timestamped'
);

select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000001'),
  'ready', 'served', 'd6a00000-0000-0000-0000-000000000009'
);
select pg_temp.assert_true(
  (select status = 'ready' and version = 4 from public.orders limit 1),
  'one served ticket must keep the order ready until all are served'
);
select public.transition_kitchen_ticket(
  'd6200000-0000-0000-0000-000000000001', 'd6300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets where kitchen_station_id = 'd6700000-0000-0000-0000-000000000002'),
  'ready', 'served', 'd6a00000-0000-0000-0000-000000000010'
);
select pg_temp.assert_true(
  (select status = 'served' and version = 5 from public.orders limit 1),
  'all served tickets must mark the order served'
);
select pg_temp.assert_true(
  (select bool_and(served_at is not null) from public.kitchen_tickets),
  'served transitions must be timestamped'
);

reset role;
select pg_temp.assert_true(
  (select count(*) from public.order_status_history) = 5,
  'order history must contain open, submitted, in progress, ready and served'
);
select pg_temp.assert_true(
  (select count(*) from public.audit_logs
   where tenant_id = 'd6200000-0000-0000-0000-000000000001'
     and action = 'kitchen.ticket_transitioned') = 6,
  'every successful kitchen transition must be audited once'
);

select 'HOSTED_MODULE6_SMOKE_OK' as result;
rollback;
