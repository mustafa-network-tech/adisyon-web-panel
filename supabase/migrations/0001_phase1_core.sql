-- MK Adisyon Web / Phase 1 schema draft
-- IMPORTANT: This file has not been applied to any local or remote database.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.subscription_status as enum ('trial', 'active', 'suspended', 'cancelled');
create type public.table_operational_status as enum ('available', 'dirty', 'reserved', 'disabled');
create type public.order_status as enum ('draft', 'open', 'submitted', 'in_progress', 'ready', 'served', 'closed', 'cancelled');
create type public.kitchen_ticket_status as enum ('new', 'preparing', 'ready', 'served', 'cancelled');
create type public.cash_session_status as enum ('open', 'closed');
create type public.payment_method as enum ('cash', 'card');
create type public.payment_status as enum ('pending', 'completed', 'voided', 'refunded');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  legal_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  timezone text not null default 'Europe/Istanbul',
  currency_code char(3) not null default 'TRY',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.membership_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id)
);

create table public.membership_branches (
  tenant_id uuid not null,
  membership_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, membership_id, branch_id),
  foreign key (tenant_id, membership_id) references public.tenant_memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete cascade
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null
);

create table public.role_permissions (
  tenant_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (tenant_id, role_id, permission_id),
  foreign key (tenant_id, role_id) references public.roles(tenant_id, id) on delete cascade
);

create table public.membership_roles (
  tenant_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  primary key (tenant_id, membership_id, role_id),
  foreign key (tenant_id, membership_id) references public.tenant_memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, role_id) references public.roles(tenant_id, id) on delete cascade
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  brand_name text not null,
  primary_color text not null default '#e8623a' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, name),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict
);

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  area_id uuid not null,
  label text not null,
  capacity smallint not null default 2 check (capacity > 0),
  operational_status public.table_operational_status not null default 'available',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, label),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, area_id) references public.dining_areas(tenant_id, id) on delete restrict
);

create table public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  name text not null,
  color text not null default '#e8623a',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, name),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null,
  category_id uuid not null,
  kitchen_station_id uuid,
  name text not null,
  description text,
  price_minor bigint not null check (price_minor >= 0),
  tax_rate numeric(5,2) not null default 10 check (tax_rate between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, category_id) references public.menu_categories(tenant_id, id) on delete restrict,
  foreign key (tenant_id, kitchen_station_id) references public.kitchen_stations(tenant_id, id) on delete restrict
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  table_id uuid,
  order_number bigint not null,
  status public.order_status not null default 'draft',
  guest_count smallint not null default 1 check (guest_count > 0),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  version integer not null default 1 check (version > 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, order_number),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, table_id) references public.restaurant_tables(tenant_id, id) on delete restrict
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  order_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  tax_rate numeric(5,2) not null check (tax_rate between 0 and 100),
  line_total_minor bigint not null check (line_total_minor >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, product_id) references public.products(tenant_id, id) on delete restrict
);

create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  order_id uuid not null,
  kitchen_station_id uuid not null,
  status public.kitchen_ticket_status not null default 'new',
  sent_at timestamptz not null default now(),
  started_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id) references public.orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, kitchen_station_id) references public.kitchen_stations(tenant_id, id) on delete restrict
);

create table public.kitchen_ticket_items (
  tenant_id uuid not null,
  ticket_id uuid not null,
  order_item_id uuid not null,
  quantity integer not null check (quantity > 0),
  primary key (tenant_id, ticket_id, order_item_id),
  foreign key (tenant_id, ticket_id) references public.kitchen_tickets(tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_item_id) references public.order_items(tenant_id, id) on delete restrict
);

create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, name),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  cash_register_id uuid not null,
  status public.cash_session_status not null default 'open',
  opening_minor bigint not null default 0,
  closing_minor bigint,
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, cash_register_id) references public.cash_registers(tenant_id, id) on delete restrict
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  order_id uuid not null,
  cash_session_id uuid not null,
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  amount_minor bigint not null check (amount_minor > 0),
  idempotency_key text not null,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete restrict,
  foreign key (tenant_id, order_id) references public.orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, cash_session_id) references public.cash_sessions(tenant_id, id) on delete restrict
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cash_session_id uuid not null,
  movement_type text not null check (movement_type in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, cash_session_id) references public.cash_sessions(tenant_id, id) on delete restrict
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  plan_code text not null,
  status public.subscription_status not null default 'trial',
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'tenants', 'branches', 'profiles', 'tenant_memberships', 'roles',
    'dining_areas', 'restaurant_tables', 'kitchen_stations', 'menu_categories',
    'products', 'orders', 'order_items', 'kitchen_tickets', 'subscriptions'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      target_table
    );
  end loop;
end $$;

insert into public.permissions (code, description) values
  ('tables.read', 'Masa ve salonları görüntüleme'),
  ('orders.create', 'Sipariş oluşturma'),
  ('orders.update', 'Sipariş güncelleme'),
  ('orders.cancel', 'Sipariş iptal etme'),
  ('kitchen.read', 'Mutfak fişlerini görüntüleme'),
  ('kitchen.update', 'Mutfak durumlarını güncelleme'),
  ('payments.create', 'Ödeme alma'),
  ('payments.refund', 'Ödeme iadesi'),
  ('cash.open', 'Kasa vardiyası açma'),
  ('cash.close', 'Kasa vardiyası kapatma'),
  ('reports.read', 'Raporları görüntüleme'),
  ('settings.manage', 'İşletme ayarlarını yönetme'),
  ('catalog.manage', 'Menü ve ürünleri yönetme'),
  ('users.manage', 'Kullanıcı ve rolleri yönetme');

create index tenant_memberships_user_idx on public.tenant_memberships(user_id, tenant_id) where status = 'active';
create index membership_branches_branch_idx on public.membership_branches(branch_id, membership_id);
create index membership_roles_membership_idx on public.membership_roles(membership_id, role_id);
create index role_permissions_permission_idx on public.role_permissions(permission_id, role_id);
create index dining_areas_branch_idx on public.dining_areas(tenant_id, branch_id);
create index restaurant_tables_branch_idx on public.restaurant_tables(tenant_id, branch_id, area_id);
create index products_branch_idx on public.products(tenant_id, branch_id, category_id) where is_active;
create index orders_active_table_idx on public.orders(tenant_id, branch_id, table_id) where status not in ('closed', 'cancelled');
create index orders_status_idx on public.orders(tenant_id, branch_id, status, opened_at desc);
create index order_items_order_idx on public.order_items(tenant_id, order_id);
create index kitchen_tickets_status_idx on public.kitchen_tickets(tenant_id, branch_id, status, sent_at);
create index payments_order_idx on public.payments(tenant_id, order_id, status);
create index cash_sessions_open_idx on public.cash_sessions(tenant_id, branch_id, status) where status = 'open';
create index audit_logs_tenant_created_idx on public.audit_logs(tenant_id, created_at desc);

commit;
