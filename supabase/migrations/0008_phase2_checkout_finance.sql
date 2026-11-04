-- MK Adisyon Web / Phase 2 Module 7
-- Cash sessions, split payments, refunds and append-only finance commands.

begin;

alter table public.cash_registers
  add constraint cash_registers_tenant_branch_id_unique
  unique (tenant_id, branch_id, id);
alter table public.cash_sessions
  add column expected_closing_minor bigint,
  add column difference_minor bigint,
  add constraint cash_sessions_tenant_branch_id_unique
  unique (tenant_id, branch_id, id),
  add constraint cash_sessions_register_branch_fk
  foreign key (tenant_id, branch_id, cash_register_id)
  references public.cash_registers(tenant_id, branch_id, id) on delete restrict;
alter table public.payments
  add constraint payments_order_branch_fk
  foreign key (tenant_id, branch_id, order_id)
  references public.orders(tenant_id, branch_id, id) on delete restrict,
  add constraint payments_session_branch_fk
  foreign key (tenant_id, branch_id, cash_session_id)
  references public.cash_sessions(tenant_id, branch_id, id) on delete restrict;

create unique index cash_sessions_one_open_register_idx
on public.cash_sessions (tenant_id, branch_id, cash_register_id)
where status = 'open';

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  payment_id uuid not null,
  order_id uuid not null,
  order_item_id uuid not null,
  quantity integer not null check (quantity > 0),
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, payment_id, order_item_id),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id) on delete restrict,
  foreign key (tenant_id, branch_id, order_id)
    references public.orders(tenant_id, branch_id, id) on delete restrict,
  foreign key (tenant_id, order_item_id)
    references public.order_items(tenant_id, id) on delete restrict
);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  payment_id uuid not null,
  cash_session_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments(tenant_id, id) on delete restrict,
  foreign key (tenant_id, branch_id, cash_session_id)
    references public.cash_sessions(tenant_id, branch_id, id) on delete restrict
);

create table public.financial_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null
    check (char_length(idempotency_key) between 16 and 120),
  command_type text not null check (
    command_type in (
      'open_session', 'record_payments', 'refund_payment',
      'cash_movement', 'close_session'
    )
  ),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, actor_user_id, idempotency_key),
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict
);

create index payment_allocations_order_idx
on public.payment_allocations (tenant_id, order_id, order_item_id);
create index payment_refunds_payment_idx
on public.payment_refunds (tenant_id, payment_id, created_at);

alter table public.payment_allocations enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.financial_commands enable row level security;

revoke all on public.payment_allocations, public.payment_refunds,
  public.financial_commands from anon, authenticated;
grant select on public.payment_allocations, public.payment_refunds
to authenticated;

create policy payment_allocations_select_branch
on public.payment_allocations for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));
create policy payment_refunds_select_branch
on public.payment_refunds for select to authenticated
using (private.has_branch_access(tenant_id, branch_id));

revoke insert, update on public.cash_sessions, public.payments,
  public.cash_movements from authenticated;

create or replace function private.cash_session_expected_minor(
  target_tenant_id uuid,
  target_cash_session_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    cash_session.opening_minor
    + coalesce((
      select sum(payment.amount_minor)
      from public.payments payment
      where payment.tenant_id = target_tenant_id
        and payment.cash_session_id = target_cash_session_id
        and payment.method = 'cash'
        and payment.status = 'completed'
    ), 0)
    - coalesce((
      select sum(refund.amount_minor)
      from public.payment_refunds refund
      join public.payments payment
        on payment.tenant_id = refund.tenant_id
        and payment.id = refund.payment_id
      where refund.tenant_id = target_tenant_id
        and refund.cash_session_id = target_cash_session_id
        and payment.method = 'cash'
    ), 0)
    + coalesce((
      select sum(case when movement.movement_type = 'income'
        then movement.amount_minor else -movement.amount_minor end)
      from public.cash_movements movement
      where movement.tenant_id = target_tenant_id
        and movement.cash_session_id = target_cash_session_id
    ), 0)
  from public.cash_sessions cash_session
  where cash_session.tenant_id = target_tenant_id
    and cash_session.id = target_cash_session_id;
$$;

create or replace function public.open_cash_session(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_cash_register_id uuid,
  target_opening_minor bigint,
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
  new_session_id uuid;
  response_payload jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'cash.open'
  ) then
    raise exception using errcode = '42501', message = 'cash_open_denied';
  end if;
  if target_opening_minor < 0
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_cash_open_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || actor_id::text || ':' || target_idempotency_key, 0
  ));
  select command_type, response into existing_command
  from public.financial_commands
  where tenant_id = target_tenant_id and actor_user_id = actor_id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_command.command_type <> 'open_session' then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_command.response;
  end if;

  perform 1 from public.cash_registers
  where id = target_cash_register_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id and is_active
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'cash_register_not_available';
  end if;
  if exists (
    select 1 from public.cash_sessions
    where tenant_id = target_tenant_id and branch_id = target_branch_id
      and cash_register_id = target_cash_register_id and status = 'open'
  ) then
    raise exception using errcode = 'P0001', message = 'cash_session_already_open';
  end if;

  insert into public.cash_sessions (
    tenant_id, branch_id, cash_register_id, status, opening_minor, opened_by
  ) values (
    target_tenant_id, target_branch_id, target_cash_register_id,
    'open', target_opening_minor, actor_id
  ) returning id into new_session_id;

  response_payload := jsonb_build_object(
    'cashSessionId', new_session_id,
    'status', 'open',
    'openingMinor', target_opening_minor
  );
  insert into public.financial_commands (
    tenant_id, branch_id, actor_user_id, idempotency_key,
    command_type, response
  ) values (
    target_tenant_id, target_branch_id, actor_id, target_idempotency_key,
    'open_session', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'cash.session_opened', 'cash_session',
    new_session_id,
    jsonb_build_object('branchId', target_branch_id, 'openingMinor', target_opening_minor)
  );
  return response_payload;
end;
$$;

create or replace function public.refund_payment(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_payment_id uuid,
  target_cash_session_id uuid,
  target_amount_minor bigint,
  target_reason text,
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
  payment_record record;
  refunded_minor bigint;
  new_refund_id uuid;
  response_payload jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'payments.refund'
  ) then
    raise exception using errcode = '42501', message = 'payment_refund_denied';
  end if;
  if target_amount_minor <= 0
    or char_length(trim(coalesce(target_reason, ''))) not between 3 and 300
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_refund_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || actor_id::text || ':' || target_idempotency_key, 0
  ));
  select command_type, response into existing_command
  from public.financial_commands
  where tenant_id = target_tenant_id and actor_user_id = actor_id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_command.command_type <> 'refund_payment' then
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
  select id, order_id, amount_minor, method into payment_record
  from public.payments
  where id = target_payment_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id and status = 'completed'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'payment_not_refundable';
  end if;
  select coalesce(sum(amount_minor), 0) into refunded_minor
  from public.payment_refunds
  where tenant_id = target_tenant_id and payment_id = target_payment_id;
  if refunded_minor + target_amount_minor > payment_record.amount_minor then
    raise exception using errcode = 'P0001', message = 'refund_exceeds_payment';
  end if;

  insert into public.payment_refunds (
    tenant_id, branch_id, payment_id, cash_session_id, amount_minor,
    reason, idempotency_key, created_by
  ) values (
    target_tenant_id, target_branch_id, target_payment_id,
    target_cash_session_id, target_amount_minor, trim(target_reason),
    target_idempotency_key, actor_id
  ) returning id into new_refund_id;

  response_payload := jsonb_build_object(
    'refundId', new_refund_id,
    'paymentId', target_payment_id,
    'orderId', payment_record.order_id,
    'amountMinor', target_amount_minor
  );
  insert into public.financial_commands (
    tenant_id, branch_id, actor_user_id, idempotency_key,
    command_type, response
  ) values (
    target_tenant_id, target_branch_id, actor_id, target_idempotency_key,
    'refund_payment', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'payment.refunded', 'payment', target_payment_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'refundId', new_refund_id,
      'amountMinor', target_amount_minor, 'reason', trim(target_reason)
    )
  );
  return response_payload;
end;
$$;

create or replace function public.record_cash_movement(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_cash_session_id uuid,
  target_movement_type text,
  target_amount_minor bigint,
  target_reason text,
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
  new_movement_id uuid;
  response_payload jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'payments.create'
  ) then
    raise exception using errcode = '42501', message = 'cash_movement_denied';
  end if;
  if target_movement_type not in ('income', 'expense')
    or target_amount_minor <= 0
    or char_length(trim(coalesce(target_reason, ''))) not between 3 and 300
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_cash_movement';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || actor_id::text || ':' || target_idempotency_key, 0
  ));
  select command_type, response into existing_command
  from public.financial_commands
  where tenant_id = target_tenant_id and actor_user_id = actor_id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_command.command_type <> 'cash_movement' then
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

  insert into public.cash_movements (
    tenant_id, cash_session_id, movement_type, amount_minor,
    reason, created_by
  ) values (
    target_tenant_id, target_cash_session_id, target_movement_type,
    target_amount_minor, trim(target_reason), actor_id
  ) returning id into new_movement_id;
  response_payload := jsonb_build_object(
    'movementId', new_movement_id,
    'cashSessionId', target_cash_session_id,
    'movementType', target_movement_type,
    'amountMinor', target_amount_minor
  );
  insert into public.financial_commands (
    tenant_id, branch_id, actor_user_id, idempotency_key,
    command_type, response
  ) values (
    target_tenant_id, target_branch_id, actor_id, target_idempotency_key,
    'cash_movement', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'cash.movement_recorded', 'cash_movement',
    new_movement_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'type', target_movement_type,
      'amountMinor', target_amount_minor
    )
  );
  return response_payload;
end;
$$;

create or replace function public.close_cash_session(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_cash_session_id uuid,
  target_closing_minor bigint,
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
  expected_minor bigint;
  response_payload jsonb;
begin
  if actor_id is null or not private.has_branch_permission(
    target_tenant_id, target_branch_id, 'cash.close'
  ) then
    raise exception using errcode = '42501', message = 'cash_close_denied';
  end if;
  if target_closing_minor < 0
    or char_length(coalesce(target_idempotency_key, '')) not between 16 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_cash_close_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant_id::text || ':' || actor_id::text || ':' || target_idempotency_key, 0
  ));
  select command_type, response into existing_command
  from public.financial_commands
  where tenant_id = target_tenant_id and actor_user_id = actor_id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_command.command_type <> 'close_session' then
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

  expected_minor := private.cash_session_expected_minor(
    target_tenant_id, target_cash_session_id
  );
  update public.cash_sessions
  set status = 'closed', closing_minor = target_closing_minor,
      expected_closing_minor = expected_minor,
      difference_minor = target_closing_minor - expected_minor,
      closed_by = actor_id, closed_at = now()
  where id = target_cash_session_id and tenant_id = target_tenant_id;

  response_payload := jsonb_build_object(
    'cashSessionId', target_cash_session_id,
    'status', 'closed',
    'expectedMinor', expected_minor,
    'closingMinor', target_closing_minor,
    'differenceMinor', target_closing_minor - expected_minor
  );
  insert into public.financial_commands (
    tenant_id, branch_id, actor_user_id, idempotency_key,
    command_type, response
  ) values (
    target_tenant_id, target_branch_id, actor_id, target_idempotency_key,
    'close_session', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'cash.session_closed', 'cash_session',
    target_cash_session_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'expectedMinor', expected_minor,
      'closingMinor', target_closing_minor,
      'differenceMinor', target_closing_minor - expected_minor
    )
  );
  return response_payload;
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

  select id, status, total_minor, version into order_record
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

revoke all on function private.cash_session_expected_minor(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.open_cash_session(uuid, uuid, uuid, bigint, text)
from public, anon;
revoke all on function public.record_order_payments(uuid, uuid, uuid, uuid, jsonb, text)
from public, anon;
revoke all on function public.refund_payment(uuid, uuid, uuid, uuid, bigint, text, text)
from public, anon;
revoke all on function public.record_cash_movement(uuid, uuid, uuid, text, bigint, text, text)
from public, anon;
revoke all on function public.close_cash_session(uuid, uuid, uuid, bigint, text)
from public, anon;

grant execute on function public.open_cash_session(uuid, uuid, uuid, bigint, text)
to authenticated;
grant execute on function public.record_order_payments(uuid, uuid, uuid, uuid, jsonb, text)
to authenticated;
grant execute on function public.refund_payment(uuid, uuid, uuid, uuid, bigint, text, text)
to authenticated;
grant execute on function public.record_cash_movement(uuid, uuid, uuid, text, bigint, text, text)
to authenticated;
grant execute on function public.close_cash_session(uuid, uuid, uuid, bigint, text)
to authenticated;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'cash_sessions', 'payments', 'payment_refunds'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
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
