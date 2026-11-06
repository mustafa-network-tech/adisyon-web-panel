-- 0037: an invitation can no longer reactivate a suspended membership, only a tenant-scope
-- manager may reactivate a suspended member, and an invitation whose creator is no longer an
-- active member of the business cannot be accepted.
-- Self-contained: builds its own businesses, branches, users and roles inside the transaction
-- (nothing depends on supabase/seed.sql) and rolls everything back.
-- Run with `supabase test db` on a local database only. Uses only plan/is/ok/finish.
-- Every id created here starts with f3000000-.

begin;

select plan(55);

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

-- Evaluates a query as the table owner (bypasses RLS) and returns its first value as text.
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

create or replace function pg_temp.role_id(tenant_key text, role_code text)
returns uuid
language sql
as $$
  select id from public.roles
  where tenant_id = current_setting('f3.tenant_' || tenant_key)::uuid and code = role_code
$$;

-- update_tenant_member_access for one member with one branch and one role.
create or replace function pg_temp.access(member_key text, new_status text, branch_key text, role_code text)
returns text
language plpgsql
as $$
begin
  perform public.update_tenant_member_access(
    current_setting('f3.tenant_a')::uuid,
    current_setting('f3.m_' || member_key)::uuid,
    new_status::public.membership_status,
    array[current_setting('f3.b_' || branch_key)::uuid],
    array[pg_temp.role_id('a', role_code)]
  );
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

create temporary table f3_tokens (tenant_key text, email text, token text);
grant all on f3_tokens to authenticated;

-- create_tenant_invitation; remembers the raw token of a successful invitation.
create or replace function pg_temp.invite(tenant_key text, branch_key text, invite_email text, invite_role uuid)
returns text
language plpgsql
as $$
declare
  result jsonb;
begin
  result := public.create_tenant_invitation(
    current_setting('f3.tenant_' || tenant_key)::uuid,
    current_setting('f3.b_' || branch_key)::uuid,
    invite_email, invite_role, 72
  );
  insert into f3_tokens (tenant_key, email, token) values (tenant_key, invite_email, result ->> 'token');
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

-- accept_tenant_invitation with the token remembered for an e-mail address.
create or replace function pg_temp.accept(invite_email text, from_tenant text default 'a')
returns text
language plpgsql
as $$
begin
  perform public.accept_tenant_invitation((select token from f3_tokens where email = invite_email and tenant_key = from_tenant limit 1));
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

create or replace function pg_temp.act_as(user_number integer)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub',
    'f3000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'), true)
$$;

create or replace function pg_temp.status_of(user_number integer)
returns text
language sql
security definer
as $$
  select status::text from public.tenant_memberships
  where tenant_id = current_setting('f3.tenant_a')::uuid
    and user_id = ('f3000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'))::uuid
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner)
--   1 owner A, 2 owner B, 3 second owner A, 4 tenant_admin, 5 delegated manager (Merkez),
--   6 waiter (Merkez), 7 suspended waiter, 8 suspended manager, 9 suspended tenant_admin,
--   10 suspended owner, 11 new invitee, 12 delegated manager (Teras), 13 suspended waiter (Teras),
--   14 delegated cashier (Merkez), 16 suspended waiter, 17 suspended manager, 18 active waiter,
--   19 new invitee, 20 suspended waiter (Merkez)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
select ('f3000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'f3-user-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 20) as n;
insert into public.profiles (id, full_name)
select ('f3000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'F3 User ' || n
from generate_series(1, 20) as n
on conflict (id) do nothing;

select pg_temp.act_as(1);
select public.create_my_tenant('F3 Test Isletme A', 'F3 Merkez', 'multi');
select pg_temp.act_as(2);
select public.create_my_tenant('F3 Test Isletme B', 'F3 Sahil', 'multi');
select set_config('request.jwt.claim.sub', '', true);

alter table public.branches disable trigger user;
update public.branches set slug = 'f3-merkez'
where tenant_id = (select id from public.tenants where name = 'F3 Test Isletme A');
update public.branches set slug = 'f3-sahil'
where tenant_id = (select id from public.tenants where name = 'F3 Test Isletme B');
insert into public.branches (tenant_id, name, slug, timezone, currency_code)
select id, 'F3 Teras', 'f3-teras', 'Europe/Istanbul', 'TRY'
from public.tenants where name = 'F3 Test Isletme A';
alter table public.branches enable trigger user;

select set_config('f3.tenant_a', (select id::text from public.tenants where name = 'F3 Test Isletme A'), true);
select set_config('f3.tenant_b', (select id::text from public.tenants where name = 'F3 Test Isletme B'), true);
select set_config('f3.b_m', (select id::text from public.branches where slug = 'f3-merkez'), true);
select set_config('f3.b_t', (select id::text from public.branches where slug = 'f3-teras'), true);
select set_config('f3.b_s', (select id::text from public.branches where slug = 'f3-sahil'), true);

create or replace function pg_temp.add_member(user_number integer, role_code text, branch_key text, member_key text, member_status text default 'active')
returns void
language plpgsql
as $$
declare
  tenant uuid := current_setting('f3.tenant_a')::uuid;
  membership uuid;
begin
  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (tenant, ('f3000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'))::uuid, member_status::public.membership_status)
  returning id into membership;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  select tenant, membership, id from public.roles where tenant_id = tenant and code = role_code;
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  values (tenant, membership, current_setting('f3.b_' || branch_key)::uuid);
  perform set_config('f3.m_' || member_key, membership::text, true);
end;
$$;

select pg_temp.add_member(3, 'owner', 'm', 'owner2');
select pg_temp.add_member(4, 'tenant_admin', 'm', 'admin');
select pg_temp.add_member(5, 'manager', 'm', 'mgr_deleg');
select pg_temp.add_member(6, 'waiter', 'm', 'waiter');
select pg_temp.add_member(7, 'waiter', 'm', 'susp_waiter', 'suspended');
select pg_temp.add_member(8, 'manager', 'm', 'susp_manager', 'suspended');
select pg_temp.add_member(9, 'tenant_admin', 'm', 'susp_admin', 'suspended');
select pg_temp.add_member(10, 'owner', 'm', 'susp_owner', 'suspended');
select pg_temp.add_member(12, 'manager', 't', 'mgr_teras');
select pg_temp.add_member(13, 'waiter', 't', 'susp_teras', 'suspended');
select pg_temp.add_member(14, 'cashier', 'm', 'cashier_deleg');
select pg_temp.add_member(16, 'waiter', 'm', 'susp_w2', 'suspended');
select pg_temp.add_member(17, 'manager', 'm', 'susp_m2', 'suspended');
select pg_temp.add_member(18, 'waiter', 'm', 'waiter2');
select pg_temp.add_member(20, 'waiter', 'm', 'susp_w3', 'suspended');

-- Delegate users.manage the way the product does it: the owner calls set_member_extras.
select pg_temp.act_as(1);
select public.set_member_extras(current_setting('f3.tenant_a')::uuid, current_setting('f3.m_mgr_deleg')::uuid, array['users.manage'], '{}'::uuid[]);
select public.set_member_extras(current_setting('f3.tenant_a')::uuid, current_setting('f3.m_mgr_teras')::uuid, array['users.manage'], '{}'::uuid[]);
select public.set_member_extras(current_setting('f3.tenant_a')::uuid, current_setting('f3.m_cashier_deleg')::uuid, array['users.manage'], '{}'::uuid[]);
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- A. Fixture sanity
-- ---------------------------------------------------------------------------

select is(pg_temp.q($s$select count(*)::text from public.tenant_memberships where tenant_id = current_setting('f3.tenant_a')::uuid and status = 'suspended'$s$),
  '8', 'fixture: eight suspended memberships (waiter, manager, tenant_admin, owner, Teras waiter, three more waiters/managers)');

-- ---------------------------------------------------------------------------
-- B. A suspended member cannot come back through an invitation
-- ---------------------------------------------------------------------------

select pg_temp.act_as(5);
select is(pg_temp.invite('a', 'm', 'f3-user-7@test.local', pg_temp.role_id('a', 'waiter')), 'ok', 'delegated manager invites the suspended waiter');
select is(pg_temp.invite('a', 'm', 'f3-user-8@test.local', pg_temp.role_id('a', 'waiter')), 'ok', 'delegated manager invites the suspended manager');
select is(pg_temp.invite('a', 'm', 'f3-user-9@test.local', pg_temp.role_id('a', 'waiter')), 'ok', 'delegated manager invites the suspended tenant_admin');
select is(pg_temp.invite('a', 'm', 'f3-user-10@test.local', pg_temp.role_id('a', 'waiter')), 'ok', 'delegated manager invites the suspended owner');

select pg_temp.act_as(7);
select is(pg_temp.accept('f3-user-7@test.local'), '42501:membership_suspended', '1. suspended waiter cannot reactivate through an invitation');
select is(pg_temp.status_of(7), 'suspended', '1. the waiter stays suspended');
select pg_temp.act_as(8);
select is(pg_temp.accept('f3-user-8@test.local'), '42501:membership_suspended', '2. suspended manager cannot reactivate through an invitation');
select is(pg_temp.status_of(8), 'suspended', '2. the manager stays suspended');
select pg_temp.act_as(9);
select is(pg_temp.accept('f3-user-9@test.local'), '42501:membership_suspended', '3. suspended tenant_admin cannot reactivate through an invitation');
select is(pg_temp.status_of(9), 'suspended', '3. the tenant_admin stays suspended');
select pg_temp.act_as(10);
select is(pg_temp.accept('f3-user-10@test.local'), '42501:membership_suspended', '4. suspended owner cannot reactivate through an invitation');
select is(pg_temp.status_of(10), 'suspended', '4. the owner stays suspended');
select is(pg_temp.q($s$select count(*)::text from public.tenant_invitations where tenant_id = current_setting('f3.tenant_a')::uuid and accepted_at is not null$s$),
  '0', 'a refused acceptance does not consume the invitation');

-- ---------------------------------------------------------------------------
-- C. Reactivation through update_tenant_member_access
-- ---------------------------------------------------------------------------

select pg_temp.act_as(5);
select is(pg_temp.access('susp_w2', 'active', 'm', 'waiter'), '42501:reactivation_requires_tenant_scope', '5. delegated branch manager cannot reactivate a suspended waiter');
select is(pg_temp.status_of(16), 'suspended', '5. the waiter stays suspended');
select is(pg_temp.access('susp_m2', 'active', 'm', 'manager'), '42501:reactivation_requires_tenant_scope', '5. delegated branch manager cannot reactivate a suspended manager');
select is(pg_temp.status_of(17), 'suspended', '5. the manager stays suspended');
select pg_temp.act_as(12);
select is(pg_temp.access('susp_teras', 'active', 't', 'waiter'), '42501:reactivation_requires_tenant_scope', '5. the Teras delegated manager cannot reactivate the suspended Teras waiter');
select is(pg_temp.status_of(13), 'suspended', '5. the Teras waiter stays suspended');
select pg_temp.act_as(14);
select is(pg_temp.access('susp_w2', 'active', 'm', 'waiter'), '42501:reactivation_requires_tenant_scope', '5. delegated cashier cannot reactivate either');

-- a branch manager can still suspend, but cannot undo it
select pg_temp.act_as(5);
select is(pg_temp.access('waiter', 'suspended', 'm', 'waiter'), 'ok', 'a delegated branch manager can still suspend an active waiter');
select is(pg_temp.status_of(6), 'suspended', 'the waiter is suspended');
select is(pg_temp.access('waiter', 'active', 'm', 'waiter'), '42501:reactivation_requires_tenant_scope', 'the same manager cannot undo the suspension');

-- tenant-scope managers can
select pg_temp.act_as(4);
select is(pg_temp.access('waiter', 'active', 'm', 'waiter'), 'ok', '6. tenant_admin reactivates the waiter');
select is(pg_temp.status_of(6), 'active', '6. the waiter is active again');
select pg_temp.act_as(1);
select is(pg_temp.access('susp_w2', 'active', 'm', 'waiter'), 'ok', '6. owner reactivates a suspended waiter');
select pg_temp.act_as(3);
select is(pg_temp.access('susp_m2', 'active', 'm', 'manager'), 'ok', '6. second owner reactivates a suspended manager');
select pg_temp.act_as(4);
select ok(pg_temp.access('susp_owner', 'active', 'm', 'owner') like '42501:%', 'tenant_admin cannot reactivate a suspended owner (owner guard unchanged)');
select pg_temp.act_as(1);
select is(pg_temp.access('susp_owner', 'active', 'm', 'owner'), 'ok', '6. owner reactivates the suspended owner');
select is(pg_temp.status_of(10), 'active', '6. the owner is active again');

select is(pg_temp.q($s$select count(*)::text from public.audit_logs
  where tenant_id = current_setting('f3.tenant_a')::uuid and action = 'tenant.member_access.updated'
    and metadata -> 'before' ->> 'status' = 'suspended' and metadata -> 'after' ->> 'status' = 'active'$s$),
  '4', '7. every successful reactivation is audited (waiter, waiter, manager, owner) and refused ones are not');

-- ---------------------------------------------------------------------------
-- D. Normal flows keep working
-- ---------------------------------------------------------------------------

select pg_temp.act_as(5);
select is(pg_temp.invite('a', 'm', 'f3-user-11@test.local', pg_temp.role_id('a', 'waiter')), 'ok', 'delegated manager invites a new user');
select pg_temp.act_as(11);
select is(pg_temp.accept('f3-user-11@test.local'), 'ok', '8. a normal invitation is accepted');
select is(pg_temp.status_of(11), 'active', '8. the new member is active');

-- an active member can still be given another branch, by invitation ...
select pg_temp.act_as(12);
select is(pg_temp.invite('a', 't', 'f3-user-6@test.local', pg_temp.role_id('a', 'waiter')), 'ok', 'Teras manager invites the active Merkez waiter to Teras');
select pg_temp.act_as(6);
select is(pg_temp.accept('f3-user-6@test.local'), 'ok', '9. the active waiter accepts the Teras invitation');
select is(pg_temp.q($s$select count(*)::text from public.membership_branches where tenant_id = current_setting('f3.tenant_a')::uuid and membership_id = current_setting('f3.m_waiter')::uuid$s$),
  '2', '9. the active waiter now belongs to two branches');
-- ... and directly
select pg_temp.act_as(1);
select is(
  (select public.update_tenant_member_access(current_setting('f3.tenant_a')::uuid, current_setting('f3.m_waiter2')::uuid, 'active',
     array[current_setting('f3.b_m')::uuid, current_setting('f3.b_t')::uuid], array[pg_temp.role_id('a', 'waiter')]) ->> 'status'),
  'active', '9. the owner adds a branch to an active member directly');

-- ---------------------------------------------------------------------------
-- E. An invitation from a creator who is no longer an active member is refused
-- ---------------------------------------------------------------------------

select pg_temp.act_as(14);
select is(pg_temp.invite('a', 'm', 'f3-user-19@test.local', pg_temp.role_id('a', 'cashier')), 'ok', 'delegated cashier invites a new cashier');
select pg_temp.act_as(1);
select is(pg_temp.access('cashier_deleg', 'suspended', 'm', 'cashier'), 'ok', 'the owner suspends the inviting cashier');
select pg_temp.act_as(19);
select is(pg_temp.accept('f3-user-19@test.local'), 'P0001:invitation_inviter_inactive', '10. the invitation of a suspended creator is refused');
select is(pg_temp.q($s$select count(*)::text from public.tenant_memberships where tenant_id = current_setting('f3.tenant_a')::uuid and user_id = 'f3000000-0000-4000-8000-000000000019'$s$),
  '0', '10. no membership was created');

-- ---------------------------------------------------------------------------
-- F. Tenant and branch isolation
-- ---------------------------------------------------------------------------

select pg_temp.act_as(2);
select is(pg_temp.invite('b', 's', 'f3-user-7@test.local', pg_temp.role_id('b', 'waiter')), 'ok', 'owner B invites a user who is suspended in business A');
select pg_temp.act_as(7);
select is(pg_temp.accept('f3-user-7@test.local', 'b'), 'ok', '11. a suspension in business A does not block joining business B');
select is(pg_temp.status_of(7), 'suspended', '11. the member stays suspended in business A');
select pg_temp.act_as(2);
select is(pg_temp.access('susp_w3', 'active', 'm', 'waiter'), '42501:users_manage_denied', '11. owner B cannot reactivate a member of business A');
select pg_temp.act_as(12);
select ok(pg_temp.access('susp_w3', 'active', 't', 'waiter') like '42501:%', '11. the Teras manager cannot reactivate a Merkez member');
select is(pg_temp.status_of(20), 'suspended', '11. the Merkez waiter stays suspended');
select pg_temp.act_as(5);
select ok(pg_temp.access('susp_teras', 'active', 'm', 'waiter') like '42501:%', '11. the Merkez manager cannot reactivate a Teras member');
select is(pg_temp.status_of(13), 'suspended', '11. the Teras waiter stays suspended');

-- ---------------------------------------------------------------------------
-- G. F1 and F2 stay in place; the functions keep their security properties
-- ---------------------------------------------------------------------------

select is(pg_temp.q($s$select count(*)::text from pg_policies where schemaname = 'public' and policyname like '%\_finance\_read\_restrict'$s$), '5', '12. the five finance read policies of 0035 are untouched');
select is(pg_temp.q($s$select count(*)::text from pg_policies where schemaname = 'public' and tablename in ('roles', 'role_permissions') and cmd <> 'SELECT'$s$), '0', '12. no write policy on roles / role_permissions (0036)');
select is(pg_temp.q($s$select count(*)::text from pg_proc where proname in ('accept_tenant_invitation', 'update_tenant_member_access') and pronamespace = 'public'::regnamespace and prosecdef and proconfig = array['search_path=""']$s$),
  '2', 'both functions are still SECURITY DEFINER with an empty search_path');
select is(has_function_privilege('authenticated', 'public.accept_tenant_invitation(text)', 'EXECUTE'), true, 'authenticated can still accept invitations');

select * from finish();
rollback;
