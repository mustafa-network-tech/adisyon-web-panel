-- Hosted development smoke test for Phase 2 Module 3.
-- Creates isolated fixtures inside one transaction and always rolls them back.
-- Run only after 0004_phase2_tenant_roles_rls.sql in the dedicated dev project.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'RLS smoke assertion failed: %', message;
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
returns bigint
language plpgsql
as $$
declare
  affected bigint;
begin
  execute statement;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function pg_temp.assert_true(boolean, text) to anon, authenticated;
grant execute on function pg_temp.operation_denied(text) to anon, authenticated;
grant execute on function pg_temp.affected_rows(text) to anon, authenticated;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Tenant A"}', now(), now()),
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Tenant B"}', now(), now()),
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-platform@transaction.test', crypt('TransactionOnly123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Platform"}', now(), now());

insert into public.tenants (id, slug, name) values
  ('c2000000-0000-0000-0000-000000000001', 'rls-tenant-a', 'RLS Tenant A'),
  ('d2000000-0000-0000-0000-000000000001', 'rls-tenant-b', 'RLS Tenant B');

insert into public.branches (id, tenant_id, slug, name) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'merkez', 'Merkez'),
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'merkez', 'Merkez');

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'active'),
  ('d4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'active');

insert into public.membership_branches (tenant_id, membership_id, branch_id) values
  ('c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001');

insert into public.membership_roles (tenant_id, membership_id, role_id)
select role_map.tenant_id, role_map.membership_id, role.id
from (values
  ('c2000000-0000-0000-0000-000000000001'::uuid, 'c4000000-0000-0000-0000-000000000001'::uuid, 'waiter'),
  ('d2000000-0000-0000-0000-000000000001'::uuid, 'd4000000-0000-0000-0000-000000000001'::uuid, 'owner')
) as role_map(tenant_id, membership_id, role_code)
join public.roles role
  on role.tenant_id = role_map.tenant_id
  and role.code = role_map.role_code;

insert into public.platform_admins (user_id) values
  ('e1000000-0000-0000-0000-000000000001');

insert into public.dining_areas (id, tenant_id, branch_id, name) values
  ('c5000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Salon'),
  ('d5000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'Salon');

insert into public.restaurant_tables (
  id, tenant_id, branch_id, area_id, label
) values
  ('c6000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'A01'),
  ('d6000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'B01');

set local role anon;
select pg_temp.assert_true(
  pg_temp.operation_denied('select count(*) from public.tenants'),
  'anonymous users must not read tenant data'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);

select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables where tenant_id = 'c2000000-0000-0000-0000-000000000001') = 1,
  'tenant A member must read the assigned branch'
);
select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables where tenant_id = 'd2000000-0000-0000-0000-000000000001') = 0,
  'tenant A member must not read tenant B'
);
select pg_temp.assert_true(
  pg_temp.operation_denied($statement$
    insert into public.orders (
      id, tenant_id, branch_id, table_id, order_number, created_by
    ) values (
      'd7000000-0000-0000-0000-000000000001',
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000001',
      'd6000000-0000-0000-0000-000000000001',
      88001,
      'c1000000-0000-0000-0000-000000000001'
    )
  $statement$),
  'tenant A member must not insert into tenant B'
);
select pg_temp.assert_true(
  pg_temp.affected_rows($statement$
    update public.restaurant_tables
    set label = 'FORBIDDEN'
    where id = 'd6000000-0000-0000-0000-000000000001'
  $statement$) = 0,
  'tenant A member must not update tenant B'
);

reset role;
update public.tenant_memberships
set status = 'suspended'
where id = 'c4000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) from public.tenants) = 0,
  'suspended members must immediately lose access'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) from public.tenants) = 2,
  'platform administrators may list tenant metadata'
);
select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables) = 0,
  'platform administrators must not inherit operational access'
);

select set_config(
  'test.support_session_id',
  public.open_platform_support_session(
    'c2000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001',
    'Hosted transaction RLS smoke test',
    30
  )::text,
  true
);

select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables where tenant_id = 'c2000000-0000-0000-0000-000000000001') = 1,
  'active support session must read only its branch'
);
select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables where tenant_id = 'd2000000-0000-0000-0000-000000000001') = 0,
  'support session must not cross tenants'
);
select pg_temp.assert_true(
  pg_temp.operation_denied($statement$
    insert into public.orders (
      id, tenant_id, branch_id, order_number, created_by
    ) values (
      'c7000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      88002,
      'e1000000-0000-0000-0000-000000000001'
    )
  $statement$),
  'platform support must remain read-only'
);

select public.record_tenant_context(
  'c2000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = 'e1000000-0000-0000-0000-000000000001'
      and action = 'tenant.context.selected'
  ),
  'support tenant context must be audited'
);

select public.close_platform_support_session(
  current_setting('test.support_session_id')::uuid
);
select pg_temp.assert_true(
  (select count(*) from public.restaurant_tables) = 0,
  'closed support session must immediately remove access'
);

select 'HOSTED_RLS_SMOKE_OK' as result;

rollback;
