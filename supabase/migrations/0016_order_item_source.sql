-- MK Adisyon Web / Order item origin
-- Lines added through the QR menu are marked so the bill can show whether an
-- item was taken by a staff member or ordered by the customer at the table.

begin;

alter table public.order_items
  add column source text not null default 'staff'
    check (source in ('staff', 'qr'));

-- Everything on a QR-originated order came from the customer.
update public.order_items item
set source = 'qr'
from public.orders o
where o.tenant_id = item.tenant_id and o.id = item.order_id and o.source = 'qr';

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

  -- Remember which lines the customer added (bill shows "Müşteri (QR)").
  update public.order_items
  set source = 'qr'
  where tenant_id = table_record.tenant_id
    and order_id = target_order_id
    and created_at = now();

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

commit;
