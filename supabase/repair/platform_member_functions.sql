-- Repair: creates platform_list_members and platform_assign_member if they are missing
-- (copied unchanged from migration 0012; safe to run more than once).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';

begin;

create or replace function public.platform_list_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;

  return coalesce((
    select jsonb_agg(member_json order by created_at desc)
    from (
      select
        account.created_at,
        jsonb_build_object(
          'userId', account.id,
          'email', account.email,
          'fullName', profile.full_name,
          'createdAt', account.created_at,
          'tenants', coalesce((
            select jsonb_agg(jsonb_build_object(
              'tenantId', tenant.id,
              'tenantName', tenant.name,
              'status', membership.status,
              'roles', coalesce((
                select jsonb_agg(role.name order by role.name)
                from public.membership_roles link
                join public.roles role
                  on role.tenant_id = link.tenant_id and role.id = link.role_id
                where link.tenant_id = membership.tenant_id
                  and link.membership_id = membership.id
              ), '[]'::jsonb)
            ) order by tenant.name)
            from public.tenant_memberships membership
            join public.tenants tenant on tenant.id = membership.tenant_id
            where membership.user_id = account.id
          ), '[]'::jsonb)
        ) as member_json
      from auth.users account
      left join public.profiles profile on profile.id = account.id
      where not exists (
        select 1 from public.platform_admins admin where admin.user_id = account.id
      )
    ) members
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_assign_member(
  target_user_id uuid,
  target_tenant_id uuid,
  target_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_role record;
  seat_limit integer;
  used_seats integer;
  membership_id uuid;
  already_member boolean;
begin
  if actor_id is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception using errcode = 'P0001', message = 'member_not_found';
  end if;

  select role.id, role.scope into target_role
  from public.roles role
  where role.tenant_id = target_tenant_id
    and role.code = target_role_code and role.is_system;
  if not found then
    raise exception using errcode = 'P0001', message = 'role_not_found';
  end if;

  select exists (
    select 1 from public.tenant_memberships
    where tenant_id = target_tenant_id and user_id = target_user_id
  ) into already_member;

  if not already_member then
    select subscription.user_limit into seat_limit
    from public.subscriptions subscription
    where subscription.tenant_id = target_tenant_id
    order by subscription.created_at desc limit 1;
    select count(*) into used_seats
    from public.tenant_memberships
    where tenant_id = target_tenant_id and status in ('active', 'invited');
    if seat_limit is not null and used_seats >= seat_limit then
      raise exception using errcode = 'P0001', message = 'user_limit_reached';
    end if;
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (target_tenant_id, target_user_id, 'active')
  on conflict (tenant_id, user_id) do update
  set status = 'active', updated_at = now()
  returning id into membership_id;

  -- Tenant-scope roles reach every branch; others start on the first branch.
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  select target_tenant_id, membership_id, branch.id
  from public.branches branch
  where branch.tenant_id = target_tenant_id and branch.is_active
    and (target_role.scope = 'tenant' or branch.id = (
      select first_branch.id from public.branches first_branch
      where first_branch.tenant_id = target_tenant_id and first_branch.is_active
      order by first_branch.created_at limit 1
    ))
  on conflict do nothing;

  insert into public.membership_roles (tenant_id, membership_id, role_id)
  values (target_tenant_id, membership_id, target_role.id)
  on conflict do nothing;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'platform.member.assigned',
    'tenant_membership', membership_id,
    jsonb_build_object('userId', target_user_id, 'roleCode', target_role_code)
  );

  return jsonb_build_object('membershipId', membership_id);
end;
$$;

revoke all on function public.platform_list_members() from public, anon;
revoke all on function public.platform_assign_member(uuid, uuid, text) from public, anon;
grant execute on function public.platform_list_members() to authenticated;
grant execute on function public.platform_assign_member(uuid, uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
