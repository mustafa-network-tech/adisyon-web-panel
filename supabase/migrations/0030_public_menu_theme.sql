-- MK Adisyon Web / The QR menu follows the business theme
-- get_public_menu now also returns the business theme ("classic", "ocean" or
-- "burgundy") so guests see the same colours as the staff.

begin;

create or replace function public.get_public_menu(target_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  table_record record;
  qr_menu_enabled boolean;
  qr_ordering_enabled boolean;
  menu jsonb;
begin
  if target_token is null or target_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select t.id, t.label, t.tenant_id, t.branch_id, t.operational_status,
    b.name as branch_name, b.currency_code,
    tenant.name as tenant_name,
    coalesce(settings.brand_name, tenant.name) as brand_name,
    coalesce(settings.theme, 'classic') as theme
  into table_record
  from public.restaurant_tables t
  join public.branches b
    on b.tenant_id = t.tenant_id and b.id = t.branch_id and b.is_active
  join public.tenants tenant on tenant.id = t.tenant_id and tenant.is_active
  left join public.tenant_settings settings on settings.tenant_id = t.tenant_id
  where t.qr_token = target_token;

  if not found then
    return null;
  end if;

  select coalesce(s.menu_enabled, true), coalesce(s.ordering_enabled, false)
  into qr_menu_enabled, qr_ordering_enabled
  from (select 1) as one
  left join public.branch_qr_settings s
    on s.tenant_id = table_record.tenant_id
    and s.branch_id = table_record.branch_id;

  if not qr_menu_enabled then
    return null;
  end if;

  select coalesce(jsonb_agg(category_json order by category_sort, category_name), '[]'::jsonb)
  into menu
  from (
    select
      c.sort_order as category_sort,
      c.name as category_name,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'products', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'name', p.name,
              'description', p.description,
              'priceMinor', p.price_minor,
              'optionGroups', private.product_option_json(p.tenant_id, p.id),
              'soldOut', p.sold_out_on is not distinct from private.branch_today(c.tenant_id, c.branch_id),
              'orderable', (
                coalesce(p.fulfillment, c.fulfillment) = 'direct'
                or p.kitchen_station_id is not null
              )
              and p.sold_out_on is distinct from private.branch_today(c.tenant_id, c.branch_id)
            ) order by p.name
          ), '[]'::jsonb)
          from public.products p
          where p.tenant_id = c.tenant_id
            and p.branch_id = c.branch_id
            and p.category_id = c.id
            and p.is_active
        )
      ) as category_json
    from public.menu_categories c
    where c.tenant_id = table_record.tenant_id
      and c.branch_id = table_record.branch_id
      and c.is_active
  ) categories
  where jsonb_array_length(category_json -> 'products') > 0;

  return jsonb_build_object(
    'brandName', table_record.brand_name,
    'theme', table_record.theme,
    'branchName', table_record.branch_name,
    'tableLabel', table_record.label,
    'currencyCode', table_record.currency_code,
    'orderingEnabled', qr_ordering_enabled
      and table_record.operational_status not in ('dirty', 'disabled'),
    'categories', menu
  );
end;
$$;

commit;
