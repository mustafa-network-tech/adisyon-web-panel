-- MK Adisyon Web / Phase 2 Module 3
-- Makes support-session relation aliases explicit for hosted PostgreSQL.

begin;

create or replace function public.open_platform_support_session(
  target_tenant_id uuid,
  target_branch_id uuid,
  support_reason text,
  duration_minutes integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session_id uuid;
  support_expires_at timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception 'Platform administrator access required'
      using errcode = '42501';
  end if;

  if char_length(trim(support_reason)) not between 10 and 500 then
    raise exception 'Support reason must contain 10-500 characters'
      using errcode = '22023';
  end if;

  if duration_minutes not between 15 and 240 then
    raise exception 'Support duration must be between 15 and 240 minutes'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.branches as target_branch
    join public.tenants as target_tenant
      on target_tenant.id = target_branch.tenant_id
    where target_branch.tenant_id = target_tenant_id
      and target_branch.id = target_branch_id
      and target_branch.is_active
      and target_tenant.is_active
  ) then
    raise exception 'Active tenant branch not found'
      using errcode = 'P0002';
  end if;

  support_expires_at := now() + make_interval(mins => duration_minutes);

  insert into public.platform_support_sessions (
    admin_user_id,
    tenant_id,
    branch_id,
    reason,
    expires_at
  ) values (
    (select auth.uid()),
    target_tenant_id,
    target_branch_id,
    trim(support_reason),
    support_expires_at
  ) returning id into support_session_id;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    target_tenant_id,
    (select auth.uid()),
    'platform.support.opened',
    'platform_support_session',
    support_session_id,
    jsonb_build_object(
      'branch_id', target_branch_id,
      'reason', trim(support_reason),
      'expires_at', support_expires_at
    )
  );

  return support_session_id;
end;
$$;

revoke all on function public.open_platform_support_session(uuid, uuid, text, integer)
from public;
grant execute on function public.open_platform_support_session(uuid, uuid, text, integer)
to authenticated;

commit;
