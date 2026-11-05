-- MK Adisyon Web / Cancel or comp an item that was already sent
-- A waiter (orders.cancel) can take back units that already went to the kitchen
-- or give them away ("ikram"), always with a written reason. Every such action:
--   * is recorded in order_item_voids (who, which table, what, why, how much)
--   * reaches managers and the kitchen live (realtime) and the audit log
--   * keeps payments consistent: paid units cannot be taken back, and the new
--     total may never fall below what was already collected
-- void : the units disappear from the adisyon and from active kitchen tickets
-- comp : the units stay on the adisyon at price 0 (list price is kept)

begin;

create table public.order_item_voids (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  order_id uuid not null,
  order_number bigint not null,
  table_label text,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  mode text not null check (mode in ('void', 'comp')),
  reason text not null check (char_length(reason) between 3 and 200),
  amount_minor bigint not null check (amount_minor >= 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade
);

create index order_item_voids_branch_created_idx
on public.order_item_voids (tenant_id, branch_id, created_at desc);

alter table public.order_item_voids enable row level security;
revoke all on public.order_item_voids from anon, authenticated;
grant select on public.order_item_voids to authenticated;

create policy order_item_voids_select
on public.order_item_voids for select to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'reports.read')
  or private.has_branch_permission(tenant_id, branch_id, 'shifts.manage')
  or private.has_branch_permission(tenant_id, branch_id, 'kitchen.read')
);

create or replace function public.void_order_item(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_order_item_id uuid,
  target_expected_version integer,
  target_quantity integer,
  target_mode text,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_reason text := nullif(trim(coalesce(target_reason, '')), '');
  order_record record;
  item_record record;
  table_text text;
  actor_text text;
  allocated_quantity integer;
  remaining integer;
  ticket_item record;
  take integer;
  new_total bigint;
  paid_total bigint;
  refunded_total bigint;
  next_version integer;
  next_status public.order_status;
  amount bigint;
  order_cancelled boolean := false;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'orders.cancel') then
    raise exception using errcode = '42501', message = 'void_denied';
  end if;
  if target_mode not in ('void', 'comp')
    or target_quantity is null or target_quantity < 1
    or char_length(coalesce(clean_reason, '')) not between 3 and 200 then
    raise exception using errcode = 'P0001', message = 'invalid_void';
  end if;

  select id, status, version, table_id, order_number into order_record
  from public.orders
  where id = target_order_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;
  if not found or order_record.status in ('closed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'order_not_editable';
  end if;
  if order_record.version <> target_expected_version then
    raise exception using errcode = 'P0001', message = 'order_version_conflict';
  end if;

  select * into item_record
  from public.order_items
  where id = target_order_item_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id and order_id = target_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'order_item_not_editable';
  end if;
  -- Units that never left the waiter's screen are changed with the normal edit instead.
  if target_quantity > item_record.sent_quantity then
    raise exception using errcode = 'P0001', message = 'void_exceeds_sent';
  end if;

  select coalesce(sum(allocation.quantity), 0) into allocated_quantity
  from public.payment_allocations allocation
  join public.payments payment
    on payment.tenant_id = allocation.tenant_id and payment.id = allocation.payment_id
  where allocation.tenant_id = target_tenant_id
    and allocation.order_item_id = target_order_item_id
    and payment.status = 'completed';
  if target_quantity > item_record.quantity - allocated_quantity then
    raise exception using errcode = 'P0001', message = 'void_item_paid';
  end if;

  amount := coalesce(item_record.list_unit_price_minor, item_record.unit_price_minor)
    * target_quantity;
  if target_mode = 'comp' and item_record.unit_price_minor = 0 then
    raise exception using errcode = 'P0001', message = 'already_free';
  end if;

  select label into table_text from public.restaurant_tables
  where id = order_record.table_id and tenant_id = target_tenant_id;
  select full_name into actor_text from public.profiles where id = actor_id;

  if target_mode = 'void' then
    remaining := target_quantity;
    -- Take the units back from kitchen tickets that are still being worked on, newest first.
    for ticket_item in
      select link.ticket_id, link.quantity
      from public.kitchen_ticket_items link
      join public.kitchen_tickets ticket
        on ticket.tenant_id = link.tenant_id and ticket.id = link.ticket_id
      where link.tenant_id = target_tenant_id and link.order_item_id = target_order_item_id
        and ticket.status in ('new', 'preparing')
      order by ticket.created_at desc
    loop
      exit when remaining <= 0;
      take := least(remaining, ticket_item.quantity);
      if take = ticket_item.quantity then
        delete from public.kitchen_ticket_items
        where tenant_id = target_tenant_id and ticket_id = ticket_item.ticket_id
          and order_item_id = target_order_item_id;
      else
        update public.kitchen_ticket_items set quantity = quantity - take
        where tenant_id = target_tenant_id and ticket_id = ticket_item.ticket_id
          and order_item_id = target_order_item_id;
      end if;
      remaining := remaining - take;
      -- Touch the ticket so screens listening to it refresh.
      update public.kitchen_tickets set updated_at = now()
      where tenant_id = target_tenant_id and id = ticket_item.ticket_id;
    end loop;

    if target_quantity = item_record.quantity then
      delete from public.kitchen_ticket_items
      where tenant_id = target_tenant_id and order_item_id = target_order_item_id;
      delete from public.order_items
      where id = target_order_item_id and tenant_id = target_tenant_id;
    else
      update public.order_items
      set quantity = quantity - target_quantity,
          sent_quantity = sent_quantity - target_quantity,
          line_total_minor = unit_price_minor * (quantity - target_quantity)
      where id = target_order_item_id and tenant_id = target_tenant_id;
    end if;
  else
    if target_quantity = item_record.quantity then
      update public.order_items
      set list_unit_price_minor = coalesce(list_unit_price_minor, unit_price_minor),
          unit_price_minor = 0, line_total_minor = 0,
          discount_reason = 'İkram: ' || clean_reason
      where id = target_order_item_id and tenant_id = target_tenant_id;
    else
      update public.order_items
      set quantity = quantity - target_quantity,
          sent_quantity = sent_quantity - target_quantity,
          line_total_minor = unit_price_minor * (quantity - target_quantity)
      where id = target_order_item_id and tenant_id = target_tenant_id;
      with free_item as (
        insert into public.order_items (
          tenant_id, branch_id, order_id, product_id, kitchen_station_id, fulfillment,
          source, product_name, quantity, sent_quantity, unit_price_minor,
          list_unit_price_minor, discount_reason, tax_rate, line_total_minor, notes
        ) values (
          item_record.tenant_id, item_record.branch_id, item_record.order_id,
          item_record.product_id, item_record.kitchen_station_id, item_record.fulfillment,
          item_record.source, item_record.product_name, target_quantity, target_quantity, 0,
          coalesce(item_record.list_unit_price_minor, item_record.unit_price_minor),
          'İkram: ' || clean_reason, item_record.tax_rate, 0, item_record.notes
        ) returning id
      )
      insert into public.order_item_options (
        tenant_id, branch_id, order_item_id, choice_id, group_name, kind,
        choice_name, price_delta_minor
      )
      select option_row.tenant_id, option_row.branch_id, free_item.id, option_row.choice_id,
        option_row.group_name, option_row.kind, option_row.choice_name,
        option_row.price_delta_minor
      from public.order_item_options option_row, free_item
      where option_row.tenant_id = target_tenant_id
        and option_row.order_item_id = target_order_item_id;
    end if;
  end if;

  -- Tickets that ended up empty are closed so the kitchen screen does not show them.
  update public.kitchen_tickets ticket
  set status = 'cancelled'
  where ticket.tenant_id = target_tenant_id and ticket.order_id = target_order_id
    and ticket.status <> 'cancelled'
    and not exists (
      select 1 from public.kitchen_ticket_items link
      where link.tenant_id = ticket.tenant_id and link.ticket_id = ticket.id
    );

  next_version := private.refresh_order_totals(target_tenant_id, target_order_id, true);

  select total_minor into new_total
  from public.orders where id = target_order_id and tenant_id = target_tenant_id;
  select coalesce(sum(amount_minor), 0) into paid_total
  from public.payments
  where tenant_id = target_tenant_id and order_id = target_order_id and status = 'completed';
  select coalesce(sum(refund.amount_minor), 0) into refunded_total
  from public.payment_refunds refund
  join public.payments payment
    on payment.tenant_id = refund.tenant_id and payment.id = refund.payment_id
  where refund.tenant_id = target_tenant_id and payment.order_id = target_order_id;
  if new_total < paid_total - refunded_total then
    raise exception using errcode = 'P0001', message = 'void_below_paid';
  end if;

  if not exists (
    select 1 from public.order_items
    where tenant_id = target_tenant_id and order_id = target_order_id
  ) then
    -- Nothing is left on the adisyon: close it as cancelled.
    update public.orders
    set status = 'cancelled', closed_at = now()
    where id = target_order_id and tenant_id = target_tenant_id;
    insert into public.order_status_history (
      tenant_id, branch_id, order_id, status, actor_user_id, metadata
    ) values (
      target_tenant_id, target_branch_id, target_order_id, 'cancelled', actor_id,
      jsonb_build_object('voidedAllItems', true, 'reason', clean_reason)
    );
    order_cancelled := true;
  elsif not exists (
    select 1 from public.order_items
    where tenant_id = target_tenant_id and order_id = target_order_id
      and quantity > sent_quantity
  ) then
    next_status := private.post_submit_status(target_tenant_id, target_branch_id, target_order_id, 0);
    if next_status <> order_record.status then
      update public.orders set status = next_status
      where id = target_order_id and tenant_id = target_tenant_id;
      insert into public.order_status_history (
        tenant_id, branch_id, order_id, status, actor_user_id, metadata
      ) values (
        target_tenant_id, target_branch_id, target_order_id, next_status, actor_id,
        jsonb_build_object('afterVoid', true)
      );
    end if;
  end if;

  insert into public.order_item_voids (
    tenant_id, branch_id, order_id, order_number, table_label, product_name,
    quantity, mode, reason, amount_minor, actor_user_id, actor_name
  ) values (
    target_tenant_id, target_branch_id, target_order_id, order_record.order_number,
    table_text, item_record.product_name, target_quantity, target_mode,
    clean_reason, amount, actor_id, actor_text
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id,
    case when target_mode = 'void' then 'order_item.voided' else 'order_item.comped' end,
    'order', target_order_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'name', item_record.product_name,
      'count', target_quantity, 'reason', clean_reason, 'amountMinor', amount
    )
  );
  return jsonb_build_object(
    'orderId', target_order_id, 'version', next_version, 'orderCancelled', order_cancelled
  );
end;
$$;

revoke all on function public.void_order_item(uuid, uuid, uuid, uuid, integer, integer, text, text) from public, anon;
grant execute on function public.void_order_item(uuid, uuid, uuid, uuid, integer, integer, text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'order_item_voids'
    ) then
    alter publication supabase_realtime add table public.order_item_voids;
  end if;
end $$;

create or replace function public.sales_report(
  target_tenant_id uuid,
  target_branch_id uuid,
  range_start date,
  range_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  branch_timezone text;
  today_local date;
  from_ts timestamptz;
  to_ts timestamptz;
  summary_value jsonb;
  payments_value jsonb;
  by_day jsonb;
  by_hour jsonb;
  products_value jsonb;
  categories_value jsonb;
  staff_value jsonb;
  sessions_value jsonb;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'reports.read') then
    raise exception using errcode = '42501', message = 'report_denied';
  end if;
  if range_start is null or range_end is null or range_end < range_start
    or range_end - range_start > 92 then
    raise exception using errcode = 'P0001', message = 'invalid_report_range';
  end if;

  select branch.timezone into branch_timezone
  from public.branches branch
  where branch.tenant_id = target_tenant_id and branch.id = target_branch_id;
  if branch_timezone is null then
    raise exception using errcode = 'P0001', message = 'invalid_report_range';
  end if;
  today_local := (now() at time zone branch_timezone)::date;
  if range_start < today_local
    and not private.can_view_history(target_tenant_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'report_history_denied';
  end if;

  from_ts := range_start::timestamp at time zone branch_timezone;
  to_ts := (range_end + 1)::timestamp at time zone branch_timezone;

  select jsonb_build_object(
    'orderCount', count(*),
    'guestCount', coalesce(sum(o.guest_count), 0),
    'grossMinor', coalesce(sum(o.total_minor + o.discount_minor), 0),
    'discountMinor', coalesce(sum(o.discount_minor), 0),
    'netMinor', coalesce(sum(o.total_minor), 0),
    'taxMinor', coalesce(sum(o.tax_minor), 0),
    'averageMinor', coalesce(round(avg(o.total_minor)), 0),
    'itemDiscountMinor', coalesce((
      select sum((item.list_unit_price_minor - item.unit_price_minor) * item.quantity)
      from public.order_items item
      join public.orders closed_order
        on closed_order.tenant_id = item.tenant_id and closed_order.id = item.order_id
      where closed_order.tenant_id = target_tenant_id
        and closed_order.branch_id = target_branch_id
        and closed_order.status = 'closed'
        and closed_order.closed_at >= from_ts and closed_order.closed_at < to_ts
        and item.list_unit_price_minor is not null
    ), 0),
    'voidCount', (
      select count(*) from public.order_item_voids voided
      where voided.tenant_id = target_tenant_id and voided.branch_id = target_branch_id
        and voided.created_at >= from_ts and voided.created_at < to_ts
    ),
    'voidMinor', coalesce((
      select sum(voided.amount_minor) from public.order_item_voids voided
      where voided.tenant_id = target_tenant_id and voided.branch_id = target_branch_id
        and voided.mode = 'void'
        and voided.created_at >= from_ts and voided.created_at < to_ts
    ), 0),
    'compMinor', coalesce((
      select sum(voided.amount_minor) from public.order_item_voids voided
      where voided.tenant_id = target_tenant_id and voided.branch_id = target_branch_id
        and voided.mode = 'comp'
        and voided.created_at >= from_ts and voided.created_at < to_ts
    ), 0),
    'cancelledCount', (
      select count(*) from public.orders cancelled
      where cancelled.tenant_id = target_tenant_id
        and cancelled.branch_id = target_branch_id
        and cancelled.status = 'cancelled'
        and cancelled.updated_at >= from_ts and cancelled.updated_at < to_ts
        and not exists (
          select 1 from public.order_status_history history
          where history.tenant_id = cancelled.tenant_id
            and history.order_id = cancelled.id
            and history.metadata ? 'mergedInto'
        )
    )
  )
  into summary_value
  from public.orders o
  where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
    and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts;

  select jsonb_build_object(
    'cashMinor', coalesce(sum(payment.amount_minor) filter (where payment.method = 'cash'), 0),
    'cardMinor', coalesce(sum(payment.amount_minor) filter (where payment.method = 'card'), 0),
    'cashRefundMinor', coalesce((
      select sum(refund.amount_minor)
      from public.payment_refunds refund
      join public.payments refunded
        on refunded.tenant_id = refund.tenant_id and refunded.id = refund.payment_id
      where refund.tenant_id = target_tenant_id and refund.branch_id = target_branch_id
        and refund.created_at >= from_ts and refund.created_at < to_ts
        and refunded.method = 'cash'
    ), 0),
    'cardRefundMinor', coalesce((
      select sum(refund.amount_minor)
      from public.payment_refunds refund
      join public.payments refunded
        on refunded.tenant_id = refund.tenant_id and refunded.id = refund.payment_id
      where refund.tenant_id = target_tenant_id and refund.branch_id = target_branch_id
        and refund.created_at >= from_ts and refund.created_at < to_ts
        and refunded.method = 'card'
    ), 0)
  )
  into payments_value
  from public.payments payment
  where payment.tenant_id = target_tenant_id and payment.branch_id = target_branch_id
    and payment.status = 'completed'
    and payment.paid_at >= from_ts and payment.paid_at < to_ts;

  select coalesce(jsonb_agg(day_row order by day_row ->> 'date'), '[]'::jsonb) into by_day
  from (
    select jsonb_build_object(
      'date', (o.closed_at at time zone branch_timezone)::date,
      'orderCount', count(*),
      'netMinor', sum(o.total_minor)
    ) as day_row
    from public.orders o
    where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
      and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts
    group by (o.closed_at at time zone branch_timezone)::date
  ) days;

  select coalesce(jsonb_agg(hour_row order by (hour_row ->> 'hour')::integer), '[]'::jsonb) into by_hour
  from (
    select jsonb_build_object(
      'hour', extract(hour from o.closed_at at time zone branch_timezone)::integer,
      'orderCount', count(*),
      'netMinor', sum(o.total_minor)
    ) as hour_row
    from public.orders o
    where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
      and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts
    group by extract(hour from o.closed_at at time zone branch_timezone)::integer
  ) hours;

  select coalesce(jsonb_agg(product_row order by (product_row ->> 'quantity')::integer desc, product_row ->> 'name'), '[]'::jsonb)
  into products_value
  from (
    select jsonb_build_object(
      'name', item.product_name,
      'quantity', sum(item.quantity),
      'revenueMinor', sum(item.line_total_minor)
    ) as product_row
    from public.order_items item
    join public.orders o on o.tenant_id = item.tenant_id and o.id = item.order_id
    where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
      and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts
    group by item.product_name
    order by sum(item.quantity) desc, item.product_name
    limit 20
  ) top_products;

  select coalesce(jsonb_agg(category_row order by (category_row ->> 'revenueMinor')::bigint desc), '[]'::jsonb)
  into categories_value
  from (
    select jsonb_build_object(
      'name', coalesce(category.name, 'Diğer'),
      'quantity', sum(item.quantity),
      'revenueMinor', sum(item.line_total_minor)
    ) as category_row
    from public.order_items item
    join public.orders o on o.tenant_id = item.tenant_id and o.id = item.order_id
    left join public.products product
      on product.tenant_id = item.tenant_id and product.id = item.product_id
    left join public.menu_categories category
      on category.tenant_id = product.tenant_id and category.id = product.category_id
    where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
      and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts
    group by coalesce(category.name, 'Diğer')
  ) categories;

  select coalesce(jsonb_agg(staff_row order by (staff_row ->> 'netMinor')::bigint desc), '[]'::jsonb)
  into staff_value
  from (
    select jsonb_build_object(
      'name', coalesce(profile.full_name, case when o.created_by is null then 'Müşteri (QR)' else 'Ekip üyesi' end),
      'orderCount', count(*),
      'netMinor', sum(o.total_minor)
    ) as staff_row
    from public.orders o
    left join public.profiles profile on profile.id = o.created_by
    where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
      and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts
    group by o.created_by, profile.full_name
  ) staff;

  select coalesce(jsonb_agg(session_row order by session_row ->> 'openedAt'), '[]'::jsonb)
  into sessions_value
  from (
    select jsonb_build_object(
      'registerName', register.name,
      'openedAt', cash_session.opened_at,
      'closedAt', cash_session.closed_at,
      'openingMinor', cash_session.opening_minor,
      'expectedMinor', private.cash_session_expected_minor(cash_session.tenant_id, cash_session.id),
      'countedMinor', cash_session.closing_minor,
      'differenceMinor', case when cash_session.closing_minor is null then null
        else cash_session.closing_minor
          - private.cash_session_expected_minor(cash_session.tenant_id, cash_session.id) end
    ) as session_row
    from public.cash_sessions cash_session
    join public.cash_registers register
      on register.tenant_id = cash_session.tenant_id and register.id = cash_session.cash_register_id
    where cash_session.tenant_id = target_tenant_id
      and cash_session.branch_id = target_branch_id
      and cash_session.opened_at >= from_ts and cash_session.opened_at < to_ts
  ) sessions;

  return jsonb_build_object(
    'rangeStart', range_start,
    'rangeEnd', range_end,
    'timezone', branch_timezone,
    'summary', summary_value,
    'payments', payments_value,
    'byDay', by_day,
    'byHour', by_hour,
    'products', products_value,
    'categories', categories_value,
    'staff', staff_value,
    'sessions', sessions_value
  );
end;
$$;

commit;
