-- MK Adisyon Web / Default kitchen station
-- Every branch gets a "Mutfak" station and products without a station fall back
-- to it, so QR and waiter orders can always be routed to a kitchen.

begin;

-- Existing branches without any station.
insert into public.kitchen_stations (tenant_id, branch_id, name)
select branch.tenant_id, branch.id, 'Mutfak'
from public.branches branch
where not exists (
  select 1 from public.kitchen_stations station
  where station.tenant_id = branch.tenant_id and station.branch_id = branch.id
)
on conflict do nothing;

-- Existing products without a station use the branch's first active station.
update public.products product
set kitchen_station_id = (
  select station.id from public.kitchen_stations station
  where station.tenant_id = product.tenant_id
    and station.branch_id = product.branch_id
    and station.is_active
  order by station.created_at, station.name
  limit 1
)
where product.kitchen_station_id is null;

-- New branches get a default station automatically.
create or replace function private.create_default_kitchen_station()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.kitchen_stations (tenant_id, branch_id, name)
  values (new.tenant_id, new.id, 'Mutfak')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists branches_default_kitchen_station on public.branches;
create trigger branches_default_kitchen_station
after insert on public.branches
for each row execute function private.create_default_kitchen_station();

-- A product saved without a station is routed to the branch default.
create or replace function private.default_product_station()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kitchen_station_id is null then
    select station.id into new.kitchen_station_id
    from public.kitchen_stations station
    where station.tenant_id = new.tenant_id
      and station.branch_id = new.branch_id
      and station.is_active
    order by station.created_at, station.name
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists products_default_station on public.products;
create trigger products_default_station
before insert or update on public.products
for each row execute function private.default_product_station();

commit;
