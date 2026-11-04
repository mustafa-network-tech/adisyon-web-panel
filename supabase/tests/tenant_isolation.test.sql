-- Phase 2 Module 3 pgTAP tests.
-- Requires a clean local `supabase db reset`; never run seed.sql remotely.

begin;

select plan(32);

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

select has_table('public', 'tenants', 'tenants table exists');
select has_table(
  'public',
  'platform_support_sessions',
  'platform support session table exists'
);
select has_table('public', 'roles', 'roles table exists');
select row_security_active('public', 'orders', 'orders has RLS enabled');
select row_security_active('public', 'payments', 'payments has RLS enabled');
select has_function(
  'private',
  'has_branch_access',
  array['uuid', 'uuid'],
  'branch access helper exists'
);
select has_function(
  'public',
  'open_platform_support_session',
  array['uuid', 'uuid', 'text', 'integer'],
  'audited platform support function exists'
);

select is(
  (
    select count(*)::integer
    from public.roles
    where tenant_id = 'a0000000-0000-0000-0000-000000000001'
      and is_system
  ),
  6,
  'tenant A has six canonical system roles'
);

select is(
  (
    select count(*)::integer
    from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    where role.tenant_id = 'a0000000-0000-0000-0000-000000000001'
      and role.code = 'owner'
  ),
  (select count(*)::integer from public.permissions),
  'owner role receives every tenant permission'
);

set local role anon;
select ok(
  pg_temp.operation_denied('select count(*) from public.tenants'),
  'anonymous role cannot read tenant data'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);

select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where branch_id = 'a1000000-0000-0000-0000-000000000001'
  ),
  3,
  'tenant A waiter sees assigned branch tables'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where branch_id = 'a1000000-0000-0000-0000-000000000002'
  ),
  0,
  'tenant A waiter cannot see an unassigned branch'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where tenant_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  0,
  'tenant A waiter cannot read tenant B rows'
);

select lives_ok(
  $$
    insert into public.orders (
      id, tenant_id, branch_id, table_id, order_number, created_by
    ) values (
      'ad000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001',
      99001,
      '10000000-0000-0000-0000-000000000002'
    )
  $$,
  'waiter can create an order in the assigned branch'
);

select ok(
  pg_temp.operation_denied($statement$
    insert into public.orders (
      id, tenant_id, branch_id, table_id, order_number, created_by
    ) values (
      'bd000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000001',
      'b5000000-0000-0000-0000-000000000001',
      99002,
      '10000000-0000-0000-0000-000000000002'
    )
  $statement$),
  'waiter cannot insert an order into tenant B'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where tenant_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  4,
  'tenant owner sees both assigned branches'
);

select is(
  pg_temp.affected_rows($statement$
    update public.restaurant_tables
    set label = 'FORBIDDEN'
    where id = 'b5000000-0000-0000-0000-000000000001'
  $statement$),
  0::bigint,
  'tenant A owner cannot update tenant B rows'
);

reset role;
update public.tenant_memberships
set status = 'suspended'
where id = 'a2000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::integer from public.tenants),
  0,
  'suspended membership immediately loses tenant visibility'
);
select ok(
  pg_temp.operation_denied($statement$
    insert into public.orders (
      id, tenant_id, branch_id, order_number, created_by
    ) values (
      'ad000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      99003,
      '10000000-0000-0000-0000-000000000002'
    )
  $statement$),
  'suspended membership cannot create orders'
);

reset role;
update public.tenant_memberships
set status = 'active'
where id = 'a2000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);

select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where tenant_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  1,
  'tenant B owner sees tenant B branch data'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where tenant_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  0,
  'tenant B owner cannot read tenant A rows'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.tenants),
  2,
  'platform administrator can list tenant metadata'
);
select is(
  (select count(*)::integer from public.restaurant_tables),
  0,
  'platform administrator has no implicit operational access'
);

create temporary table support_test_result (id uuid not null);
insert into support_test_result (id)
select public.open_platform_support_session(
  'a0000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Tenant A isolation test support session',
  30
);

select ok(
  (select id is not null from support_test_result limit 1),
  'platform administrator can open an audited support session'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where branch_id = 'a1000000-0000-0000-0000-000000000001'
  ),
  3,
  'active support session grants read access to its branch'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_tables
    where tenant_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  0,
  'support session does not grant access to other tenants'
);
select ok(
  pg_temp.operation_denied($statement$
    insert into public.orders (
      id, tenant_id, branch_id, order_number, created_by
    ) values (
      'ad000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      99004,
      '90000000-0000-0000-0000-000000000001'
    )
  $statement$),
  'support mode remains read-only for restaurant operations'
);

select lives_ok(
  $$
    select public.record_tenant_context(
      'a0000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001'
    )
  $$,
  'authorized tenant context selection is recorded'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = '90000000-0000-0000-0000-000000000001'
      and action = 'tenant.context.selected'
      and entity_id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'tenant context audit event exists'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = '90000000-0000-0000-0000-000000000001'
      and action = 'platform.support.opened'
  ),
  'platform support opening audit event exists'
);

select lives_ok(
  $$
    select public.close_platform_support_session(
      (select id from support_test_result limit 1)
    )
  $$,
  'platform administrator can close the support session'
);
select is(
  (select count(*)::integer from public.restaurant_tables),
  0,
  'revoked support session immediately removes operational access'
);

select * from finish();
rollback;
