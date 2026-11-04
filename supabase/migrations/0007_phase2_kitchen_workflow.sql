-- MK Adisyon Web / Phase 2 Module 6
-- Transactional kitchen transitions and aggregate order status.

begin;

alter table public.order_commands
  drop constraint if exists order_commands_command_type_check;
alter table public.order_commands
  add constraint order_commands_command_type_check check (
    command_type in (
      'open_order', 'append_items', 'update_item', 'submit_order',
      'kitchen_transition'
    )
  );

create or replace function public.transition_kitchen_ticket(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_ticket_id uuid,
  target_expected_status public.kitchen_ticket_status,
  target_status public.kitchen_ticket_status,
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
  ticket_record record;
  order_record record;
  all_served boolean;
  all_ready_or_served boolean;
  derived_order_status public.order_status;
  next_order_version integer;
  response_payload jsonb;
begin
  if actor_id is null
    or not private.has_branch_permission(
      target_tenant_id, target_branch_id, 'kitchen.update'
    ) then
    raise exception using errcode = '42501', message = 'kitchen_transition_denied';
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
    if existing_command.command_type <> 'kitchen_transition' then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_command.response;
  end if;

  select id, order_id, status into ticket_record
  from public.kitchen_tickets
  where id = target_ticket_id
    and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'kitchen_ticket_not_found';
  end if;

  if ticket_record.status <> target_expected_status then
    raise exception using errcode = 'P0001', message = 'kitchen_status_conflict';
  end if;
  if not (
    (target_expected_status = 'new' and target_status = 'preparing')
    or (target_expected_status = 'preparing' and target_status = 'ready')
    or (target_expected_status = 'ready' and target_status = 'served')
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_kitchen_transition';
  end if;

  select id, status, version into order_record
  from public.orders
  where id = ticket_record.order_id
    and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;
  if not found or order_record.status in ('closed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'kitchen_order_not_active';
  end if;

  update public.kitchen_tickets
  set status = target_status,
      started_at = case
        when target_status = 'preparing' then coalesce(started_at, now())
        else started_at
      end,
      ready_at = case
        when target_status = 'ready' then coalesce(ready_at, now())
        else ready_at
      end,
      served_at = case
        when target_status = 'served' then coalesce(served_at, now())
        else served_at
      end
  where id = target_ticket_id and tenant_id = target_tenant_id;

  select
    bool_and(status = 'served'),
    bool_and(status in ('ready', 'served'))
  into all_served, all_ready_or_served
  from public.kitchen_tickets
  where tenant_id = target_tenant_id
    and branch_id = target_branch_id
    and order_id = ticket_record.order_id
    and status <> 'cancelled';

  derived_order_status := case
    when all_served then 'served'::public.order_status
    when all_ready_or_served then 'ready'::public.order_status
    else 'in_progress'::public.order_status
  end;
  next_order_version := order_record.version;

  if order_record.status <> derived_order_status then
    update public.orders
    set status = derived_order_status, version = version + 1
    where id = ticket_record.order_id and tenant_id = target_tenant_id
    returning version into next_order_version;

    insert into public.order_status_history (
      tenant_id, branch_id, order_id, status, actor_user_id, metadata
    ) values (
      target_tenant_id, target_branch_id, ticket_record.order_id,
      derived_order_status, actor_id,
      jsonb_build_object('ticketId', target_ticket_id)
    );
  end if;

  response_payload := jsonb_build_object(
    'ticketId', target_ticket_id,
    'ticketStatus', target_status,
    'orderId', ticket_record.order_id,
    'orderStatus', derived_order_status,
    'orderVersion', next_order_version
  );

  insert into public.order_commands (
    tenant_id, branch_id, order_id, actor_user_id,
    idempotency_key, command_type, response
  ) values (
    target_tenant_id, target_branch_id, ticket_record.order_id, actor_id,
    target_idempotency_key, 'kitchen_transition', response_payload
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'kitchen.ticket_transitioned',
    'kitchen_ticket', target_ticket_id,
    jsonb_build_object(
      'branchId', target_branch_id,
      'orderId', ticket_record.order_id,
      'from', target_expected_status,
      'to', target_status,
      'orderStatus', derived_order_status
    )
  );

  return response_payload;
end;
$$;

revoke all on function public.transition_kitchen_ticket(
  uuid, uuid, uuid, public.kitchen_ticket_status,
  public.kitchen_ticket_status, text
) from public, anon;
grant execute on function public.transition_kitchen_ticket(
  uuid, uuid, uuid, public.kitchen_ticket_status,
  public.kitchen_ticket_status, text
) to authenticated;

commit;
