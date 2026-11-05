-- MK Adisyon Web / Discounts
--   * adisyon discount (amount or percent) on the order, with a reason
--   * item discount: the unit price is lowered, the list price is kept for reports
-- Only holders of discounts.apply (manager, tenant_admin, owner by default) can
-- apply them. An order discount blocks item-split payments (they would not add up);
-- item discounts keep working because the unit price itself changes.

begin;

insert into public.permissions (code, description) values
  ('discounts.apply', 'Adisyon ve urun indirimi uygulama')
on conflict (code) do nothing;

alter table public.orders
  add column discount_type text check (discount_type in ('amount', 'percent')),
  add column discount_value bigint not null default 0 check (discount_value >= 0),
  add column discount_minor bigint not null default 0 check (discount_minor >= 0),
  add column discount_reason text check (char_length(discount_reason) <= 200),
  add column discount_by uuid references auth.users(id) on delete set null,
  add constraint orders_discount_consistent check (
    (discount_type is null and discount_value = 0 and discount_minor = 0)
    or (discount_type is not null and discount_value > 0)
  );

alter table public.order_items
  add column list_unit_price_minor bigint check (list_unit_price_minor >= 0),
  add column discount_reason text check (char_length(discount_reason) <= 200);

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
          'reports.history', 'staff.view', 'shifts.manage', 'discounts.apply'
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
        and permission.code in ('kitchen.read', 'kitchen.update', 'staff.view')
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

-- Totals now account for the adisyon discount. Without a discount the result is
-- identical to before (VAT rounded per line); with one, VAT is computed per rate
-- on the discounted amount.
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
  order_discount_type text;
  order_discount_value bigint;
  applied_discount bigint := 0;
  calculated_tax bigint;
  next_version integer;
begin
  select coalesce(sum(item.line_total_minor), 0)::bigint
  into gross_total
  from public.order_items item
  where item.tenant_id = target_tenant_id and item.order_id = target_order_id;

  select discount_type, discount_value
  into order_discount_type, order_discount_value
  from public.orders
  where tenant_id = target_tenant_id and id = target_order_id;

  if order_discount_type = 'amount' then
    applied_discount := least(order_discount_value, gross_total);
  elsif order_discount_type = 'percent' then
    applied_discount := least(round(gross_total::numeric * order_discount_value / 10000)::bigint, gross_total);
  end if;

  if applied_discount = 0 then
    select coalesce(sum(round(
      item.line_total_minor::numeric * item.tax_rate /
      nullif(100 + item.tax_rate, 0)
    )), 0)::bigint
    into calculated_tax
    from public.order_items item
    where item.tenant_id = target_tenant_id and item.order_id = target_order_id;
  else
    select coalesce(sum(round(
      (rate_group.gross - round(applied_discount::numeric * rate_group.gross / gross_total))
        * rate_group.tax_rate / nullif(100 + rate_group.tax_rate, 0)
    )), 0)::bigint
    into calculated_tax
    from (
      select item.tax_rate, sum(item.line_total_minor) as gross
      from public.order_items item
      where item.tenant_id = target_tenant_id and item.order_id = target_order_id
      group by item.tax_rate
    ) rate_group;
  end if;

  update public.orders
  set subtotal_minor = gross_total - applied_discount - calculated_tax,
      tax_minor = calculated_tax,
      total_minor = gross_total - applied_discount,
      discount_minor = applied_discount,
      version = version + case when bump_version then 1 else 0 end
  where tenant_id = target_tenant_id and id = target_order_id
  returning version into next_version;

  return next_version;
end;
$$;

create or replace function public.record_order_payments(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_cash_session_id uuid,
  target_payments jsonb,
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
  order_record record;
  payment_data jsonb;
  allocation_data jsonb;
  payment_method public.payment_method;
  payment_amount bigint;
  requested_total bigint := 0;
  paid_total bigint;
  refunded_total bigint;
  outstanding_minor bigint;
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
  if jsonb_typeof(target_payments) <> 'array'
    or jsonb_array_length(target_payments) < 1
    or jsonb_array_length(target_payments) > 2
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
  select coalesce(sum(refund.amount_minor), 0) into refunded_total
  from public.payment_refunds refund
  join public.payments payment
    on payment.tenant_id = refund.tenant_id and payment.id = refund.payment_id
  where refund.tenant_id = target_tenant_id and payment.order_id = target_order_id;
  outstanding_minor := order_record.total_minor - paid_total + refunded_total;

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

  if requested_total > outstanding_minor then
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
      -- An adisyon discount is not tied to single items, so item payments would not add up.
      if order_record.discount_minor > 0 then
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

  if requested_total = outstanding_minor then
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
    'outstandingMinor', outstanding_minor - requested_total,
    'orderClosed', requested_total = outstanding_minor
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

-- ---------------------------------------------------------------------------
-- Adisyon discount
-- ---------------------------------------------------------------------------

create or replace function public.apply_order_discount(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_expected_version integer,
  target_type text,
  target_value bigint,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_record record;
  clean_reason text := nullif(trim(coalesce(target_reason, '')), '');
  gross_total bigint;
  new_total bigint;
  paid_total bigint;
  refunded_total bigint;
  next_version integer;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'discounts.apply') then
    raise exception using errcode = '42501', message = 'discount_denied';
  end if;
  if target_type not in ('amount', 'percent', 'none') then
    raise exception using errcode = 'P0001', message = 'invalid_discount';
  end if;
  if target_type <> 'none' and (
    target_value is null or target_value < 1
    or (target_type = 'percent' and target_value > 10000)
    or char_length(coalesce(clean_reason, '')) not between 3 and 200
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_discount';
  end if;

  select id, status, version into order_record
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

  select coalesce(sum(line_total_minor), 0) into gross_total
  from public.order_items
  where tenant_id = target_tenant_id and order_id = target_order_id;
  if target_type = 'amount' and target_value > gross_total then
    raise exception using errcode = 'P0001', message = 'invalid_discount';
  end if;

  -- An order that was already partly paid by item cannot take an adisyon discount.
  if target_type <> 'none' and exists (
    select 1 from public.payment_allocations
    where tenant_id = target_tenant_id and order_id = target_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'discount_after_item_payment';
  end if;

  update public.orders
  set discount_type = case when target_type = 'none' then null else target_type end,
      discount_value = case when target_type = 'none' then 0 else target_value end,
      discount_reason = case when target_type = 'none' then null else clean_reason end,
      discount_by = case when target_type = 'none' then null else actor_id end,
      discount_minor = case when target_type = 'none' then 0 else discount_minor end
  where id = target_order_id and tenant_id = target_tenant_id;
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
    raise exception using errcode = 'P0001', message = 'discount_below_paid';
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id,
    case when target_type = 'none' then 'order.discount_removed' else 'order.discount_applied' end,
    'order', target_order_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'type', target_type, 'value', target_value,
      'reason', clean_reason, 'totalMinor', new_total
    )
  );
  return jsonb_build_object('orderId', target_order_id, 'version', next_version, 'totalMinor', new_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Item discount: lowers the unit price, keeps the list price
-- ---------------------------------------------------------------------------

create or replace function public.apply_item_discount(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_order_item_id uuid,
  target_expected_version integer,
  target_type text,
  target_value bigint,
  target_reason text
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
  clean_reason text := nullif(trim(coalesce(target_reason, '')), '');
  list_price bigint;
  new_price bigint;
  next_version integer;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'discounts.apply') then
    raise exception using errcode = '42501', message = 'discount_denied';
  end if;
  if target_type not in ('amount', 'percent', 'none') then
    raise exception using errcode = 'P0001', message = 'invalid_discount';
  end if;
  if target_type <> 'none' and (
    target_value is null or target_value < 1
    or (target_type = 'percent' and target_value > 10000)
    or char_length(coalesce(clean_reason, '')) not between 3 and 200
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_discount';
  end if;

  select id, status, version into order_record
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

  select id, quantity, unit_price_minor, list_unit_price_minor into item_record
  from public.order_items
  where id = target_order_item_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id and order_id = target_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'order_item_not_editable';
  end if;
  if exists (
    select 1 from public.payment_allocations
    where tenant_id = target_tenant_id and order_item_id = target_order_item_id
  ) then
    raise exception using errcode = 'P0001', message = 'discount_after_item_payment';
  end if;

  list_price := coalesce(item_record.list_unit_price_minor, item_record.unit_price_minor);
  if target_type = 'none' then
    new_price := list_price;
  elsif target_type = 'percent' then
    new_price := round(list_price::numeric * (10000 - target_value) / 10000)::bigint;
  else
    if target_value > list_price then
      raise exception using errcode = 'P0001', message = 'invalid_discount';
    end if;
    new_price := list_price - target_value;
  end if;

  update public.order_items
  set unit_price_minor = new_price,
      line_total_minor = new_price * item_record.quantity,
      list_unit_price_minor = case when target_type = 'none' then null else list_price end,
      discount_reason = case when target_type = 'none' then null else clean_reason end
  where id = target_order_item_id and tenant_id = target_tenant_id;
  next_version := private.refresh_order_totals(target_tenant_id, target_order_id, true);

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id,
    case when target_type = 'none' then 'order_item.discount_removed' else 'order_item.discount_applied' end,
    'order_item', target_order_item_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'orderId', target_order_id,
      'type', target_type, 'value', target_value, 'reason', clean_reason,
      'listPriceMinor', list_price, 'unitPriceMinor', new_price
    )
  );
  return jsonb_build_object('orderId', target_order_id, 'version', next_version, 'unitPriceMinor', new_price);
end;
$$;

revoke all on function public.apply_order_discount(uuid, uuid, uuid, integer, text, bigint, text) from public, anon;
revoke all on function public.apply_item_discount(uuid, uuid, uuid, uuid, integer, text, bigint, text) from public, anon;
grant execute on function public.apply_order_discount(uuid, uuid, uuid, integer, text, bigint, text) to authenticated;
grant execute on function public.apply_item_discount(uuid, uuid, uuid, uuid, integer, text, bigint, text) to authenticated;

-- Re-apply the system role permissions so existing tenants get discounts.apply.
do $$
declare
  tenant_record record;
begin
  for tenant_record in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_record.id);
  end loop;
end $$;

commit;
