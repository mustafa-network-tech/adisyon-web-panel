-- MK Adisyon Web / Phase 2 Module 2
-- Auth profile provisioning and platform-admin read boundary.

begin;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Kullanıcı'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Backfill profiles for accounts created before this migration.
insert into public.profiles (id, full_name)
select
  user_record.id,
  coalesce(
    nullif(trim(user_record.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(user_record.email, ''), '@', 1), ''),
    'Kullanıcı'
  )
from auth.users as user_record
where not exists (
  select 1 from public.profiles where profiles.id = user_record.id
);

grant select on public.platform_admins to authenticated;

drop policy if exists platform_admins_select_self
on public.platform_admins;
create policy platform_admins_select_self
on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists memberships_select_platform_admin
on public.tenant_memberships;
create policy memberships_select_platform_admin
on public.tenant_memberships for select to authenticated
using (private.is_platform_admin());

commit;
