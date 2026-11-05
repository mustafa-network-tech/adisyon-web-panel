-- MK Adisyon Web / Plan limits, kitchen stations, themes, 7 day trial
--   * subscriptions get table_limit and station_limit (NULL = unlimited);
--     inserts beyond the limit are refused in the database
--   * the self-service trial is 7 days (was 14) and starts with the limits of
--     a small plan: 15 tables, 3 kitchen stations per branch
--   * businesses manage their own kitchen stations (kitchen / grill / oven ...)
--   * tenant_settings.theme with three themes
--   * get_plan_usage tells the panel what the plan allows and what is used

begin;

alter table public.subscriptions
  add column table_limit integer check (table_limit between 1 and 100000),
  add column station_limit integer check (station_limit between 1 and 1000);

create or replace function private.current_subscription(target_tenant_id uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select subscription.*
  from public.subscriptions subscription
  where subscription.tenant_id = target_tenant_id
  order by subscription.created_at desc
  limit 1;
$$;

revoke all on function private.current_subscription(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limits are enforced where the rows are created
-- ---------------------------------------------------------------------------

create or replace function private.enforce_table_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limit_value integer;
begin
  select table_limit into limit_value from private.current_subscription(new.tenant_id);
  if limit_value is not null and (
    select count(*) from public.restaurant_tables existing
    where existing.tenant_id = new.tenant_id
  ) >= limit_value then
    raise exception using errcode = 'P0001', message = 'table_limit_reached';
  end if;
  return new;
end;
$$;

create trigger restaurant_tables_limit
before insert on public.restaurant_tables
for each row execute function private.enforce_table_limit();

create or replace function private.enforce_station_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limit_value integer;
begin
  select station_limit into limit_value from private.current_subscription(new.tenant_id);
  if limit_value is not null and (
    select count(*) from public.kitchen_stations existing
    where existing.tenant_id = new.tenant_id and existing.branch_id = new.branch_id
  ) >= limit_value then
    raise exception using errcode = 'P0001', message = 'station_limit_reached';
  end if;
  return new;
end;
$$;

create trigger kitchen_stations_limit
before insert on public.kitchen_stations
for each row execute function private.enforce_station_limit();


-- ---------------------------------------------------------------------------
-- Kitchen stations managed by the business (needs catalog.manage)
-- products on a station = the list passed in; products dropped from the list
-- move to the branch's oldest other active station so nothing is left unrouted
-- ---------------------------------------------------------------------------

create or replace function public.save_kitchen_station(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_station_id uuid,
  target_name text,
  target_color text,
  target_is_active boolean,
  target_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_name text := trim(coalesce(target_name, ''));
  saved_id uuid;
  fallback_id uuid;
  wants_active boolean := coalesce(target_is_active, true);
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'catalog.manage') then
    raise exception using errcode = '42501', message = 'catalog_manage_denied';
  end if;
  if char_length(clean_name) not between 2 and 40
    or coalesce(target_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception using errcode = 'P0001', message = 'invalid_station';
  end if;
  if target_product_ids is not null and (
    select count(*) from public.products
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = any(target_product_ids)
  ) <> cardinality(target_product_ids) then
    raise exception using errcode = 'P0001', message = 'invalid_station';
  end if;

  -- Names are unique per branch regardless of upper or lower case.
  if exists (
    select 1 from public.kitchen_stations other
    where other.tenant_id = target_tenant_id and other.branch_id = target_branch_id
      and lower(other.name) = lower(clean_name)
      and other.id is distinct from target_station_id
  ) then
    raise exception using errcode = 'P0001', message = 'station_name_taken';
  end if;

  if target_station_id is null then
    insert into public.kitchen_stations (tenant_id, branch_id, name, color, is_active)
    values (target_tenant_id, target_branch_id, clean_name, lower(target_color), wants_active)
    returning id into saved_id;
  else
    perform 1 from public.kitchen_stations
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = target_station_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'station_not_found';
    end if;
    saved_id := target_station_id;
    update public.kitchen_stations
    set name = clean_name, color = lower(target_color), is_active = wants_active,
        updated_at = now()
    where tenant_id = target_tenant_id and id = saved_id;
  end if;

  select station.id into fallback_id
  from public.kitchen_stations station
  where station.tenant_id = target_tenant_id and station.branch_id = target_branch_id
    and station.is_active and station.id <> saved_id
  order by station.created_at, station.name
  limit 1;

  if not wants_active and fallback_id is null then
    raise exception using errcode = 'P0001', message = 'last_station';
  end if;

  -- Products taken off this station (or all of them, when it is switched off).
  update public.products
  set kitchen_station_id = fallback_id
  where tenant_id = target_tenant_id and branch_id = target_branch_id
    and kitchen_station_id = saved_id
    and (not wants_active or not (id = any(coalesce(target_product_ids, '{}'::uuid[]))))
    and fulfillment is distinct from 'direct';

  if wants_active then
    update public.products
    set kitchen_station_id = saved_id
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = any(coalesce(target_product_ids, '{}'::uuid[]))
      and fulfillment is distinct from 'direct';
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id,
    case when target_station_id is null then 'kitchen_station.created' else 'kitchen_station.updated' end,
    'kitchen_station', saved_id,
    jsonb_build_object('branchId', target_branch_id, 'name', clean_name, 'active', wants_active)
  );
  return jsonb_build_object('id', saved_id);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'station_name_taken';
end;
$$;

revoke all on function public.save_kitchen_station(uuid, uuid, uuid, text, text, boolean, uuid[]) from public, anon;
grant execute on function public.save_kitchen_station(uuid, uuid, uuid, text, text, boolean, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Themes
-- ---------------------------------------------------------------------------

alter table public.tenant_settings
  add column theme text not null default 'classic'
    check (theme in ('classic', 'ocean', 'burgundy'));

create or replace function public.set_tenant_theme(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_theme text
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
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'settings.manage') then
    raise exception using errcode = '42501', message = 'settings_manage_denied';
  end if;
  if target_theme not in ('classic', 'ocean', 'burgundy') then
    raise exception using errcode = 'P0001', message = 'invalid_theme';
  end if;
  update public.tenant_settings
  set theme = target_theme, updated_by = actor_id, updated_at = now()
  where tenant_id = target_tenant_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'tenant.theme.changed', 'tenant', target_tenant_id,
    jsonb_build_object('theme', target_theme)
  );
  return jsonb_build_object('theme', target_theme);
end;
$$;

revoke all on function public.set_tenant_theme(uuid, uuid, text) from public, anon;
grant execute on function public.set_tenant_theme(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What the plan allows and what is already used (any member of the branch)
-- ---------------------------------------------------------------------------

create or replace function public.get_plan_usage(
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
  subscription_row public.subscriptions;
begin
  if (select auth.uid()) is null
    or not private.has_branch_membership(target_tenant_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'plan_usage_denied';
  end if;
  subscription_row := private.current_subscription(target_tenant_id);
  return jsonb_build_object(
    'planCode', subscription_row.plan_code,
    'status', subscription_row.status,
    'endsAt', subscription_row.ends_at,
    'userLimit', subscription_row.user_limit,
    'branchLimit', subscription_row.branch_limit,
    'tableLimit', subscription_row.table_limit,
    'stationLimit', subscription_row.station_limit,
    'tablesUsed', (select count(*) from public.restaurant_tables where tenant_id = target_tenant_id),
    'stationsUsed', (
      select count(*) from public.kitchen_stations
      where tenant_id = target_tenant_id and branch_id = target_branch_id
    )
  );
end;
$$;

revoke all on function public.get_plan_usage(uuid, uuid) from public, anon;
grant execute on function public.get_plan_usage(uuid, uuid) to authenticated;


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
    user_limit, branch_limit, table_limit, station_limit
  ) values (
    new_tenant_id, 'TRIAL', 'trial', now(), now() + interval '7 days',
    actor_id, 5, 1, 15, 3
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

create or replace function public.update_tenant_subscription(
  target_tenant_id uuid,
  target_plan_code text,
  target_status public.subscription_status,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_notes text,
  target_user_limit integer,
  target_branch_limit integer,
  target_table_limit integer,
  target_station_limit integer
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
    or target_branch_limit not between 1 and 1000
    or (target_table_limit is not null and target_table_limit not between 1 and 100000)
    or (target_station_limit is not null and target_station_limit not between 1 and 1000) then
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
    user_limit, branch_limit, table_limit, station_limit
  ) values (
    target_tenant_id, upper(trim(target_plan_code)), target_status,
    target_starts_at, target_ends_at,
    nullif(trim(coalesce(target_notes, '')), ''), actor_id,
    target_user_limit, target_branch_limit, target_table_limit, target_station_limit
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
  integer, integer, integer, integer
) from public, anon;
grant execute on function public.update_tenant_subscription(
  uuid, text, public.subscription_status, timestamptz, timestamptz, text,
  integer, integer, integer, integer
) to authenticated;

commit;
