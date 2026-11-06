-- MK Adisyon Web / F2: role and permission definitions can no longer be written directly
--
-- Problem (reproduced on PostgreSQL 17): migration 0002 gave `authenticated` INSERT/UPDATE on
-- public.roles and INSERT/UPDATE on public.role_permissions, guarded only by an RLS policy
-- "has_tenant_permission(tenant, 'users.manage')". 0009 took the same direct write away from the
-- membership link tables but forgot these two. users.manage can be delegated to a branch-scope
-- manager (set_member_extras), and has_tenant_permission() is tenant wide, so that manager could
--   * insert into role_permissions and give the shared system role "waiter" settings.manage,
--   * rewrite roles.scope / roles.code, which every scope guard in the team-management functions
--     relies on (is_tenant_scope_member reads roles.scope),
-- bypassing tenant-scope checks, the owner guards and the audit log.
--
-- The application never writes these tables (it only reads them; system roles are created by the
-- SECURITY DEFINER trigger function private.ensure_system_roles). So the direct write path is
-- removed at three levels: privileges, policies, and (for good measure) any other privilege.
--
-- Second part: the audited functions that DO change who holds which role are tightened so a
-- delegated branch manager cannot use them as a ladder either:
--   * update_tenant_member_access: a branch-scope actor may only edit members that already belong to
--     one of his branches, and may only newly assign roles whose permissions he holds himself.
--   * create_tenant_invitation: a branch-scope inviter may only invite with a role whose
--     permissions he holds himself.
-- Owners and tenant-scope admins are not affected (they hold every permission).
--
-- Not touched: ACLs of the functions (create or replace keeps them), the finance policies of 0035,
-- anon/authenticated privileges of other tables, set_member_extras (already tenant-scope only).
--
-- ROLLBACK: supabase/rollback/0036_role_management_lockdown_down.sql

begin;

-- 1) Privileges: read only. (Explicit about every privilege so a later default-privilege change
--    in the hosting platform cannot silently bring one back.)
revoke insert, update, delete, truncate, references, trigger
  on public.roles, public.role_permissions from authenticated, anon;
grant select on public.roles, public.role_permissions to authenticated;

-- 2) Policies: the write policies would only matter after a re-GRANT; remove them so that a
--    re-GRANT alone does not re-open the hole (RLS then denies by default).
drop policy if exists roles_manage_insert on public.roles;
drop policy if exists roles_manage_update on public.roles;
drop policy if exists role_permissions_manage on public.role_permissions;

-- 3) Audited role assignment: never hand out more than you hold.
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

    -- F2: a branch-scope manager only touches members that already belong to one of
    -- his own branches (otherwise he could rewrite the roles of another branch's staff).
    if not exists (
      select 1 from public.membership_branches link
      where link.tenant_id = target_tenant_id
        and link.membership_id = target_membership_id
        and private.has_branch_membership(target_tenant_id, link.branch_id)
    ) then
      raise exception using errcode = '42501', message = 'member_outside_actor_branches';
    end if;
    -- F2: ...and may only hand out roles whose permissions he holds himself. Roles the
    -- member already has are left alone, so editing status or branches keeps working.
    if exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
      where role_permission.tenant_id = target_tenant_id
        and role_permission.role_id = any(target_role_ids)
        and not exists (
          select 1 from public.membership_roles current_link
          where current_link.tenant_id = target_tenant_id
            and current_link.membership_id = target_membership_id
            and current_link.role_id = role_permission.role_id
        )
        and not private.has_tenant_permission(target_tenant_id, permission.code)
    ) then
      raise exception using errcode = '42501', message = 'role_exceeds_actor_permissions';
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
  -- F2: an invitation may only carry a role whose permissions the inviter holds himself.
  if not private.is_tenant_scope_member(target_tenant_id) and exists (
    select 1
    from public.role_permissions role_permission
    join public.permissions permission on permission.id = role_permission.permission_id
    where role_permission.tenant_id = target_tenant_id
      and role_permission.role_id = target_role_id
      and not private.has_tenant_permission(target_tenant_id, permission.code)
  ) then
    raise exception using errcode = '42501', message = 'role_exceeds_actor_permissions';
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
