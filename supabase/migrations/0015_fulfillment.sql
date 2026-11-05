-- MK Adisyon Web / Fulfillment (preparation place)
-- Categories and products can be marked "direct": served without the kitchen
-- (water, soda...). Direct items never create kitchen tickets or need a station.
-- Product value NULL = inherit from its category. The default stays 'kitchen'.

begin;

alter table public.menu_categories
  add column fulfillment text not null default 'kitchen'
    check (fulfillment in ('kitchen', 'direct'));

alter table public.products
  add column fulfillment text
    check (fulfillment is null or fulfillment in ('kitchen', 'direct'));

alter table public.order_items
  add column fulfillment text not null default 'kitchen'
    check (fulfillment in ('kitchen', 'direct'));

-- Direct products carry no station; kitchen products fall back to the default.
create or replace function private.default_product_station()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective text;
begin
  select coalesce(new.fulfillment, category.fulfillment) into effective
  from public.menu_categories category
  where category.tenant_id = new.tenant_id and category.id = new.category_id;

  if effective = 'direct' then
    new.kitchen_station_id := null;
  elsif new.kitchen_station_id is null then
    select station.id into new.kitchen_station_id
    from public.kitchen_stations station
    where station.tenant_id = new.tenant_id
      and station.branch_id = new.branch_id
      and station.is_active
    order by station.created_at, station.name
    limit 1;
  end if;
  return new;
end;
$$;

-- Order status after a submit. New kitchen tickets mean the order waits for the
-- kitchen. With none (direct items only) it follows the existing tickets, and
-- an order without any ticket is immediately served (payable at the cashier).
create or replace function private.post_submit_status(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  new_ticket_count integer
)
returns public.order_status
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ticket_total integer;
  served_total integer;
  ready_total integer;
  started_total integer;
begin
  if new_ticket_count > 0 then
    return 'submitted';
  end if;
  select count(*),
    count(*) filter (where status = 'served'),
    count(*) filter (where status in ('ready', 'served')),
    count(*) filter (where status <> 'new')
  into ticket_total, served_total, ready_total, started_total
  from public.kitchen_tickets
  where tenant_id = target_tenant_id
    and branch_id = target_branch_id
    and order_id = target_order_id
    and status <> 'cancelled';

  if ticket_total = 0 or served_total = ticket_total then return 'served'; end if;
  if ready_total = ticket_total then return 'ready'; end if;
  if started_total > 0 then return 'in_progress'; end if;
  return 'submitted';
end;
$$;

revoke all on function private.post_submit_status(uuid, uuid, uuid, integer)
from public, anon, authenticated;

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
      coalesce(product.fulfillment, category.fulfillment) as fulfillment
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

create or replace function public.submit_order(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_expected_version integer,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_record record;
  existing_command record;
  station_record record;
  new_ticket_id uuid;
  submission_id uuid := gen_random_uuid();
  ticket_count integer := 0;
  next_version integer;
  next_status public.order_status;
  response_payload jsonb;
begin
  if actor_id is null
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'orders.update'
    ) then
    raise exception using errcode = '42501', message = 'order_submit_denied';
  end if;
  if char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_idempotency_key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || actor_id::text || ':' || target_idempotency_key,
    0
  ));
  select command_type, response into existing_command
  from public.order_commands
  where tenant_id = target_tenant_id
    and actor_user_id = actor_id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_command.command_type <> 'submit_order' then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_command.response;
  end if;

  select id, version, status into order_record
  from public.orders
  where id = target_order_id
    and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;
  if not found or order_record.status in ('closed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'order_not_submittable';
  end if;
  if order_record.version <> target_expected_version then
    raise exception using errcode = 'P0001', message = 'order_version_conflict';
  end if;
  if not exists (
    select 1 from public.order_items
    where tenant_id = target_tenant_id
      and branch_id = target_branch_id
      and order_id = target_order_id
      and quantity > sent_quantity
  ) then
    raise exception using errcode = 'P0001', message = 'order_has_no_pending_items';
  end if;
  if exists (
    select 1 from public.order_items
    where tenant_id = target_tenant_id
      and branch_id = target_branch_id
      and order_id = target_order_id
      and quantity > sent_quantity
      and fulfillment = 'kitchen'
      and kitchen_station_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'product_station_required';
  end if;

  for station_record in
    select distinct kitchen_station_id
    from public.order_items
    where tenant_id = target_tenant_id
      and branch_id = target_branch_id
      and order_id = target_order_id
      and quantity > sent_quantity
      and fulfillment = 'kitchen'
  loop
    insert into public.kitchen_tickets (
      tenant_id, branch_id, order_id, kitchen_station_id, status
    ) values (
      target_tenant_id, target_branch_id, target_order_id,
      station_record.kitchen_station_id, 'new'
    ) returning id into new_ticket_id;

    insert into public.kitchen_ticket_items (
      tenant_id, ticket_id, order_item_id, quantity
    )
    select target_tenant_id, new_ticket_id, item.id,
      item.quantity - item.sent_quantity
    from public.order_items item
    where item.tenant_id = target_tenant_id
      and item.branch_id = target_branch_id
      and item.order_id = target_order_id
      and item.kitchen_station_id = station_record.kitchen_station_id
      and item.quantity > item.sent_quantity;
    ticket_count := ticket_count + 1;
  end loop;

  update public.order_items
  set sent_quantity = quantity
  where tenant_id = target_tenant_id
    and branch_id = target_branch_id
    and order_id = target_order_id
    and quantity > sent_quantity;

  next_status := private.post_submit_status(
    target_tenant_id, target_branch_id, target_order_id, ticket_count
  );
  update public.orders
  set status = next_status, version = version + 1
  where tenant_id = target_tenant_id and id = target_order_id
  returning version into next_version;

  response_payload := jsonb_build_object(
    'orderId', target_order_id,
    'status', next_status,
    'version', next_version,
    'submissionId', submission_id,
    'ticketCount', ticket_count
  );
  insert into public.order_commands (
    tenant_id, branch_id, order_id, actor_user_id,
    idempotency_key, command_type, response
  ) values (
    target_tenant_id, target_branch_id, target_order_id, actor_id,
    target_idempotency_key, 'submit_order', response_payload
  );
  if order_record.status <> next_status then
    insert into public.order_status_history (
      tenant_id, branch_id, order_id, status, actor_user_id, metadata
    ) values (
      target_tenant_id, target_branch_id, target_order_id, next_status,
      actor_id, jsonb_build_object('submissionId', submission_id)
    );
  end if;
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'order.submitted', 'order', target_order_id,
    jsonb_build_object(
      'branchId', target_branch_id,
      'submissionId', submission_id,
      'ticketCount', ticket_count,
      'version', next_version
    )
  );
  return response_payload;
end;
$$;

create or replace function public.place_customer_order(
  target_token text,
  target_items jsonb,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_record record;
  qr_ordering_enabled boolean;
  existing_request record;
  order_record record;
  station_record record;
  new_ticket_id uuid;
  target_order_id uuid;
  target_order_number bigint;
  next_version integer;
  next_status public.order_status;
  ticket_count integer := 0;
  recent_requests integer;
  response_payload jsonb;
begin
  if target_token is null or target_token !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_qr_request';
  end if;

  select t.id, t.tenant_id, t.branch_id, t.operational_status
  into table_record
  from public.restaurant_tables t
  join public.branches b
    on b.tenant_id = t.tenant_id and b.id = t.branch_id and b.is_active
  join public.tenants tenant on tenant.id = t.tenant_id and tenant.is_active
  where t.qr_token = target_token
  for update of t;

  if not found then
    raise exception using errcode = 'P0001', message = 'qr_not_found';
  end if;

  select coalesce(s.ordering_enabled, false)
  into qr_ordering_enabled
  from (select 1) as one
  left join public.branch_qr_settings s
    on s.tenant_id = table_record.tenant_id
    and s.branch_id = table_record.branch_id;

  if not qr_ordering_enabled then
    raise exception using errcode = 'P0001', message = 'qr_ordering_disabled';
  end if;
  if table_record.operational_status in ('dirty', 'disabled') then
    raise exception using errcode = 'P0001', message = 'table_not_available';
  end if;

  -- The table row is locked above, so requests for one table are serialised.
  select response into existing_request
  from public.customer_order_requests
  where table_id = table_record.id
    and idempotency_key = target_idempotency_key;
  if found then
    return existing_request.response;
  end if;

  select count(*) into recent_requests
  from public.customer_order_requests
  where table_id = table_record.id
    and created_at > now() - interval '60 seconds';
  if recent_requests >= 3 then
    raise exception using errcode = 'P0001', message = 'qr_rate_limited';
  end if;

  select id, version into order_record
  from public.orders
  where tenant_id = table_record.tenant_id
    and branch_id = table_record.branch_id
    and table_id = table_record.id
    and status in ('draft', 'open', 'submitted', 'in_progress', 'ready', 'served')
  for update;

  if found then
    target_order_id := order_record.id;
  else
    perform pg_advisory_xact_lock(hashtextextended(
      table_record.tenant_id::text || ':' || table_record.branch_id::text
        || ':order-number',
      0
    ));
    select coalesce(max(order_number), 0) + 1 into target_order_number
    from public.orders
    where tenant_id = table_record.tenant_id
      and branch_id = table_record.branch_id;

    insert into public.orders (
      tenant_id, branch_id, table_id, order_number, status,
      guest_count, created_by, source
    ) values (
      table_record.tenant_id, table_record.branch_id, table_record.id,
      target_order_number, 'open', 1, null, 'qr'
    ) returning id into target_order_id;
  end if;

  -- Validates the payload and snapshots product name/price/tax. Rows created
  -- here share now() as created_at, which identifies this customer's items.
  perform private.insert_order_item_snapshots(
    table_record.tenant_id, table_record.branch_id, target_order_id,
    target_items
  );

  if exists (
    select 1 from public.order_items
    where tenant_id = table_record.tenant_id
      and order_id = target_order_id
      and created_at = now()
      and fulfillment = 'kitchen'
      and kitchen_station_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'product_station_required';
  end if;

  for station_record in
    select distinct kitchen_station_id
    from public.order_items
    where tenant_id = table_record.tenant_id
      and order_id = target_order_id
      and created_at = now()
      and fulfillment = 'kitchen'
  loop
    insert into public.kitchen_tickets (
      tenant_id, branch_id, order_id, kitchen_station_id, status
    ) values (
      table_record.tenant_id, table_record.branch_id, target_order_id,
      station_record.kitchen_station_id, 'new'
    ) returning id into new_ticket_id;

    insert into public.kitchen_ticket_items (
      tenant_id, ticket_id, order_item_id, quantity
    )
    select table_record.tenant_id, new_ticket_id, item.id, item.quantity
    from public.order_items item
    where item.tenant_id = table_record.tenant_id
      and item.order_id = target_order_id
      and item.created_at = now()
      and item.kitchen_station_id = station_record.kitchen_station_id;
    ticket_count := ticket_count + 1;
  end loop;

  update public.order_items
  set sent_quantity = quantity
  where tenant_id = table_record.tenant_id
    and order_id = target_order_id
    and created_at = now();

  perform private.refresh_order_totals(
    table_record.tenant_id, target_order_id, false
  );

  next_status := private.post_submit_status(
    table_record.tenant_id, table_record.branch_id, target_order_id, ticket_count
  );
  update public.orders
  set status = next_status, version = version + 1
  where tenant_id = table_record.tenant_id and id = target_order_id
  returning version, order_number into next_version, target_order_number;

  insert into public.order_status_history (
    tenant_id, branch_id, order_id, status, actor_user_id, metadata
  ) values (
    table_record.tenant_id, table_record.branch_id, target_order_id,
    next_status, null, jsonb_build_object('source', 'qr')
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    table_record.tenant_id, null, 'order.customer_submitted', 'order',
    target_order_id,
    jsonb_build_object(
      'branchId', table_record.branch_id,
      'tableId', table_record.id,
      'ticketCount', ticket_count
    )
  );

  response_payload := jsonb_build_object(
    'orderNumber', target_order_number,
    'ticketCount', ticket_count
  );

  insert into public.customer_order_requests (
    tenant_id, branch_id, table_id, order_id, idempotency_key, response
  ) values (
    table_record.tenant_id, table_record.branch_id, table_record.id,
    target_order_id, target_idempotency_key, response_payload
  );

  return response_payload;
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
              'orderable', (
                coalesce(p.fulfillment, c.fulfillment) = 'direct'
                or p.kitchen_station_id is not null
              )
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
