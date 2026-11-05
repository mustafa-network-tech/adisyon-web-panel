-- MK Adisyon Web / Product options
-- Option groups (portion = variant, extras, removals) are attached to products.
-- A guest or waiter picks choices when ordering; the choices and their price
-- change are copied onto the order line (snapshots), so later menu edits never
-- rewrite an order. The price of a line is base price + the chosen price changes.
--   variant : exactly one (or none when optional), e.g. Yarım / Tam / Büyük
--   extra   : any number up to max, usually adds a price, e.g. Ekstra peynir
--   removal : any number, always free, e.g. Soğan, Turşu

begin;

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(name) between 2 and 60),
  kind text not null check (kind in ('variant', 'extra', 'removal')),
  min_select smallint not null default 0 check (min_select between 0 and 10),
  max_select smallint check (max_select between 1 and 30),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, name),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade,
  check (kind <> 'variant' or (max_select = 1 and min_select in (0, 1))),
  check (max_select is null or min_select <= max_select)
);

create table public.option_choices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  group_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  price_delta_minor bigint not null default 0
    check (price_delta_minor between -100000000 and 100000000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  sold_out_on date,
  unique (tenant_id, id),
  unique (tenant_id, group_id, name),
  foreign key (tenant_id, group_id)
    references public.option_groups(tenant_id, id) on delete cascade
);

create table public.product_option_groups (
  tenant_id uuid not null,
  product_id uuid not null,
  group_id uuid not null,
  sort_order integer not null default 0,
  primary key (tenant_id, product_id, group_id),
  foreign key (tenant_id, product_id)
    references public.products(tenant_id, id) on delete cascade,
  foreign key (tenant_id, group_id)
    references public.option_groups(tenant_id, id) on delete cascade
);

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  order_item_id uuid not null,
  choice_id uuid,
  group_name text not null,
  kind text not null check (kind in ('variant', 'extra', 'removal')),
  choice_name text not null,
  price_delta_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_item_id)
    references public.order_items(tenant_id, id) on delete cascade
);

create index order_item_options_item_idx
on public.order_item_options (tenant_id, order_item_id);
create index option_groups_branch_idx on public.option_groups (tenant_id, branch_id);
create index product_option_groups_group_idx
on public.product_option_groups (tenant_id, group_id);

-- A removal is always free; extras never lower the price.
create or replace function private.check_option_choice_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_kind text;
begin
  select option_group.kind into group_kind
  from public.option_groups option_group
  where option_group.tenant_id = new.tenant_id and option_group.id = new.group_id;
  if group_kind = 'removal' and new.price_delta_minor <> 0 then
    raise exception using errcode = 'P0001', message = 'removal_must_be_free';
  end if;
  if group_kind = 'extra' and new.price_delta_minor < 0 then
    raise exception using errcode = 'P0001', message = 'extra_cannot_discount';
  end if;
  return new;
end;
$$;

create trigger option_choices_price_rules
before insert or update on public.option_choices
for each row execute function private.check_option_choice_price();

-- JSON used by the public menu: active groups and choices of one product.
create or replace function private.product_option_json(
  target_tenant_id uuid,
  target_product_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(group_json order by group_sort, group_name), '[]'::jsonb)
  from (
    select
      option_group.sort_order as group_sort,
      option_group.name as group_name,
      jsonb_build_object(
        'id', option_group.id,
        'name', option_group.name,
        'kind', option_group.kind,
        'minSelect', option_group.min_select,
        'maxSelect', option_group.max_select,
        'choices', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', choice.id,
            'name', choice.name,
            'priceDeltaMinor', choice.price_delta_minor,
            'soldOut', choice.sold_out_on is not distinct from
              private.branch_today(option_group.tenant_id, option_group.branch_id)
          ) order by choice.sort_order, choice.name), '[]'::jsonb)
          from public.option_choices choice
          where choice.tenant_id = option_group.tenant_id
            and choice.group_id = option_group.id and choice.is_active
        )
      ) as group_json
    from public.product_option_groups link
    join public.option_groups option_group
      on option_group.tenant_id = link.tenant_id and option_group.id = link.group_id
    where link.tenant_id = target_tenant_id and link.product_id = target_product_id
      and option_group.is_active
      and exists (
        select 1 from public.option_choices active_choice
        where active_choice.tenant_id = option_group.tenant_id
          and active_choice.group_id = option_group.id and active_choice.is_active
      )
  ) groups;
$$;

revoke all on function private.product_option_json(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access: everyone in the branch reads; only menu managers write (via the RPCs below)
-- ---------------------------------------------------------------------------

alter table public.option_groups enable row level security;
alter table public.option_choices enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.order_item_options enable row level security;
revoke all on public.option_groups, public.option_choices,
  public.product_option_groups, public.order_item_options from anon, authenticated;
grant select on public.option_groups, public.option_choices,
  public.product_option_groups, public.order_item_options to authenticated;

create policy option_groups_select on public.option_groups for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));
create policy option_choices_select on public.option_choices for select to authenticated
using (exists (
  select 1 from public.option_groups option_group
  where option_group.tenant_id = option_choices.tenant_id
    and option_group.id = option_choices.group_id
    and private.has_branch_access(option_group.tenant_id, option_group.branch_id)
));
create policy product_option_groups_select on public.product_option_groups for select to authenticated
using (exists (
  select 1 from public.option_groups option_group
  where option_group.tenant_id = product_option_groups.tenant_id
    and option_group.id = product_option_groups.group_id
    and private.has_branch_access(option_group.tenant_id, option_group.branch_id)
));
create policy order_item_options_select on public.order_item_options for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

-- ---------------------------------------------------------------------------
-- Menu managers save a whole group (choices and products) in one step
-- ---------------------------------------------------------------------------

create or replace function public.save_option_group(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_group_id uuid,
  target_name text,
  target_kind text,
  target_required boolean,
  target_max_select integer,
  target_is_active boolean,
  target_choices jsonb,
  target_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid;
  choice_data jsonb;
  choice_position integer := 0;
  choice_id uuid;
  kept_ids uuid[] := '{}';
  min_value smallint;
  max_value smallint;
  clean_name text := trim(coalesce(target_name, ''));
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'catalog.manage') then
    raise exception using errcode = '42501', message = 'catalog_manage_denied';
  end if;
  if char_length(clean_name) not between 2 and 60
    or target_kind not in ('variant', 'extra', 'removal')
    or jsonb_typeof(target_choices) <> 'array'
    or jsonb_array_length(target_choices) < 1
    or jsonb_array_length(target_choices) > 40 then
    raise exception using errcode = 'P0001', message = 'invalid_option_group';
  end if;

  if target_kind = 'variant' then
    min_value := case when coalesce(target_required, false) then 1 else 0 end;
    max_value := 1;
  else
    min_value := case when coalesce(target_required, false) then 1 else 0 end;
    max_value := case when target_max_select is null then null else target_max_select::smallint end;
    if max_value is not null and (max_value < 1 or max_value > 30 or max_value < min_value) then
      raise exception using errcode = 'P0001', message = 'invalid_option_group';
    end if;
  end if;

  if target_product_ids is not null and (
    select count(*) from public.products
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = any(target_product_ids)
  ) <> cardinality(target_product_ids) then
    raise exception using errcode = 'P0001', message = 'invalid_option_group';
  end if;

  if target_group_id is null then
    insert into public.option_groups (
      tenant_id, branch_id, name, kind, min_select, max_select, is_active
    ) values (
      target_tenant_id, target_branch_id, clean_name, target_kind, min_value,
      max_value, coalesce(target_is_active, true)
    ) returning id into saved_id;
  else
    update public.option_groups
    set name = clean_name, kind = target_kind, min_select = min_value,
        max_select = max_value, is_active = coalesce(target_is_active, true),
        updated_at = now()
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and id = target_group_id
    returning id into saved_id;
    if saved_id is null then
      raise exception using errcode = 'P0001', message = 'option_group_not_found';
    end if;
  end if;

  for choice_data in select value from jsonb_array_elements(target_choices) loop
    choice_position := choice_position + 1;
    if char_length(trim(coalesce(choice_data ->> 'name', ''))) not between 1 and 60 then
      raise exception using errcode = 'P0001', message = 'invalid_option_group';
    end if;
    begin
      choice_id := nullif(choice_data ->> 'id', '')::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'invalid_option_group';
    end;
    if choice_id is not null and exists (
      select 1 from public.option_choices
      where tenant_id = target_tenant_id and id = choice_id and group_id = saved_id
    ) then
      update public.option_choices
      set name = trim(choice_data ->> 'name'),
          price_delta_minor = coalesce((choice_data ->> 'priceDeltaMinor')::bigint, 0),
          is_active = coalesce((choice_data ->> 'isActive')::boolean, true),
          sort_order = choice_position
      where tenant_id = target_tenant_id and id = choice_id;
    else
      insert into public.option_choices (
        tenant_id, group_id, name, price_delta_minor, is_active, sort_order
      ) values (
        target_tenant_id, saved_id, trim(choice_data ->> 'name'),
        coalesce((choice_data ->> 'priceDeltaMinor')::bigint, 0),
        coalesce((choice_data ->> 'isActive')::boolean, true), choice_position
      ) returning id into choice_id;
    end if;
    kept_ids := kept_ids || choice_id;
  end loop;
  -- Choices left out of the list are removed; past orders keep their own copy.
  delete from public.option_choices
  where tenant_id = target_tenant_id and group_id = saved_id
    and not (id = any(kept_ids));

  delete from public.product_option_groups
  where tenant_id = target_tenant_id and group_id = saved_id;
  insert into public.product_option_groups (tenant_id, product_id, group_id, sort_order)
  select target_tenant_id, product_id, saved_id, 0
  from unnest(coalesce(target_product_ids, '{}'::uuid[])) as product_id
  on conflict do nothing;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'option_group.saved', 'option_group', saved_id,
    jsonb_build_object('branchId', target_branch_id, 'name', clean_name, 'kind', target_kind)
  );
  return jsonb_build_object('id', saved_id);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'option_name_taken';
end;
$$;

create or replace function public.delete_option_group(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  group_name text;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'catalog.manage') then
    raise exception using errcode = '42501', message = 'catalog_manage_denied';
  end if;
  delete from public.option_groups
  where tenant_id = target_tenant_id and branch_id = target_branch_id and id = target_group_id
  returning name into group_name;
  if not found then
    raise exception using errcode = 'P0001', message = 'option_group_not_found';
  end if;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'option_group.deleted', 'option_group', target_group_id,
    jsonb_build_object('branchId', target_branch_id, 'name', group_name)
  );
  return jsonb_build_object('id', target_group_id);
end;
$$;

-- Same daily "sold out" idea for a single choice (e.g. the extra cheese ran out).
create or replace function public.set_option_choice_availability(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_choice_id uuid,
  target_sold_out boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  choice_name text;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'catalog.availability') then
    raise exception using errcode = '42501', message = 'availability_denied';
  end if;
  update public.option_choices choice
  set sold_out_on = case when target_sold_out
    then private.branch_today(target_tenant_id, target_branch_id) else null end
  from public.option_groups option_group
  where choice.tenant_id = target_tenant_id and choice.id = target_choice_id
    and option_group.tenant_id = choice.tenant_id and option_group.id = choice.group_id
    and option_group.branch_id = target_branch_id
  returning choice.name into choice_name;
  if not found then
    raise exception using errcode = 'P0001', message = 'option_not_found';
  end if;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'option_choice.availability_changed', 'option_choice',
    target_choice_id,
    jsonb_build_object('branchId', target_branch_id, 'name', choice_name, 'soldOut', target_sold_out)
  );
  return jsonb_build_object('choiceId', target_choice_id, 'soldOut', target_sold_out);
end;
$$;

revoke all on function public.save_option_group(uuid, uuid, uuid, text, text, boolean, integer, boolean, jsonb, uuid[]) from public, anon;
revoke all on function public.delete_option_group(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_option_choice_availability(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.save_option_group(uuid, uuid, uuid, text, text, boolean, integer, boolean, jsonb, uuid[]) to authenticated;
grant execute on function public.delete_option_group(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_option_choice_availability(uuid, uuid, uuid, boolean) to authenticated;

create or replace function private.insert_order_item_snapshots(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  product_record record;
  item_product_id uuid;
  item_quantity integer;
  item_notes text;
  inserted_count integer := 0;
  item_station_id uuid;
  inserted_item_id uuid;
  choice_ids uuid[];
  group_record record;
  selected_count integer;
  options_delta bigint;
  final_price bigint;
begin
  if jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) < 1
    or jsonb_array_length(target_items) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_order_items';
  end if;

  for item in select value from jsonb_array_elements(target_items) loop
    begin
      item_product_id := (item ->> 'productId')::uuid;
      item_quantity := (item ->> 'quantity')::integer;
    exception when others then
      raise exception using errcode = 'P0001', message = 'invalid_order_item';
    end;

    item_notes := nullif(trim(coalesce(item ->> 'notes', '')), '');
    if item_quantity < 1 or item_quantity > 99
      or char_length(coalesce(item_notes, '')) > 500 then
      raise exception using errcode = 'P0001', message = 'invalid_order_item';
    end if;

    select product.id, product.name, product.price_minor, product.tax_rate,
      product.kitchen_station_id,
      coalesce(product.fulfillment, category.fulfillment) as fulfillment,
      product.sold_out_on
    into product_record
    from public.products product
    join public.menu_categories category
      on category.tenant_id = product.tenant_id
      and category.id = product.category_id
    where product.id = item_product_id
      and product.tenant_id = target_tenant_id
      and product.branch_id = target_branch_id
      and product.is_active
      and category.branch_id = target_branch_id
      and category.is_active;

    if not found then
      raise exception using errcode = 'P0001', message = 'product_not_available';
    end if;

    if product_record.sold_out_on is not distinct from
      private.branch_today(target_tenant_id, target_branch_id) then
      raise exception using errcode = 'P0001', message = 'product_sold_out';
    end if;

    -- Chosen options (portion, extras, removals) are checked against the product.
    begin
      choice_ids := coalesce(array(
        select distinct value::uuid
        from jsonb_array_elements_text(coalesce(item -> 'options', '[]'::jsonb))
      ), '{}'::uuid[]);
    exception when others then
      raise exception using errcode = 'P0001', message = 'invalid_option';
    end;
    if cardinality(choice_ids) > 30 then
      raise exception using errcode = 'P0001', message = 'invalid_option';
    end if;
    if exists (
      select 1 from public.option_choices choice
      where choice.tenant_id = target_tenant_id and choice.id = any(choice_ids)
        and choice.sold_out_on is not distinct from
          private.branch_today(target_tenant_id, target_branch_id)
    ) then
      raise exception using errcode = 'P0001', message = 'option_sold_out';
    end if;
    if (
      select count(*)
      from public.option_choices choice
      join public.option_groups option_group
        on option_group.tenant_id = choice.tenant_id and option_group.id = choice.group_id
      join public.product_option_groups link
        on link.tenant_id = option_group.tenant_id and link.group_id = option_group.id
        and link.product_id = product_record.id
      where choice.tenant_id = target_tenant_id and choice.id = any(choice_ids)
        and choice.is_active and option_group.is_active
        and option_group.branch_id = target_branch_id
    ) <> cardinality(choice_ids) then
      raise exception using errcode = 'P0001', message = 'invalid_option';
    end if;
    for group_record in
      select option_group.id, option_group.min_select, option_group.max_select
      from public.product_option_groups link
      join public.option_groups option_group
        on option_group.tenant_id = link.tenant_id and option_group.id = link.group_id
      where link.tenant_id = target_tenant_id and link.product_id = product_record.id
        and option_group.is_active
    loop
      select count(*) into selected_count
      from public.option_choices choice
      where choice.tenant_id = target_tenant_id and choice.group_id = group_record.id
        and choice.id = any(choice_ids);
      if selected_count < group_record.min_select then
        raise exception using errcode = 'P0001', message = 'option_required';
      end if;
      if group_record.max_select is not null and selected_count > group_record.max_select then
        raise exception using errcode = 'P0001', message = 'option_limit';
      end if;
    end loop;
    select coalesce(sum(choice.price_delta_minor), 0) into options_delta
    from public.option_choices choice
    where choice.tenant_id = target_tenant_id and choice.id = any(choice_ids);
    final_price := product_record.price_minor + options_delta;
    if final_price < 0 then
      raise exception using errcode = 'P0001', message = 'invalid_option';
    end if;

    -- Direct-service items (water, soda...) never get a kitchen station.
    if product_record.fulfillment = 'direct' then
      item_station_id := null;
    else
      item_station_id := coalesce(
        product_record.kitchen_station_id,
        (
          select station.id from public.kitchen_stations station
          where station.tenant_id = target_tenant_id
            and station.branch_id = target_branch_id
            and station.is_active
          order by station.created_at, station.name
          limit 1
        )
      );
    end if;

    insert into public.order_items (
      tenant_id, branch_id, order_id, product_id, kitchen_station_id,
      fulfillment, product_name, quantity, unit_price_minor, tax_rate,
      line_total_minor, notes
    ) values (
      target_tenant_id, target_branch_id, target_order_id,
      product_record.id, item_station_id,
      product_record.fulfillment, product_record.name, item_quantity, final_price,
      product_record.tax_rate, final_price * item_quantity,
      item_notes
    ) returning id into inserted_item_id;

    insert into public.order_item_options (
      tenant_id, branch_id, order_item_id, choice_id, group_name, kind,
      choice_name, price_delta_minor
    )
    select target_tenant_id, target_branch_id, inserted_item_id, choice.id,
      option_group.name, option_group.kind, choice.name, choice.price_delta_minor
    from public.option_choices choice
    join public.option_groups option_group
      on option_group.tenant_id = choice.tenant_id and option_group.id = choice.group_id
    where choice.tenant_id = target_tenant_id and choice.id = any(choice_ids)
    order by option_group.sort_order, choice.sort_order;
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.get_public_menu(target_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  table_record record;
  qr_menu_enabled boolean;
  qr_ordering_enabled boolean;
  menu jsonb;
begin
  if target_token is null or target_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select t.id, t.label, t.tenant_id, t.branch_id, t.operational_status,
    b.name as branch_name, b.currency_code,
    tenant.name as tenant_name,
    coalesce(settings.brand_name, tenant.name) as brand_name
  into table_record
  from public.restaurant_tables t
  join public.branches b
    on b.tenant_id = t.tenant_id and b.id = t.branch_id and b.is_active
  join public.tenants tenant on tenant.id = t.tenant_id and tenant.is_active
  left join public.tenant_settings settings on settings.tenant_id = t.tenant_id
  where t.qr_token = target_token;

  if not found then
    return null;
  end if;

  select coalesce(s.menu_enabled, true), coalesce(s.ordering_enabled, false)
  into qr_menu_enabled, qr_ordering_enabled
  from (select 1) as one
  left join public.branch_qr_settings s
    on s.tenant_id = table_record.tenant_id
    and s.branch_id = table_record.branch_id;

  if not qr_menu_enabled then
    return null;
  end if;

  select coalesce(jsonb_agg(category_json order by category_sort, category_name), '[]'::jsonb)
  into menu
  from (
    select
      c.sort_order as category_sort,
      c.name as category_name,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'products', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'name', p.name,
              'description', p.description,
              'priceMinor', p.price_minor,
              'optionGroups', private.product_option_json(p.tenant_id, p.id),
              'soldOut', p.sold_out_on is not distinct from private.branch_today(c.tenant_id, c.branch_id),
              'orderable', (
                coalesce(p.fulfillment, c.fulfillment) = 'direct'
                or p.kitchen_station_id is not null
              )
              and p.sold_out_on is distinct from private.branch_today(c.tenant_id, c.branch_id)
            ) order by p.name
          ), '[]'::jsonb)
          from public.products p
          where p.tenant_id = c.tenant_id
            and p.branch_id = c.branch_id
            and p.category_id = c.id
            and p.is_active
        )
      ) as category_json
    from public.menu_categories c
    where c.tenant_id = table_record.tenant_id
      and c.branch_id = table_record.branch_id
      and c.is_active
  ) categories
  where jsonb_array_length(category_json -> 'products') > 0;

  return jsonb_build_object(
    'brandName', table_record.brand_name,
    'branchName', table_record.branch_name,
    'tableLabel', table_record.label,
    'currencyCode', table_record.currency_code,
    'orderingEnabled', qr_ordering_enabled
      and table_record.operational_status not in ('dirty', 'disabled'),
    'categories', menu
  );
end;
$$;

commit;
