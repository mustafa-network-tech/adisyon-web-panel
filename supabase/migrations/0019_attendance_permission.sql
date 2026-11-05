-- MK Adisyon Web / Attendance approval is its own permission
-- Approving what was actually worked (puantaj) is no longer part of
-- shifts.manage. attendance.manage is held by owner and tenant_admin; a
-- manager only gets it when a company admin grants it as an extra permission.
-- Shift planning (shifts.manage) is unchanged.

begin;

insert into public.permissions (code, description) values
  ('attendance.manage', 'Gunluk calisma suresini (puantaj) onaylama')
on conflict (code) do nothing;

-- Owner and tenant_admin hold every permission, so refresh the system roles.
do $$
declare
  tenant_record record;
begin
  for tenant_record in select id from public.tenants loop
    perform private.ensure_system_roles(tenant_record.id);
  end loop;
end $$;

-- Only approvers (and the person themselves) read attendance rows.
drop policy if exists shift_attendance_select on public.shift_attendance;
create policy shift_attendance_select
on public.shift_attendance for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_branch_permission(tenant_id, branch_id, 'attendance.manage')
  or private.has_branch_permission(tenant_id, branch_id, 'payroll.manage')
);

create or replace function public.approve_shift_attendance(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_shift_id uuid,
  target_status text,
  target_minutes integer,
  target_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  shift_record record;
  planned_minutes integer;
  final_minutes integer;
  clean_note text := nullif(trim(coalesce(target_note, '')), '');
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'attendance.manage') then
    raise exception using errcode = '42501', message = 'attendance_denied';
  end if;
  if target_status not in ('worked', 'absent')
    or char_length(coalesce(clean_note, '')) > 200 then
    raise exception using errcode = 'P0001', message = 'invalid_attendance';
  end if;

  select shift.membership_id, shift.shift_date, shift.start_time, shift.end_time
  into shift_record
  from public.shifts shift
  where shift.tenant_id = target_tenant_id
    and shift.branch_id = target_branch_id
    and shift.id = target_shift_id
    and shift.kind = 'work';
  if not found then
    raise exception using errcode = 'P0001', message = 'shift_not_found';
  end if;
  if shift_record.shift_date > (now() at time zone 'Europe/Istanbul')::date then
    raise exception using errcode = 'P0001', message = 'attendance_in_future';
  end if;

  planned_minutes := (
    (extract(epoch from (shift_record.end_time - shift_record.start_time))::integer / 60)
    + 1440
  ) % 1440;
  final_minutes := case
    when target_status = 'absent' then 0
    else coalesce(target_minutes, planned_minutes)
  end;
  if final_minutes < 0 or final_minutes > 1440
    or (target_status = 'worked' and final_minutes = 0) then
    raise exception using errcode = 'P0001', message = 'invalid_attendance';
  end if;

  insert into public.shift_attendance (
    tenant_id, shift_id, branch_id, membership_id, shift_date, status,
    approved_minutes, note, approved_by
  ) values (
    target_tenant_id, target_shift_id, target_branch_id,
    shift_record.membership_id, shift_record.shift_date, target_status,
    final_minutes, clean_note, actor_id
  )
  on conflict (tenant_id, shift_id) do update
  set status = excluded.status, approved_minutes = excluded.approved_minutes,
      note = excluded.note, approved_by = actor_id, approved_at = now();

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'attendance.approved', 'shift', target_shift_id,
    jsonb_build_object(
      'branchId', target_branch_id, 'membershipId', shift_record.membership_id,
      'date', shift_record.shift_date, 'status', target_status,
      'minutes', final_minutes
    )
  );
  return jsonb_build_object('shiftId', target_shift_id, 'status', target_status, 'minutes', final_minutes);
end;
$$;

create or replace function public.approve_attendance_as_planned(
  target_tenant_id uuid,
  target_branch_id uuid,
  range_start date,
  range_end date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  approved_count integer;
begin
  if actor_id is null
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'attendance.manage') then
    raise exception using errcode = '42501', message = 'attendance_denied';
  end if;
  if range_start is null or range_end is null or range_end < range_start
    or range_end - range_start > 31 then
    raise exception using errcode = 'P0001', message = 'invalid_attendance';
  end if;

  insert into public.shift_attendance (
    tenant_id, shift_id, branch_id, membership_id, shift_date, status,
    approved_minutes, approved_by
  )
  select shift.tenant_id, shift.id, shift.branch_id, shift.membership_id,
    shift.shift_date, 'worked',
    (
      (extract(epoch from (shift.end_time - shift.start_time))::integer / 60) + 1440
    ) % 1440,
    actor_id
  from public.shifts shift
  where shift.tenant_id = target_tenant_id
    and shift.branch_id = target_branch_id
    and shift.kind = 'work'
    and shift.shift_date between range_start and range_end
    and shift.shift_date <= (now() at time zone 'Europe/Istanbul')::date
    and not exists (
      select 1 from public.shift_attendance existing
      where existing.tenant_id = shift.tenant_id and existing.shift_id = shift.id
    );
  get diagnostics approved_count = row_count;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'attendance.bulk_approved', 'branch',
    target_branch_id,
    jsonb_build_object('from', range_start, 'to', range_end, 'count', approved_count)
  );
  return jsonb_build_object('approved', approved_count);
end;
$$;

commit;
