-- Adisyon Web / Opening extra branches (Cok Subeli plan)
--
-- Until now the plan stored a branch limit but nothing created a second branch.
--   * public.create_branch: an owner / tenant administrator (or a platform
--     administrator) adds a branch to a business.
--   * private.enforce_branch_limit: the plan's branch_limit is enforced in the
--     database, like the table and station limits.
-- Tenant-scope roles already reach every active branch, including new ones
-- (migration 0011), so no membership rows are needed. The new branch gets its
-- default kitchen station from the existing trigger (migration 0013).
--
-- Run after 0033. Not applied to production by committing this file.

begin;

create or replace function private.enforce_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limit_value integer;
begin
  select branch_limit into limit_value from private.current_subscription(new.tenant_id);
  -- No subscription yet (business is being created): nothing to compare with.
  if limit_value is not null and (
    select count(*) from public.branches existing
    where existing.tenant_id = new.tenant_id and existing.is_active
  ) >= limit_value then
    raise exception using errcode = 'P0001', message = 'branch_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists branches_enforce_limit on public.branches;
create trigger branches_enforce_limit
before insert on public.branches
for each row execute function private.enforce_branch_limit();

create or replace function public.create_branch(
  target_tenant_id uuid,
  target_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_name text := trim(coalesce(target_name, ''));
  base_slug text;
  new_slug text;
  attempt integer := 0;
  new_branch_id uuid;
begin
  if actor_id is null
    or not (private.is_tenant_scope_member(target_tenant_id) or private.is_platform_admin()) then
    raise exception using errcode = '42501', message = 'branch_manage_denied';
  end if;
  if char_length(clean_name) not between 2 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_branch_name';
  end if;
  if not private.tenant_is_writable(target_tenant_id) and not private.is_platform_admin() then
    raise exception using errcode = 'P0001', message = 'tenant_read_only';
  end if;
  if not exists (select 1 from public.tenants where id = target_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;

  base_slug := trim(both '-' from regexp_replace(
    lower(translate(clean_name, 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')),
    '[^a-z0-9]+', '-', 'g'
  ));
  base_slug := left(base_slug, 40);
  if base_slug = '' then base_slug := 'sube'; end if;
  new_slug := base_slug;
  while exists (
    select 1 from public.branches where tenant_id = target_tenant_id and slug = new_slug
  ) loop
    attempt := attempt + 1;
    if attempt > 8 then
      raise exception using errcode = 'P0001', message = 'slug_generation_failed';
    end if;
    new_slug := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;

  -- The branch limit trigger refuses the insert when the plan is full.
  insert into public.branches (tenant_id, name, slug)
  values (target_tenant_id, clean_name, new_slug)
  returning id into new_branch_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_tenant_id, actor_id, 'tenant.branch_created', 'branch', new_branch_id,
    jsonb_build_object('name', clean_name, 'slug', new_slug)
  );

  return jsonb_build_object('branchId', new_branch_id, 'branchSlug', new_slug);
end;
$$;

revoke all on function public.create_branch(uuid, text) from public, anon;
grant execute on function public.create_branch(uuid, text) to authenticated;

commit;
