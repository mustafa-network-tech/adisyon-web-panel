-- MK Adisyon Web / 0039: cash-desk discounts, no refunds, no QR customer orders, no service charge
--
-- Product decisions this migration applies (all history is kept; nothing is deleted from orders,
-- payments, refunds, kitchen tickets or the audit log):
--   1) Customer ordering through the QR code is gone. place_customer_order and set_branch_qr_settings are
--      dropped (anonymous callers lose the right to create orders). The QR menu (get_public_menu) and the
--      waiter call (call_waiter) stay. customer_order_requests is kept as history.
--   2) There is no service charge: the settings column is dropped and save_tenant_configuration loses its
--      parameter (the old signature is dropped, so the anon revoke of 0038 cannot be undone by it).
--   3) Prices already include KDV (refresh_order_totals extracts the tax from the price). Order and item level
--      discounts are removed (apply_order_discount / apply_item_discount dropped; open orders lose a legacy
--      order discount, closed orders are untouched).
--   4) Discounts and promotions exist only at the cash desk, in the same transaction as the payment:
--      record_order_payments takes an optional adjustment {kind: discount|promotion, amountMinor, reason}.
--      It needs payments.create AND discounts.apply, can never exceed the outstanding amount and is never
--      booked as cash or card money. Rows live in order_adjustments, which cannot be changed or deleted.
--   5) Refunds are removed: refund_payment is dropped and the payments.refund permission disappears from every
--      role and grant. Past refunds stay in payment_refunds and keep counting in the reports.
--   6) Reports: gross / discount / promotion / refund / net are separate figures; a new audit function lists
--      every discount with cashier, table, original total, cash and card parts, time and reason.
--
-- ROLLBACK: none. The migration removes features by product decision (refunds, QR customer orders,
-- order / item discounts, service charge); history is kept. To undo it, restore the database backup.

begin;

-- 1) refunds and QR ordering and old discount functions are gone ---------------------------------------------
drop function if exists public.refund_payment(uuid, uuid, uuid, uuid, bigint, text, text);
drop function if exists public.place_customer_order(text, jsonb, text);
drop function if exists public.set_branch_qr_settings(uuid, uuid, boolean);
drop function if exists public.apply_order_discount(uuid, uuid, uuid, integer, text, bigint, text);
drop function if exists public.apply_item_discount(uuid, uuid, uuid, uuid, integer, text, bigint, text);

-- 2) service charge ---------------------------------------------------------------------------------------------
drop function if exists public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer);
alter table public.tenant_settings drop column if exists service_charge_basis_points;

create or replace function public.save_tenant_configuration(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_tenant_name text,
  target_legal_name text,
  target_branch_name text,
  target_brand_name text,
  target_primary_color text,
  target_order_prefix text,
  target_receipt_footer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_value jsonb;
  after_value jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'settings.manage'
  ) then
    raise exception using errcode = '42501', message = 'settings_manage_denied';
  end if;
  if char_length(trim(coalesce(target_tenant_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(target_branch_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(target_brand_name, ''))) not between 2 and 120
    or coalesce(target_primary_color, '') !~ '^#[0-9a-fA-F]{6}$'
    or upper(trim(coalesce(target_order_prefix, ''))) !~ '^[A-Z0-9]{1,8}$'
    or char_length(coalesce(target_receipt_footer, '')) > 500 then
    raise exception using errcode = 'P0001', message = 'invalid_tenant_configuration';
  end if;

  select jsonb_build_object(
    'tenantName', tenant.name,
    'legalName', tenant.legal_name,
    'branchName', branch.name,
    'settings', to_jsonb(settings)
  ) into before_value
  from public.tenants tenant
  join public.branches branch
    on branch.tenant_id = tenant.id and branch.id = target_branch_id
  left join public.tenant_settings settings on settings.tenant_id = tenant.id
  where tenant.id = target_tenant_id
  for update of tenant, branch;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_branch_not_found';
  end if;

  update public.tenants
  set name = trim(target_tenant_name),
      legal_name = nullif(trim(coalesce(target_legal_name, '')), '')
  where id = target_tenant_id;

  update public.branches
  set name = trim(target_branch_name)
  where tenant_id = target_tenant_id and id = target_branch_id;

  insert into public.tenant_settings (
    tenant_id, brand_name, primary_color, order_number_prefix,
    receipt_footer, updated_by
  ) values (
    target_tenant_id, trim(target_brand_name), lower(target_primary_color),
    upper(trim(target_order_prefix)),
    nullif(trim(coalesce(target_receipt_footer, '')), ''),
    actor_id
  )
  on conflict (tenant_id) do update set
    brand_name = excluded.brand_name,
    primary_color = excluded.primary_color,
    order_number_prefix = excluded.order_number_prefix,
    receipt_footer = excluded.receipt_footer,
    updated_by = actor_id,
    updated_at = now();

  select jsonb_build_object(
    'tenantName', tenant.name,
    'legalName', tenant.legal_name,
    'branchName', branch.name,
    'settings', to_jsonb(settings)
  ) into after_value
  from public.tenants tenant
  join public.branches branch
    on branch.tenant_id = tenant.id and branch.id = target_branch_id
  join public.tenant_settings settings on settings.tenant_id = tenant.id
  where tenant.id = target_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'tenant.settings.updated',
    'tenant_settings', target_tenant_id,
    jsonb_build_object('branchId', target_branch_id, 'before', before_value, 'after', after_value)
  );
  return after_value;
end;
$$;

revoke all on function public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text) to authenticated;

-- 3) totals: prices include KDV, no order level discount any more ------------------------------------------------
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
  gross_total bigint;
  calculated_tax bigint;
  next_version integer;
begin
  select coalesce(sum(item.line_total_minor), 0)::bigint
  into gross_total
  from public.order_items item
  where item.tenant_id = target_tenant_id and item.order_id = target_order_id;

  -- The menu price is the final price: the KDV is taken OUT of it, never added on top.
  select coalesce(sum(round(
    item.line_total_minor::numeric * item.tax_rate / nullif(100 + item.tax_rate, 0)
  )), 0)::bigint
  into calculated_tax
  from public.order_items item
  where item.tenant_id = target_tenant_id and item.order_id = target_order_id;

  update public.orders
  set subtotal_minor = gross_total - calculated_tax,
      tax_minor = calculated_tax,
      total_minor = gross_total,
      discount_minor = 0,
      discount_type = null,
      discount_value = 0,
      discount_reason = null,
      discount_by = null,
      version = version + case when bump_version then 1 else 0 end
  where tenant_id = target_tenant_id and id = target_order_id
  returning version into next_version;

  return next_version;
end;
$$;

-- open orders that still carry an order level discount: the discount is dropped, totals recomputed
do $$
declare
  open_order record;
begin
  for open_order in
    select o.tenant_id, o.id from public.orders o
    where o.status not in ('closed', 'cancelled') and (o.discount_minor > 0 or o.discount_type is not null)
  loop
    begin
      perform private.refresh_order_totals(open_order.tenant_id, open_order.id, true);
    exception when others then
      raise notice 'order % keeps its old discount (%)', open_order.id, sqlerrm;
    end;
  end loop;
end
$$;

-- 4) discounts and promotions at the cash desk ---------------------------------------------------------------
create table public.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  order_id uuid not null,
  cash_session_id uuid not null,
  kind text not null check (kind in ('discount', 'promotion')),
  amount_minor bigint not null check (amount_minor > 0),
  reason text check (reason is null or char_length(reason) between 1 and 200),
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, branch_id, order_id)
    references public.orders(tenant_id, branch_id, id) on delete restrict,
  foreign key (tenant_id, branch_id, cash_session_id)
    references public.cash_sessions(tenant_id, branch_id, id) on delete restrict
);

create index order_adjustments_order_idx on public.order_adjustments (tenant_id, order_id);
create index order_adjustments_branch_time_idx on public.order_adjustments (tenant_id, branch_id, created_at desc);

alter table public.order_adjustments enable row level security;
revoke all on public.order_adjustments from anon, authenticated;
grant select on public.order_adjustments to authenticated;

-- Readable by the cash desk and by whoever may read reports; written only by record_order_payments.
create policy order_adjustments_select_cash_or_reports
on public.order_adjustments for select to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.has_branch_permission(tenant_id, branch_id, 'reports.read')
  or private.is_platform_support_active(tenant_id, branch_id)
);

-- A discount record can never be edited or removed afterwards, by anybody.
create or replace function private.forbid_adjustment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'order_adjustments_are_immutable';
end;
$$;
revoke all on function private.forbid_adjustment_change() from public, anon, authenticated;

create trigger order_adjustments_immutable
before update or delete on public.order_adjustments
for each row execute function private.forbid_adjustment_change();
create trigger order_adjustments_read_only
before insert on public.order_adjustments
for each row execute function private.block_writes_when_read_only();
create trigger order_adjustments_before_trial
before insert on public.order_adjustments
for each row execute function private.block_operations_before_trial();

-- 5) record_order_payments with an optional cash-desk adjustment ----------------------------------------------
drop function if exists public.record_order_payments(uuid, uuid, uuid, uuid, jsonb, text);

create or replace function public.record_order_payments(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_cash_session_id uuid,
  target_payments jsonb,
  target_idempotency_key text,
  target_adjustment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing_command record;
  order_record record;
  payment_data jsonb;
  allocation_data jsonb;
  payment_method public.payment_method;
  payment_amount bigint;
  requested_total bigint := 0;
  paid_total bigint;
  refunded_total bigint;
  adjusted_total bigint;
  outstanding_minor bigint;
  adjustment_kind text;
  adjustment_amount bigint := 0;
  adjustment_reason text;
  new_adjustment_id uuid;
  new_payment_id uuid;
  payment_ids jsonb := '[]'::jsonb;
  allocation_sum bigint;
  allocation_quantity integer;
  allocated_quantity integer;
  order_item_record record;
  payment_index integer := 0;
  response_payload jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'payments.create'
  ) then
    raise exception using errcode = '42501', message = 'payment_create_denied';
  end if;
  if target_adjustment is not null and not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'discounts.apply'
  ) then
    raise exception using errcode = '42501', message = 'discount_denied';
  end if;
  if jsonb_typeof(target_payments) <> 'array'
    or jsonb_array_length(target_payments) > 2
    or (jsonb_array_length(target_payments) < 1 and target_adjustment is null)
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_payment_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || actor_id::text || ':' || target_idempotency_key, 0
  ));
  select command_type, response into existing_command
  from public.financial_commands
  where tenant_id = target_tenant_id and actor_user_id = actor_id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_command.command_type <> 'record_payments' then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_command.response;
  end if;

  perform 1 from public.cash_sessions
  where id = target_cash_session_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id and status = 'open'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'cash_session_not_open';
  end if;

  select id, status, total_minor, discount_minor, version into order_record
  from public.orders
  where id = target_order_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;
  if not found or order_record.status not in ('ready', 'served') then
    raise exception using errcode = 'P0001', message = 'order_not_payable';
  end if;

  select coalesce(sum(amount_minor), 0) into paid_total
  from public.payments
  where tenant_id = target_tenant_id and order_id = target_order_id
    and status = 'completed';
  -- Refunds no longer exist; older refunds are still part of the balance of old orders.
  select coalesce(sum(refund.amount_minor), 0) into refunded_total
  from public.payment_refunds refund
  join public.payments payment
    on payment.tenant_id = refund.tenant_id and payment.id = refund.payment_id
  where refund.tenant_id = target_tenant_id and payment.order_id = target_order_id;
  select coalesce(sum(amount_minor), 0) into adjusted_total
  from public.order_adjustments
  where tenant_id = target_tenant_id and order_id = target_order_id;
  outstanding_minor := order_record.total_minor - paid_total + refunded_total - adjusted_total;

  for payment_data in select value from jsonb_array_elements(target_payments) loop
    begin
      payment_method := (payment_data ->> 'method')::public.payment_method;
      payment_amount := (payment_data ->> 'amountMinor')::bigint;
    exception when others then
      raise exception using errcode = 'P0001', message = 'invalid_payment_input';
    end;
    if payment_amount <= 0 then
      raise exception using errcode = 'P0001', message = 'invalid_payment_amount';
    end if;
    requested_total := requested_total + payment_amount;
  end loop;

  if target_adjustment is not null then
    begin
      adjustment_kind := target_adjustment ->> 'kind';
      adjustment_amount := (target_adjustment ->> 'amountMinor')::bigint;
      adjustment_reason := nullif(trim(coalesce(target_adjustment ->> 'reason', '')), '');
    exception when others then
      raise exception using errcode = 'P0001', message = 'invalid_adjustment';
    end;
    -- the cashier must say explicitly what it is: a missing part of the payment is never a discount
    if adjustment_kind is null or adjustment_kind not in ('discount', 'promotion')
      or adjustment_amount is null or adjustment_amount <= 0
      or char_length(coalesce(adjustment_reason, '')) > 200 then
      raise exception using errcode = 'P0001', message = 'invalid_adjustment';
    end if;
    if adjustment_amount > outstanding_minor then
      raise exception using errcode = 'P0001', message = 'discount_exceeds_outstanding';
    end if;
  end if;

  if requested_total + adjustment_amount > outstanding_minor then
    raise exception using errcode = 'P0001', message = 'payment_exceeds_outstanding';
  end if;

  for payment_data in select value from jsonb_array_elements(target_payments) loop
    payment_index := payment_index + 1;
    payment_method := (payment_data ->> 'method')::public.payment_method;
    payment_amount := (payment_data ->> 'amountMinor')::bigint;

    insert into public.payments (
      tenant_id, branch_id, order_id, cash_session_id, method,
      status, amount_minor, idempotency_key, paid_at, created_by
    ) values (
      target_tenant_id, target_branch_id, target_order_id,
      target_cash_session_id, payment_method, 'completed', payment_amount,
      target_idempotency_key || ':' || payment_index::text, now(), actor_id
    ) returning id into new_payment_id;
    payment_ids := payment_ids || jsonb_build_array(new_payment_id);

    if payment_data ? 'allocations'
      and jsonb_typeof(payment_data -> 'allocations') = 'array'
      and jsonb_array_length(payment_data -> 'allocations') > 0 then
      -- A discount or promotion is not tied to single items, so item payments would not add up.
      if order_record.discount_minor > 0 or adjusted_total > 0 or adjustment_amount > 0 then
        raise exception using errcode = 'P0001', message = 'allocation_not_allowed_with_discount';
      end if;
      allocation_sum := 0;
      for allocation_data in
        select value from jsonb_array_elements(payment_data -> 'allocations')
      loop
        begin
          allocation_quantity := (allocation_data ->> 'quantity')::integer;
          select id, quantity, unit_price_minor into order_item_record
          from public.order_items
          where id = (allocation_data ->> 'orderItemId')::uuid
            and tenant_id = target_tenant_id
            and branch_id = target_branch_id
            and order_id = target_order_id;
        exception when others then
          raise exception using errcode = 'P0001', message = 'invalid_payment_allocation';
        end;
        if not found or allocation_quantity < 1 then
          raise exception using errcode = 'P0001', message = 'invalid_payment_allocation';
        end if;

        select coalesce(sum(allocation.quantity), 0) into allocated_quantity
        from public.payment_allocations allocation
        join public.payments payment
          on payment.tenant_id = allocation.tenant_id
          and payment.id = allocation.payment_id
        where allocation.tenant_id = target_tenant_id
          and allocation.order_item_id = order_item_record.id
          and payment.status = 'completed';
        if allocated_quantity + allocation_quantity > order_item_record.quantity then
          raise exception using errcode = 'P0001', message = 'allocation_exceeds_item_quantity';
        end if;

        insert into public.payment_allocations (
          tenant_id, branch_id, payment_id, order_id, order_item_id,
          quantity, amount_minor
        ) values (
          target_tenant_id, target_branch_id, new_payment_id,
          target_order_id, order_item_record.id, allocation_quantity,
          order_item_record.unit_price_minor * allocation_quantity
        );
        allocation_sum := allocation_sum
          + order_item_record.unit_price_minor * allocation_quantity;
      end loop;
      if allocation_sum <> payment_amount then
        raise exception using errcode = 'P0001', message = 'allocation_total_mismatch';
      end if;
    end if;
  end loop;

  if adjustment_amount > 0 then
    insert into public.order_adjustments (
      tenant_id, branch_id, order_id, cash_session_id, kind, amount_minor,
      reason, idempotency_key, created_by
    ) values (
      target_tenant_id, target_branch_id, target_order_id, target_cash_session_id,
      adjustment_kind, adjustment_amount, adjustment_reason,
      target_idempotency_key || ':adjustment', actor_id
    ) returning id into new_adjustment_id;
    insert into public.audit_logs (
      tenant_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      target_tenant_id, actor_id, 'payment.adjustment_recorded', 'order', target_order_id,
      jsonb_build_object(
        'branchId', target_branch_id, 'adjustmentId', new_adjustment_id,
        'kind', adjustment_kind, 'amountMinor', adjustment_amount, 'reason', adjustment_reason
      )
    );
  end if;

  if requested_total + adjustment_amount = outstanding_minor then
    update public.orders
    set status = 'closed', closed_at = now(), version = version + 1
    where id = target_order_id and tenant_id = target_tenant_id;
    insert into public.order_status_history (
      tenant_id, branch_id, order_id, status, actor_user_id, metadata
    ) values (
      target_tenant_id, target_branch_id, target_order_id, 'closed', actor_id,
      jsonb_build_object('paymentIds', payment_ids)
    );
  end if;

  response_payload := jsonb_build_object(
    'orderId', target_order_id,
    'paymentIds', payment_ids,
    'paidMinor', requested_total,
    'adjustmentMinor', adjustment_amount,
    'adjustmentKind', adjustment_kind,
    'outstandingMinor', outstanding_minor - requested_total - adjustment_amount,
    'orderClosed', requested_total + adjustment_amount = outstanding_minor
  );
  insert into public.financial_commands (
    tenant_id, branch_id, actor_user_id, idempotency_key,
    command_type, response
  ) values (
    target_tenant_id, target_branch_id, actor_id, target_idempotency_key,
    'record_payments', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'payment.recorded', 'order', target_order_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'paymentIds', payment_ids,
      'amountMinor', requested_total
    )
  );
  return response_payload;
end;
$$;

revoke all on function public.record_order_payments(uuid, uuid, uuid, uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.record_order_payments(uuid, uuid, uuid, uuid, jsonb, text, jsonb) to authenticated;

-- 6) reports: separate gross / discount / promotion / refund / net, and the discount audit ---------------------
create or replace function public.sales_report(target_tenant_id uuid, target_branch_id uuid, range_start date, range_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- gross = the original product total (KDV included); discount / promotion are recorded at the cash desk
    -- (order_adjustments) and are NOT payments; refund = historical refunds (the feature no longer exists)
    'grossMinor', coalesce(sum(o.total_minor + o.discount_minor), 0),
    'discountMinor', coalesce(sum(o.discount_minor + adjustment.discount_minor), 0),
    'promotionMinor', coalesce(sum(adjustment.promotion_minor), 0),
    'refundMinor', coalesce((
      select sum(refund.amount_minor) from public.payment_refunds refund
      where refund.tenant_id = target_tenant_id and refund.branch_id = target_branch_id
        and refund.created_at >= from_ts and refund.created_at < to_ts
    ), 0),
    'netMinor', coalesce(sum(o.total_minor - adjustment.discount_minor - adjustment.promotion_minor), 0) - coalesce((
      select sum(refund.amount_minor) from public.payment_refunds refund
      where refund.tenant_id = target_tenant_id and refund.branch_id = target_branch_id
        and refund.created_at >= from_ts and refund.created_at < to_ts
    ), 0),
    'taxMinor', coalesce(sum(o.tax_minor - case when o.total_minor > 0
      then round(o.tax_minor::numeric * (adjustment.discount_minor + adjustment.promotion_minor) / o.total_minor)
      else 0 end), 0),
    'averageMinor', coalesce(round(avg(o.total_minor - adjustment.discount_minor - adjustment.promotion_minor)), 0),
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
  cross join lateral (
    select coalesce(sum(a.amount_minor) filter (where a.kind = 'discount'), 0)::bigint as discount_minor,
           coalesce(sum(a.amount_minor) filter (where a.kind = 'promotion'), 0)::bigint as promotion_minor
    from public.order_adjustments a
    where a.tenant_id = o.tenant_id and a.order_id = o.id
  ) adjustment
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
      'netMinor', sum(o.total_minor - adjustment.adjusted_minor)
    ) as day_row
    from public.orders o
    cross join lateral (
      select coalesce(sum(a.amount_minor), 0)::bigint as adjusted_minor
      from public.order_adjustments a
      where a.tenant_id = o.tenant_id and a.order_id = o.id
    ) adjustment
    where o.tenant_id = target_tenant_id and o.branch_id = target_branch_id
      and o.status = 'closed' and o.closed_at >= from_ts and o.closed_at < to_ts
    group by (o.closed_at at time zone branch_timezone)::date
  ) days;

  select coalesce(jsonb_agg(hour_row order by (hour_row ->> 'hour')::integer), '[]'::jsonb) into by_hour
  from (
    select jsonb_build_object(
      'hour', extract(hour from o.closed_at at time zone branch_timezone)::integer,
      'orderCount', count(*),
      'netMinor', sum(o.total_minor - adjustment.adjusted_minor)
    ) as hour_row
    from public.orders o
    cross join lateral (
      select coalesce(sum(a.amount_minor), 0)::bigint as adjusted_minor
      from public.order_adjustments a
      where a.tenant_id = o.tenant_id and a.order_id = o.id
    ) adjustment
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
      'netMinor', sum(o.total_minor - adjustment.adjusted_minor)
    ) as staff_row
    from public.orders o
    left join public.profiles profile on profile.id = o.created_by
    cross join lateral (
      select coalesce(sum(a.amount_minor), 0)::bigint as adjusted_minor
      from public.order_adjustments a
      where a.tenant_id = o.tenant_id and a.order_id = o.id
    ) adjustment
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
$function$;

create or replace function public.discount_audit(
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
  rows_value jsonb;
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

  select coalesce(jsonb_agg(row_value order by (row_value ->> 'createdAt') desc), '[]'::jsonb)
  into rows_value
  from (
    select jsonb_build_object(
      'adjustmentId', adjustment.id,
      'createdAt', adjustment.created_at,
      'kind', adjustment.kind,
      'amountMinor', adjustment.amount_minor,
      'reason', adjustment.reason,
      'orderId', o.id,
      'orderNumber', o.order_number,
      'tableLabel', t.label,
      'originalTotalMinor', o.total_minor + o.discount_minor,
      'cashMinor', coalesce((
        select sum(p.amount_minor) from public.payments p
        where p.tenant_id = o.tenant_id and p.order_id = o.id and p.status = 'completed' and p.method = 'cash'), 0),
      'cardMinor', coalesce((
        select sum(p.amount_minor) from public.payments p
        where p.tenant_id = o.tenant_id and p.order_id = o.id and p.status = 'completed' and p.method = 'card'), 0),
      'cashierName', coalesce(profile.full_name, 'Ekip üyesi'),
      'branchName', branch.name,
      'tenantName', tenant.name
    ) as row_value
    from public.order_adjustments adjustment
    join public.orders o on o.tenant_id = adjustment.tenant_id and o.id = adjustment.order_id
    left join public.restaurant_tables t on t.tenant_id = o.tenant_id and t.id = o.table_id
    left join public.profiles profile on profile.id = adjustment.created_by
    join public.branches branch on branch.tenant_id = adjustment.tenant_id and branch.id = adjustment.branch_id
    join public.tenants tenant on tenant.id = adjustment.tenant_id
    where adjustment.tenant_id = target_tenant_id and adjustment.branch_id = target_branch_id
      and adjustment.created_at >= from_ts and adjustment.created_at < to_ts
  ) audit_rows;

  return rows_value;
end;
$$;

revoke all on function public.discount_audit(uuid, uuid, date, date) from public, anon;
grant execute on function public.discount_audit(uuid, uuid, date, date) to authenticated;

-- 7) the refund permission is gone; discounts belong to the cash desk -----------------------------------------
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
          'cash.open', 'cash.close', 'reports.read',
          'reports.history', 'staff.view', 'shifts.manage', 'discounts.apply',
          'catalog.availability'
        )
      )
      or (
        role.code = 'cashier'
        and permission.code in (
          'tables.read', 'payments.create', 'discounts.apply',
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

do $$
declare
  tenant_row record;
begin
  for tenant_row in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_row.id);
  end loop;
end
$$;

delete from public.membership_permission_grants
where permission_id in (select id from public.permissions where code = 'payments.refund');
delete from public.role_permissions
where permission_id in (select id from public.permissions where code = 'payments.refund');
delete from public.permissions where code = 'payments.refund';

-- the finance read policies of 0035 without the refund permission
drop policy if exists cash_sessions_finance_read_restrict on public.cash_sessions;
create policy cash_sessions_finance_read_restrict
on public.cash_sessions
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.open')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

drop policy if exists payments_finance_read_restrict on public.payments;
create policy payments_finance_read_restrict
on public.payments
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

drop policy if exists payment_refunds_finance_read_restrict on public.payment_refunds;
create policy payment_refunds_finance_read_restrict
on public.payment_refunds
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

drop policy if exists payment_allocations_finance_read_restrict on public.payment_allocations;
create policy payment_allocations_finance_read_restrict
on public.payment_allocations
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

commit;
