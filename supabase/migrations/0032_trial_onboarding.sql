-- Adisyon Web / First setup and 7 day trial that starts after setup
--
-- Before: the 7 day trial started the moment the business was created.
-- Now:    the business is created in a "setup" phase (subscription row with
--         status 'trial' and NO end date). The trial starts only when the owner
--         confirms it, after the four setup steps are done:
--         halls, tables, kitchen stations, menu.
--         Setup is done either by the owner ("self") or by MK Digital Systems
--         ("assisted", limited to those same four areas).
--
-- The existing subscription system stays the single source of the trial dates:
-- starting the trial sets starts_at = now() and ends_at = now() + 7 days on the
-- existing subscription row, and the existing read-only mode takes over when it
-- ends. tenant_onboarding only stores the setup progress.
--
-- QR codes: every table already gets a random, revocable qr_token on insert
-- (migration 0010); nothing about QR changes here.
--
-- Not run against production by this file being committed: apply it yourself
-- with `supabase db push` after reviewing it.

begin;

-- ---------------------------------------------------------------------------
-- Plan presets (same numbers as src/modules/plan/usage.ts planPresets)
-- ---------------------------------------------------------------------------

create or replace function private.plan_preset(target_plan_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case upper(coalesce(target_plan_code, ''))
    when 'START' then '{"userLimit":5,"branchLimit":1,"tableLimit":15,"stationLimit":1}'::jsonb
    when 'PRO' then '{"userLimit":15,"branchLimit":1,"tableLimit":null,"stationLimit":null}'::jsonb
    when 'MULTI' then '{"userLimit":40,"branchLimit":3,"tableLimit":null,"stationLimit":null}'::jsonb
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Setup progress, one row per self-created business
-- ---------------------------------------------------------------------------

create table public.tenant_onboarding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  selected_plan text not null check (selected_plan in ('START', 'PRO', 'MULTI')),
  setup_method text check (setup_method in ('self', 'assisted')),
  status text not null default 'method_pending' check (status in (
    'method_pending',
    'self_in_progress',
    'assisted_requested',
    'info_needed',
    'assisted_in_progress',
    'setup_completed',
    'trial_ready'
  )),
  current_step smallint not null default 1 check (current_step between 1 and 4),
  completed_steps text[] not null default '{}'
    check (completed_steps <@ array['areas', 'tables', 'stations', 'menu']),
  request_payload jsonb not null default '{}'::jsonb,
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  requested_at timestamptz,
  ready_at timestamptz,
  trial_started_at timestamptz,
  trial_started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict
);

create trigger set_updated_at before update on public.tenant_onboarding
for each row execute function private.set_updated_at();

alter table public.tenant_onboarding enable row level security;

-- Readable by people who manage the business settings and by platform admins.
-- There is no insert/update/delete policy: every change goes through the
-- functions below, which check the caller and the allowed transitions.
create policy tenant_onboarding_select on public.tenant_onboarding
for select to authenticated
using (private.is_platform_admin() or private.has_tenant_permission(tenant_id, 'settings.manage'));

grant select on public.tenant_onboarding to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_tenant_owner(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    join public.membership_roles link
      on link.tenant_id = membership.tenant_id and link.membership_id = membership.id
    join public.roles role
      on role.tenant_id = link.tenant_id and role.id = link.role_id
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.code = 'owner'
  );
$$;

revoke all on function private.is_tenant_owner(uuid) from public, anon;
grant execute on function private.is_tenant_owner(uuid) to authenticated;

-- The business is still in its setup phase: trial not started yet.
create or replace function private.tenant_in_setup(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_onboarding onboarding
    join private.current_subscription(target_tenant_id) subscription
      on subscription.tenant_id = onboarding.tenant_id
    where onboarding.tenant_id = target_tenant_id
      and onboarding.trial_started_at is null
      and subscription.status = 'trial'
      and subscription.ends_at is null
  );
$$;

revoke all on function private.tenant_in_setup(uuid) from public, anon;
grant execute on function private.tenant_in_setup(uuid) to authenticated, anon;

-- What exists in the branch for each of the four setup steps.
create or replace function private.setup_readiness(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'areas', exists (
      select 1 from public.dining_areas area
      where area.tenant_id = target_tenant_id and area.branch_id = target_branch_id and area.is_active
    ),
    'tables', exists (
      select 1 from public.restaurant_tables restaurant_table
      where restaurant_table.tenant_id = target_tenant_id and restaurant_table.branch_id = target_branch_id
    ),
    'stations', exists (
      select 1 from public.kitchen_stations station
      where station.tenant_id = target_tenant_id and station.branch_id = target_branch_id and station.is_active
    ),
    'menu', exists (
      select 1
      from public.products product
      join public.menu_categories category
        on category.tenant_id = product.tenant_id and category.id = product.category_id
      where product.tenant_id = target_tenant_id
        and product.branch_id = target_branch_id
        and product.is_active
        and category.is_active
    )
  );
$$;

revoke all on function private.setup_readiness(uuid, uuid) from public, anon;
grant execute on function private.setup_readiness(uuid, uuid) to authenticated;

create or replace function private.setup_is_complete(readiness jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((readiness ->> 'areas')::boolean, false)
    and coalesce((readiness ->> 'tables')::boolean, false)
    and coalesce((readiness ->> 'stations')::boolean, false)
    and coalesce((readiness ->> 'menu')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- Operations are blocked until the trial has started
-- Setup tables (halls, tables, stations, menu, settings) stay writable.
-- ---------------------------------------------------------------------------

create or replace function private.block_operations_before_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant uuid;
begin
  if tg_op = 'DELETE' then
    target_tenant := old.tenant_id;
  else
    target_tenant := new.tenant_id;
  end if;
  if private.tenant_in_setup(target_tenant) and not private.is_platform_admin() then
    raise exception using errcode = 'P0001', message = 'tenant_setup_pending';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.block_operations_before_trial() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'orders',
    'order_items',
    'order_item_options',
    'kitchen_tickets',
    'kitchen_ticket_items',
    'payments',
    'payment_allocations',
    'cash_sessions',
    'cash_movements',
    'waiter_calls',
    'customer_order_requests'
  ] loop
    execute format(
      'create trigger %I before insert on public.%I '
      'for each row execute function private.block_operations_before_trial()',
      table_name || '_setup_pending', table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- A signed-in user creates their business. The package is validated here, on
-- the server, and the trial is NOT started: the subscription has no end date
-- until the owner starts the trial after setup.
-- ---------------------------------------------------------------------------

drop function if exists public.create_my_tenant(text, text);

create or replace function public.create_my_tenant(
  target_name text,
  target_branch_name text,
  target_plan_code text default 'START'
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
  plan_code text := upper(trim(coalesce(target_plan_code, '')));
  preset jsonb := private.plan_preset(target_plan_code);
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
  if preset is null then
    raise exception using errcode = 'P0001', message = 'invalid_plan';
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

  -- Trial subscription without an end date: setup phase, trial not started.
  insert into public.subscriptions (
    tenant_id, plan_code, status, starts_at, ends_at, created_by,
    user_limit, branch_limit, table_limit, station_limit
  ) values (
    new_tenant_id, plan_code, 'trial', now(), null, actor_id,
    (preset ->> 'userLimit')::integer,
    (preset ->> 'branchLimit')::integer,
    (preset ->> 'tableLimit')::integer,
    (preset ->> 'stationLimit')::integer
  );

  insert into public.tenant_onboarding (tenant_id, branch_id, selected_plan)
  values (new_tenant_id, new_branch_id, plan_code);

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
    jsonb_build_object('branchId', new_branch_id, 'plan', plan_code)
  );

  return jsonb_build_object(
    'tenantSlug', new_slug,
    'branchSlug', branch_slug
  );
end;
$$;

revoke all on function public.create_my_tenant(text, text, text) from public, anon;
grant execute on function public.create_my_tenant(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner actions
-- ---------------------------------------------------------------------------

create or replace function private.load_onboarding_for_owner(target_tenant_id uuid)
returns public.tenant_onboarding
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value public.tenant_onboarding;
begin
  if (select auth.uid()) is null or not private.is_tenant_owner(target_tenant_id) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;
  select * into row_value from public.tenant_onboarding
  where tenant_id = target_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'onboarding_not_found';
  end if;
  return row_value;
end;
$$;

revoke all on function private.load_onboarding_for_owner(uuid) from public, anon, authenticated;

-- Choose how setup is done. 'self' needs no data; 'assisted' carries the
-- information MK Digital Systems asks for (halls, tables, stations, menu only).
-- Switching never deletes anything that was already created.
create or replace function public.set_setup_method(
  target_tenant_id uuid,
  target_method text,
  target_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  clean_payload jsonb;
  new_status text;
begin
  row_value := private.load_onboarding_for_owner(target_tenant_id);

  if row_value.trial_started_at is not null
    or row_value.status in ('assisted_in_progress', 'setup_completed', 'trial_ready') then
    raise exception using errcode = 'P0001', message = 'setup_method_locked';
  end if;

  if target_method = 'self' then
    new_status := 'self_in_progress';
    clean_payload := row_value.request_payload;
  elsif target_method = 'assisted' then
    if jsonb_typeof(target_payload) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = 'invalid_setup_request';
    end if;
    -- Only the four allowed sections, each a bounded piece of text.
    clean_payload := jsonb_build_object(
      'areas', left(coalesce(target_payload ->> 'areas', ''), 4000),
      'tables', left(coalesce(target_payload ->> 'tables', ''), 8000),
      'stations', left(coalesce(target_payload ->> 'stations', ''), 4000),
      'menu', left(coalesce(target_payload ->> 'menu', ''), 20000),
      'notes', left(coalesce(target_payload ->> 'notes', ''), 1000)
    );
    if char_length(trim(clean_payload ->> 'areas')) = 0
      or char_length(trim(clean_payload ->> 'tables')) = 0
      or char_length(trim(clean_payload ->> 'stations')) = 0
      or char_length(trim(clean_payload ->> 'menu')) = 0 then
      raise exception using errcode = 'P0001', message = 'invalid_setup_request';
    end if;
    new_status := 'assisted_requested';
  else
    raise exception using errcode = 'P0001', message = 'invalid_setup_method';
  end if;

  update public.tenant_onboarding
  set setup_method = target_method,
      status = new_status,
      request_payload = clean_payload,
      requested_at = case when target_method = 'assisted' then now() else requested_at end
  where tenant_id = target_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_tenant_id, actor_id, 'onboarding.method_set', 'tenant', target_tenant_id,
    jsonb_build_object('method', target_method, 'from', row_value.status, 'to', new_status)
  );

  return jsonb_build_object('method', target_method, 'status', new_status);
end;
$$;

revoke all on function public.set_setup_method(uuid, text, jsonb) from public, anon;
grant execute on function public.set_setup_method(uuid, text, jsonb) to authenticated;

-- Move between the four steps of the self-service wizard (back and forth).
create or replace function public.set_setup_step(
  target_tenant_id uuid,
  target_step integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value public.tenant_onboarding;
begin
  row_value := private.load_onboarding_for_owner(target_tenant_id);
  if row_value.setup_method is distinct from 'self'
    or row_value.status not in ('self_in_progress', 'trial_ready')
    or row_value.trial_started_at is not null then
    raise exception using errcode = 'P0001', message = 'setup_step_not_allowed';
  end if;
  if target_step not between 1 and 4 then
    raise exception using errcode = 'P0001', message = 'invalid_setup_step';
  end if;

  update public.tenant_onboarding
  set current_step = target_step,
      status = 'self_in_progress',
      ready_at = null
  where tenant_id = target_tenant_id;

  return jsonb_build_object('currentStep', target_step);
end;
$$;

revoke all on function public.set_setup_step(uuid, integer) from public, anon;
grant execute on function public.set_setup_step(uuid, integer) to authenticated;

-- Mark a step done. The data has to exist; the server checks it, not the form.
create or replace function public.complete_setup_step(
  target_tenant_id uuid,
  target_step text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  readiness jsonb;
  steps text[] := array['areas', 'tables', 'stations', 'menu'];
  step_index integer := array_position(array['areas', 'tables', 'stations', 'menu'], target_step);
  done text[];
  next_status text;
  next_step integer;
begin
  row_value := private.load_onboarding_for_owner(target_tenant_id);
  if row_value.setup_method is distinct from 'self'
    or row_value.status <> 'self_in_progress'
    or row_value.trial_started_at is not null then
    raise exception using errcode = 'P0001', message = 'setup_step_not_allowed';
  end if;
  if step_index is null then
    raise exception using errcode = 'P0001', message = 'invalid_setup_step';
  end if;

  readiness := private.setup_readiness(target_tenant_id, row_value.branch_id);
  if not coalesce((readiness ->> target_step)::boolean, false) then
    raise exception using errcode = 'P0001', message = 'setup_step_incomplete';
  end if;

  done := (
    select coalesce(array_agg(distinct item order by item), '{}')
    from unnest(row_value.completed_steps || target_step) item
  );
  if cardinality(done) = 4 then
    next_status := 'trial_ready';
    next_step := 4;
  else
    next_status := 'self_in_progress';
    next_step := least(step_index + 1, 4);
  end if;

  update public.tenant_onboarding
  set completed_steps = done,
      current_step = next_step,
      status = next_status,
      ready_at = case when next_status = 'trial_ready' then now() else null end
  where tenant_id = target_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_tenant_id, actor_id, 'onboarding.step_completed', 'tenant', target_tenant_id,
    jsonb_build_object('step', target_step, 'status', next_status)
  );

  return jsonb_build_object('status', next_status, 'completedSteps', done, 'currentStep', next_step);
end;
$$;

revoke all on function public.complete_setup_step(uuid, text) from public, anon;
grant execute on function public.complete_setup_step(uuid, text) to authenticated;

-- The owner starts the 7 day trial. Once only; the end date is computed here
-- with the database clock, the client cannot influence it.
create or replace function public.start_trial(target_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  subscription_row public.subscriptions;
  started timestamptz := now();
  ends timestamptz := now() + interval '7 days';
begin
  row_value := private.load_onboarding_for_owner(target_tenant_id);

  if row_value.trial_started_at is not null then
    raise exception using errcode = 'P0001', message = 'trial_already_started';
  end if;
  if row_value.status <> 'trial_ready' then
    raise exception using errcode = 'P0001', message = 'trial_not_ready';
  end if;
  if not private.setup_is_complete(private.setup_readiness(target_tenant_id, row_value.branch_id)) then
    raise exception using errcode = 'P0001', message = 'trial_not_ready';
  end if;

  subscription_row := private.current_subscription(target_tenant_id);
  if subscription_row.id is null
    or subscription_row.status <> 'trial'
    or subscription_row.ends_at is not null then
    raise exception using errcode = 'P0001', message = 'trial_not_available';
  end if;

  update public.subscriptions
  set starts_at = started, ends_at = ends
  where id = subscription_row.id;

  update public.tenant_onboarding
  set trial_started_at = started, trial_started_by = actor_id
  where tenant_id = target_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_tenant_id, actor_id, 'onboarding.trial_started', 'subscription', subscription_row.id,
    jsonb_build_object('startsAt', started, 'endsAt', ends, 'plan', subscription_row.plan_code)
  );

  return jsonb_build_object('startsAt', started, 'endsAt', ends);
end;
$$;

revoke all on function public.start_trial(uuid) from public, anon;
grant execute on function public.start_trial(uuid) to authenticated;

-- Readiness for the screen (which steps have data), owner/manager only.
create or replace function public.get_setup_readiness(target_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branch_value uuid;
begin
  if (select auth.uid()) is null
    or not (
      private.is_platform_admin()
      or private.has_tenant_permission(target_tenant_id, 'settings.manage')
    ) then
    raise exception using errcode = '42501', message = 'setup_access_denied';
  end if;
  select branch_id into branch_value from public.tenant_onboarding
  where tenant_id = target_tenant_id;
  if branch_value is null then
    return null;
  end if;
  return private.setup_readiness(target_tenant_id, branch_value);
end;
$$;

revoke all on function public.get_setup_readiness(uuid) from public, anon;
grant execute on function public.get_setup_readiness(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform administrator: status changes and setup on behalf of the business
-- Limited to businesses that asked for assisted setup, before the trial, and to
-- the four setup areas. Every change writes an audit row with the tenant id.
-- ---------------------------------------------------------------------------

create or replace function private.load_onboarding_for_platform(target_tenant_id uuid)
returns public.tenant_onboarding
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value public.tenant_onboarding;
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;
  select * into row_value from public.tenant_onboarding
  where tenant_id = target_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'onboarding_not_found';
  end if;
  return row_value;
end;
$$;

revoke all on function private.load_onboarding_for_platform(uuid) from public, anon, authenticated;

create or replace function private.require_assisted_setup(row_value public.tenant_onboarding)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row_value.setup_method is distinct from 'assisted'
    or row_value.trial_started_at is not null
    or row_value.status not in ('assisted_requested', 'info_needed', 'assisted_in_progress') then
    raise exception using errcode = 'P0001', message = 'assisted_setup_not_open';
  end if;
end;
$$;

revoke all on function private.require_assisted_setup(public.tenant_onboarding) from public, anon, authenticated;

create or replace function public.platform_set_setup_status(
  target_tenant_id uuid,
  target_status text,
  target_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  clean_note text := nullif(trim(coalesce(target_note, '')), '');
  allowed boolean;
begin
  row_value := private.load_onboarding_for_platform(target_tenant_id);

  if row_value.setup_method is distinct from 'assisted' or row_value.trial_started_at is not null then
    raise exception using errcode = 'P0001', message = 'assisted_setup_not_open';
  end if;

  allowed := case row_value.status
    when 'assisted_requested' then target_status in ('assisted_in_progress', 'info_needed')
    when 'info_needed' then target_status in ('assisted_in_progress')
    when 'assisted_in_progress' then target_status in ('info_needed', 'setup_completed')
    when 'setup_completed' then target_status in ('assisted_in_progress', 'trial_ready')
    else false
  end;
  if not allowed then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;

  if target_status = 'info_needed'
    and (clean_note is null or char_length(clean_note) < 5) then
    raise exception using errcode = 'P0001', message = 'info_note_required';
  end if;

  -- "Ready for trial" only when all four areas really have data.
  if target_status = 'trial_ready'
    and not private.setup_is_complete(private.setup_readiness(target_tenant_id, row_value.branch_id)) then
    raise exception using errcode = 'P0001', message = 'setup_incomplete';
  end if;

  update public.tenant_onboarding
  set status = target_status,
      admin_note = case
        when target_status = 'info_needed' then clean_note
        when target_status in ('trial_ready', 'setup_completed') then null
        else admin_note
      end,
      ready_at = case when target_status = 'trial_ready' then now() else null end,
      completed_steps = case
        when target_status = 'trial_ready' then array['areas', 'tables', 'stations', 'menu']
        else completed_steps
      end
  where tenant_id = target_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_tenant_id, actor_id, 'platform.setup.status_changed', 'tenant', target_tenant_id,
    jsonb_build_object('from', row_value.status, 'to', target_status, 'note', clean_note)
  );

  return jsonb_build_object('status', target_status);
end;
$$;

revoke all on function public.platform_set_setup_status(uuid, text, text) from public, anon;
grant execute on function public.platform_set_setup_status(uuid, text, text) to authenticated;

-- The business answers an information request: back to "requested".
create or replace function public.answer_setup_info_request(
  target_tenant_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value public.tenant_onboarding;
begin
  row_value := private.load_onboarding_for_owner(target_tenant_id);
  if row_value.status <> 'info_needed' then
    raise exception using errcode = 'P0001', message = 'no_info_request';
  end if;
  return public.set_setup_method(target_tenant_id, 'assisted', target_payload);
end;
$$;

revoke all on function public.answer_setup_info_request(uuid, jsonb) from public, anon;
grant execute on function public.answer_setup_info_request(uuid, jsonb) to authenticated;

-- 1) Halls
create or replace function public.platform_setup_apply_areas(
  target_tenant_id uuid,
  target_names jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  item text;
  created integer := 0;
  affected integer;
begin
  row_value := private.load_onboarding_for_platform(target_tenant_id);
  perform private.require_assisted_setup(row_value);
  if jsonb_typeof(target_names) is distinct from 'array'
    or jsonb_array_length(target_names) not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'invalid_setup_items';
  end if;

  for item in select trim(value) from jsonb_array_elements_text(target_names) loop
    if char_length(item) not between 1 and 80 then
      raise exception using errcode = 'P0001', message = 'invalid_setup_items';
    end if;
    if not exists (
      select 1 from public.dining_areas area
      where area.tenant_id = target_tenant_id
        and area.branch_id = row_value.branch_id
        and lower(area.name) = lower(item)
    ) then
      insert into public.dining_areas (tenant_id, branch_id, name, sort_order)
      values (target_tenant_id, row_value.branch_id, item,
        (select coalesce(max(sort_order), 0) + 1 from public.dining_areas
         where tenant_id = target_tenant_id and branch_id = row_value.branch_id));
      created := created + 1;
    end if;
  end loop;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, 'platform.setup.areas_applied', 'tenant', target_tenant_id,
    jsonb_build_object('created', created, 'requested', jsonb_array_length(target_names)));
  return jsonb_build_object('created', created);
end;
$$;

-- 2) Tables: items = [{"area": "Salon", "label": "Masa 1", "capacity": 4}]
-- Each new table gets its random qr_token from the column default (migration 0010).
create or replace function public.platform_setup_apply_tables(
  target_tenant_id uuid,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  item jsonb;
  area_value uuid;
  label_value text;
  capacity_value integer;
  created integer := 0;
  affected integer;
begin
  row_value := private.load_onboarding_for_platform(target_tenant_id);
  perform private.require_assisted_setup(row_value);
  if jsonb_typeof(target_items) is distinct from 'array'
    or jsonb_array_length(target_items) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'invalid_setup_items';
  end if;

  for item in select * from jsonb_array_elements(target_items) loop
    label_value := trim(coalesce(item ->> 'label', ''));
    capacity_value := coalesce(nullif(item ->> 'capacity', '')::integer, 2);
    if char_length(label_value) not between 1 and 40 or capacity_value not between 1 and 500 then
      raise exception using errcode = 'P0001', message = 'invalid_setup_items';
    end if;
    select area.id into area_value from public.dining_areas area
    where area.tenant_id = target_tenant_id
      and area.branch_id = row_value.branch_id
      and lower(area.name) = lower(trim(coalesce(item ->> 'area', '')));
    if area_value is null then
      raise exception using errcode = 'P0001', message = 'setup_area_not_found';
    end if;
    insert into public.restaurant_tables (tenant_id, branch_id, area_id, label, capacity, sort_order)
    values (target_tenant_id, row_value.branch_id, area_value, label_value, capacity_value,
      (select coalesce(max(sort_order), 0) + 1 from public.restaurant_tables
       where tenant_id = target_tenant_id and branch_id = row_value.branch_id))
    on conflict (tenant_id, branch_id, label) do nothing;
    get diagnostics affected = row_count;
    created := created + affected;
  end loop;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, 'platform.setup.tables_applied', 'tenant', target_tenant_id,
    jsonb_build_object('created', created, 'requested', jsonb_array_length(target_items)));
  return jsonb_build_object('created', created);
end;
$$;

-- 3) Stations: items = [{"name": "Izgara", "categories": ["Ana yemek"]}]
create or replace function public.platform_setup_apply_stations(
  target_tenant_id uuid,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  item jsonb;
  station_id_value uuid;
  station_name text;
  category_name text;
  created integer := 0;
  affected integer;
begin
  row_value := private.load_onboarding_for_platform(target_tenant_id);
  perform private.require_assisted_setup(row_value);
  if jsonb_typeof(target_items) is distinct from 'array'
    or jsonb_array_length(target_items) not between 1 and 20 then
    raise exception using errcode = 'P0001', message = 'invalid_setup_items';
  end if;

  for item in select * from jsonb_array_elements(target_items) loop
    station_name := trim(coalesce(item ->> 'name', ''));
    if char_length(station_name) not between 1 and 60 then
      raise exception using errcode = 'P0001', message = 'invalid_setup_items';
    end if;
    select station.id into station_id_value from public.kitchen_stations station
    where station.tenant_id = target_tenant_id
      and station.branch_id = row_value.branch_id
      and lower(station.name) = lower(station_name);
    if station_id_value is null then
      insert into public.kitchen_stations (tenant_id, branch_id, name)
      values (target_tenant_id, row_value.branch_id, station_name)
      returning id into station_id_value;
      created := created + 1;
    end if;

    -- Route every product of the listed categories to this station.
    if jsonb_typeof(item -> 'categories') = 'array' then
      for category_name in select trim(value) from jsonb_array_elements_text(item -> 'categories') loop
        update public.products product
        set kitchen_station_id = station_id_value
        where product.tenant_id = target_tenant_id
          and product.branch_id = row_value.branch_id
          and product.category_id in (
            select category.id from public.menu_categories category
            where category.tenant_id = target_tenant_id
              and category.branch_id = row_value.branch_id
              and lower(category.name) = lower(category_name)
          );
      end loop;
    end if;
  end loop;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, 'platform.setup.stations_applied', 'tenant', target_tenant_id,
    jsonb_build_object('created', created, 'requested', jsonb_array_length(target_items)));
  return jsonb_build_object('created', created);
end;
$$;

-- 4) Menu: items = [{"category": "Içecek", "name": "Çay", "price_minor": 2500,
--                    "description": "...", "station": "Bar"}]
create or replace function public.platform_setup_apply_menu(
  target_tenant_id uuid,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_value public.tenant_onboarding;
  item jsonb;
  category_value uuid;
  category_name text;
  product_name text;
  price_value bigint;
  station_value uuid;
  station_name text;
  created integer := 0;
  affected integer;
begin
  row_value := private.load_onboarding_for_platform(target_tenant_id);
  perform private.require_assisted_setup(row_value);
  if jsonb_typeof(target_items) is distinct from 'array'
    or jsonb_array_length(target_items) not between 1 and 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_setup_items';
  end if;

  for item in select * from jsonb_array_elements(target_items) loop
    category_name := trim(coalesce(item ->> 'category', ''));
    product_name := trim(coalesce(item ->> 'name', ''));
    price_value := (item ->> 'price_minor')::bigint;
    if char_length(category_name) not between 1 and 80
      or char_length(product_name) not between 1 and 120
      or price_value is null or price_value < 0 or price_value > 100000000
      or char_length(coalesce(item ->> 'description', '')) > 500 then
      raise exception using errcode = 'P0001', message = 'invalid_setup_items';
    end if;

    select category.id into category_value from public.menu_categories category
    where category.tenant_id = target_tenant_id
      and category.branch_id = row_value.branch_id
      and lower(category.name) = lower(category_name)
    limit 1;
    if category_value is null then
      insert into public.menu_categories (tenant_id, branch_id, name, sort_order)
      values (target_tenant_id, row_value.branch_id, category_name,
        (select coalesce(max(sort_order), 0) + 1 from public.menu_categories
         where tenant_id = target_tenant_id and branch_id = row_value.branch_id))
      returning id into category_value;
    end if;

    station_value := null;
    station_name := nullif(trim(coalesce(item ->> 'station', '')), '');
    if station_name is not null then
      select station.id into station_value from public.kitchen_stations station
      where station.tenant_id = target_tenant_id
        and station.branch_id = row_value.branch_id
        and lower(station.name) = lower(station_name);
      if station_value is null then
        raise exception using errcode = 'P0001', message = 'setup_station_not_found';
      end if;
    end if;

    if not exists (
      select 1 from public.products product
      where product.tenant_id = target_tenant_id
        and product.category_id = category_value
        and lower(product.name) = lower(product_name)
    ) then
      insert into public.products (
        tenant_id, branch_id, category_id, kitchen_station_id, name, description, price_minor
      ) values (
        target_tenant_id, row_value.branch_id, category_value, station_value, product_name,
        nullif(trim(coalesce(item ->> 'description', '')), ''), price_value
      );
      created := created + 1;
    end if;
  end loop;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, 'platform.setup.menu_applied', 'tenant', target_tenant_id,
    jsonb_build_object('created', created, 'requested', jsonb_array_length(target_items)));
  return jsonb_build_object('created', created);
end;
$$;

revoke all on function public.platform_setup_apply_areas(uuid, jsonb) from public, anon;
revoke all on function public.platform_setup_apply_tables(uuid, jsonb) from public, anon;
revoke all on function public.platform_setup_apply_stations(uuid, jsonb) from public, anon;
revoke all on function public.platform_setup_apply_menu(uuid, jsonb) from public, anon;
grant execute on function public.platform_setup_apply_areas(uuid, jsonb) to authenticated;
grant execute on function public.platform_setup_apply_tables(uuid, jsonb) to authenticated;
grant execute on function public.platform_setup_apply_stations(uuid, jsonb) to authenticated;
grant execute on function public.platform_setup_apply_menu(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Plan usage tells the panel whether the business is still in setup
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
    'writable', private.tenant_is_writable(target_tenant_id),
    'setupPending', private.tenant_in_setup(target_tenant_id),
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

commit;
