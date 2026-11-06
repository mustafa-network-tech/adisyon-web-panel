-- F1: reading the finance tables needs a finance permission (migration 0035).
-- Self-contained: builds its own businesses, users and finance rows inside the
-- transaction (nothing depends on supabase/seed.sql) and rolls everything back.
-- 0039: the refund permission is gone, so its role case was removed. Run with `supabase test db` on a local database only.
-- Prefix f1000000-... marks every id created here.

begin;

select plan(58);

-- ---------------------------------------------------------------------------
-- Helpers (temporary, gone after the rollback)
-- ---------------------------------------------------------------------------

-- "<Merkez rows>/<Teras rows>/<rows of other businesses>" as seen by the caller.
-- Plain SQL under the caller's role, so row level security decides.
create or replace function pg_temp.seen(table_name text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  execute format(
    $q$
      select count(*) filter (where %1$s)::text || '/' ||
             count(*) filter (where %2$s)::text || '/' ||
             count(*) filter (where tenant_id <> current_setting('f1.tenant_a')::uuid)::text
      from public.%3$I
    $q$,
    case when table_name = 'cash_movements'
      then $c$reason = 'f1-merkez'$c$
      else $c$branch_id = current_setting('f1.branch_merkez')::uuid$c$ end,
    case when table_name = 'cash_movements'
      then $c$reason = 'f1-teras'$c$
      else $c$branch_id = current_setting('f1.branch_teras')::uuid$c$ end,
    table_name
  ) into result;
  return result;
end;
$$;

create or replace function pg_temp.write_denied(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when insufficient_privilege then return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
select ('f1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'f1-user-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 11) as n;
insert into public.profiles (id, full_name)
select ('f1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'F1 User ' || n
from generate_series(1, 11) as n
on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('f1000000-0000-4000-8000-000000000011');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select public.create_my_tenant('F1 Test Isletme A', 'F1 Merkez');
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000010', true);
select public.create_my_tenant('F1 Test Isletme B', 'F1 Sahil');
select set_config('request.jwt.claim.sub', '', true);

-- Fixture rows bypass the product-flow triggers (limits, setup, read-only). User triggers
-- only: foreign keys stay enforced. Rolled back with the transaction.
alter table public.branches disable trigger user;
alter table public.orders disable trigger user;
alter table public.order_items disable trigger user;
alter table public.payments disable trigger user;
alter table public.payment_allocations disable trigger user;
alter table public.payment_refunds disable trigger user;
alter table public.cash_sessions disable trigger user;
alter table public.cash_movements disable trigger user;

update public.branches set slug = 'f1-merkez'
where tenant_id = (select id from public.tenants where name = 'F1 Test Isletme A');
update public.branches set slug = 'f1-sahil'
where tenant_id = (select id from public.tenants where name = 'F1 Test Isletme B');
insert into public.branches (tenant_id, name, slug, timezone, currency_code)
select id, 'F1 Teras', 'f1-teras', 'Europe/Istanbul', 'TRY'
from public.tenants where name = 'F1 Test Isletme A';
insert into public.cash_registers (tenant_id, branch_id, name)
select tenant_id, id, 'F1 Teras Kasa' from public.branches where slug = 'f1-teras';

select set_config('f1.tenant_a', (select id::text from public.tenants where name = 'F1 Test Isletme A'), true);
select set_config('f1.branch_merkez', (select id::text from public.branches where slug = 'f1-merkez'), true);
select set_config('f1.branch_teras', (select id::text from public.branches where slug = 'f1-teras'), true);

-- Staff: system roles plus four single-permission roles, all in branch Merkez except the Teras cashier.
create or replace function pg_temp.add_member(user_id uuid, role_id uuid, branch_slug text)
returns void
language plpgsql
as $$
declare
  tenant uuid := (select id from public.tenants where name = 'F1 Test Isletme A');
  membership uuid;
begin
  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (tenant, user_id, 'active') returning id into membership;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  values (tenant, membership, role_id);
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  select tenant, membership, id from public.branches where slug = branch_slug and tenant_id = tenant;
end;
$$;

create or replace function pg_temp.narrow_role(code text, permission text)
returns uuid
language plpgsql
as $$
declare
  tenant uuid := (select id from public.tenants where name = 'F1 Test Isletme A');
  new_role uuid;
begin
  insert into public.roles (tenant_id, code, name, scope)
  values (tenant, code, code, 'branch') returning id into new_role;
  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant, new_role, id from public.permissions where permissions.code = permission;
  return new_role;
end;
$$;

select pg_temp.add_member('f1000000-0000-4000-8000-000000000002', (select id from public.roles where code = 'waiter' and tenant_id = (select id from public.tenants where name = 'F1 Test Isletme A')), 'f1-merkez');
select pg_temp.add_member('f1000000-0000-4000-8000-000000000003', (select id from public.roles where code = 'kitchen' and tenant_id = (select id from public.tenants where name = 'F1 Test Isletme A')), 'f1-merkez');
select pg_temp.add_member('f1000000-0000-4000-8000-000000000004', (select id from public.roles where code = 'cashier' and tenant_id = (select id from public.tenants where name = 'F1 Test Isletme A')), 'f1-merkez');
select pg_temp.add_member('f1000000-0000-4000-8000-000000000005', (select id from public.roles where code = 'cashier' and tenant_id = (select id from public.tenants where name = 'F1 Test Isletme A')), 'f1-teras');
select pg_temp.add_member('f1000000-0000-4000-8000-000000000007', pg_temp.narrow_role('f1_create_only', 'payments.create'), 'f1-merkez');
select pg_temp.add_member('f1000000-0000-4000-8000-000000000008', pg_temp.narrow_role('f1_open_only', 'cash.open'), 'f1-merkez');
select pg_temp.add_member('f1000000-0000-4000-8000-000000000009', pg_temp.narrow_role('f1_reports_only', 'reports.read'), 'f1-merkez');

-- One complete set of finance rows per branch (and one for business B).
create or replace function pg_temp.seed_finance(branch_slug text, marker text, order_no bigint, creator uuid)
returns void
language plpgsql
as $$
declare
  b record;
  register uuid;
  session uuid;
  new_order uuid;
  item uuid;
  payment uuid;
begin
  select id, tenant_id into b from public.branches where slug = branch_slug;
  select id into register from public.cash_registers where branch_id = b.id order by created_at limit 1;
  insert into public.cash_sessions (tenant_id, branch_id, cash_register_id, opened_by)
  values (b.tenant_id, b.id, register, creator) returning id into session;
  insert into public.orders (tenant_id, branch_id, order_number, status, created_by)
  values (b.tenant_id, b.id, order_no, 'served', creator) returning id into new_order;
  insert into public.order_items (tenant_id, branch_id, order_id, product_name, quantity, unit_price_minor, tax_rate, line_total_minor)
  values (b.tenant_id, b.id, new_order, 'F1 urun', 1, 1000, 10, 1000) returning id into item;
  insert into public.payments (tenant_id, branch_id, order_id, cash_session_id, method, amount_minor, idempotency_key, created_by)
  values (b.tenant_id, b.id, new_order, session, 'cash', 1000, 'f1-pay-' || marker, creator) returning id into payment;
  insert into public.payment_allocations (tenant_id, branch_id, payment_id, order_id, order_item_id, quantity, amount_minor)
  values (b.tenant_id, b.id, payment, new_order, item, 1, 1000);
  insert into public.payment_refunds (tenant_id, branch_id, payment_id, cash_session_id, amount_minor, reason, idempotency_key, created_by)
  values (b.tenant_id, b.id, payment, session, 100, 'f1-' || marker, 'f1-refund-' || marker, creator);
  insert into public.cash_movements (tenant_id, cash_session_id, movement_type, amount_minor, reason, created_by)
  values (b.tenant_id, session, 'expense', 100, 'f1-' || marker, creator);
end;
$$;

select pg_temp.seed_finance('f1-merkez', 'merkez', 920001, 'f1000000-0000-4000-8000-000000000001');
select pg_temp.seed_finance('f1-teras', 'teras', 920002, 'f1000000-0000-4000-8000-000000000001');
select pg_temp.seed_finance('f1-sahil', 'sahil', 920003, 'f1000000-0000-4000-8000-000000000010');

-- ---------------------------------------------------------------------------
-- Checks, as plain authenticated users (what a REST call with the user's JWT does)
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select is(pg_temp.seen('cash_sessions'), '0/0/0', 'waiter reads no finance row: cash_sessions');
select is(pg_temp.seen('payments'), '0/0/0', 'waiter reads no finance row: payments');
select is(pg_temp.seen('payment_refunds'), '0/0/0', 'waiter reads no finance row: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/0/0', 'waiter reads no finance row: payment_allocations');
select is(pg_temp.seen('cash_movements'), '0/0/0', 'waiter reads no finance row: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
select is(pg_temp.seen('cash_sessions'), '0/0/0', 'kitchen user reads no finance row: cash_sessions');
select is(pg_temp.seen('payments'), '0/0/0', 'kitchen user reads no finance row: payments');
select is(pg_temp.seen('payment_refunds'), '0/0/0', 'kitchen user reads no finance row: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/0/0', 'kitchen user reads no finance row: payment_allocations');
select is(pg_temp.seen('cash_movements'), '0/0/0', 'kitchen user reads no finance row: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select is(pg_temp.seen('cash_sessions'), '1/0/0', 'Merkez cashier reads only Merkez rows: cash_sessions');
select is(pg_temp.seen('payments'), '1/0/0', 'Merkez cashier reads only Merkez rows: payments');
select is(pg_temp.seen('payment_refunds'), '1/0/0', 'Merkez cashier reads only Merkez rows: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '1/0/0', 'Merkez cashier reads only Merkez rows: payment_allocations');
select is(pg_temp.seen('cash_movements'), '1/0/0', 'Merkez cashier reads only Merkez rows: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000005', true);
select is(pg_temp.seen('cash_sessions'), '0/1/0', 'Teras cashier reads only Teras rows: cash_sessions');
select is(pg_temp.seen('payments'), '0/1/0', 'Teras cashier reads only Teras rows: payments');
select is(pg_temp.seen('payment_refunds'), '0/1/0', 'Teras cashier reads only Teras rows: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/1/0', 'Teras cashier reads only Teras rows: payment_allocations');
select is(pg_temp.seen('cash_movements'), '0/1/0', 'Teras cashier reads only Teras rows: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select is(pg_temp.seen('cash_sessions'), '1/1/0', 'business owner reads both branches and no foreign row: cash_sessions');
select is(pg_temp.seen('payments'), '1/1/0', 'business owner reads both branches and no foreign row: payments');
select is(pg_temp.seen('payment_refunds'), '1/1/0', 'business owner reads both branches and no foreign row: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '1/1/0', 'business owner reads both branches and no foreign row: payment_allocations');
select is(pg_temp.seen('cash_movements'), '1/1/0', 'business owner reads both branches and no foreign row: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000010', true);
select is(pg_temp.seen('cash_sessions'), '0/0/1', 'other business owner reads only its own row: cash_sessions');
select is(pg_temp.seen('payments'), '0/0/1', 'other business owner reads only its own row: payments');
select is(pg_temp.seen('payment_refunds'), '0/0/1', 'other business owner reads only its own row: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/0/1', 'other business owner reads only its own row: payment_allocations');
select is(pg_temp.seen('cash_movements'), '0/0/1', 'other business owner reads only its own row: cash_movements');


select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000007', true);
select is(pg_temp.seen('cash_sessions'), '1/0/0', 'payments.create-only role: cash_sessions');
select is(pg_temp.seen('payments'), '1/0/0', 'payments.create-only role: payments');
select is(pg_temp.seen('payment_refunds'), '1/0/0', 'payments.create-only role: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '1/0/0', 'payments.create-only role: payment_allocations');
select is(pg_temp.seen('cash_movements'), '1/0/0', 'payments.create-only role: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000008', true);
select is(pg_temp.seen('cash_sessions'), '1/0/0', 'cash.open-only role: cash_sessions');
select is(pg_temp.seen('payments'), '0/0/0', 'cash.open-only role: payments');
select is(pg_temp.seen('payment_refunds'), '0/0/0', 'cash.open-only role: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/0/0', 'cash.open-only role: payment_allocations');
select is(pg_temp.seen('cash_movements'), '1/0/0', 'cash.open-only role: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000009', true);
select is(pg_temp.seen('cash_sessions'), '0/0/0', 'reports.read-only role: cash_sessions');
select is(pg_temp.seen('payments'), '0/0/0', 'reports.read-only role: payments');
select is(pg_temp.seen('payment_refunds'), '0/0/0', 'reports.read-only role: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/0/0', 'reports.read-only role: payment_allocations');
select is(pg_temp.seen('cash_movements'), '0/0/0', 'reports.read-only role: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000011', true);
select is(pg_temp.seen('cash_sessions'), '0/0/0', 'platform admin without a support session: cash_sessions');
select is(pg_temp.seen('payments'), '0/0/0', 'platform admin without a support session: payments');
select is(pg_temp.seen('payment_refunds'), '0/0/0', 'platform admin without a support session: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '0/0/0', 'platform admin without a support session: payment_allocations');
select is(pg_temp.seen('cash_movements'), '0/0/0', 'platform admin without a support session: cash_movements');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000011', true);
create temporary table f1_support_result (id uuid not null);
insert into f1_support_result (id)
select public.open_platform_support_session(
  current_setting('f1.tenant_a')::uuid,
  current_setting('f1.branch_merkez')::uuid,
  'F1 finance read permission regression',
  15
);

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000011', true);
select is(pg_temp.seen('cash_sessions'), '1/0/0', 'support session of Merkez reads Merkez rows only: cash_sessions');
select is(pg_temp.seen('payments'), '1/0/0', 'support session of Merkez reads Merkez rows only: payments');
select is(pg_temp.seen('payment_refunds'), '1/0/0', 'support session of Merkez reads Merkez rows only: payment_refunds');
select is(pg_temp.seen('payment_allocations'), '1/0/0', 'support session of Merkez reads Merkez rows only: payment_allocations');
select is(pg_temp.seen('cash_movements'), '1/0/0', 'support session of Merkez reads Merkez rows only: cash_movements');

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select ok(
  pg_temp.write_denied($statement$
    insert into public.payments (
      tenant_id, branch_id, order_id, cash_session_id, method,
      amount_minor, idempotency_key, created_by
    ) select tenant_id, branch_id, order_id, cash_session_id, 'cash', 1,
      'f1-direct-write-forbidden', 'f1000000-0000-4000-8000-000000000004'
    from public.payments limit 1
  $statement$),
  'a cashier cannot insert payments directly'
);

reset role;
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname like '%\_finance\_read\_restrict'
      and permissive = 'RESTRICTIVE'
      and cmd = 'SELECT'
  ),
  5,
  'five restrictive finance read policies exist'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('cash_sessions', 'payments', 'payment_refunds', 'payment_allocations', 'cash_movements')
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
  ),
  5,
  'the permissive branch access policies are still in place'
);
select * from finish();
rollback;
