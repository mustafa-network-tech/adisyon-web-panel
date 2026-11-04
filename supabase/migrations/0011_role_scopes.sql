-- MK Adisyon Web / Role model
--   Tenant scope : Isletme Sahibi (owner), Isletme Yoneticisi (tenant_admin)
--   Branch scope : Mudur (manager), Kasa (cashier), Mutfak (kitchen), Garson (waiter)
-- Adds role scope, per-member permission grants, kitchen station scope and
-- the "cashier sees only today" rule.

begin;

-- ---------------------------------------------------------------------------
-- Scope, permissions and the canonical role set
-- ---------------------------------------------------------------------------

alter table public.roles
  add column scope text not null default 'branch'
    check (scope in ('tenant', 'branch'));

insert into public.permissions (code, description) values
  ('reports.history', 'Gecmis gun raporlarini ve kasa gecmisini goruntuleme')
on conflict (code) do nothing;

create or replace function private.ensure_system_roles(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.roles (tenant_id, code, name, is_system, scope)
  select target_tenant_id, role_data.code, role_data.name, true, role_data.scope
  from (values
    ('owner', 'İşletme Sahibi', 'tenant'),
    ('tenant_admin', 'İşletme Yöneticisi', 'tenant'),
    ('manager', 'Müdür', 'branch'),
    ('cashier', 'Kasa', 'branch'),
    ('kitchen', 'Mutfak', 'branch'),
    ('waiter', 'Garson', 'branch')
  ) as role_data(code, name, scope)
  on conflict (tenant_id, code) do update
  set name = excluded.name, is_system = true, scope = excluded.scope;

  delete from public.role_permissions role_permission
  using public.roles role
  where role_permission.tenant_id = target_tenant_id
    and role_permission.role_id = role.id
    and role.is_system
    and role.code in (
      'owner', 'tenant_admin', 'manager', 'cashier', 'kitchen', 'waiter'
    );

  insert into public.role_permissions (tenant_id, role_id, permission_id)
  select target_tenant_id, role.id, permission.id
  from public.roles role
  cross join public.permissions permission
  where role.tenant_id = target_tenant_id
    and role.is_system
    and (
      role.code in ('owner', 'tenant_admin')
      or (
        role.code = 'manager'
        and permission.code in (
          'tables.read', 'orders.create', 'orders.update', 'orders.cancel',
          'kitchen.read', 'kitchen.update', 'payments.create',
          'payments.refund', 'cash.open', 'cash.close', 'reports.read',
          'reports.history'
        )
      )
      or (
        role.code = 'cashier'
        and permission.code in (
          'tables.read', 'payments.create', 'payments.refund',
          'cash.open', 'cash.close', 'reports.read'
        )
      )
      or (
        role.code = 'kitchen'
        and permission.code in ('kitchen.read', 'kitchen.update')
      )
      or (
        role.code = 'waiter'
        and permission.code in (
          'tables.read', 'orders.create', 'orders.update', 'orders.cancel'
        )
      )
    )
  on conflict do nothing;
end;
$$;

do $$
declare
  tenant_record record;
begin
  for tenant_record in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_record.id);
  end loop;
end $$;

-- The previous "manager" role was named Isletme Yoneticisi and held every
-- management permission. Keep those members' access by moving them to the new
-- tenant_admin role; "manager" now means branch manager (Mudur).
update public.membership_roles link
set role_id = admin_role.id
from public.roles old_role, public.roles admin_role
where old_role.tenant_id = link.tenant_id
  and old_role.id = link.role_id
  and old_role.code = 'manager'
  and admin_role.tenant_id = old_role.tenant_id
  and admin_role.code = 'tenant_admin'
  and not exists (
    select 1 from public.membership_roles existing
    where existing.tenant_id = link.tenant_id
      and existing.membership_id = link.membership_id
      and existing.role_id = admin_role.id
  );

update public.tenant_invitations invitation
set role_id = admin_role.id
from public.roles old_role, public.roles admin_role
where old_role.tenant_id = invitation.tenant_id
  and old_role.id = invitation.role_id
  and old_role.code = 'manager'
  and admin_role.tenant_id = old_role.tenant_id
  and admin_role.code = 'tenant_admin'
  and invitation.accepted_at is null
  and invitation.revoked_at is null;

-- Viewer is retired. Keep it only where somebody still holds it.
delete from public.roles role
where role.code = 'viewer'
  and not exists (
    select 1 from public.membership_roles link
    where link.tenant_id = role.tenant_id and link.role_id = role.id
  )
  and not exists (
    select 1 from public.tenant_invitations invitation
    where invitation.tenant_id = role.tenant_id and invitation.role_id = role.id
  );

-- ---------------------------------------------------------------------------
-- Per-member extra permissions and kitchen station scope
-- ---------------------------------------------------------------------------

create table public.membership_permission_grants (
  tenant_id uuid not null,
  membership_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, membership_id, permission_id),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create table public.membership_kitchen_stations (
  tenant_id uuid not null,
  membership_id uuid not null,
  station_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, membership_id, station_id),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, station_id)
    references public.kitchen_stations(tenant_id, id) on delete cascade
);

alter table public.membership_permission_grants enable row level security;
alter table public.membership_kitchen_stations enable row level security;
revoke all on public.membership_permission_grants,
  public.membership_kitchen_stations from anon, authenticated;
grant select on public.membership_permission_grants,
  public.membership_kitchen_stations to authenticated;

create policy membership_permission_grants_select
on public.membership_permission_grants for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_tenant_permission(tenant_id, 'users.manage')
);

create policy membership_kitchen_stations_select
on public.membership_kitchen_stations for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_tenant_permission(tenant_id, 'users.manage')
);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

-- Role permissions plus per-member grants.
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
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        exists (
          select 1
          from public.membership_roles membership_role
          join public.role_permissions role_permission
            on role_permission.tenant_id = membership_role.tenant_id
            and role_permission.role_id = membership_role.role_id
          join public.permissions permission
            on permission.id = role_permission.permission_id
          where membership_role.tenant_id = membership.tenant_id
            and membership_role.membership_id = membership.id
            and permission.code = target_permission
        )
        or exists (
          select 1
          from public.membership_permission_grants grant_row
          join public.permissions permission
            on permission.id = grant_row.permission_id
          where grant_row.tenant_id = membership.tenant_id
            and grant_row.membership_id = membership.id
            and permission.code = target_permission
        )
      )
  );
$$;

-- True when the caller holds a tenant-scope role (owner / tenant_admin).
create or replace function private.is_tenant_scope_member(target_tenant_id uuid)
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
    join public.membership_roles link
      on link.tenant_id = membership.tenant_id
      and link.membership_id = membership.id
    join public.roles role
      on role.tenant_id = link.tenant_id and role.id = link.role_id
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.scope = 'tenant'
  );
$$;

-- Tenant-scope roles reach every active branch (including future ones);
-- branch-scope roles reach only their assigned branches.
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
    join public.branches branch
      on branch.tenant_id = membership.tenant_id
      and branch.id = target_branch_id and branch.is_active
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        exists (
          select 1
          from public.membership_branches membership_branch
          where membership_branch.tenant_id = membership.tenant_id
            and membership_branch.membership_id = membership.id
            and membership_branch.branch_id = target_branch_id
        )
        or exists (
          select 1
          from public.membership_roles link
          join public.roles role
            on role.tenant_id = link.tenant_id and role.id = link.role_id
          where link.tenant_id = membership.tenant_id
            and link.membership_id = membership.id
            and role.scope = 'tenant'
        )
      )
  );
$$;

create or replace function private.can_view_history(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_branch_permission(
      target_tenant_id, target_branch_id, 'reports.history'
    )
    or private.is_platform_support_active(target_tenant_id, target_branch_id);
$$;

create or replace function private.branch_day_start(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (date_trunc('day', now() at time zone branch.timezone))
    at time zone branch.timezone
  from public.branches branch
  where branch.tenant_id = target_tenant_id and branch.id = target_branch_id;
$$;

create or replace function private.order_is_active(
  target_tenant_id uuid,
  target_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders item
    where item.tenant_id = target_tenant_id
      and item.id = target_order_id
      and item.status in (
        'draft', 'open', 'submitted', 'in_progress', 'ready', 'served'
      )
  );
$$;

create or replace function private.cash_session_is_open(
  target_tenant_id uuid,
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cash_sessions item
    where item.tenant_id = target_tenant_id
      and item.id = target_session_id
      and item.status = 'open'
  );
$$;

-- Kitchen users without station rows see the whole branch; with station rows
-- only those stations.
create or replace function private.can_access_kitchen_station(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_station_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_platform_support_active(target_tenant_id, target_branch_id)
    or not exists (
      select 1
      from public.tenant_memberships membership
      join public.membership_kitchen_stations assigned
        on assigned.tenant_id = membership.tenant_id
        and assigned.membership_id = membership.id
      join public.kitchen_stations station
        on station.tenant_id = assigned.tenant_id
        and station.id = assigned.station_id
        and station.branch_id = target_branch_id
      where membership.tenant_id = target_tenant_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
    or exists (
      select 1
      from public.tenant_memberships membership
      join public.membership_kitchen_stations assigned
        on assigned.tenant_id = membership.tenant_id
        and assigned.membership_id = membership.id
      where membership.tenant_id = target_tenant_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and assigned.station_id = target_station_id
    );
$$;

revoke all on function private.is_tenant_scope_member(uuid),
  private.can_view_history(uuid, uuid),
  private.branch_day_start(uuid, uuid),
  private.order_is_active(uuid, uuid),
  private.cash_session_is_open(uuid, uuid),
  private.can_access_kitchen_station(uuid, uuid, uuid)
from public;
grant execute on function private.is_tenant_scope_member(uuid),
  private.can_view_history(uuid, uuid),
  private.branch_day_start(uuid, uuid),
  private.order_is_active(uuid, uuid),
  private.cash_session_is_open(uuid, uuid),
  private.can_access_kitchen_station(uuid, uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Kasa sees only today: restrictive policies layered over branch access
-- ---------------------------------------------------------------------------

create policy payments_history_restrict on public.payments
as restrictive for select to authenticated
using (
  private.can_view_history(tenant_id, branch_id)
  or coalesce(paid_at, created_at) >= private.branch_day_start(tenant_id, branch_id)
  or private.order_is_active(tenant_id, order_id)
);

create policy payment_refunds_history_restrict on public.payment_refunds
as restrictive for select to authenticated
using (
  private.can_view_history(tenant_id, branch_id)
  or created_at >= private.branch_day_start(tenant_id, branch_id)
  or private.cash_session_is_open(tenant_id, cash_session_id)
);

create policy cash_sessions_history_restrict on public.cash_sessions
as restrictive for select to authenticated
using (
  private.can_view_history(tenant_id, branch_id)
  or status = 'open'
  or coalesce(closed_at, opened_at) >= private.branch_day_start(tenant_id, branch_id)
);

create policy cash_movements_history_restrict on public.cash_movements
as restrictive for select to authenticated
using (
  created_at >= (
    select private.branch_day_start(session.tenant_id, session.branch_id)
    from public.cash_sessions session
    where session.tenant_id = cash_movements.tenant_id
      and session.id = cash_movements.cash_session_id
  )
  or private.cash_session_is_open(tenant_id, cash_session_id)
  or exists (
    select 1 from public.cash_sessions session
    where session.tenant_id = cash_movements.tenant_id
      and session.id = cash_movements.cash_session_id
      and private.can_view_history(session.tenant_id, session.branch_id)
  )
);

-- ---------------------------------------------------------------------------
-- Kitchen station scope
-- ---------------------------------------------------------------------------

create policy kitchen_tickets_station_restrict on public.kitchen_tickets
as restrictive for select to authenticated
using (
  private.can_access_kitchen_station(tenant_id, branch_id, kitchen_station_id)
);

create or replace function private.enforce_kitchen_station_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and not private.can_access_kitchen_station(
      new.tenant_id, new.branch_id, new.kitchen_station_id
    ) then
    raise exception using errcode = '42501', message = 'kitchen_station_denied';
  end if;
  return new;
end;
$$;

create trigger kitchen_tickets_station_scope
before update on public.kitchen_tickets
for each row execute function private.enforce_kitchen_station_scope();

-- ---------------------------------------------------------------------------
-- Privilege-escalation guards for team management
-- ---------------------------------------------------------------------------

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

-- Tenant-scope managers grant extra permissions; kitchen stations may be set
-- by anyone who can manage the team.
create or replace function public.set_member_extras(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_permission_codes text[],
  target_station_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not private.has_tenant_permission(target_tenant_id, 'users.manage')
    or not private.is_tenant_scope_member(target_tenant_id) then
    raise exception using errcode = '42501', message = 'member_extras_denied';
  end if;
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = target_tenant_id and id = target_membership_id
  ) then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;
  if (select count(*) from public.permissions
      where code = any(coalesce(target_permission_codes, '{}')))
     <> (select count(distinct value)
         from unnest(coalesce(target_permission_codes, '{}')) as value)
    or (select count(*) from public.kitchen_stations
        where tenant_id = target_tenant_id
          and id = any(coalesce(target_station_ids, '{}')))
       <> (select count(distinct value)
           from unnest(coalesce(target_station_ids, '{}')) as value) then
    raise exception using errcode = 'P0001', message = 'invalid_member_extras';
  end if;

  delete from public.membership_permission_grants
  where tenant_id = target_tenant_id and membership_id = target_membership_id;
  insert into public.membership_permission_grants (
    tenant_id, membership_id, permission_id, granted_by
  )
  select target_tenant_id, target_membership_id, permission.id, actor_id
  from public.permissions permission
  where permission.code = any(coalesce(target_permission_codes, '{}'));

  delete from public.membership_kitchen_stations
  where tenant_id = target_tenant_id and membership_id = target_membership_id;
  insert into public.membership_kitchen_stations (
    tenant_id, membership_id, station_id
  )
  select target_tenant_id, target_membership_id, value
  from (select distinct unnest(coalesce(target_station_ids, '{}')) as value) ids;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'tenant.member_extras.updated',
    'tenant_membership', target_membership_id,
    jsonb_build_object(
      'permissions', to_jsonb(coalesce(target_permission_codes, '{}')),
      'stationIds', to_jsonb(coalesce(target_station_ids, '{}'))
    )
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_member_extras(uuid, uuid, text[], uuid[])
from public, anon;
grant execute on function public.set_member_extras(uuid, uuid, text[], uuid[])
to authenticated;

commit;
