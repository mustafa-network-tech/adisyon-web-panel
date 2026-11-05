-- MK Adisyon Web / Attendance approval and payroll records
--   * shift_attendance : manager approval of what was actually worked
--   * staff_pay        : pay type (monthly / hourly) and amount per person
--   * payroll_entries  : manual bonus (optional), deduction and advance lines
-- Permissions:
--   shifts.manage   (manager and above) approves attendance in their branches
--   payroll.manage  (tenant_admin, owner by default) sees and edits pay; can be
--                   granted to a manager as an extra permission
-- Amounts never go to audit_logs: the log only records who changed what.

begin;

insert into public.permissions (code, description) values
  ('payroll.manage', 'Maas, prim, kesinti ve avans kayitlarini yonetme')
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

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.shift_attendance (
  tenant_id uuid not null,
  shift_id uuid not null,
  branch_id uuid not null,
  membership_id uuid not null,
  shift_date date not null,
  status text not null check (status in ('worked', 'absent')),
  approved_minutes integer not null check (approved_minutes between 0 and 1440),
  note text check (char_length(note) <= 200),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  primary key (tenant_id, shift_id),
  check ((status = 'absent' and approved_minutes = 0) or status = 'worked'),
  foreign key (tenant_id, shift_id)
    references public.shifts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete cascade,
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create index shift_attendance_branch_date_idx
on public.shift_attendance (tenant_id, branch_id, shift_date);

create table public.staff_pay (
  tenant_id uuid not null,
  membership_id uuid not null,
  pay_type text not null check (pay_type in ('monthly', 'hourly')),
  amount_minor bigint not null check (amount_minor between 0 and 100000000000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, membership_id),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  period date not null check (period = date_trunc('month', period)::date),
  kind text not null check (kind in ('bonus', 'deduction', 'advance')),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, membership_id)
    references public.tenant_memberships(tenant_id, id) on delete cascade
);

create index payroll_entries_member_period_idx
on public.payroll_entries (tenant_id, membership_id, period);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Pay data: payroll.manage, limited to people the caller shares a branch with
-- (tenant-scope roles reach everyone).
create or replace function private.can_manage_payroll(
  target_tenant_id uuid,
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_tenant_permission(target_tenant_id, 'payroll.manage')
    and (
      private.is_tenant_scope_member(target_tenant_id)
      or private.shares_branch_with(target_tenant_id, target_membership_id)
    );
$$;

alter table public.shift_attendance enable row level security;
alter table public.staff_pay enable row level security;
alter table public.payroll_entries enable row level security;
revoke all on public.shift_attendance, public.staff_pay, public.payroll_entries
from anon, authenticated;
grant select on public.shift_attendance, public.staff_pay, public.payroll_entries
to authenticated;

create policy shift_attendance_select
on public.shift_attendance for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.has_branch_permission(tenant_id, branch_id, 'shifts.manage')
);

create policy staff_pay_select
on public.staff_pay for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.can_manage_payroll(tenant_id, membership_id)
);

create policy payroll_entries_select
on public.payroll_entries for select to authenticated
using (
  private.owns_membership(tenant_id, membership_id)
  or private.can_manage_payroll(tenant_id, membership_id)
);

-- ---------------------------------------------------------------------------
-- Attendance approval
-- ---------------------------------------------------------------------------

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
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'shifts.manage') then
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

-- Approve every not-yet-approved, already-finished shift in a range as planned.
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
    or not private.has_branch_permission(target_tenant_id, target_branch_id, 'shifts.manage') then
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

-- ---------------------------------------------------------------------------
-- Pay and payroll lines (payroll.manage)
-- ---------------------------------------------------------------------------

create or replace function public.set_staff_pay(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_pay_type text,
  target_amount_minor bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not private.can_manage_payroll(target_tenant_id, target_membership_id) then
    raise exception using errcode = '42501', message = 'payroll_denied';
  end if;
  if target_pay_type not in ('monthly', 'hourly')
    or target_amount_minor is null
    or target_amount_minor < 0 or target_amount_minor > 100000000000 then
    raise exception using errcode = 'P0001', message = 'invalid_payroll';
  end if;
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = target_tenant_id and id = target_membership_id
  ) then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;

  insert into public.staff_pay (
    tenant_id, membership_id, pay_type, amount_minor, updated_by
  ) values (
    target_tenant_id, target_membership_id, target_pay_type,
    target_amount_minor, actor_id
  )
  on conflict (tenant_id, membership_id) do update
  set pay_type = excluded.pay_type, amount_minor = excluded.amount_minor,
      updated_by = actor_id, updated_at = now();

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'payroll.pay_changed', 'tenant_membership',
    target_membership_id, jsonb_build_object('payType', target_pay_type)
  );
  return jsonb_build_object('membershipId', target_membership_id);
end;
$$;

create or replace function public.add_payroll_entry(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_period date,
  target_kind text,
  target_amount_minor bigint,
  target_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid;
  clean_note text := nullif(trim(coalesce(target_note, '')), '');
begin
  if actor_id is null
    or not private.can_manage_payroll(target_tenant_id, target_membership_id) then
    raise exception using errcode = '42501', message = 'payroll_denied';
  end if;
  if target_period is null
    or target_kind not in ('bonus', 'deduction', 'advance')
    or target_amount_minor is null
    or target_amount_minor < 1 or target_amount_minor > 100000000000
    or char_length(coalesce(clean_note, '')) > 200 then
    raise exception using errcode = 'P0001', message = 'invalid_payroll';
  end if;
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = target_tenant_id and id = target_membership_id
  ) then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;

  insert into public.payroll_entries (
    tenant_id, membership_id, period, kind, amount_minor, note, created_by
  ) values (
    target_tenant_id, target_membership_id,
    date_trunc('month', target_period)::date, target_kind,
    target_amount_minor, clean_note, actor_id
  ) returning id into saved_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'payroll.entry_added', 'payroll_entry', saved_id,
    jsonb_build_object('membershipId', target_membership_id, 'kind', target_kind)
  );
  return jsonb_build_object('id', saved_id);
end;
$$;

create or replace function public.delete_payroll_entry(
  target_tenant_id uuid,
  target_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  entry_record record;
begin
  select entry.membership_id, entry.kind into entry_record
  from public.payroll_entries entry
  where entry.tenant_id = target_tenant_id and entry.id = target_entry_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'payroll_entry_not_found';
  end if;
  if actor_id is null
    or not private.can_manage_payroll(target_tenant_id, entry_record.membership_id) then
    raise exception using errcode = '42501', message = 'payroll_denied';
  end if;

  delete from public.payroll_entries
  where tenant_id = target_tenant_id and id = target_entry_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_tenant_id, actor_id, 'payroll.entry_deleted', 'payroll_entry',
    target_entry_id,
    jsonb_build_object('membershipId', entry_record.membership_id, 'kind', entry_record.kind)
  );
  return jsonb_build_object('id', target_entry_id);
end;
$$;

revoke all on function private.can_manage_payroll(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_shift_attendance(uuid, uuid, uuid, text, integer, text) from public, anon;
revoke all on function public.approve_attendance_as_planned(uuid, uuid, date, date) from public, anon;
revoke all on function public.set_staff_pay(uuid, uuid, text, bigint) from public, anon;
revoke all on function public.add_payroll_entry(uuid, uuid, date, text, bigint, text) from public, anon;
revoke all on function public.delete_payroll_entry(uuid, uuid) from public, anon;
grant execute on function public.approve_shift_attendance(uuid, uuid, uuid, text, integer, text) to authenticated;
grant execute on function public.approve_attendance_as_planned(uuid, uuid, date, date) to authenticated;
grant execute on function public.set_staff_pay(uuid, uuid, text, bigint) to authenticated;
grant execute on function public.add_payroll_entry(uuid, uuid, date, text, bigint, text) to authenticated;
grant execute on function public.delete_payroll_entry(uuid, uuid) to authenticated;

commit;
