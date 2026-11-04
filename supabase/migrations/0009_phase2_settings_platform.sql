-- MK Adisyon Web / Phase 2 Module 8
-- Tenant settings, invitations, member access and audited platform administration.

begin;

alter table public.tenant_settings
  add column receipt_footer text,
  add column order_number_prefix text not null default 'MK'
    check (order_number_prefix ~ '^[A-Z0-9]{1,8}$'),
  add column service_charge_basis_points integer not null default 0
    check (service_charge_basis_points between 0 and 10000);

-- A suspended tenant remains visible to platform administrators, while tenant
-- users lose both tenant-level and branch-level access at the RLS boundary.
create or replace function private.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.tenant_memberships membership
    join public.tenants tenant
      on tenant.id = membership.tenant_id and tenant.is_active
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_tenant_permission(
  target_tenant_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    join public.tenants tenant
      on tenant.id = membership.tenant_id and tenant.is_active
    join public.membership_roles membership_role
      on membership_role.tenant_id = membership.tenant_id
      and membership_role.membership_id = membership.id
    join public.role_permissions role_permission
      on role_permission.tenant_id = membership_role.tenant_id
      and role_permission.role_id = membership_role.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and permission.code = target_permission
  );
$$;

create or replace function private.has_branch_membership(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    join public.tenants tenant
      on tenant.id = membership.tenant_id and tenant.is_active
    join public.membership_branches membership_branch
      on membership_branch.tenant_id = membership.tenant_id
      and membership_branch.membership_id = membership.id
    join public.branches branch
      on branch.tenant_id = membership_branch.tenant_id
      and branch.id = membership_branch.branch_id and branch.is_active
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership_branch.branch_id = target_branch_id
  );
$$;

create or replace function private.is_platform_support_active(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() and exists (
    select 1
    from public.platform_support_sessions support_session
    join public.tenants tenant
      on tenant.id = support_session.tenant_id and tenant.is_active
    join public.branches branch
      on branch.tenant_id = support_session.tenant_id
      and branch.id = support_session.branch_id and branch.is_active
    where support_session.admin_user_id = (select auth.uid())
      and support_session.tenant_id = target_tenant_id
      and support_session.branch_id = target_branch_id
      and support_session.revoked_at is null
      and support_session.expires_at > now()
  );
$$;

create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  role_id uuid not null,
  email text not null check (char_length(trim(email)) between 5 and 254),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade,
  foreign key (tenant_id, role_id)
    references public.roles(tenant_id, id) on delete restrict,
  check (expires_at > created_at),
  check (accepted_at is null or accepted_by is not null)
);

create index tenant_invitations_manager_idx
on public.tenant_invitations (tenant_id, created_at desc);

alter table public.tenant_invitations enable row level security;
revoke all on public.tenant_invitations from anon, authenticated;
grant select on public.tenant_invitations to authenticated;

create policy tenant_invitations_select_manager
on public.tenant_invitations for select to authenticated
using (private.has_tenant_permission(tenant_id, 'users.manage'));

create or replace function private.has_system_role(
  target_tenant_id uuid,
  target_role_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    join public.membership_roles membership_role
      on membership_role.tenant_id = membership.tenant_id
      and membership_role.membership_id = membership.id
    join public.roles role
      on role.tenant_id = membership_role.tenant_id
      and role.id = membership_role.role_id
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.code = target_role_code
  );
$$;

revoke all on function private.has_system_role(uuid, text) from public;
grant execute on function private.has_system_role(uuid, text) to authenticated;

create or replace function public.save_tenant_configuration(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_tenant_name text,
  target_legal_name text,
  target_branch_name text,
  target_brand_name text,
  target_primary_color text,
  target_order_prefix text,
  target_receipt_footer text,
  target_service_charge_basis_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_value jsonb;
  after_value jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'settings.manage'
  ) then
    raise exception using errcode = '42501', message = 'settings_manage_denied';
  end if;
  if char_length(trim(coalesce(target_tenant_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(target_branch_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(target_brand_name, ''))) not between 2 and 120
    or coalesce(target_primary_color, '') !~ '^#[0-9a-fA-F]{6}$'
    or upper(trim(coalesce(target_order_prefix, ''))) !~ '^[A-Z0-9]{1,8}$'
    or target_service_charge_basis_points not between 0 and 10000
    or char_length(coalesce(target_receipt_footer, '')) > 500 then
    raise exception using errcode = 'P0001', message = 'invalid_tenant_configuration';
  end if;

  select jsonb_build_object(
    'tenantName', tenant.name,
    'legalName', tenant.legal_name,
    'branchName', branch.name,
    'settings', to_jsonb(settings)
  ) into before_value
  from public.tenants tenant
  join public.branches branch
    on branch.tenant_id = tenant.id and branch.id = target_branch_id
  left join public.tenant_settings settings on settings.tenant_id = tenant.id
  where tenant.id = target_tenant_id
  for update of tenant, branch;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_branch_not_found';
  end if;

  update public.tenants
  set name = trim(target_tenant_name),
      legal_name = nullif(trim(coalesce(target_legal_name, '')), '')
  where id = target_tenant_id;

  update public.branches
  set name = trim(target_branch_name)
  where tenant_id = target_tenant_id and id = target_branch_id;

  insert into public.tenant_settings (
    tenant_id, brand_name, primary_color, order_number_prefix,
    receipt_footer, service_charge_basis_points, updated_by
  ) values (
    target_tenant_id, trim(target_brand_name), lower(target_primary_color),
    upper(trim(target_order_prefix)),
    nullif(trim(coalesce(target_receipt_footer, '')), ''),
    target_service_charge_basis_points, actor_id
  )
  on conflict (tenant_id) do update set
    brand_name = excluded.brand_name,
    primary_color = excluded.primary_color,
    order_number_prefix = excluded.order_number_prefix,
    receipt_footer = excluded.receipt_footer,
    service_charge_basis_points = excluded.service_charge_basis_points,
    updated_by = actor_id,
    updated_at = now();

  select jsonb_build_object(
    'tenantName', tenant.name,
    'legalName', tenant.legal_name,
    'branchName', branch.name,
    'settings', to_jsonb(settings)
  ) into after_value
  from public.tenants tenant
  join public.branches branch
    on branch.tenant_id = tenant.id and branch.id = target_branch_id
  join public.tenant_settings settings on settings.tenant_id = tenant.id
  where tenant.id = target_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'tenant.settings.updated',
    'tenant_settings', target_tenant_id,
    jsonb_build_object('branchId', target_branch_id, 'before', before_value, 'after', after_value)
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

  select role.code into role_code
  from public.roles role
  where role.tenant_id = target_tenant_id and role.id = target_role_id;
  if role_code is null then
    raise exception using errcode = 'P0001', message = 'role_not_found';
  end if;
  if role_code = 'owner' and not private.has_system_role(target_tenant_id, 'owner') then
    raise exception using errcode = '42501', message = 'owner_role_assignment_denied';
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

create or replace function public.get_tenant_invitation(target_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tenantName', tenant.name,
    'branchName', branch.name,
    'roleName', role.name,
    'emailHint', left(invitation.email, 2) || '***@' || split_part(invitation.email, '@', 2),
    'expiresAt', invitation.expires_at
  )
  from public.tenant_invitations invitation
  join public.tenants tenant on tenant.id = invitation.tenant_id and tenant.is_active
  join public.branches branch
    on branch.tenant_id = invitation.tenant_id
    and branch.id = invitation.branch_id and branch.is_active
  join public.roles role
    on role.tenant_id = invitation.tenant_id and role.id = invitation.role_id
  where invitation.token_hash = encode(
    extensions.digest(coalesce(target_token, '')::text, 'sha256'::text),
    'hex'
  )
    and invitation.accepted_at is null and invitation.revoked_at is null
    and invitation.expires_at > now();
$$;

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

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (invitation.tenant_id, actor_id, 'active')
  on conflict (tenant_id, user_id) do update
  set status = 'active', updated_at = now()
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
  if (select count(distinct id) from public.branches where tenant_id = target_tenant_id and id = any(target_branch_ids))
      <> (select count(distinct value) from unnest(target_branch_ids) as value)
    or (select count(distinct id) from public.roles where tenant_id = target_tenant_id and id = any(target_role_ids))
      <> (select count(distinct value) from unnest(target_role_ids) as value) then
    raise exception using errcode = 'P0001', message = 'cross_tenant_member_access';
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
  delete from public.membership_branches
  where tenant_id = target_tenant_id and membership_id = target_membership_id;
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  select target_tenant_id, target_membership_id, value
  from (select distinct unnest(target_branch_ids) as value) values_to_add;
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

create or replace function public.provision_tenant(
  target_name text,
  target_legal_name text,
  target_slug text,
  target_branch_name text,
  target_branch_slug text,
  target_owner_email text,
  target_plan_code text,
  target_subscription_status public.subscription_status,
  target_ends_at timestamptz,
  target_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_tenant_id uuid;
  new_branch_id uuid;
  new_subscription_id uuid;
  owner_role_id uuid;
  owner_invitation_id uuid;
  owner_invitation_token text := encode(extensions.gen_random_bytes(24), 'hex');
  normalized_owner_email text := lower(trim(coalesce(target_owner_email, '')));
begin
  if actor_id is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;
  if char_length(trim(coalesce(target_name, ''))) not between 2 and 120
    or coalesce(target_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(trim(coalesce(target_branch_name, ''))) not between 2 and 120
    or coalesce(target_branch_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or normalized_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(trim(coalesce(target_plan_code, ''))) not between 2 and 40
    or (target_ends_at is not null and target_ends_at <= now()) then
    raise exception using errcode = 'P0001', message = 'invalid_tenant_provisioning_input';
  end if;

  insert into public.tenants (name, legal_name, slug, is_active)
  values (
    trim(target_name), nullif(trim(coalesce(target_legal_name, '')), ''),
    target_slug, target_subscription_status in ('trial', 'active')
  ) returning id into new_tenant_id;
  insert into public.branches (tenant_id, name, slug)
  values (new_tenant_id, trim(target_branch_name), target_branch_slug)
  returning id into new_branch_id;
  insert into public.tenant_settings (tenant_id, brand_name, updated_by)
  values (new_tenant_id, trim(target_name), actor_id);
  select id into owner_role_id from public.roles
  where tenant_id = new_tenant_id and code = 'owner';
  if owner_role_id is null then
    raise exception using errcode = 'P0001', message = 'owner_role_not_created';
  end if;
  insert into public.tenant_invitations (
    tenant_id, branch_id, role_id, email, token_hash,
    invited_by, expires_at
  ) values (
    new_tenant_id, new_branch_id, owner_role_id, normalized_owner_email,
    encode(extensions.digest(owner_invitation_token, 'sha256'::text), 'hex'), actor_id,
    now() + interval '7 days'
  ) returning id into owner_invitation_id;
  insert into public.subscriptions (
    tenant_id, plan_code, status, starts_at, ends_at, notes, created_by
  ) values (
    new_tenant_id, upper(trim(target_plan_code)), target_subscription_status,
    now(), target_ends_at, nullif(trim(coalesce(target_notes, '')), ''), actor_id
  ) returning id into new_subscription_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    new_tenant_id, actor_id, 'platform.tenant.provisioned', 'tenant', new_tenant_id,
    jsonb_build_object(
      'branchId', new_branch_id, 'subscriptionId', new_subscription_id,
      'ownerInvitationId', owner_invitation_id, 'ownerEmail', normalized_owner_email,
      'planCode', upper(trim(target_plan_code)), 'status', target_subscription_status
    )
  );
  return jsonb_build_object(
    'tenantId', new_tenant_id, 'branchId', new_branch_id,
    'tenantSlug', target_slug, 'branchSlug', target_branch_slug,
    'ownerInvitationToken', owner_invitation_token
  );
end;
$$;

create or replace function public.update_tenant_subscription(
  target_tenant_id uuid,
  target_plan_code text,
  target_status public.subscription_status,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_value jsonb;
  after_value jsonb;
  new_subscription_id uuid;
begin
  if actor_id is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;
  if char_length(trim(coalesce(target_plan_code, ''))) not between 2 and 40
    or target_starts_at is null
    or (target_ends_at is not null and target_ends_at <= target_starts_at) then
    raise exception using errcode = 'P0001', message = 'invalid_subscription_input';
  end if;

  perform 1 from public.tenants where id = target_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  select to_jsonb(subscription) into before_value
  from public.subscriptions subscription
  where subscription.tenant_id = target_tenant_id
  order by subscription.created_at desc limit 1;

  insert into public.subscriptions (
    tenant_id, plan_code, status, starts_at, ends_at, notes, created_by
  ) values (
    target_tenant_id, upper(trim(target_plan_code)), target_status,
    target_starts_at, target_ends_at,
    nullif(trim(coalesce(target_notes, '')), ''), actor_id
  ) returning id into new_subscription_id;
  update public.tenants
  set is_active = target_status in ('trial', 'active')
  where id = target_tenant_id;
  select to_jsonb(subscription) into after_value
  from public.subscriptions subscription where id = new_subscription_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'platform.subscription.updated',
    'subscription', new_subscription_id,
    jsonb_build_object('before', before_value, 'after', after_value)
  );
  return after_value;
end;
$$;

revoke all on function public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer) from public;
revoke all on function public.create_tenant_invitation(uuid, uuid, text, uuid, integer) from public;
revoke all on function public.get_tenant_invitation(text) from public;
revoke all on function public.accept_tenant_invitation(text) from public;
revoke all on function public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[]) from public;
revoke all on function public.provision_tenant(text, text, text, text, text, text, text, public.subscription_status, timestamptz, text) from public;
revoke all on function public.update_tenant_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, text) from public;

grant execute on function public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.create_tenant_invitation(uuid, uuid, text, uuid, integer) to authenticated;
grant execute on function public.get_tenant_invitation(text) to anon, authenticated;
grant execute on function public.accept_tenant_invitation(text) to authenticated;
grant execute on function public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[]) to authenticated;
grant execute on function public.provision_tenant(text, text, text, text, text, text, text, public.subscription_status, timestamptz, text) to authenticated;
grant execute on function public.update_tenant_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, text) to authenticated;

-- Membership links must only be mutated through audited, tenant-scoped functions.
revoke insert, update, delete on public.tenant_memberships,
  public.membership_branches, public.membership_roles from authenticated;

commit;
