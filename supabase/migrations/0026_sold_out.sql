-- MK Adisyon Web / Daily sold-out products
-- A product (or later an option) can be marked "sold out for today". It
-- re-opens by itself the next day in the branch's time zone, so nobody has to
-- remember to switch it back on. Managers and kitchen staff may mark it
-- (catalog.availability) without access to the whole menu settings.

begin;

insert into public.permissions (code, description) values
  ('catalog.availability', 'Urunu bugunluk tukendi olarak isaretleme')
on conflict (code) do nothing;

alter table public.products add column sold_out_on date;

create or replace function private.branch_today(
  target_tenant_id uuid,
  target_branch_id uuid
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone branch.timezone)::date
  from public.branches branch
  where branch.tenant_id = target_tenant_id and branch.id = target_branch_id;
$$;

revoke all on function private.branch_today(uuid, uuid) from public, anon;
grant execute on function private.branch_today(uuid, uuid) to authenticated;

create or replace function public.set_product_availability(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_product_id uuid,
  target_sold_out boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  product_name text;
  today_value date := private.branch_today(target_tenant_id, target_branch_id);
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'catalog.availability') then
    raise exception using errcode = '42501', message = 'availability_denied';
  end if;

  update public.products
  set sold_out_on = case when target_sold_out then today_value else null end
  where id = target_product_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  returning name into product_name;
  if not found then
    raise exception using errcode = 'P0001', message = 'product_not_available';
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'product.availability_changed', 'product',
    target_product_id,
    jsonb_build_object('branchId', target_branch_id, 'name', product_name, 'soldOut', target_sold_out)
  );
  return jsonb_build_object('productId', target_product_id, 'soldOut', target_sold_out);
end;
$$;

revoke all on function public.set_product_availability(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_product_availability(uuid, uuid, uuid, boolean) to authenticated;

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
          'reports.history', 'staff.view', 'shifts.manage', 'discounts.apply',
          'catalog.availability'
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
        and permission.code in ('kitchen.read', 'kitchen.update', 'staff.view', 'catalog.availability')
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

-- Re-apply the system role permissions so existing tenants get catalog.availability.
do $$
declare
  tenant_record record;
begin
  for tenant_record in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_record.id);
  end loop;
end $$;

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
      product_record.fulfillment, product_record.name, item_quantity, product_record.price_minor,
      product_record.tax_rate, product_record.price_minor * item_quantity,
      item_notes
    );
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
