-- MK Adisyon Web / Sales report
-- One read-only function returns everything the report screen needs for a date
-- range in the branch's time zone. Needs reports.read; ranges that reach before
-- today also need reports.history (the cashier sees today only).
--   * Sales are counted on closed adisyons by closing time.
--   * Money collected is counted on payments by payment time, refunds by refund time.
--   * Product and category figures use line totals, i.e. before an adisyon discount.

begin;

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

revoke all on function public.sales_report(uuid, uuid, date, date) from public, anon;
grant execute on function public.sales_report(uuid, uuid, date, date) to authenticated;

commit;
