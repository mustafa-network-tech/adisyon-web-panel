-- Hosted development smoke test for Phase 2 Module 4.
-- All fixtures and CRUD operations are rolled back at the end.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'Module 4 smoke assertion failed: %', message;
  end if;
end;
$$;

create or replace function pg_temp.operation_denied(statement text)
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

create or replace function pg_temp.affected_rows(statement text)
returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  execute statement;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function pg_temp.assert_true(boolean, text) to authenticated;
grant execute on function pg_temp.operation_denied(text) to authenticated;
grant execute on function pg_temp.affected_rows(text) to authenticated;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('f1100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module4-manager@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 4 Manager"}', now(), now()),
  ('f1100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module4-waiter@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 4 Waiter"}', now(), now());

insert into public.tenants (id, slug, name) values
  ('f1200000-0000-0000-0000-000000000001', 'module4-smoke', 'Module 4 Smoke');

insert into public.branches (id, tenant_id, slug, name) values
  ('f1300000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'merkez', 'Merkez'),
  ('f1300000-0000-0000-0000-000000000002', 'f1200000-0000-0000-0000-000000000001', 'diger', 'Diğer Şube');

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('f1400000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'active'),
  ('f1400000-0000-0000-0000-000000000002', 'f1200000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000002', 'active');

insert into public.membership_branches (tenant_id, membership_id, branch_id) values
  ('f1200000-0000-0000-0000-000000000001', 'f1400000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000001'),
  ('f1200000-0000-0000-0000-000000000001', 'f1400000-0000-0000-0000-000000000002', 'f1300000-0000-0000-0000-000000000001');

insert into public.membership_roles (tenant_id, membership_id, role_id)
select role_map.tenant_id, role_map.membership_id, role.id
from (values
  ('f1200000-0000-0000-0000-000000000001'::uuid, 'f1400000-0000-0000-0000-000000000001'::uuid, 'manager'),
  ('f1200000-0000-0000-0000-000000000001'::uuid, 'f1400000-0000-0000-0000-000000000002'::uuid, 'waiter')
) as role_map(tenant_id, membership_id, role_code)
join public.roles role
  on role.tenant_id = role_map.tenant_id
  and role.code = role_map.role_code;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1100000-0000-0000-0000-000000000001', true);

insert into public.dining_areas (id, tenant_id, branch_id, name)
values ('f1500000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000001', 'Salon');

insert into public.restaurant_tables (
  id, tenant_id, branch_id, area_id, label, capacity
) values (
  'f1600000-0000-0000-0000-000000000001',
  'f1200000-0000-0000-0000-000000000001',
  'f1300000-0000-0000-0000-000000000001',
  'f1500000-0000-0000-0000-000000000001',
  'M01',
  4
);

insert into public.menu_categories (id, tenant_id, branch_id, name)
values ('f1700000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000001', 'Ana Yemekler');

insert into public.products (
  id, tenant_id, branch_id, category_id, name, price_minor, tax_rate
) values (
  'f1800000-0000-0000-0000-000000000001',
  'f1200000-0000-0000-0000-000000000001',
  'f1300000-0000-0000-0000-000000000001',
  'f1700000-0000-0000-0000-000000000001',
  'Izgara Tavuk',
  36550,
  10
);

update public.restaurant_tables
set capacity = 6, operational_status = 'reserved'
where id = 'f1600000-0000-0000-0000-000000000001';
update public.products
set price_minor = 37950, description = 'Güncel fiyat'
where id = 'f1800000-0000-0000-0000-000000000001';

select pg_temp.assert_true(
  (select capacity = 6 and operational_status = 'reserved' from public.restaurant_tables where id = 'f1600000-0000-0000-0000-000000000001'),
  'manager must create and update assigned-branch tables'
);
select pg_temp.assert_true(
  (select price_minor = 37950 from public.products where id = 'f1800000-0000-0000-0000-000000000001'),
  'manager must create and update assigned-branch products'
);
select pg_temp.assert_true(
  pg_temp.operation_denied($statement$
    insert into public.dining_areas (tenant_id, branch_id, name)
    values ('f1200000-0000-0000-0000-000000000001', 'f1300000-0000-0000-0000-000000000002', 'Yetkisiz Alan')
  $statement$),
  'manager must not write to an unassigned branch'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1100000-0000-0000-0000-000000000002', true);

select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables) = 1,
  'waiter must read assigned-branch tables'
);
select pg_temp.assert_true(
  (select count(*) from public.products) = 1,
  'waiter must read assigned-branch products'
);
select pg_temp.assert_true(
  pg_temp.affected_rows($statement$
    update public.products
    set price_minor = 1
    where id = 'f1800000-0000-0000-0000-000000000001'
  $statement$) = 0,
  'waiter must not update products'
);
select pg_temp.assert_true(
  pg_temp.operation_denied($statement$
    insert into public.restaurant_tables (
      tenant_id, branch_id, area_id, label, capacity
    ) values (
      'f1200000-0000-0000-0000-000000000001',
      'f1300000-0000-0000-0000-000000000001',
      'f1500000-0000-0000-0000-000000000001',
      'M02',
      2
    )
  $statement$),
  'waiter must not create tables'
);

select 'HOSTED_MODULE4_SMOKE_OK' as result;

rollback;
