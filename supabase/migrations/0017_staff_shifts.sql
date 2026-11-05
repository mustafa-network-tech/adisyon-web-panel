-- MK Adisyon Web / Staff cards and shift planning
--   * staff_profiles : non-sensitive card (position, hire date, status)
--   * staff_private  : emergency contact and notes (tenant admins only)
--   * shift_templates / shifts : weekly plan per branch (work or leave)
-- Permissions:
--   staff.view     every role  - sees their own shifts
--   shifts.manage  manager, tenant_admin, owner - plans shifts in own branches
--   staff.manage   tenant_admin, owner only     - edits staff cards
-- Also: nobody can change their own roles (needs a second person).

begin;

insert into public.permissions (code, description) values
  ('staff.view', 'Kendi vardiyalarini goruntuleme'),
  ('shifts.manage', 'Sube vardiya planini yonetme'),
  ('staff.manage', 'Personel kartlarini yonetme')
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
          'reports.history', 'staff.view', 'shifts.manage'
        )
      )
      or (
        role.code = 'cashier'
        and permission.code in (
          'tables.read', 'payments.create', 'payments.refund',
          'cash.open', 'cash.close', 'reports.read', 'staff.view'
        )
      )
      or (
        role.code = 'kitchen'
        and permission.code in ('kitchen.read', 'kitchen.update', 'staff.view')
      )
      or (
        role.code = 'waiter'
        and permission.code in (
          'tables.read', 'orders.create', 'orders.update', 'orders.cancel',
          'staff.view'
        )
      )
    )
  on conflict do nothing;
end;
$$;

-- Re-apply the system role permissions so existing tenants get the new codes.
do $$
declare
  tenant_record record;
begin
  for tenant_record in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_record.id);
  end loop;
end $$;

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

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.staff_profiles (
  tenant_id uuid not null,
  membership_id uuid not null,
  position_title text check (char_length(position_title) <= 80),
  hired_on date,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'terminated')),
  terminated_on date,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, membership_id),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create table public.staff_private (
  tenant_id uuid not null,
  membership_id uuid not null,
  emergency_contact_name text check (char_length(emergency_contact_name) <= 120),
  emergency_contact_phone text check (char_length(emergency_contact_phone) <= 40),
  notes text check (char_length(notes) <= 1000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, membership_id),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(name) between 2 and 60),
  start_time time not null,
  end_time time not null check (end_time <> start_time),
  color text not null default '#e8623a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, name),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  membership_id uuid not null,
  shift_date date not null,
  kind text not null default 'work' check (kind in ('work', 'leave')),
  start_time time,
  end_time time,
  template_id uuid,
  notes text check (char_length(notes) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (
    (kind = 'work' and start_time is not null and end_time is not null
      and start_time <> end_time)
    or (kind = 'leave' and start_time is null and end_time is null)
  ),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade,
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, template_id)
    references public.shift_templates(tenant_id, id) on delete set null (template_id)
);

create index shifts_branch_date_idx on public.shifts (tenant_id, branch_id, shift_date);
create index shifts_member_date_idx on public.shifts (tenant_id, membership_id, shift_date);

-- Every membership gets a staff card; new members get one automatically.
insert into public.staff_profiles (tenant_id, membership_id, hired_on)
select tenant_id, id, created_at::date from public.tenant_memberships
on conflict do nothing;

create or replace function private.create_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_profiles (tenant_id, membership_id, hired_on)
  values (new.tenant_id, new.id, current_date)
  on conflict do nothing;
  return new;
end;
$$;

create trigger tenant_memberships_staff_profile
after insert on public.tenant_memberships
for each row execute function private.create_staff_profile();

-- ---------------------------------------------------------------------------
-- Access: reads through RLS, every write through the functions below
-- ---------------------------------------------------------------------------

create or replace function private.shares_branch_with(
  target_tenant_id uuid,
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membership_branches branch_link
    where branch_link.tenant_id = target_tenant_id
      and branch_link.membership_id = target_membership_id
      and private.has_branch_membership(target_tenant_id, branch_link.branch_id)
  );
$$;

alter table public.staff_profiles enable row level security;
alter table public.staff_private enable row level security;
alter table public.shift_templates enable row level security;
alter table public.shifts enable row level security;
revoke all on public.staff_profiles, public.staff_private,
  public.shift_templates, public.shifts from anon, authenticated;
grant select on public.staff_profiles, public.staff_private,
  public.shift_templates, public.shifts to authenticated;

create policy staff_profiles_select
on public.staff_profiles for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_tenant_permission(tenant_id, 'staff.manage')
  or (
    private.has_tenant_permission(tenant_id, 'shifts.manage')
    and private.shares_branch_with(tenant_id, membership_id)
  )
);

create policy staff_private_select
on public.staff_private for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_tenant_permission(tenant_id, 'staff.manage')
);

create policy shift_templates_select
on public.shift_templates for select to authenticated
using (private.has_branch_membership(tenant_id, branch_id));

create policy shifts_select
on public.shifts for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_branch_permission(tenant_id, branch_id, 'shifts.manage')
);

-- ---------------------------------------------------------------------------
-- Shift templates
-- ---------------------------------------------------------------------------

create or replace function public.save_shift_template(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_template_id uuid,
  target_name text,
  target_start time,
  target_end time,
  target_color text,
  target_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'shifts.manage') then
    raise exception using errcode = '42501', message = 'shifts_manage_denied';
  end if;
  if char_length(trim(coalesce(target_name, ''))) not between 2 and 60
    or target_start is null or target_end is null or target_start = target_end
    or coalesce(target_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception using errcode = 'P0001', message = 'invalid_shift_template';
  end if;

  if target_template_id is null then
    insert into public.shift_templates (
      tenant_id, branch_id, name, start_time, end_time, color, is_active
    ) values (
      target_tenant_id, target_branch_id, trim(target_name), target_start,
      target_end, target_color, coalesce(target_is_active, true)
    ) returning id into saved_id;
  else
    update public.shift_templates
    set name = trim(target_name), start_time = target_start, end_time = target_end,
        color = target_color, is_active = coalesce(target_is_active, true),
        updated_at = now()
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = target_template_id
    returning id into saved_id;
    if saved_id is null then
      raise exception using errcode = 'P0001', message = 'shift_template_not_found';
    end if;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'shift_template.saved', 'shift_template', saved_id,
    jsonb_build_object('branchId', target_branch_id, 'name', trim(target_name))
  );
  return jsonb_build_object('id', saved_id);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'shift_template_name_taken';
end;
$$;

-- ---------------------------------------------------------------------------
-- Shifts (work or leave), planned by managers
-- ---------------------------------------------------------------------------

create or replace function public.save_shift(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_shift_id uuid,
  target_membership_id uuid,
  target_date date,
  target_kind text,
  target_start time,
  target_end time,
  target_notes text,
  target_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  member_status public.membership_status;
  new_start integer;
  new_length integer;
  saved_id uuid;
  clean_notes text := nullif(trim(coalesce(target_notes, '')), '');
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'shifts.manage') then
    raise exception using errcode = '42501', message = 'shifts_manage_denied';
  end if;
  if target_kind not in ('work', 'leave')
    or target_date is null
    or target_date < current_date - 62 or target_date > current_date + 400
    or char_length(coalesce(clean_notes, '')) > 300
    or (target_kind = 'work' and (target_start is null or target_end is null or target_start = target_end)) then
    raise exception using errcode = 'P0001', message = 'invalid_shift';
  end if;

  select membership.status into member_status
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id and membership.id = target_membership_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;
  if member_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'member_not_active';
  end if;
  if not exists (
      select 1 from public.membership_branches branch_link
      where branch_link.tenant_id = target_tenant_id
        and branch_link.membership_id = target_membership_id
        and branch_link.branch_id = target_branch_id
    ) and not exists (
      select 1 from public.membership_roles link
      join public.roles role on role.tenant_id = link.tenant_id and role.id = link.role_id
      where link.tenant_id = target_tenant_id
        and link.membership_id = target_membership_id
        and role.scope = 'tenant'
    ) then
    raise exception using errcode = 'P0001', message = 'member_not_in_branch';
  end if;
  if target_shift_id is not null and not exists (
    select 1 from public.shifts
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = target_shift_id
  ) then
    raise exception using errcode = 'P0001', message = 'shift_not_found';
  end if;
  if target_template_id is not null and not exists (
    select 1 from public.shift_templates
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = target_template_id
  ) then
    raise exception using errcode = 'P0001', message = 'shift_template_not_found';
  end if;

  if target_kind = 'leave' then
    if exists (
      select 1 from public.shifts
      where tenant_id = target_tenant_id and membership_id = target_membership_id
        and shift_date = target_date and kind = 'work'
        and id is distinct from target_shift_id
    ) then
      raise exception using errcode = 'P0001', message = 'leave_conflicts_with_shift';
    end if;
  else
    if exists (
      select 1 from public.shifts
      where tenant_id = target_tenant_id and membership_id = target_membership_id
        and shift_date = target_date and kind = 'leave'
        and id is distinct from target_shift_id
    ) then
      raise exception using errcode = 'P0001', message = 'shift_conflicts_with_leave';
    end if;

    new_start := extract(hour from target_start)::integer * 60
      + extract(minute from target_start)::integer;
    new_length := (
      extract(hour from target_end)::integer * 60
      + extract(minute from target_end)::integer
      - new_start + 1440
    ) % 1440;
    -- Overlap with this person's other shifts, including ones that run past midnight.
    if exists (
      select 1
      from (
        select
          (existing.shift_date - target_date) * 1440
            + extract(hour from existing.start_time)::integer * 60
            + extract(minute from existing.start_time)::integer as existing_start,
          (
            extract(hour from existing.end_time)::integer * 60
            + extract(minute from existing.end_time)::integer
            - extract(hour from existing.start_time)::integer * 60
            - extract(minute from existing.start_time)::integer + 1440
          ) % 1440 as existing_length
        from public.shifts existing
        where existing.tenant_id = target_tenant_id
          and existing.membership_id = target_membership_id
          and existing.kind = 'work'
          and existing.id is distinct from target_shift_id
          and existing.shift_date between target_date - 1 and target_date + 1
      ) overlap
      where overlap.existing_start < new_start + new_length
        and new_start < overlap.existing_start + overlap.existing_length
    ) then
      raise exception using errcode = 'P0001', message = 'shift_overlap';
    end if;
  end if;

  if target_shift_id is null then
    insert into public.shifts (
      tenant_id, branch_id, membership_id, shift_date, kind, start_time,
      end_time, template_id, notes, created_by
    ) values (
      target_tenant_id, target_branch_id, target_membership_id, target_date,
      target_kind,
      case when target_kind = 'work' then target_start end,
      case when target_kind = 'work' then target_end end,
      target_template_id, clean_notes, actor_id
    ) returning id into saved_id;
  else
    update public.shifts
    set membership_id = target_membership_id, shift_date = target_date,
        kind = target_kind,
        start_time = case when target_kind = 'work' then target_start end,
        end_time = case when target_kind = 'work' then target_end end,
        template_id = target_template_id, notes = clean_notes,
        updated_at = now()
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = target_shift_id
    returning id into saved_id;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id,
    case when target_shift_id is null then 'shift.created' else 'shift.updated' end,
    'shift', saved_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'membershipId', target_membership_id,
      'date', target_date, 'kind', target_kind
    )
  );
  return jsonb_build_object('id', saved_id);
end;
$$;

create or replace function public.delete_shift(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  removed record;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'shifts.manage') then
    raise exception using errcode = '42501', message = 'shifts_manage_denied';
  end if;
  delete from public.shifts
  where tenant_id = target_tenant_id and branch_id = target_branch_id
    and id = target_shift_id
  returning membership_id, shift_date, kind into removed;
  if not found then
    raise exception using errcode = 'P0001', message = 'shift_not_found';
  end if;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'shift.deleted', 'shift', target_shift_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'membershipId', removed.membership_id,
      'date', removed.shift_date, 'kind', removed.kind
    )
  );
  return jsonb_build_object('id', target_shift_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff cards (tenant admins and owners only)
-- ---------------------------------------------------------------------------

create or replace function public.save_staff_profile(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_position text,
  target_hired_on date,
  target_status text,
  target_terminated_on date,
  target_emergency_name text,
  target_emergency_phone text,
  target_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_user_id uuid;
  target_is_owner boolean;
  suspended boolean := false;
begin
  if actor_id is null
    or not private.has_tenant_permission(target_tenant_id, 'staff.manage') then
    raise exception using errcode = '42501', message = 'staff_manage_denied';
  end if;
  if target_status not in ('active', 'on_leave', 'terminated')
    or char_length(coalesce(target_position, '')) > 80
    or char_length(coalesce(target_emergency_name, '')) > 120
    or char_length(coalesce(target_emergency_phone, '')) > 40
    or char_length(coalesce(target_notes, '')) > 1000
    or (target_status = 'terminated' and target_terminated_on is null)
    or (target_status <> 'terminated' and target_terminated_on is not null)
    or (target_hired_on is not null and target_terminated_on is not null
        and target_terminated_on < target_hired_on) then
    raise exception using errcode = 'P0001', message = 'invalid_staff_profile';
  end if;

  select membership.user_id into target_user_id
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id and membership.id = target_membership_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;

  -- Leaving staff lose access immediately; owners and yourself are protected.
  if target_status = 'terminated' then
    select exists (
      select 1 from public.membership_roles link
      join public.roles role on role.tenant_id = link.tenant_id and role.id = link.role_id
      where link.tenant_id = target_tenant_id
        and link.membership_id = target_membership_id and role.code = 'owner'
    ) into target_is_owner;
    if target_user_id = actor_id or target_is_owner then
      raise exception using errcode = 'P0001', message = 'cannot_terminate_owner_or_self';
    end if;
    update public.tenant_memberships
    set status = 'suspended', updated_at = now()
    where tenant_id = target_tenant_id and id = target_membership_id
      and status <> 'suspended';
    suspended := found;
  end if;

  insert into public.staff_profiles (
    tenant_id, membership_id, position_title, hired_on, employment_status,
    terminated_on, updated_by
  ) values (
    target_tenant_id, target_membership_id,
    nullif(trim(coalesce(target_position, '')), ''), target_hired_on,
    target_status, target_terminated_on, actor_id
  )
  on conflict (tenant_id, membership_id) do update
  set position_title = excluded.position_title, hired_on = excluded.hired_on,
      employment_status = excluded.employment_status,
      terminated_on = excluded.terminated_on, updated_by = actor_id,
      updated_at = now();

  insert into public.staff_private (
    tenant_id, membership_id, emergency_contact_name, emergency_contact_phone,
    notes, updated_by
  ) values (
    target_tenant_id, target_membership_id,
    nullif(trim(coalesce(target_emergency_name, '')), ''),
    nullif(trim(coalesce(target_emergency_phone, '')), ''),
    nullif(trim(coalesce(target_notes, '')), ''), actor_id
  )
  on conflict (tenant_id, membership_id) do update
  set emergency_contact_name = excluded.emergency_contact_name,
      emergency_contact_phone = excluded.emergency_contact_phone,
      notes = excluded.notes, updated_by = actor_id, updated_at = now();

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'staff.profile_saved', 'tenant_membership',
    target_membership_id,
    jsonb_build_object('status', target_status, 'accessSuspended', suspended)
  );
  return jsonb_build_object('membershipId', target_membership_id, 'accessSuspended', suspended);
end;
$$;

-- Branch roster for planners. Members' tables are not readable by managers, so
-- this returns exactly what shift planning needs; private fields only for
-- staff.manage holders.
create or replace function public.list_branch_staff(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  see_private boolean;
begin
  if actor_id is null or not (
    private.has_branch_permission(target_tenant_id, target_branch_id, 'shifts.manage')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'staff.manage')
  ) then
    raise exception using errcode = '42501', message = 'staff_list_denied';
  end if;
  see_private := private.has_tenant_permission(target_tenant_id, 'staff.manage');

  return coalesce((
    select jsonb_agg(entry.item order by entry.sort_name)
    from (
      select
        coalesce(profile.full_name, 'Kullanici') as sort_name,
        jsonb_build_object(
          'membershipId', membership.id,
          'userId', membership.user_id,
          'fullName', coalesce(profile.full_name, 'Kullanici'),
          'phone', profile.phone,
          'status', membership.status,
          'roleNames', coalesce((
            select jsonb_agg(role.name order by role.name)
            from public.membership_roles link
            join public.roles role
              on role.tenant_id = link.tenant_id and role.id = link.role_id
            where link.tenant_id = membership.tenant_id
              and link.membership_id = membership.id
          ), '[]'::jsonb),
          'positionTitle', staff.position_title,
          'hiredOn', staff.hired_on,
          'employmentStatus', coalesce(staff.employment_status, 'active'),
          'terminatedOn', staff.terminated_on,
          'emergencyName', case when see_private then secret.emergency_contact_name end,
          'emergencyPhone', case when see_private then secret.emergency_contact_phone end,
          'notes', case when see_private then secret.notes end
        ) as item
      from public.tenant_memberships membership
      left join public.profiles profile on profile.id = membership.user_id
      left join public.staff_profiles staff
        on staff.tenant_id = membership.tenant_id and staff.membership_id = membership.id
      left join public.staff_private secret
        on secret.tenant_id = membership.tenant_id and secret.membership_id = membership.id
      where membership.tenant_id = target_tenant_id
        and (
          exists (
            select 1 from public.membership_branches branch_link
            where branch_link.tenant_id = membership.tenant_id
              and branch_link.membership_id = membership.id
              and branch_link.branch_id = target_branch_id
          )
          or exists (
            select 1 from public.membership_roles link
            join public.roles role
              on role.tenant_id = link.tenant_id and role.id = link.role_id
            where link.tenant_id = membership.tenant_id
              and link.membership_id = membership.id
              and role.scope = 'tenant'
          )
        )
    ) entry
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.save_shift_template(uuid, uuid, uuid, text, time, time, text, boolean) from public, anon;
revoke all on function public.save_shift(uuid, uuid, uuid, uuid, date, text, time, time, text, uuid) from public, anon;
revoke all on function public.delete_shift(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_branch_staff(uuid, uuid) from public, anon;
revoke all on function public.save_staff_profile(uuid, uuid, text, date, text, date, text, text, text) from public, anon;
grant execute on function public.save_shift_template(uuid, uuid, uuid, text, time, time, text, boolean) to authenticated;
grant execute on function public.save_shift(uuid, uuid, uuid, uuid, date, text, time, time, text, uuid) to authenticated;
grant execute on function public.delete_shift(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_branch_staff(uuid, uuid) to authenticated;
grant execute on function public.save_staff_profile(uuid, uuid, text, date, text, date, text, text, text) to authenticated;
revoke all on function private.shares_branch_with(uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_staff_profile() from public, anon, authenticated;

commit;
