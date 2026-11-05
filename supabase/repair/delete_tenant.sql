-- Deletes ONE business and everything that belongs to it (orders, menu, tables, users' memberships,
-- subscriptions, audit rows ...). The user accounts themselves (auth.users) stay.
-- IRREVERSIBLE: take a backup first if the business holds anything you need.
--
-- 1) Put the business slug below (the part after /app/ in the panel address).
-- 2) Run the whole block in the Supabase SQL editor. The messages list what was removed.

do $$
declare
  target_slug text := 'mavi-kadraj';   -- <== change this
  target_id uuid;
  rec record;
  removed bigint;
begin
  select id into target_id from public.tenants where slug = target_slug;
  if target_id is null then
    raise exception 'Isletme bulunamadi: %', target_slug;
  end if;

  -- Rows are removed table by table; foreign key checks and triggers are
  -- switched off for this transaction only so the order does not matter.
  set local session_replication_role = replica;

  for rec in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'tenant_id' and c.table_name <> 'tenants'
    order by c.table_name
  loop
    execute format('delete from public.%I where tenant_id = $1', rec.table_name) using target_id;
    get diagnostics removed = row_count;
    if removed > 0 then
      raise notice '%: % satir silindi', rec.table_name, removed;
    end if;
  end loop;

  delete from public.tenants where id = target_id;
  raise notice 'Isletme silindi: %', target_slug;
end $$;
