-- MK Adisyon Web / QR menu
-- Per-table QR tokens, branch-level "customers may order" switch, and
-- anonymous (token-gated) menu read + customer order placement.

begin;

-- ---------------------------------------------------------------------------
-- Per-table secret QR token
-- ---------------------------------------------------------------------------

alter table public.restaurant_tables
  add column qr_token text not null
    default replace(gen_random_uuid()::text, '-', '')
         || replace(gen_random_uuid()::text, '-', '');

alter table public.restaurant_tables
  add constraint restaurant_tables_qr_token_unique unique (qr_token),
  add constraint restaurant_tables_qr_token_format
    check (qr_token ~ '^[0-9a-f]{64}$');

-- ---------------------------------------------------------------------------
-- Branch QR settings
-- ---------------------------------------------------------------------------

create table public.branch_qr_settings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  menu_enabled boolean not null default true,
  ordering_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, branch_id),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade
);

create trigger set_updated_at before update on public.branch_qr_settings
for each row execute function private.set_updated_at();

alter table public.branch_qr_settings enable row level security;
revoke all on public.branch_qr_settings from anon, authenticated;
grant select on public.branch_qr_settings to authenticated;

create policy branch_qr_settings_select_branch
on public.branch_qr_settings for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

-- ---------------------------------------------------------------------------
-- Orders placed by customers have no staff actor
-- ---------------------------------------------------------------------------

alter table public.orders
  alter column created_by drop not null,
  add column source text not null default 'staff'
    check (source in ('staff', 'qr'));

alter table public.order_status_history
  alter column actor_user_id drop not null;

create table public.customer_order_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  table_id uuid not null,
  order_id uuid not null,
  idempotency_key text not null
    check (char_length(idempotency_key) between 16 and 120),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (table_id, idempotency_key),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade,
  foreign key (tenant_id, table_id)
    references public.restaurant_tables(tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_id)
    references public.orders(tenant_id, id) on delete cascade
);

create index customer_order_requests_table_created_idx
on public.customer_order_requests (table_id, created_at desc);

alter table public.customer_order_requests enable row level security;
revoke all on public.customer_order_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: switch ordering on/off and rotate a table token
-- ---------------------------------------------------------------------------

create or replace function public.set_branch_qr_settings(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_ordering_enabled boolean
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
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'settings.manage'
    ) then
    raise exception using errcode = '42501', message = 'qr_settings_denied';
  end if;

  insert into public.branch_qr_settings (
    tenant_id, branch_id, ordering_enabled, updated_by
  ) values (
    target_tenant_id, target_branch_id, target_ordering_enabled, actor_id
  )
  on conflict (tenant_id, branch_id) do update
  set ordering_enabled = excluded.ordering_enabled,
      updated_by = excluded.updated_by;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'qr.ordering_changed', 'branch',
    target_branch_id,
    jsonb_build_object('orderingEnabled', target_ordering_enabled)
  );

  return jsonb_build_object('orderingEnabled', target_ordering_enabled);
end;
$$;

create or replace function public.rotate_table_qr_token(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_token text := replace(gen_random_uuid()::text, '-', '')
                 || replace(gen_random_uuid()::text, '-', '');
begin
  if actor_id is null
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'settings.manage'
    ) then
    raise exception using errcode = '42501', message = 'qr_settings_denied';
  end if;

  update public.restaurant_tables
  set qr_token = new_token
  where id = target_table_id
    and tenant_id = target_tenant_id
    and branch_id = target_branch_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'table_not_found';
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'qr.token_rotated', 'table', target_table_id,
    jsonb_build_object('branchId', target_branch_id)
  );

  return jsonb_build_object('tableId', target_table_id, 'qrToken', new_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public: read the menu behind a table token
-- ---------------------------------------------------------------------------

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
              'orderable', p.kitchen_station_id is not null
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

-- ---------------------------------------------------------------------------
-- Public: customer places an order (goes straight to the kitchen)
-- ---------------------------------------------------------------------------

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

  update public.orders
  set status = 'submitted', version = version + 1
  where tenant_id = table_record.tenant_id and id = target_order_id
  returning version, order_number into next_version, target_order_number;

  insert into public.order_status_history (
    tenant_id, branch_id, order_id, status, actor_user_id, metadata
  ) values (
    table_record.tenant_id, table_record.branch_id, target_order_id,
    'submitted', null, jsonb_build_object('source', 'qr')
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

revoke all on function public.set_branch_qr_settings(uuid, uuid, boolean)
from public, anon;
revoke all on function public.rotate_table_qr_token(uuid, uuid, uuid)
from public, anon;
revoke all on function public.get_public_menu(text) from public;
revoke all on function public.place_customer_order(text, jsonb, text) from public;

grant execute on function public.set_branch_qr_settings(uuid, uuid, boolean)
to authenticated;
grant execute on function public.rotate_table_qr_token(uuid, uuid, uuid)
to authenticated;
grant execute on function public.get_public_menu(text) to anon, authenticated;
grant execute on function public.place_customer_order(text, jsonb, text)
to anon, authenticated;

commit;
