-- F2: roles and role_permissions can no longer be written directly (migration 0036), and the
-- audited team-management functions never hand out more than the caller holds.
-- Self-contained: builds its own businesses, branches, users and roles inside the transaction
-- (nothing depends on supabase/seed.sql) and rolls everything back.
-- Run with `supabase test db` on a local database only. Uses only plan/is/ok/finish.
-- Every id created here starts with f2000000-.

begin;

select plan(67);

-- ---------------------------------------------------------------------------
-- Helpers (temporary)
-- ---------------------------------------------------------------------------

-- Runs a statement as the current role and returns 'ok' or '<sqlstate>:<message>'.
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

create or replace function pg_temp.role_id(role_code text)
returns uuid
language sql
as $$
  select id from public.roles
  where tenant_id = current_setting('f2.tenant_a')::uuid and code = role_code
$$;

-- update_tenant_member_access with one branch and one role; member/branch come from settings.
create or replace function pg_temp.access(member_key text, branch_key text, new_role uuid)
returns text
language plpgsql
as $$
begin
  perform public.update_tenant_member_access(
    current_setting('f2.tenant_a')::uuid,
    current_setting('f2.m_' || member_key)::uuid,
    'active',
    array[current_setting('f2.b_' || branch_key)::uuid],
    array[new_role]
  );
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

-- create_tenant_invitation; remembers the raw token of a successful invitation.
create or replace function pg_temp.invite(branch_key text, invite_email text, invite_role uuid)
returns text
language plpgsql
as $$
declare
  result jsonb;
begin
  result := public.create_tenant_invitation(
    current_setting('f2.tenant_a')::uuid,
    current_setting('f2.b_' || branch_key)::uuid,
    invite_email, invite_role, 72
  );
  insert into f2_tokens (email, token) values (invite_email, result ->> 'token');
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

create temporary table f2_tokens (email text, token text);
grant all on f2_tokens to authenticated;

create or replace function pg_temp.act_as(user_number integer)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub',
    'f2000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'), true)
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner)
--   1 owner A, 2 owner B, 3 waiter (Merkez), 4 plain manager (Merkez, no users.manage),
--   5 delegated manager (Merkez, users.manage), 6 delegated cashier (Merkez, users.manage),
--   7 waiter (Teras), 8 delegated manager (Teras, users.manage), 9 invitee (not a member yet)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
select ('f2000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'f2-user-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 9) as n;
update auth.users set email = 'f2-invitee@test.local' where id = 'f2000000-0000-4000-8000-000000000009';
insert into public.profiles (id, full_name)
select ('f2000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'F2 User ' || n
from generate_series(1, 9) as n
on conflict (id) do nothing;

select pg_temp.act_as(1);
select public.create_my_tenant('F2 Test Isletme A', 'F2 Merkez', 'pro');
select pg_temp.act_as(2);
select public.create_my_tenant('F2 Test Isletme B', 'F2 Sahil', 'pro');
select set_config('request.jwt.claim.sub', '', true);

alter table public.branches disable trigger user;
update public.branches set slug = 'f2-merkez'
where tenant_id = (select id from public.tenants where name = 'F2 Test Isletme A');
update public.branches set slug = 'f2-sahil'
where tenant_id = (select id from public.tenants where name = 'F2 Test Isletme B');
insert into public.branches (tenant_id, name, slug, timezone, currency_code)
select id, 'F2 Teras', 'f2-teras', 'Europe/Istanbul', 'TRY'
from public.tenants where name = 'F2 Test Isletme A';
alter table public.branches enable trigger user;

select set_config('f2.tenant_a', (select id::text from public.tenants where name = 'F2 Test Isletme A'), true);
select set_config('f2.tenant_b', (select id::text from public.tenants where name = 'F2 Test Isletme B'), true);
select set_config('f2.b_m', (select id::text from public.branches where slug = 'f2-merkez'), true);
select set_config('f2.b_t', (select id::text from public.branches where slug = 'f2-teras'), true);
select set_config('f2.role_b_waiter',
  (select id::text from public.roles where code = 'waiter' and tenant_id = current_setting('f2.tenant_b')::uuid), true);

create or replace function pg_temp.add_member(user_number integer, role_code text, branch_key text, member_key text)
returns void
language plpgsql
as $$
declare
  tenant uuid := current_setting('f2.tenant_a')::uuid;
  membership uuid;
begin
  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (tenant, ('f2000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'))::uuid, 'active')
  returning id into membership;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  select tenant, membership, id from public.roles where tenant_id = tenant and code = role_code;
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  values (tenant, membership, current_setting('f2.b_' || branch_key)::uuid);
  perform set_config('f2.m_' || member_key, membership::text, true);
end;
$$;

select pg_temp.add_member(3, 'waiter', 'm', 'waiter');
select pg_temp.add_member(4, 'manager', 'm', 'mgr_plain');
select pg_temp.add_member(5, 'manager', 'm', 'mgr_deleg');
select pg_temp.add_member(6, 'cashier', 'm', 'cashier_deleg');
select pg_temp.add_member(7, 'waiter', 't', 'waiter_teras');
select pg_temp.add_member(8, 'manager', 't', 'mgr_teras');

-- Delegate users.manage the way the product does it: the owner calls set_member_extras.
select pg_temp.act_as(1);
select public.set_member_extras(current_setting('f2.tenant_a')::uuid, current_setting('f2.m_mgr_deleg')::uuid, array['users.manage'], '{}'::uuid[]);
select public.set_member_extras(current_setting('f2.tenant_a')::uuid, current_setting('f2.m_cashier_deleg')::uuid, array['users.manage'], '{}'::uuid[]);
select public.set_member_extras(current_setting('f2.tenant_a')::uuid, current_setting('f2.m_mgr_teras')::uuid, array['users.manage'], '{}'::uuid[]);
select set_config('request.jwt.claim.sub', '', true);

-- ---------------------------------------------------------------------------
-- A. Privileges and policies (catalog)
-- ---------------------------------------------------------------------------

select is(has_table_privilege('authenticated', 'public.roles', 'INSERT'), false, 'authenticated has no INSERT on roles');
select is(has_table_privilege('authenticated', 'public.roles', 'UPDATE'), false, 'authenticated has no UPDATE on roles');
select is(has_table_privilege('authenticated', 'public.roles', 'DELETE'), false, 'authenticated has no DELETE on roles');
select is(has_table_privilege('authenticated', 'public.role_permissions', 'INSERT'), false, 'authenticated has no INSERT on role_permissions');
select is(has_table_privilege('authenticated', 'public.role_permissions', 'UPDATE'), false, 'authenticated has no UPDATE on role_permissions');
select is(has_table_privilege('authenticated', 'public.role_permissions', 'DELETE'), false, 'authenticated has no DELETE on role_permissions');
select is(has_table_privilege('anon', 'public.roles', 'INSERT'), false, 'anon has no INSERT on roles');
select is(has_table_privilege('anon', 'public.role_permissions', 'INSERT'), false, 'anon has no INSERT on role_permissions');
select is(has_table_privilege('authenticated', 'public.roles', 'SELECT'), true, 'authenticated still reads roles');
select is(has_table_privilege('authenticated', 'public.role_permissions', 'SELECT'), true, 'authenticated still reads role_permissions');
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename in ('roles', 'role_permissions') and cmd <> 'SELECT'),
  0, 'no write policy is left on roles / role_permissions'
);
select is(has_function_privilege('authenticated', 'private.ensure_system_roles(uuid)', 'EXECUTE'), false, 'ensure_system_roles is not callable by authenticated');
select is(has_function_privilege('anon', 'private.ensure_system_roles(uuid)', 'EXECUTE'), false, 'ensure_system_roles is not callable by anon');

-- ---------------------------------------------------------------------------
-- B. Direct writes are refused for everybody, including the delegated manager (the reported hole)
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.act_as(3);
select is(pg_temp.attempt($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant_id, id, (select id from public.permissions where code = 'settings.manage') from public.roles where code = 'waiter'$s$),
  '42501:permission denied for table role_permissions', 'waiter cannot write role_permissions');
select pg_temp.act_as(4);
select is(pg_temp.attempt($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant_id, id, (select id from public.permissions where code = 'settings.manage') from public.roles where code = 'waiter'$s$),
  '42501:permission denied for table role_permissions', 'plain manager cannot write role_permissions');
select pg_temp.act_as(5);
select is(pg_temp.attempt($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant_id, id, (select id from public.permissions where code = 'settings.manage') from public.roles where code = 'waiter'$s$),
  '42501:permission denied for table role_permissions', 'delegated manager cannot write role_permissions (the reported hole)');
select is(pg_temp.attempt($s$update public.role_permissions set permission_id = permission_id$s$),
  '42501:permission denied for table role_permissions', 'delegated manager cannot update role_permissions');
select is(pg_temp.attempt($s$delete from public.role_permissions$s$),
  '42501:permission denied for table role_permissions', 'delegated manager cannot delete role_permissions');
select is(pg_temp.attempt($s$update public.roles set scope = 'branch' where code = 'owner'$s$),
  '42501:permission denied for table roles', 'delegated manager cannot change a role scope');
select is(pg_temp.attempt($s$update public.roles set name = 'x'$s$),
  '42501:permission denied for table roles', 'delegated manager cannot rename roles');
select is(pg_temp.attempt($s$insert into public.roles (tenant_id, code, name, scope)
  select tenant_id, 'f2_evil', 'evil', 'tenant' from public.roles where code = 'waiter' limit 1$s$),
  '42501:permission denied for table roles', 'delegated manager cannot create a tenant-scope role');
select is(pg_temp.attempt($s$delete from public.roles$s$),
  '42501:permission denied for table roles', 'delegated manager cannot delete roles');
select pg_temp.act_as(6);
select is(pg_temp.attempt($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant_id, id, (select id from public.permissions where code = 'settings.manage') from public.roles where code = 'waiter'$s$),
  '42501:permission denied for table role_permissions', 'delegated cashier cannot write role_permissions');
select pg_temp.act_as(8);
select is(pg_temp.attempt($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant_id, id, (select id from public.permissions where code = 'settings.manage') from public.roles where code = 'waiter'$s$),
  '42501:permission denied for table role_permissions', 'delegated Teras manager cannot write role_permissions');
select pg_temp.act_as(1);
select is(pg_temp.attempt($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  select tenant_id, id, (select id from public.permissions where code = 'settings.manage') from public.roles where code = 'waiter'$s$),
  '42501:permission denied for table role_permissions', 'even the owner has no direct role_permissions write (the app never needs one)');
select is(pg_temp.attempt(format($s$insert into public.role_permissions (tenant_id, role_id, permission_id)
  values (%L, %L, (select id from public.permissions where code = 'settings.manage'))$s$,
  current_setting('f2.tenant_b'), current_setting('f2.role_b_waiter'))),
  '42501:permission denied for table role_permissions', 'tenant A owner cannot write tenant B role_permissions');

-- ---------------------------------------------------------------------------
-- C. Delegated manager through the audited functions (Merkez)
-- ---------------------------------------------------------------------------

select pg_temp.act_as(5);
select is(pg_temp.attempt(format($s$select public.set_member_extras(%L, %L, array['settings.manage'], '{}'::uuid[])$s$,
  current_setting('f2.tenant_a'), current_setting('f2.m_waiter'))),
  '42501:member_extras_denied', 'delegated manager cannot grant extra permissions');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('tenant_admin')), '42501:tenant_role_assignment_denied', 'delegated manager cannot assign a tenant-scope role');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('owner')), '42501:tenant_role_assignment_denied', 'delegated manager cannot assign the owner role');
select is(pg_temp.access('waiter_teras', 'm', pg_temp.role_id('cashier')), '42501:member_outside_actor_branches', 'delegated manager cannot edit a member of another branch');
select is(pg_temp.access('waiter', 't', pg_temp.role_id('waiter')), '42501:branch_assignment_denied', 'delegated manager cannot move a member into a branch he is not in');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('cashier')), 'ok', 'delegated manager can still give a member a role within his own permissions');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('waiter')), 'ok', 'delegated manager can still change it back');
select is(pg_temp.invite('m', 'f2-new-waiter@test.local', pg_temp.role_id('waiter')), 'ok', 'delegated manager can still invite a waiter');
select is(pg_temp.invite('m', 'f2-new-admin@test.local', pg_temp.role_id('tenant_admin')), '42501:tenant_role_assignment_denied', 'delegated manager cannot invite a tenant admin');
select is(pg_temp.invite('t', 'f2-new-other@test.local', pg_temp.role_id('waiter')), '42501:users_manage_denied', 'delegated Merkez manager cannot invite into Teras');

-- plain manager and waiter: no team management at all
select pg_temp.act_as(4);
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('cashier')), '42501:users_manage_denied', 'plain manager cannot change roles');
select pg_temp.act_as(3);
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('manager')), '42501:users_manage_denied', 'waiter cannot change roles');

-- delegated cashier: may not hand out roles that carry permissions he does not hold
select pg_temp.act_as(6);
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('manager')), '42501:role_exceeds_actor_permissions', 'delegated cashier cannot assign the manager role');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('kitchen')), '42501:role_exceeds_actor_permissions', 'delegated cashier cannot assign the kitchen role');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('waiter')), 'ok', 'a role the member already has is not re-checked (editing keeps working)');
select is(pg_temp.invite('m', 'f2-up-manager@test.local', pg_temp.role_id('manager')), '42501:role_exceeds_actor_permissions', 'delegated cashier cannot invite with the manager role');
select is(pg_temp.invite('m', 'f2-up-waiter@test.local', pg_temp.role_id('waiter')), '42501:role_exceeds_actor_permissions', 'delegated cashier cannot invite with a role holding permissions he lacks');
select is(pg_temp.invite('m', 'f2-same-cashier@test.local', pg_temp.role_id('cashier')), 'ok', 'delegated cashier can invite a cashier');

-- ---------------------------------------------------------------------------
-- D. Branch isolation inside one business
-- ---------------------------------------------------------------------------

select pg_temp.act_as(8);
select is(pg_temp.access('waiter', 't', pg_temp.role_id('cashier')), '42501:member_outside_actor_branches', 'Teras manager cannot take over a Merkez member by naming his own branch');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('cashier')), '42501:branch_assignment_denied', 'Teras manager cannot edit a Merkez member in Merkez either');
select is(pg_temp.invite('m', 'f2-x@test.local', pg_temp.role_id('waiter')), '42501:users_manage_denied', 'Teras manager cannot invite into Merkez');
select is(pg_temp.access('waiter_teras', 't', pg_temp.role_id('cashier')), 'ok', 'Teras manager manages his own branch normally');

-- ---------------------------------------------------------------------------
-- E. Owner keeps the full set of team-management functions
-- ---------------------------------------------------------------------------

select pg_temp.act_as(1);
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('manager')), 'ok', 'owner can assign the manager role');
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('waiter')), 'ok', 'owner can change it back');
select is(pg_temp.attempt(format($s$select public.set_member_extras(%L, %L, array['reports.history'], '{}'::uuid[])$s$,
  current_setting('f2.tenant_a'), current_setting('f2.m_waiter'))), 'ok', 'owner can grant extra permissions');
select is(pg_temp.invite('t', 'f2-teras-admin@test.local', pg_temp.role_id('tenant_admin')), 'ok', 'owner can invite a tenant admin');
select is(pg_temp.invite('m', 'f2-invitee@test.local', pg_temp.role_id('waiter')), 'ok', 'owner can invite a waiter (used for the accept check below)');

-- ---------------------------------------------------------------------------
-- F. Tenant isolation
-- ---------------------------------------------------------------------------

select is(pg_temp.access('waiter', 'm', current_setting('f2.role_b_waiter')::uuid), 'P0001:cross_tenant_member_access', 'tenant A owner cannot assign a tenant B role');
select pg_temp.act_as(2);
select is(pg_temp.access('waiter', 'm', pg_temp.role_id('waiter')), '42501:users_manage_denied', 'tenant B owner cannot change tenant A members');
select is((select count(*)::integer from public.roles where tenant_id = current_setting('f2.tenant_a')::uuid), 0, 'tenant B owner reads none of tenant A roles');
select is((select count(*)::integer from public.role_permissions where tenant_id = current_setting('f2.tenant_a')::uuid), 0, 'tenant B owner reads none of tenant A role permissions');

-- ---------------------------------------------------------------------------
-- G. Invitation acceptance still works
-- ---------------------------------------------------------------------------

select pg_temp.act_as(9);
select is(pg_temp.attempt($s$select public.accept_tenant_invitation((select token from f2_tokens where email = 'f2-invitee@test.local'))$s$),
  'ok', 'the invitee accepts the invitation');

reset role;

select is(
  (select r.code from public.tenant_memberships m
   join public.membership_roles mr on mr.tenant_id = m.tenant_id and mr.membership_id = m.id
   join public.roles r on r.tenant_id = mr.tenant_id and r.id = mr.role_id
   where m.user_id = 'f2000000-0000-4000-8000-000000000009' and m.tenant_id = current_setting('f2.tenant_a')::uuid),
  'waiter', 'the accepted invitation created the membership with the invited role');

-- ---------------------------------------------------------------------------
-- H. Audit trail and unchanged role definitions (as the table owner)
-- ---------------------------------------------------------------------------

select is((select count(*)::integer from public.audit_logs where tenant_id = current_setting('f2.tenant_a')::uuid and action = 'tenant.member_access.updated'), 6,
  'every successful role assignment is audited, refused ones are not (6 successes)');
select is((select count(*)::integer from public.audit_logs where tenant_id = current_setting('f2.tenant_a')::uuid and action = 'tenant.invitation.created'), 4,
  'every successful invitation is audited (4 successes)');
select is((select count(*)::integer from public.audit_logs where tenant_id = current_setting('f2.tenant_a')::uuid and action = 'tenant.member_extras.updated'), 4,
  'every extra-permission change is audited (3 delegations + 1)');
select is((select count(*)::integer from public.audit_logs where tenant_id = current_setting('f2.tenant_a')::uuid and action = 'tenant.invitation.accepted'), 1,
  'the accepted invitation is audited');
select is(
  (select count(*)::integer from public.role_permissions rp
   join public.roles r on r.tenant_id = rp.tenant_id and r.id = rp.role_id
   join public.permissions p on p.id = rp.permission_id
   where r.tenant_id = current_setting('f2.tenant_a')::uuid and r.code = 'waiter' and p.code in ('settings.manage', 'users.manage', 'payments.refund')),
  0, 'the shared waiter role gained no new permission');
select is((select scope from public.roles where tenant_id = current_setting('f2.tenant_a')::uuid and code = 'owner'), 'tenant', 'the owner role keeps its tenant scope');
select is((select count(*)::integer from public.roles where tenant_id = current_setting('f2.tenant_a')::uuid and code = 'f2_evil'), 0, 'no rogue role exists');

-- ---------------------------------------------------------------------------
-- I. F1 stays in place
-- ---------------------------------------------------------------------------

select is((select count(*)::integer from pg_policies where schemaname = 'public' and policyname like '%\_finance\_read\_restrict'), 5, 'the five finance read policies of 0035 are untouched');

select * from finish();
rollback;
