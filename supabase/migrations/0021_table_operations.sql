-- MK Adisyon Web / Table operations
--   * move_order_to_table : move an open adisyon to a free table
--   * merge_orders        : merge one adisyon into another (e.g. two tables sit together)
-- Both need orders.update in the branch and fail closed on version conflicts.

begin;

create or replace function public.move_order_to_table(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_order_id uuid,
  target_expected_version integer,
  target_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_record record;
  table_record record;
  next_version integer;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'orders.update') then
    raise exception using errcode = '42501', message = 'order_update_denied';
  end if;

  select id, status, version, table_id into order_record
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
  if order_record.table_id is not distinct from target_table_id then
    raise exception using errcode = 'P0001', message = 'same_table';
  end if;

  select id, operational_status into table_record
  from public.restaurant_tables
  where id = target_table_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id
  for update;
  if not found or table_record.operational_status in ('dirty', 'disabled') then
    raise exception using errcode = 'P0001', message = 'table_not_available';
  end if;
  if exists (
    select 1 from public.orders other
    where other.tenant_id = target_tenant_id and other.branch_id = target_branch_id
      and other.table_id = target_table_id and other.id <> target_order_id
      and other.status in ('draft', 'open', 'submitted', 'in_progress', 'ready', 'served')
  ) then
    raise exception using errcode = 'P0001', message = 'table_has_active_order';
  end if;

  update public.orders
  set table_id = target_table_id, version = version + 1
  where id = target_order_id and tenant_id = target_tenant_id
  returning version into next_version;

  insert into public.order_status_history (
    tenant_id, branch_id, order_id, status, actor_user_id, metadata
  ) values (
    target_tenant_id, target_branch_id, target_order_id, order_record.status,
    actor_id,
    jsonb_build_object('movedFromTableId', order_record.table_id, 'movedToTableId', target_table_id)
  );
  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'order.moved', 'order', target_order_id,
    jsonb_build_object(
      'branchId', target_branch_id,
      'fromTableId', order_record.table_id, 'toTableId', target_table_id
    )
  );
  return jsonb_build_object('orderId', target_order_id, 'version', next_version);
end;
$$;

create or replace function public.merge_orders(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_source_order_id uuid,
  target_source_version integer,
  target_destination_order_id uuid,
  target_destination_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_record record;
  destination_record record;
  next_status public.order_status;
  moved_items integer;
  next_version integer;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'orders.update') then
    raise exception using errcode = '42501', message = 'order_update_denied';
  end if;
  if target_source_order_id = target_destination_order_id then
    raise exception using errcode = 'P0001', message = 'same_order';
  end if;

  -- Lock both in a fixed order so two concurrent merges cannot deadlock.
  perform 1 from public.orders
  where tenant_id = target_tenant_id and branch_id = target_branch_id
    and id in (target_source_order_id, target_destination_order_id)
  order by id
  for update;

  select id, status, version, table_id, discount_minor into source_record
  from public.orders
  where id = target_source_order_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id;
  select id, status, version, table_id into destination_record
  from public.orders
  where id = target_destination_order_id and tenant_id = target_tenant_id
    and branch_id = target_branch_id;
  if source_record.id is null or destination_record.id is null
    or source_record.status in ('closed', 'cancelled')
    or destination_record.status in ('closed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'order_not_editable';
  end if;
  if source_record.version <> target_source_version
    or destination_record.version <> target_destination_version then
    raise exception using errcode = 'P0001', message = 'order_version_conflict';
  end if;
  if exists (
    select 1 from public.payments
    where tenant_id = target_tenant_id and order_id = target_source_order_id
      and status = 'completed'
  ) then
    raise exception using errcode = 'P0001', message = 'merge_source_has_payments';
  end if;
  if source_record.discount_minor > 0 then
    raise exception using errcode = 'P0001', message = 'merge_source_has_discount';
  end if;

  update public.order_items
  set order_id = target_destination_order_id
  where tenant_id = target_tenant_id and branch_id = target_branch_id
    and order_id = target_source_order_id;
  get diagnostics moved_items = row_count;
  update public.kitchen_tickets
  set order_id = target_destination_order_id
  where tenant_id = target_tenant_id and branch_id = target_branch_id
    and order_id = target_source_order_id;

  -- The emptied adisyon is cancelled and kept for the audit trail.
  perform private.refresh_order_totals(target_tenant_id, target_source_order_id, true);
  update public.orders
  set status = 'cancelled', closed_at = now()
  where id = target_source_order_id and tenant_id = target_tenant_id;
  insert into public.order_status_history (
    tenant_id, branch_id, order_id, status, actor_user_id, metadata
  ) values (
    target_tenant_id, target_branch_id, target_source_order_id, 'cancelled',
    actor_id, jsonb_build_object('mergedInto', target_destination_order_id)
  );

  next_version := private.refresh_order_totals(target_tenant_id, target_destination_order_id, true);
  -- With nothing waiting to be sent, the status follows the kitchen tickets again.
  if not exists (
    select 1 from public.order_items
    where tenant_id = target_tenant_id and order_id = target_destination_order_id
      and quantity > sent_quantity
  ) then
    next_status := private.post_submit_status(
      target_tenant_id, target_branch_id, target_destination_order_id, 0
    );
    if next_status <> destination_record.status then
      update public.orders set status = next_status
      where id = target_destination_order_id and tenant_id = target_tenant_id;
      insert into public.order_status_history (
        tenant_id, branch_id, order_id, status, actor_user_id, metadata
      ) values (
        target_tenant_id, target_branch_id, target_destination_order_id,
        next_status, actor_id, jsonb_build_object('mergedFrom', target_source_order_id)
      );
    end if;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'order.merged', 'order', target_destination_order_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'sourceOrderId', target_source_order_id,
      'movedItems', moved_items
    )
  );
  return jsonb_build_object(
    'orderId', target_destination_order_id, 'version', next_version, 'movedItems', moved_items
  );
end;
$$;

revoke all on function public.move_order_to_table(uuid, uuid, uuid, integer, uuid) from public, anon;
revoke all on function public.merge_orders(uuid, uuid, uuid, integer, uuid, integer) from public, anon;
grant execute on function public.move_order_to_table(uuid, uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.merge_orders(uuid, uuid, uuid, integer, uuid, integer) to authenticated;

commit;
