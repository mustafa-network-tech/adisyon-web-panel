-- MK Adisyon Web / Self-service onboarding and subscription limits
-- Users sign up and create their own business. The platform admin no longer
-- creates tenants; it only assigns plans and limits to existing ones.

begin;

-- ---------------------------------------------------------------------------
-- Subscription limits
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column user_limit integer not null default 5 check (user_limit between 1 and 10000),
  add column branch_limit integer not null default 1 check (branch_limit between 1 and 1000);

-- ---------------------------------------------------------------------------
-- A signed-in user creates their own business (trial plan, owner role)
-- ---------------------------------------------------------------------------

create or replace function public.create_my_tenant(
  target_name text,
  target_branch_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_name text := trim(coalesce(target_name, ''));
  clean_branch text := trim(coalesce(target_branch_name, ''));
  base_slug text;
  new_slug text;
  attempt integer := 0;
  new_tenant_id uuid;
  new_branch_id uuid;
  new_membership_id uuid;
  owner_role_id uuid;
  branch_slug text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(clean_name) not between 2 and 120
    or char_length(clean_branch) not between 2 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_business_input';
  end if;

  -- One self-created business per account.
  if exists (
    select 1
    from public.tenant_memberships membership
    join public.membership_roles link
      on link.tenant_id = membership.tenant_id
      and link.membership_id = membership.id
    join public.roles role
      on role.tenant_id = link.tenant_id and role.id = link.role_id
    where membership.user_id = actor_id and role.code = 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'tenant_already_owned';
  end if;

  base_slug := trim(both '-' from regexp_replace(
    lower(translate(clean_name, 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')),
    '[^a-z0-9]+', '-', 'g'
  ));
  base_slug := left(base_slug, 40);
  if base_slug = '' then base_slug := 'isletme'; end if;
  new_slug := base_slug;
  while exists (select 1 from public.tenants where slug = new_slug) loop
    attempt := attempt + 1;
    if attempt > 8 then
      raise exception using errcode = 'P0001', message = 'slug_generation_failed';
    end if;
    new_slug := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;

  branch_slug := trim(both '-' from regexp_replace(
    lower(translate(clean_branch, 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')),
    '[^a-z0-9]+', '-', 'g'
  ));
  branch_slug := left(branch_slug, 40);
  if branch_slug = '' then branch_slug := 'merkez'; end if;

  -- The tenant insert trigger provisions the system roles.
  insert into public.tenants (name, slug, is_active)
  values (clean_name, new_slug, true)
  returning id into new_tenant_id;

  insert into public.branches (tenant_id, name, slug)
  values (new_tenant_id, clean_branch, branch_slug)
  returning id into new_branch_id;

  insert into public.tenant_settings (tenant_id, brand_name, updated_by)
  values (new_tenant_id, clean_name, actor_id);

  insert into public.subscriptions (
    tenant_id, plan_code, status, starts_at, ends_at, created_by,
    user_limit, branch_limit
  ) values (
    new_tenant_id, 'TRIAL', 'trial', now(), now() + interval '14 days',
    actor_id, 5, 1
  );

  select id into owner_role_id from public.roles
  where tenant_id = new_tenant_id and code = 'owner';
  if owner_role_id is null then
    raise exception using errcode = 'P0001', message = 'owner_role_not_created';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (new_tenant_id, actor_id, 'active')
  returning id into new_membership_id;
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  values (new_tenant_id, new_membership_id, new_branch_id);
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  values (new_tenant_id, new_membership_id, owner_role_id);

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    new_tenant_id, actor_id, 'tenant.self_created', 'tenant', new_tenant_id,
    jsonb_build_object('branchId', new_branch_id)
  );

  return jsonb_build_object(
    'tenantSlug', new_slug,
    'branchSlug', branch_slug
  );
end;
$$;

revoke all on function public.create_my_tenant(text, text) from public, anon;
grant execute on function public.create_my_tenant(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform admins no longer create tenants
-- ---------------------------------------------------------------------------

drop function if exists public.provision_tenant(
  text, text, text, text, text, text, text,
  public.subscription_status, timestamptz, text
);

-- ---------------------------------------------------------------------------
-- Plan + limits assignment (replaces the 6-argument version)
-- ---------------------------------------------------------------------------

drop function if exists public.update_tenant_subscription(
  uuid, text, public.subscription_status, timestamptz, timestamptz, text
);

create or replace function public.update_tenant_subscription(
  target_tenant_id uuid,
  target_plan_code text,
  target_status public.subscription_status,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_notes text,
  target_user_limit integer,
  target_branch_limit integer
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
    or (target_ends_at is not null and target_ends_at <= target_starts_at)
    or target_user_limit not between 1 and 10000
    or target_branch_limit not between 1 and 1000 then
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
    tenant_id, plan_code, status, starts_at, ends_at, notes, created_by,
    user_limit, branch_limit
  ) values (
    target_tenant_id, upper(trim(target_plan_code)), target_status,
    target_starts_at, target_ends_at,
    nullif(trim(coalesce(target_notes, '')), ''), actor_id,
    target_user_limit, target_branch_limit
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

revoke all on function public.update_tenant_subscription(
  uuid, text, public.subscription_status, timestamptz, timestamptz, text,
  integer, integer
) from public, anon;
grant execute on function public.update_tenant_subscription(
  uuid, text, public.subscription_status, timestamptz, timestamptz, text,
  integer, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce the user limit when inviting
-- ---------------------------------------------------------------------------

create or replace function private.enforce_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_limit integer;
  used_seats integer;
begin
  select subscription.user_limit into current_limit
  from public.subscriptions subscription
  where subscription.tenant_id = new.tenant_id
  order by subscription.created_at desc
  limit 1;

  if current_limit is null then
    return new;
  end if;

  select
    (select count(*) from public.tenant_memberships membership
      where membership.tenant_id = new.tenant_id
        and membership.status in ('active', 'invited'))
    + (select count(*) from public.tenant_invitations invitation
      where invitation.tenant_id = new.tenant_id
        and invitation.accepted_at is null
        and invitation.revoked_at is null
        and invitation.expires_at > now()
        and invitation.id <> new.id)
  into used_seats;

  if used_seats >= current_limit then
    raise exception using errcode = 'P0001', message = 'user_limit_reached';
  end if;
  return new;
end;
$$;

create trigger tenant_invitations_user_limit
before insert on public.tenant_invitations
for each row execute function private.enforce_user_limit();

-- ---------------------------------------------------------------------------
-- Platform admin: see registered members and attach them to a business
-- ---------------------------------------------------------------------------

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
