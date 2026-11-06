-- Product rules of migrations 0039-0042:
--   0039 discounts only at the cash desk (cash/card/discount/promotion), no refunds, no QR customer orders,
--        no service charge, report figures
--   0040 join requests with a business code instead of invitation links, package user limit
--   0041 role based reads (waiter / kitchen / cashier), multi-branch members, branch reactivation,
--        read-only mode for branches and cash registers
--   0042 subscription end of day (Europe/Istanbul)
-- Self-contained: builds its own businesses, users and data inside the transaction and rolls everything back.
-- Run with `supabase test db` on a local database only. Uses only plan/is/ok/finish. Ids start with f5000000-.

begin;

select plan(109);

-- ---------------------------------------------------------------------------
-- Helpers (temporary)
-- ---------------------------------------------------------------------------

create or replace function pg_temp.attempt(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

-- runs a query as the table owner (bypasses RLS) and returns the first value as text
create or replace function pg_temp.q(statement text)
returns text
language plpgsql
security definer
as $$
declare
  result text;
begin
  execute statement into result;
  return result;
end;
$$;

-- runs a statement as the table owner (bypasses RLS)
create or replace function pg_temp.run(statement text)
returns void
language plpgsql
security definer
as $$
begin
  execute statement;
end;
$$;

create or replace function pg_temp.act_as(user_number integer)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub',
    'f5000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'), true)
$$;

-- rows the current user can read, as text
create or replace function pg_temp.seen(table_name text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  execute format('select count(*)::text from public.%I', table_name) into result;
  return result;
exception when others then
  return sqlstate;
end;
$$;

create or replace function pg_temp.add_member(
  tenant uuid, user_number integer, role_code text, branch uuid, member_status text default 'active'
) returns uuid
language plpgsql
as $$
declare
  membership uuid;
begin
  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (tenant, ('f5000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'))::uuid, member_status::public.membership_status)
  returning id into membership;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  select tenant, membership, id from public.roles where tenant_id = tenant and code = role_code;
  insert into public.membership_branches (tenant_id, membership_id, branch_id) values (tenant, membership, branch);
  return membership;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner)
--   1 owner A, 2 owner B, 3 waiter A/Merkez, 4 kitchen A/Merkez, 5 cashier A/Merkez,
--   6 manager A/Merkez with users.manage delegated, 7-10 people who want to join,
--   11 waiter A in Merkez AND Teras, 12 manager A/Teras with users.manage delegated
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
select ('f5000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'f5-user-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 14) as n;
insert into public.profiles (id, full_name)
select ('f5000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'F5 User ' || n from generate_series(1, 14) as n
on conflict (id) do nothing;

select pg_temp.act_as(1);
select public.create_my_tenant('F5 Isletme A', 'F5 Merkez', 'multi');
select pg_temp.act_as(2);
select public.create_my_tenant('F5 Isletme B', 'F5 Sahil', 'start');
select set_config('request.jwt.claim.sub', '', true);

select set_config('f5.ta', (select id::text from public.tenants where name = 'F5 Isletme A'), true);
select set_config('f5.tb', (select id::text from public.tenants where name = 'F5 Isletme B'), true);
select set_config('f5.bm', (select id::text from public.branches where tenant_id = current_setting('f5.ta')::uuid), true);
select set_config('f5.bs', (select id::text from public.branches where tenant_id = current_setting('f5.tb')::uuid), true);

-- catalog of business A (direct data like the application does), then the setup / trial through the functions
insert into public.dining_areas (tenant_id, branch_id, name)
values (current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, 'Salon');
insert into public.restaurant_tables (tenant_id, branch_id, area_id, label)
select current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, id, l
from public.dining_areas, (values ('Masa 1'), ('Masa 2'), ('Masa 3')) as v(l)
where tenant_id = current_setting('f5.ta')::uuid;
insert into public.menu_categories (tenant_id, branch_id, name, fulfillment)
values (current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, 'Icecek', 'direct');
insert into public.menu_categories (tenant_id, branch_id, name)
values (current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, 'Yemek');
insert into public.products (tenant_id, branch_id, category_id, name, price_minor, tax_rate)
select current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, c.id, v.name, v.price, 10
from public.menu_categories c
join (values ('Kola', 5000, 'Icecek'), ('Kebap', 30000, 'Yemek')) as v(name, price, cat) on v.cat = c.name
where c.tenant_id = current_setting('f5.ta')::uuid;

select pg_temp.act_as(1);
select public.set_setup_method(current_setting('f5.ta')::uuid, 'self', '{}'::jsonb);
select public.complete_setup_step(current_setting('f5.ta')::uuid, step) from unnest(array['areas', 'tables', 'stations', 'menu']) as step;
select public.start_trial(current_setting('f5.ta')::uuid);
select public.create_branch(current_setting('f5.ta')::uuid, 'F5 Teras');
select set_config('request.jwt.claim.sub', '', true);
select set_config('f5.bt', (select id::text from public.branches where name = 'F5 Teras'), true);

select pg_temp.add_member(current_setting('f5.ta')::uuid, 3, 'waiter', current_setting('f5.bm')::uuid);
select pg_temp.add_member(current_setting('f5.ta')::uuid, 4, 'kitchen', current_setting('f5.bm')::uuid);
select pg_temp.add_member(current_setting('f5.ta')::uuid, 5, 'cashier', current_setting('f5.bm')::uuid);
select set_config('f5.m6', pg_temp.add_member(current_setting('f5.ta')::uuid, 6, 'manager', current_setting('f5.bm')::uuid)::text, true);
select set_config('f5.m11', pg_temp.add_member(current_setting('f5.ta')::uuid, 11, 'waiter', current_setting('f5.bm')::uuid)::text, true);
insert into public.membership_branches (tenant_id, membership_id, branch_id)
values (current_setting('f5.ta')::uuid, current_setting('f5.m11')::uuid, current_setting('f5.bt')::uuid);
select set_config('f5.m12', pg_temp.add_member(current_setting('f5.ta')::uuid, 12, 'manager', current_setting('f5.bt')::uuid)::text, true);
select pg_temp.act_as(1);
select public.set_member_extras(current_setting('f5.ta')::uuid, current_setting('f5.m6')::uuid, array['users.manage'], '{}'::uuid[]);
select public.set_member_extras(current_setting('f5.ta')::uuid, current_setting('f5.m12')::uuid, array['users.manage'], '{}'::uuid[]);
select set_config('request.jwt.claim.sub', '', true);

-- orders of business A, taken by the waiter
set local role authenticated;
select pg_temp.act_as(3);
select set_config('f5.order1', public.open_order(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid,
  (select id from public.restaurant_tables where label = 'Masa 1'), 2,
  jsonb_build_array(jsonb_build_object('productId', (select id from public.products where name = 'Kebap'), 'quantity', 1)),
  'f5-open-order-1-0000000001') ->> 'orderId', true);
select public.submit_order(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order1')::uuid, 1, 'f5-submit-order-1-00000001');
select set_config('f5.order2', public.open_order(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid,
  (select id from public.restaurant_tables where label = 'Masa 2'), 1,
  jsonb_build_array(jsonb_build_object('productId', (select id from public.products where name = 'Kola'), 'quantity', 2)),
  'f5-open-order-2-0000000001') ->> 'orderId', true);
select public.submit_order(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, 1, 'f5-submit-order-2-00000001');

-- the cashier opens the shift
select pg_temp.act_as(5);
select public.open_cash_session(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid,
  (select id from public.cash_registers where tenant_id = current_setting('f5.ta')::uuid limit 1), 0, 'f5-open-cash-0000000001');
select set_config('f5.session', (select id::text from public.cash_sessions where tenant_id = current_setting('f5.ta')::uuid and status = 'open'), true);

-- ---------------------------------------------------------------------------
-- A. Cash desk discounts (0039)
-- ---------------------------------------------------------------------------

select ok(pg_temp.q($s$select (select total_minor from public.orders where id = current_setting('f5.order2')::uuid)::text$s$) = '10000',
  'prices include KDV: two colas of 50 TL are a 100 TL adisyon');
select ok(pg_temp.q($s$select (subtotal_minor + tax_minor)::text from public.orders where id = current_setting('f5.order2')::uuid$s$) = '10000',
  'the KDV is inside the price: subtotal + tax = total');

select pg_temp.act_as(3);
select is(pg_temp.attempt($s$select public.record_order_payments(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, current_setting('f5.session')::uuid,
  '[{"method":"cash","amountMinor":6000}]'::jsonb, 'f5-pay-waiter-0000000001', '{"kind":"discount","amountMinor":4000}'::jsonb)$s$),
  '42501:payment_create_denied', 'a waiter can neither take payments nor give a discount');
select pg_temp.act_as(5);
select is(pg_temp.attempt($s$select public.record_order_payments(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, current_setting('f5.session')::uuid,
  '[{"method":"cash","amountMinor":6000}]'::jsonb, 'f5-pay-nokind-000000001', '{"amountMinor":4000}'::jsonb)$s$),
  'P0001:invalid_adjustment', 'the cashier has to choose discount or promotion explicitly');
select is(pg_temp.attempt($s$select public.record_order_payments(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, current_setting('f5.session')::uuid,
  '[]'::jsonb, 'f5-pay-toomuch-00000001', '{"kind":"discount","amountMinor":10001}'::jsonb)$s$),
  'P0001:discount_exceeds_outstanding', 'a discount can never exceed the remaining debt');
select is(pg_temp.attempt($s$select public.record_order_payments(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, current_setting('f5.session')::uuid,
  '[{"method":"cash","amountMinor":6001}]'::jsonb, 'f5-pay-over-0000000001', '{"kind":"promotion","amountMinor":4000}'::jsonb)$s$),
  'P0001:payment_exceeds_outstanding', 'money plus adjustment cannot exceed the debt');
select is(pg_temp.attempt($s$select public.record_order_payments(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, current_setting('f5.session')::uuid,
  '[]'::jsonb, 'f5-pay-empty-0000000001')$s$),
  'P0001:invalid_payment_input', 'a payment request without money and without an adjustment is refused');

select is(
  public.record_order_payments(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_setting('f5.order2')::uuid, current_setting('f5.session')::uuid,
    '[{"method":"cash","amountMinor":3000},{"method":"card","amountMinor":3000}]'::jsonb, 'f5-pay-mixed-0000001',
    '{"kind":"promotion","amountMinor":4000,"reason":"musteri memnuniyeti"}'::jsonb) ->> 'orderClosed',
  'true', 'cash + card + promotion settle the order together');
select is(pg_temp.q($s$select count(*)::text from public.payments where order_id = current_setting('f5.order2')::uuid$s$), '2', 'only the real money is a payment (cash and card)');
select is(pg_temp.q($s$select sum(amount_minor)::text from public.payments where order_id = current_setting('f5.order2')::uuid$s$), '6000', 'payments hold 60 TL, the promotion is not collected money');
select is(pg_temp.q($s$select kind || ':' || amount_minor || ':' || reason from public.order_adjustments where order_id = current_setting('f5.order2')::uuid$s$),
  'promotion:4000:musteri memnuniyeti', 'the promotion is recorded separately with its reason');
select is(pg_temp.q($s$select total_minor::text from public.orders where id = current_setting('f5.order2')::uuid$s$), '10000', 'the original adisyon total is kept');
select is(pg_temp.q($s$select count(*)::text from public.audit_logs where action = 'payment.adjustment_recorded' and entity_id = current_setting('f5.order2')::uuid$s$), '1', 'the adjustment is audited');
select is(pg_temp.attempt($s$update public.order_adjustments set amount_minor = 1$s$), '42501:permission denied for table order_adjustments', 'nobody can update a discount record');
select is(pg_temp.q($s$select pg_temp.attempt('delete from public.order_adjustments')$s$), 'P0001:order_adjustments_are_immutable', 'even the table owner cannot delete a discount record (trigger)');

-- expected cash of the shift counts only real money
select is(pg_temp.q($s$select private.cash_session_expected_minor(current_setting('f5.ta')::uuid, current_setting('f5.session')::uuid)::text$s$), '3000', 'the drawer expects 30 TL of cash: discount and card are not cash');

-- who may read the adjustments
select is(pg_temp.seen('order_adjustments'), '1', 'the cashier reads the adjustment');
select pg_temp.act_as(3);
select is(pg_temp.seen('order_adjustments'), '0', 'the waiter reads no adjustment');
select pg_temp.act_as(4);
select is(pg_temp.seen('order_adjustments'), '0', 'the kitchen reads no adjustment');

-- reports and the owner audit
select pg_temp.act_as(1);
select is((public.sales_report(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 'summary' ->> 'grossMinor'), '10000', 'report: gross product sales');
select is((public.sales_report(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 'summary' ->> 'promotionMinor'), '4000', 'report: promotion is a separate figure');
select is((public.sales_report(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 'summary' ->> 'discountMinor'), '0', 'report: discount is a separate figure');
select is((public.sales_report(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 'summary' ->> 'netMinor'), '6000', 'report: net sales = gross - discount - promotion - refunds');
select is((public.sales_report(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 'payments' ->> 'cashMinor'), '3000', 'report: cash collected');
select is((public.sales_report(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 'payments' ->> 'cardMinor'), '3000', 'report: card collected');
select is((public.discount_audit(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 0 ->> 'cashierName'), 'f5-user-5', 'audit: who gave it');
select is((public.discount_audit(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 0 ->> 'tableLabel'), 'Masa 2', 'audit: which table');
select is((public.discount_audit(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 0 ->> 'originalTotalMinor'), '10000', 'audit: original adisyon amount');
select is((public.discount_audit(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 0 ->> 'cashMinor') || '/' ||
  (public.discount_audit(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date) -> 0 ->> 'cardMinor'), '3000/3000', 'audit: cash and card parts');
select pg_temp.act_as(3);
select is(pg_temp.attempt($s$select public.discount_audit(current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, current_date, current_date)$s$), '42501:report_denied', 'a waiter cannot read the discount audit');

-- removed features
reset role;
select is(to_regprocedure('public.refund_payment(uuid,uuid,uuid,uuid,bigint,text,text)') is null, true, 'refunds cannot be created any more (function dropped)');
select is(to_regprocedure('public.place_customer_order(text,jsonb,text)') is null, true, 'customers cannot order through the QR code any more (function dropped)');
select is(to_regprocedure('public.apply_order_discount(uuid,uuid,uuid,integer,text,bigint,text)') is null
  and to_regprocedure('public.apply_item_discount(uuid,uuid,uuid,uuid,integer,text,bigint,text)') is null, true, 'order and item level discounts are gone');
select is((select count(*)::integer from public.permissions where code = 'payments.refund'), 0, 'the refund permission does not exist any more');
select is((select count(*)::integer from information_schema.columns where table_name = 'tenant_settings' and column_name = 'service_charge_basis_points'), 0, 'there is no service charge column any more');
select is((select count(*)::integer from public.role_permissions rp join public.permissions p on p.id = rp.permission_id join public.roles r on r.id = rp.role_id
  where r.code = 'cashier' and p.code = 'discounts.apply'), 2, 'the cashier role holds the discount permission (both businesses)');
select is((select count(*)::integer from public.role_permissions rp join public.permissions p on p.id = rp.permission_id join public.roles r on r.id = rp.role_id
  where r.code in ('waiter', 'kitchen') and p.code = 'discounts.apply'), 0, 'waiter and kitchen can never discount');

-- ---------------------------------------------------------------------------
-- B. Role based reads (0041)
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(4);
select is(pg_temp.seen('orders'), '1', 'kitchen: only the order that has a ticket');
select is(pg_temp.seen('restaurant_tables'), '1', 'kitchen: only the table of that order (no floor plan)');
select is(pg_temp.seen('dining_areas'), '0', 'kitchen: no dining areas');
select is(pg_temp.seen('payments'), '0', 'kitchen: no payments');
select is(pg_temp.seen('cash_registers'), '0', 'kitchen: no cash registers');
select is((select count(*)::text from public.order_items), '1', 'kitchen: the items of the ticketed order only');
select is((select count(*)::text from public.kitchen_tickets), '1', 'kitchen: reads its ticket');
select pg_temp.act_as(3);
select is(pg_temp.seen('orders'), '2', 'waiter: sees the orders of the branch');
select is(pg_temp.seen('restaurant_tables'), '3', 'waiter: sees the tables');
select is(pg_temp.seen('cash_registers'), '0', 'waiter: no cash registers');
select is(pg_temp.seen('payments'), '0', 'waiter: no payments');
select pg_temp.act_as(5);
select is(pg_temp.seen('cash_registers'), '1', 'cashier: sees the cash register');
select is(pg_temp.seen('restaurant_tables'), '3', 'cashier: sees the tables');

-- ---------------------------------------------------------------------------
-- C. Join requests with a business code (0040)
-- ---------------------------------------------------------------------------

select pg_temp.act_as(1);
select set_config('f5.codeA', public.get_join_code(current_setting('f5.ta')::uuid), true);
select pg_temp.act_as(2);
select set_config('f5.codeB', public.get_join_code(current_setting('f5.tb')::uuid), true);
select pg_temp.act_as(3);
select is(pg_temp.attempt($s$select public.get_join_code(current_setting('f5.ta')::uuid)$s$), '42501:users_manage_denied', 'an ordinary member cannot read the business code');
select is(pg_temp.seen('tenant_join_codes'), '0', 'the codes are not readable through the REST API by members');
select pg_temp.act_as(7);
select is(public.request_join_tenant('F5 Isletme A', 'ABCDEFGHJK') ->> 'status', 'invalid_code', 'a wrong code gives nothing');
select is(public.request_join_tenant('Baska Isletme', current_setting('f5.codeA')) ->> 'status', 'invalid_code', 'the right code with the wrong name gives nothing');
select is(pg_temp.attempt($s$select public.request_join_tenant('f5 isletme a', current_setting('f5.codeA'))$s$), 'ok', 'name and code (any letter case) create a join request');
select is(pg_temp.attempt($s$select public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA'))$s$), 'ok', 'asking twice is harmless (the same pending request)');
select is(pg_temp.q($s$select count(*)::text from public.join_requests where tenant_id = current_setting('f5.ta')::uuid$s$), '1', 'repeated requests do not multiply');
select is(pg_temp.seen('orders') || pg_temp.seen('restaurant_tables') || pg_temp.seen('payments') || pg_temp.seen('staff_profiles') || pg_temp.seen('audit_logs'), '00000', 'a waiting user reads no order, table, payment, staff or audit data');
select is(pg_temp.seen('tenant_memberships'), '0', 'a waiting user is not a member');
select is(pg_temp.seen('join_requests'), '1', 'a waiting user sees only his own request');
select is(pg_temp.attempt($s$select public.decide_join_request((select id from public.join_requests limit 1), 'approve',
  (select id from public.roles where code = 'owner' and tenant_id = current_setting('f5.ta')::uuid), array[current_setting('f5.bm')::uuid])$s$), '42501:users_manage_denied', 'the applicant cannot approve himself');
select pg_temp.act_as(2);
select is(pg_temp.seen('join_requests'), '0', 'the owner of another business sees no request of A');
select is(pg_temp.attempt($s$select public.list_join_requests(current_setting('f5.ta')::uuid)$s$), '42501:users_manage_denied', 'and cannot list them');

-- a branch manager approves within his authority
select pg_temp.act_as(6);
select set_config('f5.req7', (public.list_join_requests(current_setting('f5.ta')::uuid) -> 0 ->> 'id'), true);
select is(pg_temp.attempt(format($s$select public.decide_join_request(%L, 'approve', (select id from public.roles where code = 'tenant_admin' and tenant_id = current_setting('f5.ta')::uuid), array[current_setting('f5.bm')::uuid])$s$, current_setting('f5.req7'))),
  '42501:tenant_role_assignment_denied', 'a branch manager cannot hand out a business wide role');
select is(pg_temp.attempt(format($s$select public.decide_join_request(%L, 'approve', (select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.ta')::uuid), array[current_setting('f5.bt')::uuid])$s$, current_setting('f5.req7'))),
  '42501:branch_assignment_denied', 'a branch manager cannot place somebody into a branch he does not manage');
select is(pg_temp.attempt(format($s$select public.decide_join_request(%L, 'approve', (select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.ta')::uuid), array[current_setting('f5.bm')::uuid])$s$, current_setting('f5.req7'))),
  'ok', 'he approves a waiter in his own branch');
select pg_temp.act_as(7);
select is(pg_temp.seen('restaurant_tables'), '3', 'after approval the new waiter reads the tables of his branch');
select is(pg_temp.seen('payments'), '0', 'and still no payments');
select is(pg_temp.attempt($s$select public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA'))$s$), 'P0001:already_member', 'a member does not need to ask again');

-- reject and suspended people cannot come back with the code
select pg_temp.act_as(8);
select public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA'));
select pg_temp.act_as(1);
select is(public.decide_join_request((select (public.list_join_requests(current_setting('f5.ta')::uuid) -> 0 ->> 'id')::uuid), 'reject') ->> 'status', 'rejected', 'the owner rejects a request');
select pg_temp.act_as(8);
select is(pg_temp.attempt($s$select public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA'))$s$), 'P0001:join_not_allowed', 'a rejected person cannot ask again with the code');
select pg_temp.run($s$update public.tenant_memberships set status = 'suspended' where user_id = 'f5000000-0000-4000-8000-000000000007'$s$);
select pg_temp.act_as(7);
select is(pg_temp.attempt($s$select public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA'))$s$), 'P0001:join_not_allowed', 'a suspended member cannot come back through the code');
select is(pg_temp.seen('restaurant_tables'), '0', 'a suspended member reads nothing');
select pg_temp.run($s$update public.tenant_memberships set status = 'active' where user_id = 'f5000000-0000-4000-8000-000000000007'$s$);

-- guessing the code is rate limited
select pg_temp.act_as(9);
select public.request_join_tenant('F5 Isletme A', 'AAAAAAAAAA') from generate_series(1, 5);
select is(public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA')) ->> 'status', 'rate_limited', 'five wrong tries in a row block the next try, even with the right code');
select is(pg_temp.q($s$select count(*)::text from public.join_attempts where user_id = 'f5000000-0000-4000-8000-000000000009'$s$), '5', 'the failed tries really are recorded');

-- the owner can change the code
select pg_temp.act_as(1);
select set_config('f5.newCodeA', public.rotate_join_code(current_setting('f5.ta')::uuid), true);
select isnt(current_setting('f5.newCodeA'), current_setting('f5.codeA'), 'rotating the code gives a new code');
select pg_temp.act_as(10);
select is(public.request_join_tenant('F5 Isletme A', current_setting('f5.codeA')) ->> 'status', 'invalid_code', 'the old code no longer works');
select is(pg_temp.attempt($s$select public.request_join_tenant('F5 Isletme A', current_setting('f5.newCodeA'))$s$), 'ok', 'the new code works');
select pg_temp.act_as(6);
select is(pg_temp.attempt($s$select public.rotate_join_code(current_setting('f5.ta')::uuid)$s$), '42501:users_manage_denied', 'a branch manager cannot rotate the code');

-- invitation machinery is gone
reset role;
select is(to_regprocedure('public.create_tenant_invitation(uuid,uuid,text,uuid,integer)') is null
  and to_regprocedure('public.accept_tenant_invitation(text)') is null
  and to_regprocedure('public.get_tenant_invitation(text)') is null, true, 'invitation functions are gone');

-- ---------------------------------------------------------------------------
-- D. Package user limit (0040 / 0041) on a START package business (5 users)
-- ---------------------------------------------------------------------------

select pg_temp.add_member(current_setting('f5.tb')::uuid, 3, 'waiter', current_setting('f5.bs')::uuid);
select pg_temp.add_member(current_setting('f5.tb')::uuid, 4, 'waiter', current_setting('f5.bs')::uuid);
select pg_temp.add_member(current_setting('f5.tb')::uuid, 5, 'waiter', current_setting('f5.bs')::uuid);
select set_config('f5.mb6', pg_temp.add_member(current_setting('f5.tb')::uuid, 6, 'waiter', current_setting('f5.bs')::uuid, 'suspended')::text, true);
select pg_temp.add_member(current_setting('f5.tb')::uuid, 11, 'waiter', current_setting('f5.bs')::uuid);
-- owner (1) + 3 + 4 + 5 + 11 active = 5 of 5
set local role authenticated;
select pg_temp.act_as(13);
select public.request_join_tenant('F5 Isletme B', current_setting('f5.codeB'));
select pg_temp.act_as(2);
select is(pg_temp.attempt(format($s$select public.decide_join_request(%L, 'approve', (select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.tb')::uuid), array[current_setting('f5.bs')::uuid])$s$,
  (public.list_join_requests(current_setting('f5.tb')::uuid) -> 0 ->> 'id'))), 'P0001:user_limit_reached', 'the package user limit blocks the approval');
select is(pg_temp.attempt(format($s$select public.update_tenant_member_access(current_setting('f5.tb')::uuid, %L, 'active', array[current_setting('f5.bs')::uuid], array[(select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.tb')::uuid)])$s$, current_setting('f5.mb6'))),
  'P0001:user_limit_reached', 'a suspended member cannot be reactivated beyond the limit either');
select is(pg_temp.q($s$select count(distinct user_id)::text from public.tenant_memberships where tenant_id = current_setting('f5.tb')::uuid and status = 'active'$s$), '5', 'the business still has exactly five active users');
select pg_temp.run($s$update public.tenant_memberships set status = 'suspended' where tenant_id = current_setting('f5.tb')::uuid and user_id = 'f5000000-0000-4000-8000-000000000011'$s$);
select is(pg_temp.attempt(format($s$select public.decide_join_request(%L, 'approve', (select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.tb')::uuid), array[current_setting('f5.bs')::uuid])$s$,
  (public.list_join_requests(current_setting('f5.tb')::uuid) -> 0 ->> 'id'))), 'ok', 'a free seat lets the approval through');
select is(pg_temp.q($s$select count(*)::text from public.tenant_memberships where tenant_id = current_setting('f5.ta')::uuid and user_id = 'f5000000-0000-4000-8000-000000000011'$s$), '1', 'a person with two branches is one membership (one user)');

-- ---------------------------------------------------------------------------
-- E. Multi-branch members and branch reactivation (0041)
-- ---------------------------------------------------------------------------

select pg_temp.act_as(6);
select is(pg_temp.attempt(format($s$select public.update_tenant_member_access(current_setting('f5.ta')::uuid, %L, 'active', array[current_setting('f5.bm')::uuid, current_setting('f5.bt')::uuid], array[(select id from public.roles where code = 'cashier' and tenant_id = current_setting('f5.ta')::uuid)])$s$, current_setting('f5.m11'))),
  '42501:branch_assignment_denied', 'the Merkez manager cannot write the Teras assignment');
select is(pg_temp.attempt(format($s$select public.update_tenant_member_access(current_setting('f5.ta')::uuid, %L, 'active', array[current_setting('f5.bm')::uuid], array[(select id from public.roles where code = 'cashier' and tenant_id = current_setting('f5.ta')::uuid)])$s$, current_setting('f5.m11'))),
  '42501:member_spans_other_branches', 'he cannot change the role of a member who also works in Teras');
select is(pg_temp.attempt(format($s$select public.update_tenant_member_access(current_setting('f5.ta')::uuid, %L, 'suspended', array[current_setting('f5.bm')::uuid], array[(select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.ta')::uuid)])$s$, current_setting('f5.m11'))),
  '42501:member_spans_other_branches', 'nor suspend him');
select is(pg_temp.attempt(format($s$select public.update_tenant_member_access(current_setting('f5.ta')::uuid, %L, 'active', array[current_setting('f5.bm')::uuid], array[(select id from public.roles where code = 'waiter' and tenant_id = current_setting('f5.ta')::uuid)])$s$, current_setting('f5.m11'))),
  'ok', 'he can still remove the member from his own branch (role and status unchanged)');
select is(pg_temp.q($s$select count(*)::text from public.membership_branches where membership_id = current_setting('f5.m11')::uuid and branch_id = current_setting('f5.bt')::uuid$s$), '1', 'the Teras access of that member is untouched');

select pg_temp.act_as(1);
select is(pg_temp.attempt($s$select public.set_branch_active(current_setting('f5.ta')::uuid, current_setting('f5.bt')::uuid, false)$s$), 'ok', 'the owner switches a branch off');
select pg_temp.act_as(6);
select is(pg_temp.attempt($s$select public.set_branch_active(current_setting('f5.ta')::uuid, current_setting('f5.bt')::uuid, true)$s$), '42501:branch_manage_denied', 'a branch manager cannot switch branches');
select pg_temp.act_as(1);
select is(pg_temp.attempt($s$select public.set_branch_active(current_setting('f5.ta')::uuid, current_setting('f5.bt')::uuid, true)$s$), 'ok', 'the owner switches the passive branch on again');
select pg_temp.act_as(2);
select is(pg_temp.attempt($s$select public.set_branch_active(current_setting('f5.tb')::uuid, current_setting('f5.bs')::uuid, false)$s$), 'P0001:last_branch_required', 'the last active branch cannot be switched off');
select pg_temp.act_as(1);
select is(pg_temp.attempt($s$select public.set_branch_active(current_setting('f5.tb')::uuid, current_setting('f5.bs')::uuid, false)$s$), '42501:branch_manage_denied', 'and nobody can touch the branches of another business');

-- ---------------------------------------------------------------------------
-- F. Subscription end of day (0042) and the read-only mode
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.run($s$update public.subscriptions set ends_at = ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') + interval '1 second' where tenant_id = current_setting('f5.ta')::uuid$s$);
select is(private.tenant_is_writable(current_setting('f5.ta')::uuid), true, 'on the end date at 00:00:01 the business still works');
select pg_temp.run($s$update public.subscriptions set ends_at = ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') + interval '23 hours 59 minutes 59 seconds' where tenant_id = current_setting('f5.ta')::uuid$s$);
select is(private.tenant_is_writable(current_setting('f5.ta')::uuid), true, 'on the end date at 23:59:59 the business still works');
select pg_temp.run($s$update public.subscriptions set ends_at = ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') - interval '1 second' where tenant_id = current_setting('f5.ta')::uuid$s$);
select is(private.tenant_is_writable(current_setting('f5.ta')::uuid), false, 'from 00:00:00 of the next day writes are locked');
set local role authenticated;
select pg_temp.act_as(1);
select is(pg_temp.attempt($s$insert into public.cash_registers (tenant_id, branch_id, name) values (current_setting('f5.ta')::uuid, current_setting('f5.bm')::uuid, 'Yeni kasa')$s$), 'P0001:tenant_read_only', 'a locked business cannot add a cash register');
select is(pg_temp.attempt($s$update public.branches set name = 'Yeni ad' where id = current_setting('f5.bm')::uuid$s$), 'P0001:tenant_read_only', 'nor rename a branch');
reset role;
select pg_temp.run($s$update public.subscriptions set ends_at = now() + interval '30 days' where tenant_id = current_setting('f5.ta')::uuid$s$);
select is(private.tenant_is_writable(current_setting('f5.ta')::uuid), true, 'a renewal opens the business again at once');
select is(pg_temp.q($s$update public.subscriptions set status = 'active', ends_at = ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') + interval '5 hours' where tenant_id = current_setting('f5.ta')::uuid returning 'x'$s$) is not null
  and private.tenant_is_writable(current_setting('f5.ta')::uuid), true, 'a paid subscription follows the same end-of-day rule');

-- ---------------------------------------------------------------------------
-- G. Earlier security fixes stay in place
-- ---------------------------------------------------------------------------

select is((select count(*)::integer from pg_policies where schemaname = 'public' and policyname like '%\_finance\_read\_restrict'), 5, '0035: five finance read policies');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('roles', 'role_permissions') and cmd <> 'SELECT'), 0, '0036: no write policy on roles / role_permissions');
select is(has_function_privilege('anon', 'public.request_join_tenant(text,text)', 'EXECUTE'), false, 'anon cannot request to join');
select is(has_function_privilege('anon', 'public.record_order_payments(uuid,uuid,uuid,uuid,jsonb,text,jsonb)', 'EXECUTE'), false, 'anon cannot record payments');
select is(has_function_privilege('anon', 'public.discount_audit(uuid,uuid,date,date)', 'EXECUTE'), false, 'anon cannot read the discount audit');
select is(has_function_privilege('anon', 'public.save_tenant_configuration(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), false, 'anon cannot save the configuration');
select is(has_table_privilege('anon', 'public.order_adjustments', 'SELECT'), false, 'anon reads no discount record');

select * from finish();
rollback;
