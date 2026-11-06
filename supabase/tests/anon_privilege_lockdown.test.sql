-- 0038: anonymous SQL privileges. tenant_onboarding is closed for anon and read-only for
-- authenticated; seven SECURITY DEFINER functions are no longer executable by anon; the four
-- anonymous public functions (QR menu, customer order, waiter call, invitation preview) keep working;
-- the signed-in setup flow keeps working.
-- Self-contained: builds its own business inside the transaction and rolls everything back.
-- Run with `supabase test db` on a local database only. Uses only plan/is/ok/finish.
-- Every id created here starts with f4000000-.

begin;

select plan(59);

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

create or replace function pg_temp.act_as(user_number integer)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub',
    'f4000000-0000-4000-8000-0000000000' || lpad(user_number::text, 2, '0'), true)
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner): owner, business, area, table, menu, QR ordering, an invitation
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
select ('f4000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'f4-user-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 2) as n;
insert into public.profiles (id, full_name)
select ('f4000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'F4 User ' || n
from generate_series(1, 2) as n
on conflict (id) do nothing;

select pg_temp.act_as(1);
select public.create_my_tenant('F4 Test Isletme', 'F4 Merkez', 'multi');
select set_config('request.jwt.claim.sub', '', true);

select set_config('f4.tenant', (select id::text from public.tenants where name = 'F4 Test Isletme'), true);
select set_config('f4.branch', (select b.id::text from public.branches b where b.tenant_id = current_setting('f4.tenant')::uuid limit 1), true);

insert into public.dining_areas (tenant_id, branch_id, name)
values (current_setting('f4.tenant')::uuid, current_setting('f4.branch')::uuid, 'Salon');
insert into public.restaurant_tables (tenant_id, branch_id, area_id, label)
select current_setting('f4.tenant')::uuid, current_setting('f4.branch')::uuid, id, 'Masa 1'
from public.dining_areas where tenant_id = current_setting('f4.tenant')::uuid;
insert into public.menu_categories (tenant_id, branch_id, name, fulfillment)
values (current_setting('f4.tenant')::uuid, current_setting('f4.branch')::uuid, 'Icecek', 'direct');
insert into public.products (tenant_id, branch_id, category_id, name, price_minor, tax_rate)
select current_setting('f4.tenant')::uuid, current_setting('f4.branch')::uuid, id, 'Kola', 5000, 10
from public.menu_categories where tenant_id = current_setting('f4.tenant')::uuid;
select set_config('f4.qr', (select qr_token from public.restaurant_tables where tenant_id = current_setting('f4.tenant')::uuid), true);
select set_config('f4.product', (select id::text from public.products where tenant_id = current_setting('f4.tenant')::uuid), true);

-- ---------------------------------------------------------------------------
-- A. Privilege matrix (catalog)
-- ---------------------------------------------------------------------------

select is(has_table_privilege('anon', 'public.tenant_onboarding', 'SELECT'), false, 'anon: no SELECT on tenant_onboarding');
select is(has_table_privilege('anon', 'public.tenant_onboarding', 'INSERT'), false, 'anon: no INSERT on tenant_onboarding');
select is(has_table_privilege('anon', 'public.tenant_onboarding', 'UPDATE'), false, 'anon: no UPDATE on tenant_onboarding');
select is(has_table_privilege('anon', 'public.tenant_onboarding', 'DELETE'), false, 'anon: no DELETE on tenant_onboarding');
select is(has_table_privilege('anon', 'public.tenant_onboarding', 'TRUNCATE'), false, 'anon: no TRUNCATE on tenant_onboarding');
select is(has_table_privilege('anon', 'public.tenant_onboarding', 'REFERENCES'), false, 'anon: no REFERENCES on tenant_onboarding');
select is(has_table_privilege('anon', 'public.tenant_onboarding', 'TRIGGER'), false, 'anon: no TRIGGER on tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'SELECT'), true, 'authenticated: still reads tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'INSERT'), false, 'authenticated: no INSERT on tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'UPDATE'), false, 'authenticated: no UPDATE on tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'DELETE'), false, 'authenticated: no DELETE on tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'TRUNCATE'), false, 'authenticated: no TRUNCATE on tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'REFERENCES'), false, 'authenticated: no REFERENCES on tenant_onboarding');
select is(has_table_privilege('authenticated', 'public.tenant_onboarding', 'TRIGGER'), false, 'authenticated: no TRIGGER on tenant_onboarding');

select is(has_function_privilege('anon', 'public.accept_tenant_invitation(text)', 'EXECUTE'), false, 'anon cannot execute accept_tenant_invitation');
select is(has_function_privilege('anon', 'public.create_tenant_invitation(uuid, uuid, text, uuid, integer)', 'EXECUTE'), false, 'anon cannot execute create_tenant_invitation');
select is(has_function_privilege('anon', 'public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[])', 'EXECUTE'), false, 'anon cannot execute update_tenant_member_access');
select is(has_function_privilege('anon', 'public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer)', 'EXECUTE'), false, 'anon cannot execute save_tenant_configuration');
select is(has_function_privilege('anon', 'public.open_platform_support_session(uuid, uuid, text, integer)', 'EXECUTE'), false, 'anon cannot execute open_platform_support_session');
select is(has_function_privilege('anon', 'public.close_platform_support_session(uuid)', 'EXECUTE'), false, 'anon cannot execute close_platform_support_session');
select is(has_function_privilege('anon', 'public.record_tenant_context(uuid, uuid)', 'EXECUTE'), false, 'anon cannot execute record_tenant_context');

select is(has_function_privilege('authenticated', 'public.accept_tenant_invitation(text)', 'EXECUTE'), true, 'authenticated still executes accept_tenant_invitation');
select is(has_function_privilege('authenticated', 'public.create_tenant_invitation(uuid, uuid, text, uuid, integer)', 'EXECUTE'), true, 'authenticated still executes create_tenant_invitation');
select is(has_function_privilege('authenticated', 'public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[])', 'EXECUTE'), true, 'authenticated still executes update_tenant_member_access');
select is(has_function_privilege('authenticated', 'public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer)', 'EXECUTE'), true, 'authenticated still executes save_tenant_configuration');

select is(has_function_privilege('anon', 'public.get_public_menu(text)', 'EXECUTE'), true, 'anon keeps get_public_menu');
select is(has_function_privilege('anon', 'public.place_customer_order(text, jsonb, text)', 'EXECUTE'), true, 'anon keeps place_customer_order');
select is(has_function_privilege('anon', 'public.call_waiter(text, text)', 'EXECUTE'), true, 'anon keeps call_waiter');
select is(has_function_privilege('anon', 'public.get_tenant_invitation(text)', 'EXECUTE'), true, 'anon keeps get_tenant_invitation');

select is(has_schema_privilege('anon', 'private', 'USAGE'), false, 'anon still has no access to the private schema');
select is(has_schema_privilege('authenticated', 'private', 'USAGE'), true, 'authenticated access to the private schema is unchanged');

-- exactly the four intended anonymous functions remain in the public schema
select is(
  (select string_agg(p.proname, ',' order by p.proname)
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'call_waiter,get_public_menu,get_tenant_invitation,place_customer_order',
  'the only anonymous public functions are the four public ones'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'),
  0, 'anon holds no privilege on any public table'
);

-- ---------------------------------------------------------------------------
-- B. Anonymous attempts are refused
-- ---------------------------------------------------------------------------

set local role anon;

select is(pg_temp.attempt('truncate table public.tenant_onboarding'), '42501:permission denied for table tenant_onboarding', 'anon TRUNCATE tenant_onboarding is refused');
select is(pg_temp.attempt('select count(*) from public.tenant_onboarding'), '42501:permission denied for table tenant_onboarding', 'anon SELECT tenant_onboarding is refused');
select is(pg_temp.attempt($s$delete from public.tenant_onboarding$s$), '42501:permission denied for table tenant_onboarding', 'anon DELETE tenant_onboarding is refused');
select ok(pg_temp.attempt($s$select public.accept_tenant_invitation('x')$s$) like '42501:permission denied for function accept_tenant_invitation%', 'anon cannot call accept_tenant_invitation');
select ok(pg_temp.attempt($s$select public.create_tenant_invitation(gen_random_uuid(), gen_random_uuid(), 'a@b.co', gen_random_uuid(), 24)$s$) like '42501:permission denied for function create_tenant_invitation%', 'anon cannot call create_tenant_invitation');
select ok(pg_temp.attempt($s$select public.update_tenant_member_access(gen_random_uuid(), gen_random_uuid(), 'active', array[gen_random_uuid()], array[gen_random_uuid()])$s$) like '42501:permission denied for function update_tenant_member_access%', 'anon cannot call update_tenant_member_access');
select ok(pg_temp.attempt($s$select public.close_platform_support_session(gen_random_uuid())$s$) like '42501:permission denied for function close_platform_support_session%', 'anon cannot call close_platform_support_session');
select ok(pg_temp.attempt($s$select public.record_tenant_context(gen_random_uuid(), gen_random_uuid())$s$) like '42501:permission denied for function record_tenant_context%', 'anon cannot call record_tenant_context');

-- ---------------------------------------------------------------------------
-- C. The signed-in setup flow still works (as authenticated)
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(1);

select is((select count(*)::integer from public.tenant_onboarding), 1, 'the owner still reads the onboarding row');
select is(pg_temp.attempt('truncate table public.tenant_onboarding'), '42501:permission denied for table tenant_onboarding', 'a signed-in user cannot TRUNCATE tenant_onboarding');
select is(pg_temp.attempt($s$update public.tenant_onboarding set status = status$s$), '42501:permission denied for table tenant_onboarding', 'a signed-in user cannot UPDATE tenant_onboarding directly');
select is((select (public.set_setup_method(current_setting('f4.tenant')::uuid, 'self', '{}'::jsonb)) is not null), true, 'setup: the owner chooses self setup');
select is((select count(*)::integer from (
  select public.complete_setup_step(current_setting('f4.tenant')::uuid, step) from unnest(array['areas', 'tables', 'stations', 'menu']) as step) done), 4, 'setup: the four steps complete');
select is((select public.start_trial(current_setting('f4.tenant')::uuid) is not null), true, 'setup: the trial starts');
select is((select trial_started_at is not null from public.tenant_onboarding), true, 'setup: the onboarding row records the trial start');
select is(
  pg_temp.attempt(format($q$select public.save_tenant_configuration(%L, %L, 'F4 Test Isletme', null, 'F4 Merkez', 'F4 Marka', '#112233', 'F4', 'Tesekkurler', 0)$q$,
    current_setting('f4.tenant'), current_setting('f4.branch'))),
  'ok', 'settings: the owner still saves the configuration'
);
select is((select public.set_branch_qr_settings(current_setting('f4.tenant')::uuid, current_setting('f4.branch')::uuid, true) is not null), true, 'owner enables QR ordering');
select set_config('f4.token', public.create_tenant_invitation(current_setting('f4.tenant')::uuid, current_setting('f4.branch')::uuid,
  'f4-user-2@test.local', (select id from public.roles where tenant_id = current_setting('f4.tenant')::uuid and code = 'waiter'), 24) ->> 'token', true);
select is(current_setting('f4.token') ~ '^[0-9a-f]{48}$', true, 'the owner creates an invitation');

-- ---------------------------------------------------------------------------
-- D. The four anonymous functions still work for a visitor
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is((select public.get_tenant_invitation(current_setting('f4.token')) ->> 'tenantName'), 'F4 Test Isletme', 'anon: the invitation preview works');
select is((select jsonb_array_length(public.get_public_menu(current_setting('f4.qr')) -> 'categories') > 0), true, 'anon: the QR menu loads');
select is((select public.call_waiter(current_setting('f4.qr'), 'waiter') ->> 'status'), 'sent', 'anon: a guest can call the waiter');
select is((select public.place_customer_order(current_setting('f4.qr'),
  jsonb_build_array(jsonb_build_object('productId', current_setting('f4.product'), 'quantity', 1)), 'f4-order-key-0000000000000001') is not null), true, 'anon: a guest can place an order');

-- ---------------------------------------------------------------------------
-- E. A signed-in user accepts the invitation
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select pg_temp.act_as(2);
select is((select public.accept_tenant_invitation(current_setting('f4.token')) ->> 'tenantSlug') is not null, true, 'authenticated: the invitation is accepted');

-- ---------------------------------------------------------------------------
-- F. F1 / F2 / 0037 objects stay in place
-- ---------------------------------------------------------------------------

reset role;
select is((select count(*)::integer from pg_policies where schemaname = 'public' and policyname like '%_finance_read_restrict'), 5, 'the five finance read policies of 0035 are untouched');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('roles', 'role_permissions') and cmd <> 'SELECT'), 0, 'no write policy on roles / role_permissions (0036)');
select is((select count(*)::integer from pg_proc where pronamespace = 'public'::regnamespace and proname = 'accept_tenant_invitation' and prosrc like '%membership_suspended%'), 1, 'accept_tenant_invitation keeps the 0037 suspended-member guard');

select * from finish();
rollback;
