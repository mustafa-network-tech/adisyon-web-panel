-- Anonymous SQL privileges (0038, adjusted for 0039-0040): tenant_onboarding is closed for anon and
-- read-only for authenticated; the functions that only make sense for a signed-in person are not executable by
-- anon; the QR menu and the waiter call stay anonymous; the signed-in setup flow keeps working.
-- Self-contained: builds its own business inside the transaction and rolls everything back.
-- Run with `supabase test db` on a local database only. Uses only plan/is/ok/finish. Ids start with f4000000-.

begin;

select plan(48);

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

insert into auth.users (id, email, raw_user_meta_data)
select ('f4000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'f4-user-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 2) as n;
insert into public.profiles (id, full_name)
select ('f4000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'F4 User ' || n from generate_series(1, 2) as n
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

select is(has_function_privilege('anon', 'public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[])', 'EXECUTE'), false, 'anon cannot execute update_tenant_member_access');
select is(has_function_privilege('anon', 'public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text)', 'EXECUTE'), false, 'anon cannot execute save_tenant_configuration');
select is(has_function_privilege('anon', 'public.open_platform_support_session(uuid, uuid, text, integer)', 'EXECUTE'), false, 'anon cannot execute open_platform_support_session');
select is(has_function_privilege('anon', 'public.close_platform_support_session(uuid)', 'EXECUTE'), false, 'anon cannot execute close_platform_support_session');
select is(has_function_privilege('anon', 'public.record_tenant_context(uuid, uuid)', 'EXECUTE'), false, 'anon cannot execute record_tenant_context');
select is(has_function_privilege('anon', 'public.request_join_tenant(text, text)', 'EXECUTE'), false, 'anon cannot request to join a business');
select is(has_function_privilege('anon', 'public.decide_join_request(uuid, text, uuid, uuid[])', 'EXECUTE'), false, 'anon cannot decide join requests');
select is(has_function_privilege('anon', 'public.get_join_code(uuid)', 'EXECUTE'), false, 'anon cannot read a business code');
select is(has_function_privilege('anon', 'public.record_order_payments(uuid, uuid, uuid, uuid, jsonb, text, jsonb)', 'EXECUTE'), false, 'anon cannot record payments');
select is(has_function_privilege('authenticated', 'public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[])', 'EXECUTE'), true, 'authenticated still executes update_tenant_member_access');
select is(has_function_privilege('authenticated', 'public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text)', 'EXECUTE'), true, 'authenticated still executes save_tenant_configuration');

select is(has_function_privilege('anon', 'public.get_public_menu(text)', 'EXECUTE'), true, 'anon keeps get_public_menu (QR menu)');
select is(has_function_privilege('anon', 'public.call_waiter(text, text)', 'EXECUTE'), true, 'anon keeps call_waiter');

select is(has_schema_privilege('anon', 'private', 'USAGE'), false, 'anon still has no access to the private schema');
select is(has_schema_privilege('authenticated', 'private', 'USAGE'), true, 'authenticated access to the private schema is unchanged');

-- exactly the two intended anonymous functions remain in the public schema
select is(
  (select string_agg(p.proname, ',' order by p.proname)
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'call_waiter,get_public_menu',
  'the only anonymous public functions are the QR menu and the waiter call'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'),
  0, 'anon holds no privilege on any public table'
);
select is(to_regprocedure('public.place_customer_order(text,jsonb,text)') is null, true, 'no anonymous order function exists any more');
select is(to_regprocedure('public.get_tenant_invitation(text)') is null, true, 'no anonymous invitation preview exists any more');

-- ---------------------------------------------------------------------------
-- B. Anonymous attempts are refused
-- ---------------------------------------------------------------------------

set local role anon;

select is(pg_temp.attempt('truncate table public.tenant_onboarding'), '42501:permission denied for table tenant_onboarding', 'anon TRUNCATE tenant_onboarding is refused');
select is(pg_temp.attempt('select count(*) from public.tenant_onboarding'), '42501:permission denied for table tenant_onboarding', 'anon SELECT tenant_onboarding is refused');
select is(pg_temp.attempt($s$delete from public.tenant_onboarding$s$), '42501:permission denied for table tenant_onboarding', 'anon DELETE tenant_onboarding is refused');
select is(pg_temp.attempt('select count(*) from public.order_adjustments'), '42501:permission denied for table order_adjustments', 'anon reads no discount record');
select is(pg_temp.attempt('select count(*) from public.join_requests'), '42501:permission denied for table join_requests', 'anon reads no join request');
select is(pg_temp.attempt('select count(*) from public.tenant_join_codes'), '42501:permission denied for table tenant_join_codes', 'anon reads no business code');
select ok(pg_temp.attempt($s$select public.request_join_tenant('x', 'y')$s$) like '42501:permission denied for function request_join_tenant%', 'anon cannot call request_join_tenant');
select ok(pg_temp.attempt($s$select public.update_tenant_member_access(gen_random_uuid(), gen_random_uuid(), 'active', array[gen_random_uuid()], array[gen_random_uuid()])$s$) like '42501:permission denied for function update_tenant_member_access%', 'anon cannot call update_tenant_member_access');
select ok(pg_temp.attempt($s$select public.record_tenant_context(gen_random_uuid(), gen_random_uuid())$s$) like '42501:permission denied for function record_tenant_context%', 'anon cannot call record_tenant_context');

-- ---------------------------------------------------------------------------
-- C. The anonymous QR menu and waiter call work; the signed-in setup flow works
-- ---------------------------------------------------------------------------


reset role;
set local role authenticated;
select pg_temp.act_as(1);
select is((select count(*)::integer from public.tenant_onboarding), 1, 'the owner still reads the onboarding row');
select is(pg_temp.attempt('truncate table public.tenant_onboarding'), '42501:permission denied for table tenant_onboarding', 'a signed-in user cannot TRUNCATE tenant_onboarding');
select is((select public.set_setup_method(current_setting('f4.tenant')::uuid, 'self', '{}'::jsonb) is not null), true, 'setup: the owner chooses self setup');
select is((select count(*)::integer from (
  select public.complete_setup_step(current_setting('f4.tenant')::uuid, step) from unnest(array['areas', 'tables', 'stations', 'menu']) as step) done), 4, 'setup: the four steps complete');
select is((select public.start_trial(current_setting('f4.tenant')::uuid) is not null), true, 'setup: the trial starts');
select is(
  pg_temp.attempt(format($q$select public.save_tenant_configuration(%L, %L, 'F4 Test Isletme', null, 'F4 Merkez', 'F4 Marka', '#112233', 'F4', 'Tesekkurler')$q$,
    current_setting('f4.tenant'), current_setting('f4.branch'))),
  'ok', 'settings: the owner still saves the configuration (no service charge)'
);

reset role;
set local role anon;
select is((select jsonb_array_length(public.get_public_menu(current_setting('f4.qr')) -> 'categories') > 0), true, 'anon: the QR menu loads');
select is((select public.call_waiter(current_setting('f4.qr'), 'waiter') ->> 'status'), 'sent', 'anon: a guest can call the waiter');

select * from finish();
rollback;
