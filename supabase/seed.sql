-- Deterministic local-only seed data for MK Adisyon Web.
-- Password for all demo users: LocalTest123!

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@local.test', crypt('LocalTest123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ayşe Owner"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter-a@local.test', crypt('LocalTest123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ece Garson"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kitchen-a@local.test', crypt('LocalTest123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Can Mutfak"}', now(), now()),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@local.test', crypt('LocalTest123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bora Owner"}', now(), now()),
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform@local.test', crypt('LocalTest123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"MK Platform"}', now(), now())
on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  id,
  id::text,
  id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email',
  now(),
  now(),
  now()
from auth.users
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001'
)
on conflict (provider_id, provider) do nothing;

insert into public.tenants (id, slug, name, legal_name) values
  ('a0000000-0000-0000-0000-000000000001', 'meydan-restoran', 'Meydan Restoran', 'Meydan Restoran Ltd. Şti.'),
  ('b0000000-0000-0000-0000-000000000001', 'kiyi-balik', 'Kıyı Balık', 'Kıyı Balık Ltd. Şti.')
on conflict (id) do nothing;

insert into public.branches (id, tenant_id, slug, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'merkez', 'Merkez Şube'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'sahil', 'Sahil Şube')
on conflict (id) do nothing;

insert into public.profiles (id, full_name) values
  ('10000000-0000-0000-0000-000000000001', 'Ayşe Owner'),
  ('10000000-0000-0000-0000-000000000002', 'Ece Garson'),
  ('10000000-0000-0000-0000-000000000003', 'Can Mutfak'),
  ('20000000-0000-0000-0000-000000000001', 'Bora Owner'),
  ('90000000-0000-0000-0000-000000000001', 'MK Platform')
on conflict (id) do nothing;

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'active'),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'active'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active')
on conflict (id) do nothing;

insert into public.membership_branches (tenant_id, membership_id, branch_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.roles (id, tenant_id, code, name, is_system) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'İşletme Sahibi', true),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'waiter', 'Garson', true),
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'kitchen', 'Mutfak', true),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'owner', 'İşletme Sahibi', true)
on conflict (id) do nothing;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', id
from public.permissions
on conflict do nothing;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', id
from public.permissions
on conflict do nothing;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', id
from public.permissions
where code in ('tables.read', 'orders.create', 'orders.update')
on conflict do nothing;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', id
from public.permissions
where code in ('kitchen.read', 'kitchen.update')
on conflict do nothing;

insert into public.membership_roles (tenant_id, membership_id, role_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.platform_admins (user_id) values
  ('90000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.tenant_settings (tenant_id, brand_name, primary_color) values
  ('a0000000-0000-0000-0000-000000000001', 'Meydan Restoran', '#e8623a'),
  ('b0000000-0000-0000-0000-000000000001', 'Kıyı Balık', '#285e9f')
on conflict (tenant_id) do nothing;

insert into public.dining_areas (id, tenant_id, branch_id, name, sort_order) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Salon', 1),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Bahçe', 2),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Salon', 1)
on conflict (id) do nothing;

insert into public.restaurant_tables (id, tenant_id, branch_id, area_id, label, capacity, sort_order) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'M01', 2, 1),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'M02', 4, 2),
  ('a5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'B01', 4, 3),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'S01', 4, 1)
on conflict (id) do nothing;

insert into public.kitchen_stations (id, tenant_id, branch_id, name, color) values
  ('a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Sıcak', '#e8623a'),
  ('a6000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Soğuk', '#285e9f'),
  ('b6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Mutfak', '#285e9f')
on conflict (id) do nothing;

insert into public.menu_categories (id, tenant_id, branch_id, name, sort_order) values
  ('a7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Ana Yemekler', 1),
  ('b7000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Balıklar', 1)
on conflict (id) do nothing;

insert into public.products (id, tenant_id, branch_id, category_id, kitchen_station_id, name, price_minor, tax_rate) values
  ('a8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Dana Lokum', 58500, 10),
  ('b8000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'Levrek Izgara', 62000, 10)
on conflict (id) do nothing;

insert into public.cash_registers (id, tenant_id, branch_id, name) values
  ('a9000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Kasa 01'),
  ('b9000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Kasa 01')
on conflict (id) do nothing;

insert into public.subscriptions (id, tenant_id, plan_code, status, starts_at, ends_at, created_by) values
  ('aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'professional', 'active', now(), now() + interval '1 year', '90000000-0000-0000-0000-000000000001'),
  ('bb000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'starter', 'trial', now(), now() + interval '30 days', '90000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
