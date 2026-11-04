-- MK Adisyon Web / Default cash register
-- Every branch gets an "Ana Kasa" so a cash shift can always be opened.

begin;

-- Existing branches without any cash register.
insert into public.cash_registers (tenant_id, branch_id, name)
select branch.tenant_id, branch.id, 'Ana Kasa'
from public.branches branch
where not exists (
  select 1 from public.cash_registers register
  where register.tenant_id = branch.tenant_id and register.branch_id = branch.id
)
on conflict do nothing;

-- New branches get a default register automatically.
create or replace function private.create_default_cash_register()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cash_registers (tenant_id, branch_id, name)
  values (new.tenant_id, new.id, 'Ana Kasa')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists branches_default_cash_register on public.branches;
create trigger branches_default_cash_register
after insert on public.branches
for each row execute function private.create_default_cash_register();

commit;
