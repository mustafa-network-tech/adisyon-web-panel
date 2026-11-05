-- Adisyon Web / Free-text setup request and platform setup for any business
--
-- 1) The setup request is one free-text box ("Salon 8 masa, bahçe 3 masa,
--    kola 25 lira ..."). The four separate sections are no longer required.
-- 2) Information also arrives by WhatsApp or e-mail. A platform administrator can
--    therefore create or edit halls, tables, kitchen stations and the menu for
--    ANY business (also one without a setup request, and also after its trial
--    started), still limited to those four areas. Every call is audited with the
--    tenant id. Read-only mode does not stop platform administrators (0031).
-- 3) A platform administrator can take over a business that has not chosen a
--    method yet ("MK prepares it"), so the owner can start the trial afterwards.
--
-- Run after 0032. Not applied to production by committing this file.

begin;

-- ---------------------------------------------------------------------------
-- 1) Request payload: `details` (free text) is enough
-- ---------------------------------------------------------------------------

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
    -- Only these keys are kept, each a bounded piece of text.
    clean_payload := jsonb_build_object(
      'details', left(coalesce(target_payload ->> 'details', ''), 20000),
      'areas', left(coalesce(target_payload ->> 'areas', ''), 4000),
      'tables', left(coalesce(target_payload ->> 'tables', ''), 8000),
      'stations', left(coalesce(target_payload ->> 'stations', ''), 4000),
      'menu', left(coalesce(target_payload ->> 'menu', ''), 20000),
      'notes', left(coalesce(target_payload ->> 'notes', ''), 1000)
    );
    if char_length(trim(clean_payload ->> 'details')) < 5
      and (
        char_length(trim(clean_payload ->> 'areas')) = 0
        or char_length(trim(clean_payload ->> 'tables')) = 0
        or char_length(trim(clean_payload ->> 'stations')) = 0
        or char_length(trim(clean_payload ->> 'menu')) = 0
      ) then
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

-- ---------------------------------------------------------------------------
-- 2) Platform setup for any business: the branch to work on
-- ---------------------------------------------------------------------------

create or replace function private.platform_setup_branch(target_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  branch_value uuid;
begin
  if (select auth.uid()) is null or not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;
  -- The setup branch when there is a setup record, else the first active branch.
  select coalesce(
    (select onboarding.branch_id from public.tenant_onboarding onboarding where onboarding.tenant_id = target_tenant_id),
    (select branch.id from public.branches branch
     where branch.tenant_id = target_tenant_id and branch.is_active
     order by branch.created_at limit 1)
  ) into branch_value;
  if branch_value is null then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  return branch_value;
end;
$$;

revoke all on function private.platform_setup_branch(uuid) from public, anon, authenticated;

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
  branch_value uuid := private.platform_setup_branch(target_tenant_id);
  item text;
  created integer := 0;
begin
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
        and area.branch_id = branch_value
        and lower(area.name) = lower(item)
    ) then
      insert into public.dining_areas (tenant_id, branch_id, name, sort_order)
      values (target_tenant_id, branch_value, item,
        (select coalesce(max(sort_order), 0) + 1 from public.dining_areas
         where tenant_id = target_tenant_id and branch_id = branch_value));
      created := created + 1;
    end if;
  end loop;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, 'platform.setup.areas_applied', 'tenant', target_tenant_id,
    jsonb_build_object('created', created, 'requested', jsonb_array_length(target_names)));
  return jsonb_build_object('created', created);
end;
$$;

-- 2) Tables (each new table gets its random qr_token from the column default)
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
  branch_value uuid := private.platform_setup_branch(target_tenant_id);
  item jsonb;
  area_value uuid;
  label_value text;
  capacity_value integer;
  created integer := 0;
  affected integer;
begin
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
      and area.branch_id = branch_value
      and lower(area.name) = lower(trim(coalesce(item ->> 'area', '')));
    if area_value is null then
      raise exception using errcode = 'P0001', message = 'setup_area_not_found';
    end if;
    insert into public.restaurant_tables (tenant_id, branch_id, area_id, label, capacity, sort_order)
    values (target_tenant_id, branch_value, area_value, label_value, capacity_value,
      (select coalesce(max(sort_order), 0) + 1 from public.restaurant_tables
       where tenant_id = target_tenant_id and branch_id = branch_value))
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

-- 3) Stations
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
  branch_value uuid := private.platform_setup_branch(target_tenant_id);
  item jsonb;
  station_id_value uuid;
  station_name text;
  category_name text;
  created integer := 0;
begin
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
      and station.branch_id = branch_value
      and lower(station.name) = lower(station_name);
    if station_id_value is null then
      insert into public.kitchen_stations (tenant_id, branch_id, name)
      values (target_tenant_id, branch_value, station_name)
      returning id into station_id_value;
      created := created + 1;
    end if;

    if jsonb_typeof(item -> 'categories') = 'array' then
      for category_name in select trim(value) from jsonb_array_elements_text(item -> 'categories') loop
        update public.products product
        set kitchen_station_id = station_id_value
        where product.tenant_id = target_tenant_id
          and product.branch_id = branch_value
          and product.category_id in (
            select category.id from public.menu_categories category
            where category.tenant_id = target_tenant_id
              and category.branch_id = branch_value
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

-- 4) Menu
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
  branch_value uuid := private.platform_setup_branch(target_tenant_id);
  item jsonb;
  category_value uuid;
  category_name text;
  product_name text;
  price_value bigint;
  station_value uuid;
  station_name text;
  created integer := 0;
begin
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

    category_value := null;
    select category.id into category_value from public.menu_categories category
    where category.tenant_id = target_tenant_id
      and category.branch_id = branch_value
      and lower(category.name) = lower(category_name)
    limit 1;
    if category_value is null then
      insert into public.menu_categories (tenant_id, branch_id, name, sort_order)
      values (target_tenant_id, branch_value, category_name,
        (select coalesce(max(sort_order), 0) + 1 from public.menu_categories
         where tenant_id = target_tenant_id and branch_id = branch_value))
      returning id into category_value;
    end if;

    station_value := null;
    station_name := nullif(trim(coalesce(item ->> 'station', '')), '');
    if station_name is not null then
      select station.id into station_value from public.kitchen_stations station
      where station.tenant_id = target_tenant_id
        and station.branch_id = branch_value
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
        target_tenant_id, branch_value, category_value, station_value, product_name,
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

-- ---------------------------------------------------------------------------
-- 3) Platform status changes: MK can take over a business that is still in setup
-- ---------------------------------------------------------------------------

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
  taking_over boolean;
begin
  row_value := private.load_onboarding_for_platform(target_tenant_id);

  if row_value.trial_started_at is not null then
    raise exception using errcode = 'P0001', message = 'assisted_setup_not_open';
  end if;

  -- A business that has not asked for help yet (message arrived by WhatsApp /
  -- e-mail) can be taken over by MK; the owner still starts the trial.
  taking_over := row_value.setup_method is distinct from 'assisted'
    and row_value.status in ('method_pending', 'self_in_progress');
  if row_value.setup_method is distinct from 'assisted' and not taking_over then
    raise exception using errcode = 'P0001', message = 'assisted_setup_not_open';
  end if;

  allowed := case row_value.status
    when 'method_pending' then target_status = 'assisted_in_progress'
    when 'self_in_progress' then target_status = 'assisted_in_progress'
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

  if target_status = 'trial_ready'
    and not private.setup_is_complete(private.setup_readiness(target_tenant_id, row_value.branch_id)) then
    raise exception using errcode = 'P0001', message = 'setup_incomplete';
  end if;

  update public.tenant_onboarding
  set status = target_status,
      setup_method = 'assisted',
      requested_at = coalesce(requested_at, case when taking_over then now() end),
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
    jsonb_build_object('from', row_value.status, 'to', target_status, 'note', clean_note, 'takeover', taking_over)
  );

  return jsonb_build_object('status', target_status);
end;
$$;

commit;
