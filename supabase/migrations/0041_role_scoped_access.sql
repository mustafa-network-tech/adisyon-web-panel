-- MK Adisyon Web / 0041: role based data access, multi-branch members, branch reactivation, read-only mode
--
-- 1) Role based reads. Until now every active member of a branch could read orders, tables and the cash
--    registers of that branch through the REST API; only the menus hid the screens. Restrictive SELECT
--    policies (AND-ed with the existing branch policies, nothing is removed) now follow the roles:
--      waiter   tables, orders, kitchen ticket status         (no kitchen board data beyond status, no cash desk)
--      kitchen  only the orders that have a ticket for the kitchen, their items, their table label
--               (no table layout, no other orders, no cash desk, no payments)
--      cashier  tables, orders, the cash desk
--    An active platform support session keeps the access it had.
-- 2) A branch manager can no longer change the role or status of a member who also works in a branch he does
--    not manage (roles and status are valid in every branch); he may still edit the assignments of his own
--    branches. Reactivating a member now checks the package user limit (serialised per business).
-- 3) An owner can switch a branch on again (set_branch_active); reactivation respects the branch limit.
-- 4) branches and cash_registers obey the read-only mode like every other table.
-- 5) platform_assign_member uses the same user limit check; set_member_extras accepts only the permissions
--    the screen offers (settings, catalog, users, history reports, attendance, payroll, discounts at the cash
--    desk, product availability).
--
-- ROLLBACK: the restrictive policies can be dropped one by one (all are named *_role_read_restrict /
-- branches_select_inactive_for_owner); the function bodies are replaced by newer versions of 0036/0037.

begin;

-- helpers -------------------------------------------------------------------------------------------------------
create or replace function private.can_read_orders(target_tenant_id uuid, target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_branch_permission(target_tenant_id, target_branch_id, 'tables.read')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'orders.create')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'orders.update')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'orders.cancel')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'payments.create')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'cash.open')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'cash.close')
    or private.has_branch_permission(target_tenant_id, target_branch_id, 'reports.read')
    or private.is_platform_support_active(target_tenant_id, target_branch_id);
$$;

-- the kitchen reads an order only when it has a ticket for the kitchen
create or replace function private.kitchen_sees_order(target_tenant_id uuid, target_branch_id uuid, target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_branch_permission(target_tenant_id, target_branch_id, 'kitchen.read')
    and exists (
      select 1 from public.kitchen_tickets ticket
      where ticket.tenant_id = target_tenant_id and ticket.order_id = target_order_id
    );
$$;

create or replace function private.kitchen_sees_table(target_tenant_id uuid, target_branch_id uuid, target_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_branch_permission(target_tenant_id, target_branch_id, 'kitchen.read')
    and exists (
      select 1
      from public.kitchen_tickets ticket
      join public.orders ticket_order
        on ticket_order.tenant_id = ticket.tenant_id and ticket_order.id = ticket.order_id
      where ticket.tenant_id = target_tenant_id and ticket_order.table_id = target_table_id
    );
$$;

revoke all on function private.can_read_orders(uuid, uuid) from public, anon;
revoke all on function private.kitchen_sees_order(uuid, uuid, uuid) from public, anon;
revoke all on function private.kitchen_sees_table(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_read_orders(uuid, uuid) to authenticated;
grant execute on function private.kitchen_sees_order(uuid, uuid, uuid) to authenticated;
grant execute on function private.kitchen_sees_table(uuid, uuid, uuid) to authenticated;

-- restrictive SELECT policies -----------------------------------------------------------------------------------
create policy orders_role_read_restrict
on public.orders as restrictive for select to authenticated
using (private.can_read_orders(tenant_id, branch_id) or private.kitchen_sees_order(tenant_id, branch_id, id));

create policy order_items_role_read_restrict
on public.order_items as restrictive for select to authenticated
using (private.can_read_orders(tenant_id, branch_id) or private.kitchen_sees_order(tenant_id, branch_id, order_id));

create policy order_item_options_role_read_restrict
on public.order_item_options as restrictive for select to authenticated
using (private.can_read_orders(tenant_id, branch_id) or private.has_branch_permission(tenant_id, branch_id, 'kitchen.read'));

create policy order_status_history_role_read_restrict
on public.order_status_history as restrictive for select to authenticated
using (private.can_read_orders(tenant_id, branch_id));

create policy restaurant_tables_role_read_restrict
on public.restaurant_tables as restrictive for select to authenticated
using (
  private.can_read_orders(tenant_id, branch_id)
  or private.has_branch_permission(tenant_id, branch_id, 'settings.manage')
  or private.kitchen_sees_table(tenant_id, branch_id, id)
);

create policy dining_areas_role_read_restrict
on public.dining_areas as restrictive for select to authenticated
using (
  private.can_read_orders(tenant_id, branch_id)
  or private.has_branch_permission(tenant_id, branch_id, 'settings.manage')
);

create policy kitchen_tickets_role_read_restrict
on public.kitchen_tickets as restrictive for select to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'kitchen.read')
  or private.has_branch_permission(tenant_id, branch_id, 'orders.create')
  or private.has_branch_permission(tenant_id, branch_id, 'orders.update')
  or private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.is_platform_support_active(tenant_id, branch_id)
);

create policy cash_registers_role_read_restrict
on public.cash_registers as restrictive for select to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.open')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.has_branch_permission(tenant_id, branch_id, 'settings.manage')
  or private.is_platform_support_active(tenant_id, branch_id)
);

-- members, roles, branches --------------------------------------------------------------------------------------
create or replace function public.update_tenant_member_access(target_tenant_id uuid, target_membership_id uuid, target_status membership_status, target_branch_ids uuid[], target_role_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- 0041: roles and the status are valid in every branch of the business. A member who also works in
    -- branches this actor does not manage can only have his assignments inside the actor's own branches edited.
    if exists (
      select 1 from public.membership_branches link
      where link.tenant_id = target_tenant_id and link.membership_id = target_membership_id
        and not private.has_branch_membership(target_tenant_id, link.branch_id)
    ) and (
      before_value ->> 'status' <> target_status::text
      or coalesce((
        select array_agg(role_id order by role_id) from public.membership_roles
        where tenant_id = target_tenant_id and membership_id = target_membership_id
      ), '{}'::uuid[]) is distinct from coalesce((
        select array_agg(distinct value order by value) from unnest(target_role_ids) as value
      ), '{}'::uuid[])
    ) then
      raise exception using errcode = '42501', message = 'member_spans_other_branches';
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

  -- 0041: a member that becomes active again counts against the package user limit (checked, serialised)
  if target_status = 'active' and before_value ->> 'status' <> 'active' then
    perform private.assert_user_limit(target_tenant_id, target_membership_id);
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
$function$;

create or replace function public.platform_assign_member(target_user_id uuid, target_tenant_id uuid, target_role_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- 0041: the same serialised limit check as every other way of activating a member
  perform private.assert_user_limit(target_tenant_id, (
    select id from public.tenant_memberships
    where tenant_id = target_tenant_id and user_id = target_user_id
  ));

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
$function$;

-- extra permissions are limited to the list the screen offers (same list as the validation schema)
create or replace function public.set_member_extras(target_tenant_id uuid, target_membership_id uuid, target_permission_codes text[], target_station_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    or exists (
      select 1 from unnest(coalesce(target_permission_codes, '{}')) as value
      where value <> all (array[
        'settings.manage', 'catalog.manage', 'users.manage', 'reports.history',
        'attendance.manage', 'payroll.manage', 'discounts.apply', 'catalog.availability'
      ])
    )
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
$function$;

-- branches and cash registers obey the read-only mode like the other tables
create trigger branches_read_only
before insert or update or delete on public.branches
for each row execute function private.block_writes_when_read_only();
create trigger cash_registers_read_only
before insert or update or delete on public.cash_registers
for each row execute function private.block_writes_when_read_only();

-- an inactive branch can also be switched on again by the direct path only within the plan's branch limit
create trigger branches_reactivation_limit
before update of is_active on public.branches
for each row when (new.is_active and not old.is_active)
execute function private.enforce_branch_limit();

-- the owner (tenant scope) may see inactive branches, otherwise he could never switch one on again
create policy branches_select_inactive_for_owner
on public.branches for select to authenticated
using (
  not is_active
  and private.is_tenant_scope_member(tenant_id)
  and private.has_tenant_permission(tenant_id, 'settings.manage')
);

create or replace function public.set_branch_active(target_tenant_id uuid, target_branch_id uuid, target_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  branch_record record;
begin
  if actor_id is null
    or not private.is_tenant_scope_member(target_tenant_id)
    or not private.has_tenant_permission(target_tenant_id, 'settings.manage') then
    raise exception using errcode = '42501', message = 'branch_manage_denied';
  end if;
  if not private.tenant_is_writable(target_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_read_only';
  end if;
  select id, is_active into branch_record
  from public.branches
  where tenant_id = target_tenant_id and id = target_branch_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'branch_not_found';
  end if;
  if branch_record.is_active = target_active then
    return jsonb_build_object('branchId', target_branch_id, 'isActive', target_active);
  end if;
  if not target_active and (
    select count(*) from public.branches where tenant_id = target_tenant_id and is_active
  ) <= 1 then
    raise exception using errcode = 'P0001', message = 'last_branch_required';
  end if;
  -- switching on again goes through the branch limit trigger (branch_limit_reached)
  update public.branches set is_active = target_active where tenant_id = target_tenant_id and id = target_branch_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, case when target_active then 'tenant.branch_reactivated' else 'tenant.branch_deactivated' end,
    'branch', target_branch_id, '{}'::jsonb);
  return jsonb_build_object('branchId', target_branch_id, 'isActive', target_active);
end;
$$;
revoke all on function public.set_branch_active(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_branch_active(uuid, uuid, boolean) to authenticated;

commit;
