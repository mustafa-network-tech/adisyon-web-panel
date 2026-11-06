-- MK Adisyon Web / 0040: join requests with a business code replace invitation links
--
-- Product decision: staff no longer join through an e-mailed invitation link. They create their own account,
-- type the business name and its unique business code, and a JOIN REQUEST is created. Knowing the code gives
-- no membership and no access to any business data; an owner or a manager with users.manage approves the
-- request and chooses the role and branches. Rejected requests cannot be repeated, suspended members cannot
-- come back by typing the code, and the code can be rotated by the owner.
--
--   * tenant_join_codes   one random code per business (never readable by ordinary members)
--   * join_requests       the requests (a user sees only his own, a manager sees those of his business)
--   * join_attempts       failed code tries, used for a rate limit (5 failures in 15 minutes)
--   * request_join_tenant / my_join_requests / list_join_requests / decide_join_request /
--     get_join_code / rotate_join_code   (SECURITY DEFINER, authenticated only)
--   * the invitation functions are dropped; the tenant_invitations table is kept as history
--   * the package user limit is checked in the database, serialised per business, wherever a membership
--     becomes active (approval here, reactivation in 0041). One person with several branches is ONE user.
--
-- ROLLBACK: none. Invitation links were removed by product decision (old invitation rows are kept as history).
-- To undo it, restore the database backup.

begin;

-- 1) the old invitation machinery ---------------------------------------------------------------------------------
drop function if exists public.create_tenant_invitation(uuid, uuid, text, uuid, integer);
drop function if exists public.accept_tenant_invitation(text);
drop function if exists public.get_tenant_invitation(text);
drop trigger if exists tenant_invitations_user_limit on public.tenant_invitations;
drop function if exists private.enforce_user_limit();

-- pending invitations are closed (their functions no longer exist, the tokens are dead anyway)
do $$
begin
  update public.tenant_invitations set revoked_at = now()
  where accepted_at is null and revoked_at is null;
exception when others then
  raise notice 'pending invitations were left as they are (%): they cannot be used any more', sqlerrm;
end
$$;

-- 2) business codes -----------------------------------------------------------------------------------------------
create or replace function private.new_join_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea := extensions.gen_random_bytes(10);
  result text := '';
  position integer;
begin
  for position in 0..9 loop
    result := result || substr(alphabet, (get_byte(random_bytes, position) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;
revoke all on function private.new_join_code() from public, anon, authenticated;

create table public.tenant_join_codes (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{10}$'),
  rotated_at timestamptz not null default now(),
  rotated_by uuid references auth.users(id) on delete set null
);
alter table public.tenant_join_codes enable row level security;
revoke all on public.tenant_join_codes from anon, authenticated;
grant select on public.tenant_join_codes to authenticated;
-- only a manager of the whole business reads the code; ordinary members never do
create policy tenant_join_codes_select_manager
on public.tenant_join_codes for select to authenticated
using (private.has_tenant_permission(tenant_id, 'users.manage') and private.is_tenant_scope_member(tenant_id));

insert into public.tenant_join_codes (tenant_id, code)
select tenant.id, private.new_join_code() from public.tenants tenant
on conflict (tenant_id) do nothing;

create or replace function private.create_join_code_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_join_codes (tenant_id, code)
  values (new.id, private.new_join_code())
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_join_code_for_tenant() from public, anon, authenticated;
create trigger tenants_create_join_code
after insert on public.tenants
for each row execute function private.create_join_code_for_tenant();

-- 3) join requests ------------------------------------------------------------------------------------------------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, user_id)
);
create index join_requests_user_idx on public.join_requests (user_id);
create index join_requests_tenant_status_idx on public.join_requests (tenant_id, status, created_at);

alter table public.join_requests enable row level security;
revoke all on public.join_requests from anon, authenticated;
grant select on public.join_requests to authenticated;
create policy join_requests_select_own_or_manager
on public.join_requests for select to authenticated
using (user_id = (select auth.uid()) or private.has_tenant_permission(tenant_id, 'users.manage'));

create table public.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index join_attempts_user_time_idx on public.join_attempts (user_id, created_at desc);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- 4) the package user limit, one place, serialised per business -------------------------------------------------
create or replace function private.assert_user_limit(target_tenant_id uuid, ignored_membership_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_limit integer;
  used_seats integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':user-limit', 0));
  select subscription.user_limit into current_limit
  from private.current_subscription(target_tenant_id) subscription;
  if current_limit is null then
    return;
  end if;
  -- a person counts once, however many branches he works in
  select count(*) into used_seats
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.status = 'active'
    and (ignored_membership_id is null or membership.id <> ignored_membership_id);
  if used_seats >= current_limit then
    raise exception using errcode = 'P0001', message = 'user_limit_reached';
  end if;
end;
$$;
revoke all on function private.assert_user_limit(uuid, uuid) from public, anon, authenticated;

-- 5) functions ----------------------------------------------------------------------------------------------------
-- A wrong name or code is answered with a normal result ({status: 'invalid_code'}), NOT with an exception:
-- an exception would roll back the transaction and with it the record of the failed try, and the rate limit
-- (5 failures in 15 minutes -> {status: 'rate_limited'}) would never count anything.
create or replace function public.request_join_tenant(target_name text, target_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_name text := lower(trim(coalesce(target_name, '')));
  clean_code text := upper(regexp_replace(coalesce(target_code, ''), '[^A-Za-z0-9]', '', 'g'));
  found_tenant record;
  existing_membership record;
  existing_request record;
  recent_failures integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(clean_name) not between 2 and 120 or clean_code !~ '^[A-Z2-9]{10}$' then
    -- a malformed code is cheap to refuse, but it still counts as a failed try
    insert into public.join_attempts (user_id) values (actor_id);
    return jsonb_build_object('status', 'invalid_code');
  end if;

  delete from public.join_attempts where created_at < now() - interval '1 day';
  select count(*) into recent_failures
  from public.join_attempts
  where user_id = actor_id and created_at > now() - interval '15 minutes';
  if recent_failures >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select tenant.id, tenant.name into found_tenant
  from public.tenant_join_codes join_code
  join public.tenants tenant on tenant.id = join_code.tenant_id and tenant.is_active
  where join_code.code = clean_code and lower(trim(tenant.name)) = clean_name;
  if not found then
    insert into public.join_attempts (user_id) values (actor_id);
    return jsonb_build_object('status', 'invalid_code');
  end if;

  select status into existing_membership
  from public.tenant_memberships
  where tenant_id = found_tenant.id and user_id = actor_id;
  if found then
    raise exception using errcode = 'P0001',
      message = case when existing_membership.status = 'active' then 'already_member' else 'join_not_allowed' end;
  end if;

  select id, status into existing_request
  from public.join_requests
  where tenant_id = found_tenant.id and user_id = actor_id
  for update;
  if found then
    if existing_request.status = 'pending' then
      return jsonb_build_object('status', 'pending', 'tenantName', found_tenant.name);
    end if;
    -- rejected: typing the code again does not help; approved without a membership means he was removed
    raise exception using errcode = 'P0001', message = 'join_not_allowed';
  end if;

  insert into public.join_requests (tenant_id, user_id) values (found_tenant.id, actor_id);
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (found_tenant.id, actor_id, 'tenant.join_requested', 'tenant', found_tenant.id, '{}'::jsonb);
  return jsonb_build_object('status', 'pending', 'tenantName', found_tenant.name);
end;
$$;

create or replace function public.my_join_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'status', request.status,
    'tenantName', tenant.name,
    'createdAt', request.created_at
  ) order by request.created_at desc), '[]'::jsonb)
  from public.join_requests request
  join public.tenants tenant on tenant.id = request.tenant_id
  where request.user_id = (select auth.uid());
$$;

create or replace function public.list_join_requests(target_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.has_tenant_permission(target_tenant_id, 'users.manage') then
    raise exception using errcode = '42501', message = 'users_manage_denied';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', request.id,
      'fullName', coalesce(profile.full_name, 'İsimsiz kullanıcı'),
      'email', account.email,
      'createdAt', request.created_at
    ) order by request.created_at), '[]'::jsonb)
    from public.join_requests request
    join auth.users account on account.id = request.user_id
    left join public.profiles profile on profile.id = request.user_id
    where request.tenant_id = target_tenant_id and request.status = 'pending'
  );
end;
$$;

create or replace function public.decide_join_request(
  target_request_id uuid,
  target_decision text,
  target_role_id uuid default null,
  target_branch_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_record record;
  actor_tenant_scope boolean;
  role_record record;
  new_membership_id uuid;
begin
  select id, tenant_id, user_id, status into request_record
  from public.join_requests where id = target_request_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'join_request_not_found';
  end if;
  if actor_id is null or not private.has_tenant_permission(request_record.tenant_id, 'users.manage') then
    raise exception using errcode = '42501', message = 'users_manage_denied';
  end if;
  if request_record.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'join_request_already_decided';
  end if;
  if target_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;

  if target_decision = 'reject' then
    update public.join_requests
    set status = 'rejected', decided_at = now(), decided_by = actor_id
    where id = request_record.id;
    insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (request_record.tenant_id, actor_id, 'tenant.join_rejected', 'join_request', request_record.id,
      jsonb_build_object('userId', request_record.user_id));
    return jsonb_build_object('status', 'rejected');
  end if;

  -- approval: the manager chooses a role and branches, within his own authority
  if target_role_id is null or coalesce(cardinality(target_branch_ids), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'member_access_required';
  end if;
  select role.id, role.code, role.scope into role_record
  from public.roles role
  where role.tenant_id = request_record.tenant_id and role.id = target_role_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'role_not_found';
  end if;
  if (select count(distinct branch.id) from public.branches branch
      where branch.tenant_id = request_record.tenant_id and branch.is_active and branch.id = any(target_branch_ids))
     <> (select count(distinct value) from unnest(target_branch_ids) as value) then
    raise exception using errcode = 'P0001', message = 'cross_tenant_member_access';
  end if;
  if role_record.code = 'owner' and not private.has_system_role(request_record.tenant_id, 'owner') then
    raise exception using errcode = '42501', message = 'owner_role_assignment_denied';
  end if;

  actor_tenant_scope := private.is_tenant_scope_member(request_record.tenant_id);
  if not actor_tenant_scope then
    if role_record.scope = 'tenant' then
      raise exception using errcode = '42501', message = 'tenant_role_assignment_denied';
    end if;
    if exists (
      select 1 from unnest(target_branch_ids) as branch_value
      where not private.has_branch_membership(request_record.tenant_id, branch_value)
    ) then
      raise exception using errcode = '42501', message = 'branch_assignment_denied';
    end if;
    if exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
      where role_permission.tenant_id = request_record.tenant_id
        and role_permission.role_id = role_record.id
        and not private.has_tenant_permission(request_record.tenant_id, permission.code)
    ) then
      raise exception using errcode = '42501', message = 'role_exceeds_actor_permissions';
    end if;
  end if;

  if exists (
    select 1 from public.tenant_memberships
    where tenant_id = request_record.tenant_id and user_id = request_record.user_id
  ) then
    raise exception using errcode = 'P0001', message = 'already_member';
  end if;
  perform private.assert_user_limit(request_record.tenant_id);

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (request_record.tenant_id, request_record.user_id, 'active')
  returning id into new_membership_id;
  insert into public.membership_roles (tenant_id, membership_id, role_id)
  values (request_record.tenant_id, new_membership_id, role_record.id);
  insert into public.membership_branches (tenant_id, membership_id, branch_id)
  select request_record.tenant_id, new_membership_id, value from (select distinct unnest(target_branch_ids) as value) branches_to_add;

  update public.join_requests
  set status = 'approved', decided_at = now(), decided_by = actor_id
  where id = request_record.id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (request_record.tenant_id, actor_id, 'tenant.join_approved', 'tenant_membership', new_membership_id,
    jsonb_build_object('userId', request_record.user_id, 'roleId', role_record.id, 'branchIds', to_jsonb(target_branch_ids)));
  return jsonb_build_object('status', 'approved', 'membershipId', new_membership_id);
end;
$$;

create or replace function public.get_join_code(target_tenant_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not private.has_tenant_permission(target_tenant_id, 'users.manage')
    or not private.is_tenant_scope_member(target_tenant_id) then
    raise exception using errcode = '42501', message = 'users_manage_denied';
  end if;
  return (select code from public.tenant_join_codes where tenant_id = target_tenant_id);
end;
$$;

create or replace function public.rotate_join_code(target_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  fresh_code text;
begin
  if actor_id is null
    or not private.has_tenant_permission(target_tenant_id, 'users.manage')
    or not private.is_tenant_scope_member(target_tenant_id) then
    raise exception using errcode = '42501', message = 'users_manage_denied';
  end if;
  fresh_code := private.new_join_code();
  insert into public.tenant_join_codes (tenant_id, code, rotated_by)
  values (target_tenant_id, fresh_code, actor_id)
  on conflict (tenant_id) do update set code = excluded.code, rotated_at = now(), rotated_by = actor_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_tenant_id, actor_id, 'tenant.join_code_rotated', 'tenant', target_tenant_id, '{}'::jsonb);
  return fresh_code;
end;
$$;

revoke all on function public.request_join_tenant(text, text) from public, anon;
revoke all on function public.my_join_requests() from public, anon;
revoke all on function public.list_join_requests(uuid) from public, anon;
revoke all on function public.decide_join_request(uuid, text, uuid, uuid[]) from public, anon;
revoke all on function public.get_join_code(uuid) from public, anon;
revoke all on function public.rotate_join_code(uuid) from public, anon;
grant execute on function public.request_join_tenant(text, text) to authenticated;
grant execute on function public.my_join_requests() to authenticated;
grant execute on function public.list_join_requests(uuid) to authenticated;
grant execute on function public.decide_join_request(uuid, text, uuid, uuid[]) to authenticated;
grant execute on function public.get_join_code(uuid) to authenticated;
grant execute on function public.rotate_join_code(uuid) to authenticated;

commit;
