-- MK Adisyon Web / Phase 2 Module 5
-- Transactional order lifecycle, idempotency and scoped Realtime preparation.

begin;

alter table public.order_items
  add column branch_id uuid,
  add column kitchen_station_id uuid,
  add column sent_quantity integer not null default 0;

update public.order_items item
set branch_id = orders.branch_id
from public.orders orders
where orders.tenant_id = item.tenant_id
  and orders.id = item.order_id;

update public.order_items item
set kitchen_station_id = product.kitchen_station_id
from public.products product
where product.tenant_id = item.tenant_id
  and product.id = item.product_id;

alter table public.order_items
  alter column branch_id set not null,
  add constraint order_items_branch_fk
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  add constraint order_items_station_fk
    foreign key (tenant_id, kitchen_station_id)
    references public.kitchen_stations(tenant_id, id) on delete restrict,
  add constraint order_items_sent_quantity_check
    check (sent_quantity between 0 and quantity);

alter table public.orders
  add constraint orders_tenant_branch_id_unique
  unique (tenant_id, branch_id, id);

alter table public.order_items
  add constraint order_items_order_branch_fk
  foreign key (tenant_id, branch_id, order_id)
  references public.orders(tenant_id, branch_id, id) on delete restrict;

create table public.order_status_history (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  order_id uuid not null,
  status public.order_status not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, branch_id, order_id)
    references public.orders(tenant_id, branch_id, id) on delete restrict
);

create table public.order_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  order_id uuid,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null
    check (char_length(idempotency_key) between 16 and 120),
  command_type text not null check (
    command_type in ('open_order', 'append_items', 'update_item', 'submit_order')
  ),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, actor_user_id, idempotency_key),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id)
    references public.orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, branch_id, order_id)
    references public.orders(tenant_id, branch_id, id) on delete restrict
);

create unique index orders_one_active_per_table_idx
on public.orders (tenant_id, branch_id, table_id)
where table_id is not null
  and status in ('draft', 'open', 'submitted', 'in_progress', 'ready', 'served');

create index orders_branch_status_idx
on public.orders (tenant_id, branch_id, status, updated_at desc);

create index order_items_order_created_idx
on public.order_items (tenant_id, order_id, created_at);

create index order_status_history_order_idx
on public.order_status_history (tenant_id, order_id, created_at);

alter table public.order_status_history enable row level security;
alter table public.order_commands enable row level security;

revoke all on public.order_status_history, public.order_commands
from anon, authenticated;

grant select on public.order_status_history to authenticated;

create policy order_status_history_select_branch
on public.order_status_history for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

-- All order writes now pass through reviewed transaction functions.
revoke insert, update on public.orders, public.order_items,
  public.kitchen_tickets, public.kitchen_ticket_items
from authenticated;

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
      product.kitchen_station_id
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

    insert into public.order_items (
      tenant_id, branch_id, order_id, product_id, kitchen_station_id,
      product_name, quantity, unit_price_minor, tax_rate,
      line_total_minor, notes
    ) values (
      target_tenant_id, target_branch_id, target_order_id,
      product_record.id, product_record.kitchen_station_id,
      product_record.name, item_quantity, product_record.price_minor,
      product_record.tax_rate, product_record.price_minor * item_quantity,
      item_notes
    );
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function private.refresh_order_totals(
  target_tenant_id uuid,
  target_order_id uuid,
  bump_version boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculated_total bigint;
  calculated_tax bigint;
  next_version integer;
begin
  select
    coalesce(sum(item.line_total_minor), 0)::bigint,
    coalesce(sum(round(
      item.line_total_minor::numeric * item.tax_rate /
      nullif(100 + item.tax_rate, 0)
    )), 0)::bigint
  into calculated_total, calculated_tax
  from public.order_items item
  where item.tenant_id = target_tenant_id
    and item.order_id = target_order_id;

  update public.orders
  set subtotal_minor = calculated_total - calculated_tax,
      tax_minor = calculated_tax,
      total_minor = calculated_total,
      version = version + case when bump_version then 1 else 0 end
  where tenant_id = target_tenant_id and id = target_order_id
  returning version into next_version;

  return next_version;
end;
$$;

create or replace function public.open_order(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_table_id uuid,
  target_guest_count integer,
  target_items jsonb,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing_command record;
  table_status public.table_operational_status;
  new_order_id uuid;
  new_order_number bigint;
  response_payload jsonb;
begin
  if actor_id is null
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'orders.create'
    ) then
    raise exception using errcode = '42501', message = 'order_create_denied';
  end if;

  if target_guest_count < 1 or target_guest_count > 100
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_order_input';
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
    if existing_command.command_type <> 'open_order' then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_command.response;
  end if;

  select operational_status into table_status
  from public.restaurant_tables
  where id = target_table_id
    and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;

  if not found or table_status in ('dirty', 'disabled') then
    raise exception using errcode = 'P0001', message = 'table_not_available';
  end if;

  if exists (
    select 1 from public.orders
    where tenant_id = target_tenant_id
      and branch_id = target_branch_id
      and table_id = target_table_id
      and status in ('draft', 'open', 'submitted', 'in_progress', 'ready', 'served')
  ) then
    raise exception using errcode = 'P0001', message = 'table_has_active_order';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || target_branch_id::text || ':order-number',
    0
  ));
  select coalesce(max(order_number), 0) + 1 into new_order_number
  from public.orders
  where tenant_id = target_tenant_id and branch_id = target_branch_id;

  insert into public.orders (
    tenant_id, branch_id, table_id, order_number, status,
    guest_count, created_by
  ) values (
    target_tenant_id, target_branch_id, target_table_id, new_order_number,
    'open', target_guest_count, actor_id
  ) returning id into new_order_id;

  perform private.insert_order_item_snapshots(
    target_tenant_id, target_branch_id, new_order_id, target_items
  );
  perform private.refresh_order_totals(target_tenant_id, new_order_id, false);

  response_payload := jsonb_build_object(
    'orderId', new_order_id,
    'orderNumber', new_order_number,
    'status', 'open',
    'version', 1
  );

  insert into public.order_commands (
    tenant_id, branch_id, order_id, actor_user_id,
    idempotency_key, command_type, response
  ) values (
    target_tenant_id, target_branch_id, new_order_id, actor_id,
    target_idempotency_key, 'open_order', response_payload
  );

  insert into public.order_status_history (
    tenant_id, branch_id, order_id, status, actor_user_id,
    metadata
  ) values (
    target_tenant_id, target_branch_id, new_order_id, 'open', actor_id,
    jsonb_build_object('orderNumber', new_order_number)
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'order.opened', 'order', new_order_id,
    jsonb_build_object('branchId', target_branch_id, 'tableId', target_table_id)
  );

  return response_payload;
end;
$$;

create or replace function public.append_order_items(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_expected_version integer,
  target_items jsonb,
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
  next_version integer;
  response_payload jsonb;
begin
  if actor_id is null
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'orders.update'
    ) then
    raise exception using errcode = '42501', message = 'order_update_denied';
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
    if existing_command.command_type <> 'append_items' then
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
    raise exception using errcode = 'P0001', message = 'order_not_editable';
  end if;
  if order_record.version <> target_expected_version then
    raise exception using errcode = 'P0001', message = 'order_version_conflict';
  end if;

  perform private.insert_order_item_snapshots(
    target_tenant_id, target_branch_id, target_order_id, target_items
  );
  next_version := private.refresh_order_totals(
    target_tenant_id, target_order_id, true
  );

  response_payload := jsonb_build_object(
    'orderId', target_order_id, 'version', next_version
  );
  insert into public.order_commands (
    tenant_id, branch_id, order_id, actor_user_id,
    idempotency_key, command_type, response
  ) values (
    target_tenant_id, target_branch_id, target_order_id, actor_id,
    target_idempotency_key, 'append_items', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'order.items_appended', 'order', target_order_id,
    jsonb_build_object('branchId', target_branch_id, 'version', next_version)
  );
  return response_payload;
end;
$$;

create or replace function public.update_order_item(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_order_item_id uuid,
  target_expected_version integer,
  target_quantity integer,
  target_notes text,
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
  item_record record;
  existing_command record;
  next_version integer;
  response_payload jsonb;
begin
  if actor_id is null
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'orders.update'
    ) then
    raise exception using errcode = '42501', message = 'order_update_denied';
  end if;
  if target_quantity < 1 or target_quantity > 99
    or char_length(coalesce(target_notes, '')) > 500
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_order_item';
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
    if existing_command.command_type <> 'update_item' then
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
    raise exception using errcode = 'P0001', message = 'order_not_editable';
  end if;
  if order_record.version <> target_expected_version then
    raise exception using errcode = 'P0001', message = 'order_version_conflict';
  end if;

  select id, sent_quantity, unit_price_minor into item_record
  from public.order_items
  where id = target_order_item_id
    and tenant_id = target_tenant_id
    and branch_id = target_branch_id
    and order_id = target_order_id
  for update;
  if not found or target_quantity < item_record.sent_quantity then
    raise exception using errcode = 'P0001', message = 'order_item_not_editable';
  end if;

  update public.order_items
  set quantity = target_quantity,
      line_total_minor = item_record.unit_price_minor * target_quantity,
      notes = nullif(trim(coalesce(target_notes, '')), '')
  where id = target_order_item_id
    and tenant_id = target_tenant_id;
  next_version := private.refresh_order_totals(
    target_tenant_id, target_order_id, true
  );

  response_payload := jsonb_build_object(
    'orderId', target_order_id,
    'orderItemId', target_order_item_id,
    'version', next_version
  );
  insert into public.order_commands (
    tenant_id, branch_id, order_id, actor_user_id,
    idempotency_key, command_type, response
  ) values (
    target_tenant_id, target_branch_id, target_order_id, actor_id,
    target_idempotency_key, 'update_item', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'order.item_updated', 'order_item',
    target_order_item_id,
    jsonb_build_object('orderId', target_order_id, 'version', next_version)
  );
  return response_payload;
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

  update public.orders
  set status = 'submitted', version = version + 1
  where tenant_id = target_tenant_id and id = target_order_id
  returning version into next_version;

  response_payload := jsonb_build_object(
    'orderId', target_order_id,
    'status', 'submitted',
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
  if order_record.status <> 'submitted' then
    insert into public.order_status_history (
      tenant_id, branch_id, order_id, status, actor_user_id, metadata
    ) values (
      target_tenant_id, target_branch_id, target_order_id, 'submitted',
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

revoke all on function private.insert_order_item_snapshots(uuid, uuid, uuid, jsonb)
from public, anon, authenticated;
revoke all on function private.refresh_order_totals(uuid, uuid, boolean)
from public, anon, authenticated;

revoke all on function public.open_order(uuid, uuid, uuid, integer, jsonb, text)
from public, anon;
revoke all on function public.append_order_items(uuid, uuid, uuid, integer, jsonb, text)
from public, anon;
revoke all on function public.update_order_item(uuid, uuid, uuid, uuid, integer, integer, text, text)
from public, anon;
revoke all on function public.submit_order(uuid, uuid, uuid, integer, text)
from public, anon;

grant execute on function public.open_order(uuid, uuid, uuid, integer, jsonb, text)
to authenticated;
grant execute on function public.append_order_items(uuid, uuid, uuid, integer, jsonb, text)
to authenticated;
grant execute on function public.update_order_item(uuid, uuid, uuid, uuid, integer, integer, text, text)
to authenticated;
grant execute on function public.submit_order(uuid, uuid, uuid, integer, text)
to authenticated;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'orders', 'order_items', 'order_status_history', 'kitchen_tickets'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          realtime_table
        );
      end if;
    end loop;
  end if;
end $$;

commit;
