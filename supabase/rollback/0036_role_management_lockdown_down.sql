-- MK Adisyon Web / ROLLBACK for 0036_role_management_lockdown.sql
--
-- NOT a migration (the Supabase CLI only applies supabase/migrations/). Run by hand only if 0036
-- has to be undone. It RE-OPENS the direct write path to roles / role_permissions for anyone who
-- holds users.manage (including a delegated branch manager) and restores the previous bodies of
-- update_tenant_member_access and create_tenant_invitation. Use it as a short, temporary measure.
--
-- One transaction: everything is restored or nothing is. Safe to run more than once.

begin;
set local lock_timeout = '5s';

grant insert, update on public.roles, public.role_permissions to authenticated;

drop policy if exists roles_manage_insert on public.roles;
create policy roles_manage_insert
on public.roles for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

drop policy if exists roles_manage_update on public.roles;
create policy roles_manage_update
on public.roles for update to authenticated
using (private.has_tenant_permission(tenant_id, 'users.manage'))
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

drop policy if exists role_permissions_manage on public.role_permissions;
create policy role_permissions_manage
on public.role_permissions for insert to authenticated
with check (private.has_tenant_permission(tenant_id, 'users.manage'));

-- previous bodies (0017 and 0011)
create or replace function public.update_tenant_member_access(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_status public.membership_status,
  target_branch_ids uuid[],
  target_role_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_tenant_scope boolean;
  target_user_id uuid;
  had_owner_role boolean;
  assigns_owner_role boolean;
  before_value jsonb;
  after_value jsonb;
begin
  if actor_id is null or not private.has_tenant_permission(target_tenant_id, 'users.manage') then
    raise exception using errcode = '42501', message = 'users_manage_denied';
  end if;
  if coalesce(cardinality(target_branch_ids), 0) = 0
    or coalesce(cardinality(target_role_ids), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'member_access_required';
  end if;
  actor_tenant_scope := private.is_tenant_scope_member(target_tenant_id);

  select membership.user_id,
    jsonb_build_object(
      'status', membership.status,
      'branchIds', coalesce((select jsonb_agg(branch_id order by branch_id) from public.membership_branches where tenant_id = target_tenant_id and membership_id = target_membership_id), '[]'::jsonb),
      'roleIds', coalesce((select jsonb_agg(role_id order by role_id) from public.membership_roles where tenant_id = target_tenant_id and membership_id = target_membership_id), '[]'::jsonb)
    )
  into target_user_id, before_value
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id and membership.id = target_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;
  if target_user_id = actor_id and target_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'cannot_suspend_self';
  end if;
  -- Nobody changes their own roles: a role change always needs a second person.
  if target_user_id = actor_id and (
    coalesce((
      select array_agg(role_id order by role_id)
      from public.membership_roles
      where tenant_id = target_tenant_id and membership_id = target_membership_id
    ), '{}'::uuid[])
    is distinct from
    coalesce((
      select array_agg(distinct value order by value)
      from unnest(target_role_ids) as value
    ), '{}'::uuid[])
  ) then
    raise exception using errcode = 'P0001', message = 'cannot_change_own_roles';
  end if;
  if (select count(distinct id) from public.branches where tenant_id = target_tenant_id and id = any(target_branch_ids))
      <> (select count(distinct value) from unnest(target_branch_ids) as value)
    or (select count(distinct id) from public.roles where tenant_id = target_tenant_id and id = any(target_role_ids))
      <> (select count(distinct value) from unnest(target_role_ids) as value) then
    raise exception using errcode = 'P0001', message = 'cross_tenant_member_access';
  end if;

  -- Branch-scope managers may only manage branch-scope members inside the
  -- branches they themselves belong to.
  if not actor_tenant_scope then
    if exists (
      select 1 from public.roles
      where tenant_id = target_tenant_id
        and id = any(target_role_ids) and scope = 'tenant'
    ) then
      raise exception using errcode = '42501', message = 'tenant_role_assignment_denied';
    end if;
    if exists (
      select 1 from public.membership_roles link
      join public.roles role
        on role.tenant_id = link.tenant_id and role.id = link.role_id
      where link.tenant_id = target_tenant_id
        and link.membership_id = target_membership_id
        and role.scope = 'tenant'
    ) then
      raise exception using errcode = '42501', message = 'tenant_member_change_denied';
    end if;
    if exists (
      select 1 from unnest(target_branch_ids) as branch_value
      where not private.has_branch_membership(target_tenant_id, branch_value)
    ) then
      raise exception using errcode = '42501', message = 'branch_assignment_denied';
    end if;
  end if;

  select exists (
    select 1 from public.membership_roles link
    join public.roles role on role.tenant_id = link.tenant_id and role.id = link.role_id
    where link.tenant_id = target_tenant_id and link.membership_id = target_membership_id
      and role.code = 'owner'
  ) into had_owner_role;
  select exists (
    select 1 from public.roles
    where tenant_id = target_tenant_id and id = any(target_role_ids) and code = 'owner'
  ) into assigns_owner_role;

  if assigns_owner_role and not private.has_system_role(target_tenant_id, 'owner') then
    raise exception using errcode = '42501', message = 'owner_role_assignment_denied';
  end if;
  if had_owner_role and not private.has_system_role(target_tenant_id, 'owner') then
    raise exception using errcode = '42501', message = 'owner_membership_change_denied';
  end if;
  if had_owner_role and (target_status <> 'active' or not assigns_owner_role)
    and not exists (
      select 1
      from public.tenant_memberships membership
      join public.membership_roles link
        on link.tenant_id = membership.tenant_id and link.membership_id = membership.id
      join public.roles role
        on role.tenant_id = link.tenant_id and role.id = link.role_id
      where membership.tenant_id = target_tenant_id
        and membership.id <> target_membership_id
        and membership.status = 'active' and role.code = 'owner'
    ) then
    raise exception using errcode = 'P0001', message = 'last_owner_required';
  end if;

  update public.tenant_memberships
  set status = target_status, updated_at = now()
  where tenant_id = target_tenant_id and id = target_membership_id;

  -- Branch-scope actors only replace assignments inside their own branches.
  delete from public.membership_branches
  where tenant_id = target_tenant_id
    and membership_id = target_membership_id
    and (actor_tenant_scope
      or private.has_branch_membership(target_tenant_id, branch_id));
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  select target_tenant_id, target_membership_id, value
  from (select distinct unnest(target_branch_ids) as value) values_to_add
  on conflict do nothing;
  delete from public.membership_roles
  where tenant_id = target_tenant_id and membership_id = target_membership_id;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  select target_tenant_id, target_membership_id, value
  from (select distinct unnest(target_role_ids) as value) values_to_add;

  after_value := jsonb_build_object(
    'status', target_status,
    'branchIds', to_jsonb(target_branch_ids),
    'roleIds', to_jsonb(target_role_ids)
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'tenant.member_access.updated',
    'tenant_membership', target_membership_id,
    jsonb_build_object('before', before_value, 'after', after_value)
  );
  return after_value;
end;
$$;

create or replace function public.create_tenant_invitation(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_email text,
  target_role_id uuid,
  target_valid_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(trim(coalesce(target_email, '')));
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
  invitation_id uuid;
  role_code text;
  role_scope text;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'users.manage'
  ) then
    raise exception using errcode = '42501', message = 'users_manage_denied';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or target_valid_hours not between 1 and 168 then
    raise exception using errcode = 'P0001', message = 'invalid_invitation_input';
  end if;

  select role.code, role.scope into role_code, role_scope
  from public.roles role
  where role.tenant_id = target_tenant_id and role.id = target_role_id;
  if role_code is null then
    raise exception using errcode = 'P0001', message = 'role_not_found';
  end if;
  if role_code = 'owner' and not private.has_system_role(target_tenant_id, 'owner') then
    raise exception using errcode = '42501', message = 'owner_role_assignment_denied';
  end if;
  if role_scope = 'tenant'
    and not private.is_tenant_scope_member(target_tenant_id) then
    raise exception using errcode = '42501', message = 'tenant_role_assignment_denied';
  end if;

  update public.tenant_invitations
  set revoked_at = now()
  where tenant_id = target_tenant_id
    and lower(email) = normalized_email
    and accepted_at is null and revoked_at is null;

  insert into public.tenant_invitations (
    tenant_id, branch_id, role_id, email, token_hash,
    invited_by, expires_at
  ) values (
    target_tenant_id, target_branch_id, target_role_id, normalized_email,
    encode(extensions.digest(raw_token, 'sha256'::text), 'hex'), actor_id,
    now() + make_interval(hours => target_valid_hours)
  ) returning id into invitation_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'tenant.invitation.created',
    'tenant_invitation', invitation_id,
    jsonb_build_object('branchId', target_branch_id, 'roleId', target_role_id, 'email', normalized_email)
  );

  return jsonb_build_object(
    'invitationId', invitation_id,
    'token', raw_token,
    'expiresAt', now() + make_interval(hours => target_valid_hours)
  );
end;
$$;

commit;
