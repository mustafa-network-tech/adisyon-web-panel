-- MK Adisyon Web / 0037: invitations cannot reactivate suspended members; reactivation needs a
-- tenant-scope manager; an invitation of a creator who left the business cannot be accepted
--
-- Problem (reproduced on PostgreSQL 17 against 0001-0036, see supabase/tests/invitation_reactivation_hardening.test.sql):
--   1) accept_tenant_invitation upserted the membership with "status = 'active'". Anybody holding
--      users.manage (a delegated branch manager is enough) could invite the e-mail address of a
--      SUSPENDED member - including a suspended tenant_admin or owner - and the suspended person
--      became active again with the old roles, bypassing tenant_member_change_denied and
--      owner_membership_change_denied of update_tenant_member_access.
--   2) update_tenant_member_access let a branch-scope manager set a suspended member of his branch
--      back to 'active'.
--   3) An invitation stayed valid after its creator was suspended.
--
-- Fix (functions only; no table, policy or grant changes; ACLs are kept by create or replace):
--   * accept_tenant_invitation: refuses with membership_suspended when the caller's membership in
--     that business is suspended (the row is locked first), never changes a suspended status, and
--     refuses with invitation_inviter_inactive when the creator no longer has an active membership.
--   * update_tenant_member_access: a branch-scope actor gets reactivation_requires_tenant_scope
--     when the member is suspended and the new status is 'active'. Tenant-scope managers keep the
--     existing rules (only an owner touches owners). The existing audit row records before/after.
--
-- Not covered (reported separately): an invitation created BEFORE 0036 may still carry a role that
-- exceeds its creator's permissions; "creator is active" does not prove "creator is still allowed to
-- hand out this role". Existing pending invitations are not touched by this migration.
--
-- Not touched: 0035 / 0036 objects, anon / authenticated privileges (separate job).
--
-- ROLLBACK: supabase/rollback/0037_invitation_and_reactivation_hardening_down.sql

begin;

create or replace function public.accept_tenant_invitation(target_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  invitation record;
  membership_id uuid;
  tenant_slug text;
  branch_slug text;
  existing_status public.membership_status;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select lower(email) into actor_email from auth.users where id = actor_id;

  select * into invitation
  from public.tenant_invitations
  where token_hash = encode(
    extensions.digest(coalesce(target_token, '')::text, 'sha256'::text),
    'hex'
  )
  for update;
  if not found or invitation.accepted_at is not null
    or invitation.revoked_at is not null or invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'invitation_not_available';
  end if;
  if lower(invitation.email) <> actor_email then
    raise exception using errcode = '42501', message = 'invitation_email_mismatch';
  end if;
  if not exists (
    select 1 from public.tenants
    where id = invitation.tenant_id and is_active
  ) then
    raise exception using errcode = 'P0001', message = 'tenant_not_active';
  end if;

  -- 0037: an invitation never brings a suspended member back. Reactivation is an audited
  -- decision of a tenant-scope manager (update_tenant_member_access), not a side effect of a link.
  select membership.status into existing_status
  from public.tenant_memberships membership
  where membership.tenant_id = invitation.tenant_id and membership.user_id = actor_id
  for update;
  if existing_status = 'suspended' then
    raise exception using errcode = '42501', message = 'membership_suspended';
  end if;
  -- 0037: the person who created the invitation must still be an active member of the business.
  -- (This does not prove that he still holds enough permissions for the invited role.)
  if not exists (
    select 1 from public.tenant_memberships inviter
    where inviter.tenant_id = invitation.tenant_id
      and inviter.user_id = invitation.invited_by
      and inviter.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'invitation_inviter_inactive';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (invitation.tenant_id, actor_id, 'active')
  on conflict (tenant_id, user_id) do update
  set status = case when public.tenant_memberships.status = 'suspended'
        then public.tenant_memberships.status else 'active' end,
      updated_at = now()
  returning id into membership_id;

  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  values (invitation.tenant_id, membership_id, invitation.branch_id)
  on conflict do nothing;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  values (invitation.tenant_id, membership_id, invitation.role_id)
  on conflict do nothing;

  update public.tenant_invitations
  set accepted_at = now(), accepted_by = actor_id
  where id = invitation.id;

  select tenant.slug, branch.slug into tenant_slug, branch_slug
  from public.tenants tenant
  join public.branches branch
    on branch.tenant_id = tenant.id and branch.id = invitation.branch_id
  where tenant.id = invitation.tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    invitation.tenant_id, actor_id, 'tenant.invitation.accepted',
    'tenant_membership', membership_id,
    jsonb_build_object('invitationId', invitation.id, 'branchId', invitation.branch_id, 'roleId', invitation.role_id)
  );
  return jsonb_build_object('tenantSlug', tenant_slug, 'branchSlug', branch_slug);
end;
$$;

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
    -- 0037: only a tenant-scope manager brings a suspended member back. A branch-scope manager
    -- may still suspend (and edit) members of his own branches.
    if target_status = 'active' and before_value ->> 'status' = 'suspended' then
      raise exception using errcode = '42501', message = 'reactivation_requires_tenant_scope';
    end if;
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

commit;
