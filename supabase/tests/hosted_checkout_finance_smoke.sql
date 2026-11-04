-- Hosted development smoke test for Phase 2 Module 7.
-- Run after 0008_phase2_checkout_finance.sql. All fixtures are rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'Module 7 smoke assertion failed: %', message;
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
  ('c7100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module7-manager@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 7 Manager"}', now(), now()),
  ('c7100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module7-cashier@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 7 Cashier"}', now(), now());

insert into public.tenants (id, slug, name)
values ('c7200000-0000-0000-0000-000000000001', 'module7-smoke', 'Module 7 Smoke');
insert into public.branches (id, tenant_id, slug, name)
values ('c7300000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'merkez', 'Merkez');
insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('c7400000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7100000-0000-0000-0000-000000000001', 'active'),
  ('c7400000-0000-0000-0000-000000000002', 'c7200000-0000-0000-0000-000000000001', 'c7100000-0000-0000-0000-000000000002', 'active');
insert into public.membership_branches (tenant_id, membership_id, branch_id) values
  ('c7200000-0000-0000-0000-000000000001', 'c7400000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001'),
  ('c7200000-0000-0000-0000-000000000001', 'c7400000-0000-0000-0000-000000000002', 'c7300000-0000-0000-0000-000000000001');
insert into public.membership_roles (tenant_id, membership_id, role_id)
select role_map.tenant_id, role_map.membership_id, role.id
from (values
  ('c7200000-0000-0000-0000-000000000001'::uuid, 'c7400000-0000-0000-0000-000000000001'::uuid, 'manager'),
  ('c7200000-0000-0000-0000-000000000001'::uuid, 'c7400000-0000-0000-0000-000000000002'::uuid, 'cashier')
) as role_map(tenant_id, membership_id, role_code)
join public.roles role on role.tenant_id = role_map.tenant_id and role.code = role_map.role_code;

insert into public.dining_areas (id, tenant_id, branch_id, name)
values ('c7500000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001', 'Salon');
insert into public.restaurant_tables (id, tenant_id, branch_id, area_id, label)
values ('c7600000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001', 'c7500000-0000-0000-0000-000000000001', 'M01');
insert into public.kitchen_stations (id, tenant_id, branch_id, name)
values ('c7700000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001', 'Mutfak');
insert into public.menu_categories (id, tenant_id, branch_id, name)
values ('c7800000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001', 'Menü');
insert into public.products (
  id, tenant_id, branch_id, category_id, kitchen_station_id,
  name, price_minor, tax_rate
) values ('c7900000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001', 'c7800000-0000-0000-0000-000000000001', 'c7700000-0000-0000-0000-000000000001', 'Test Ürünü', 5000, 10);
insert into public.cash_registers (id, tenant_id, branch_id, name)
values ('c7a00000-0000-0000-0000-000000000001', 'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001', 'Kasa 01');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c7100000-0000-0000-0000-000000000001', true);
select public.open_order(
  'c7200000-0000-0000-0000-000000000001',
  'c7300000-0000-0000-0000-000000000001',
  'c7600000-0000-0000-0000-000000000001', 2,
  '[{"productId":"c7900000-0000-0000-0000-000000000001","quantity":4,"notes":""}]'::jsonb,
  'c7b00000-0000-0000-0000-000000000001'
);
select public.submit_order(
  'c7200000-0000-0000-0000-000000000001',
  'c7300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1), 1,
  'c7b00000-0000-0000-0000-000000000002'
);
select public.transition_kitchen_ticket(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets limit 1), 'new', 'preparing',
  'c7b00000-0000-0000-0000-000000000003'
);
select public.transition_kitchen_ticket(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets limit 1), 'preparing', 'ready',
  'c7b00000-0000-0000-0000-000000000004'
);
select public.transition_kitchen_ticket(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.kitchen_tickets limit 1), 'ready', 'served',
  'c7b00000-0000-0000-0000-000000000005'
);

select set_config('request.jwt.claim.sub', 'c7100000-0000-0000-0000-000000000002', true);
select public.open_cash_session(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  'c7a00000-0000-0000-0000-000000000001', 10000,
  'c7b00000-0000-0000-0000-000000000006'
);
select public.open_cash_session(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  'c7a00000-0000-0000-0000-000000000001', 10000,
  'c7b00000-0000-0000-0000-000000000006'
);
select pg_temp.assert_true(
  (select count(*) from public.cash_sessions where status = 'open') = 1,
  'cash open retry must create one session'
);

select public.record_order_payments(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1),
  (select id from public.cash_sessions where status = 'open'),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amountMinor', 5000,
    'allocations', jsonb_build_array(jsonb_build_object(
      'orderItemId', (select id from public.order_items limit 1),
      'quantity', 1
    ))
  )),
  'c7b00000-0000-0000-0000-000000000007'
);
select public.record_order_payments(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1),
  (select id from public.cash_sessions where status = 'open'),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amountMinor', 5000,
    'allocations', jsonb_build_array(jsonb_build_object(
      'orderItemId', (select id from public.order_items limit 1),
      'quantity', 1
    ))
  )),
  'c7b00000-0000-0000-0000-000000000007'
);
select pg_temp.assert_true(
  (select count(*) from public.payments) = 1
  and (select count(*) from public.payment_allocations) = 1,
  'item split retry must create one payment and allocation'
);
select pg_temp.assert_true(
  (select quantity = 1 and amount_minor = 5000 from public.payment_allocations limit 1),
  'item split must preserve quantity and snapshot amount'
);

select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.record_order_payments(
      'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
      (select id from public.orders limit 1),
      (select id from public.cash_sessions where status = 'open'),
      '[{"method":"card","amountMinor":16000}]'::jsonb,
      'c7b00000-0000-0000-0000-000000000008'
    )
  $statement$, 'payment_exceeds_outstanding'),
  'payment must not exceed outstanding amount'
);

select public.record_order_payments(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1),
  (select id from public.cash_sessions where status = 'open'),
  '[{"method":"cash","amountMinor":5000},{"method":"card","amountMinor":10000}]'::jsonb,
  'c7b00000-0000-0000-0000-000000000009'
);
select public.record_order_payments(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.orders limit 1),
  (select id from public.cash_sessions where status = 'open'),
  '[{"method":"cash","amountMinor":5000},{"method":"card","amountMinor":10000}]'::jsonb,
  'c7b00000-0000-0000-0000-000000000009'
);
select pg_temp.assert_true(
  (select count(*) from public.payments) = 3,
  'mixed retry must preserve three separately auditable payment rows total'
);
select pg_temp.assert_true(
  (select status = 'closed' and closed_at is not null from public.orders limit 1),
  'full settlement must close the order'
);

select public.refund_payment(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.payments where method = 'card' limit 1),
  (select id from public.cash_sessions where status = 'open'),
  2000, 'Müşteri talebi', 'c7b00000-0000-0000-0000-000000000010'
);
select public.refund_payment(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.payments where method = 'card' limit 1),
  (select id from public.cash_sessions where status = 'open'),
  2000, 'Müşteri talebi', 'c7b00000-0000-0000-0000-000000000010'
);
select pg_temp.assert_true(
  (select count(*) from public.payment_refunds) = 1,
  'refund retry must create one append-only refund row'
);

select public.record_cash_movement(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.cash_sessions where status = 'open'),
  'expense', 1000, 'Kurye ödemesi',
  'c7b00000-0000-0000-0000-000000000011'
);
select public.close_cash_session(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.cash_sessions where status = 'open'),
  19000, 'c7b00000-0000-0000-0000-000000000012'
);
select public.close_cash_session(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.cash_sessions order by opened_at limit 1),
  19000, 'c7b00000-0000-0000-0000-000000000012'
);
select pg_temp.assert_true(
  (select status = 'closed' and expected_closing_minor = 19000
    and closing_minor = 19000 and difference_minor = 0
   from public.cash_sessions order by opened_at limit 1),
  'cash close must persist server-calculated expected balance and difference'
);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.record_cash_movement(
      'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
      (select id from public.cash_sessions order by opened_at limit 1),
      'income', 100, 'Geç işlem',
      'c7b00000-0000-0000-0000-000000000013'
    )
  $statement$, 'cash_session_not_open'),
  'closed sessions must reject movements'
);

select set_config('request.jwt.claim.sub', 'c7100000-0000-0000-0000-000000000001', true);
select public.open_cash_session(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  'c7a00000-0000-0000-0000-000000000001', 0,
  'c7b00000-0000-0000-0000-000000000014'
);
select public.close_cash_session(
  'c7200000-0000-0000-0000-000000000001', 'c7300000-0000-0000-0000-000000000001',
  (select id from public.cash_sessions where status = 'open'),
  0, 'c7b00000-0000-0000-0000-000000000015'
);
select pg_temp.assert_true(
  (select count(*) from public.cash_sessions where status = 'closed') = 2,
  'manager and cashier must independently operate authorized sessions'
);

select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    insert into public.payments (
      tenant_id, branch_id, order_id, cash_session_id, method,
      amount_minor, idempotency_key, created_by
    ) values (
      'c7200000-0000-0000-0000-000000000001',
      'c7300000-0000-0000-0000-000000000001',
      (select id from public.orders limit 1),
      (select id from public.cash_sessions limit 1),
      'cash', 1, 'direct-write-forbidden',
      'c7100000-0000-0000-0000-000000000001'
    )
  $statement$, 'permission denied'),
  'direct financial table writes must remain closed'
);

reset role;
select pg_temp.assert_true(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('cash_sessions', 'payments', 'payment_refunds')) = 3,
  'finance tables must be in the Realtime publication'
);
select 'HOSTED_MODULE7_SMOKE_OK' as result;
rollback;
