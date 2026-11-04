-- Hosted development smoke test for Phase 2 Module 8.
-- Run after 0009_phase2_settings_platform.sql. All fixtures are rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'Module 8 smoke assertion failed: %', message;
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
  ('d8100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module8-admin@transaction.test', extensions.crypt('TransactionOnly123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 8 Admin"}', now(), now()),
  ('d8100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module8-owner@transaction.test', extensions.crypt('TransactionOnly123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 8 Owner"}', now(), now()),
  ('d8100000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module8-invited@transaction.test', extensions.crypt('TransactionOnly123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 8 Invited"}', now(), now()),
  ('d8100000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'module8-outsider@transaction.test', extensions.crypt('TransactionOnly123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Module 8 Outsider"}', now(), now());

insert into public.platform_admins (user_id)
values ('d8100000-0000-0000-0000-000000000001');

create temporary table module8_tokens (token text not null);
grant select, insert on pg_temp.module8_tokens to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000001', true);

select public.provision_tenant(
  'Module 8 Smoke', 'Module 8 Smoke Ltd.', 'module8-smoke',
  'Merkez', 'merkez', 'module8-owner@transaction.test',
  'PRO', 'trial', now() + interval '14 days',
  'Module 8 transaction fixture'
);
select pg_temp.assert_true(
  (select count(*) from public.tenants where slug = 'module8-smoke') = 1,
  'platform admin must provision tenant'
);

reset role;
insert into public.tenant_memberships (id, tenant_id, user_id, status)
select 'd8400000-0000-0000-0000-000000000001', tenant.id,
  'd8100000-0000-0000-0000-000000000002', 'active'
from public.tenants tenant where tenant.slug = 'module8-smoke';
insert into public.membership_branches (tenant_id, membership_id, branch_id)
select tenant.id, 'd8400000-0000-0000-0000-000000000001', branch.id
from public.tenants tenant
join public.branches branch on branch.tenant_id = tenant.id
where tenant.slug = 'module8-smoke' and branch.slug = 'merkez';
insert into public.membership_roles (tenant_id, membership_id, role_id)
select tenant.id, 'd8400000-0000-0000-0000-000000000001', role.id
from public.tenants tenant
join public.roles role on role.tenant_id = tenant.id and role.code = 'owner'
where tenant.slug = 'module8-smoke';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.provision_tenant(
      'Forbidden Tenant', '', 'module8-forbidden', 'Merkez', 'merkez',
      'module8-outsider@transaction.test',
      'PRO', 'trial', now() + interval '1 day', ''
    )
  $statement$, 'platform_admin_required'),
  'tenant owner must not provision platform tenants'
);

select public.save_tenant_configuration(
  (select id from public.tenants where slug = 'module8-smoke'),
  (select branch.id from public.branches branch join public.tenants tenant on tenant.id = branch.tenant_id where tenant.slug = 'module8-smoke' and branch.slug = 'merkez'),
  'Module 8 Restoran', 'Module 8 Restoran Ltd.', 'Merkez Şube',
  'M8', '#23866b', 'M8', 'Afiyet olsun', 1250
);
select pg_temp.assert_true(
  (select brand_name = 'M8' and service_charge_basis_points = 1250
   from public.tenant_settings settings
   join public.tenants tenant on tenant.id = settings.tenant_id
   where tenant.slug = 'module8-smoke'),
  'tenant settings must persist through audited function'
);

insert into pg_temp.module8_tokens (token)
select public.create_tenant_invitation(
  tenant.id, branch.id, 'module8-invited@transaction.test', role.id, 72
)->>'token'
from public.tenants tenant
join public.branches branch on branch.tenant_id = tenant.id and branch.slug = 'merkez'
join public.roles role on role.tenant_id = tenant.id and role.code = 'waiter'
where tenant.slug = 'module8-smoke';
select pg_temp.assert_true(
  (select length(token) = 48 from pg_temp.module8_tokens limit 1),
  'invitation must return a one-time token'
);
select pg_temp.assert_true(
  (select token_hash <> (select token from pg_temp.module8_tokens limit 1)
   from public.tenant_invitations limit 1),
  'database must store only the invitation token hash'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000004', true);
select pg_temp.assert_true(
  pg_temp.operation_failed(
    format('select public.accept_tenant_invitation(%L)', (select token from pg_temp.module8_tokens limit 1)),
    'invitation_email_mismatch'
  ),
  'different e-mail account must not accept invitation'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000003', true);
select public.accept_tenant_invitation((select token from pg_temp.module8_tokens limit 1));
select pg_temp.assert_true(
  private.has_branch_permission(
    (select id from public.tenants where slug = 'module8-smoke'),
    (select branch.id from public.branches branch join public.tenants tenant on tenant.id = branch.tenant_id where tenant.slug = 'module8-smoke' and branch.slug = 'merkez'),
    'orders.create'
  ),
  'accepted waiter must receive scoped branch role'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    select public.update_tenant_member_access(
      (select id from public.tenants where slug = 'module8-smoke'),
      (select id from public.tenant_memberships where user_id = 'd8100000-0000-0000-0000-000000000003'),
      'active', array['d8300000-0000-0000-0000-000000000099'::uuid],
      array[(select role.id from public.roles role join public.tenants tenant on tenant.id = role.tenant_id where tenant.slug = 'module8-smoke' and role.code = 'waiter')]
    )
  $statement$, 'cross_tenant_member_access'),
  'member assignment must reject an unrelated branch'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000001', true);
select public.update_tenant_subscription(
  (select id from public.tenants where slug = 'module8-smoke'),
  'PRO', 'suspended', now(), now() + interval '14 days', 'Güvenlik testi'
);
select pg_temp.assert_true(
  (select not is_active from public.tenants where slug = 'module8-smoke'),
  'suspended subscription must deactivate tenant'
);
select pg_temp.assert_true(
  (select metadata ? 'before' and metadata ? 'after'
   from public.audit_logs where action = 'platform.subscription.updated'
   order by created_at desc limit 1),
  'subscription audit must contain before and after values'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  not private.has_tenant_permission(
    (select tenant_id from public.tenant_memberships where user_id = 'd8100000-0000-0000-0000-000000000002'),
    'settings.manage'
  ),
  'suspended tenant user must lose permission at database boundary'
);
select pg_temp.assert_true(
  (select count(*) from public.tenants where slug = 'module8-smoke') = 0,
  'suspended tenant must be hidden from tenant user by RLS'
);
select pg_temp.assert_true(
  pg_temp.operation_failed($statement$
    insert into public.audit_logs (action, entity_type)
    values ('forbidden', 'test')
  $statement$, 'permission denied'),
  'audit history must reject direct client writes'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) from public.tenants where slug = 'module8-smoke') = 1,
  'platform admin must retain suspended tenant visibility'
);
select public.update_tenant_subscription(
  (select id from public.tenants where slug = 'module8-smoke'),
  'PRO', 'active', now(), now() + interval '30 days', 'Yeniden etkinleştirme'
);

select set_config('request.jwt.claim.sub', 'd8100000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  private.has_tenant_permission(
    (select id from public.tenants where slug = 'module8-smoke'),
    'settings.manage'
  ),
  'reactivated tenant must restore member permissions'
);

select 'HOSTED_MODULE8_SMOKE_OK' as result;

rollback;
