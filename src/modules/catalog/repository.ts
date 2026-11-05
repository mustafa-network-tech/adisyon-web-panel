import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTurkey } from "@/modules/staff/dates";
import type {
  CatalogSnapshot,
  Fulfillment,
  KitchenStationOption,
  MenuCategory,
  MenuProduct,
  OptionGroupAdmin,
} from "./types";
import type { OptionGroup, OptionKind } from "./options";

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  fulfillment: Fulfillment;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  category_id: string;
  kitchen_station_id: string | null;
  name: string;
  description: string | null;
  price_minor: number;
  tax_rate: number | string;
  fulfillment: Fulfillment | null;
  sold_out_on: string | null;
  is_active: boolean;
};

type GroupRow = {
  id: string;
  name: string;
  kind: OptionKind;
  min_select: number;
  max_select: number | null;
  is_active: boolean;
};

type ChoiceRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta_minor: number | string;
  is_active: boolean;
  sold_out_on: string | null;
};

type StationRow = {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
};

export async function getCatalogSnapshot(
  tenantId: string,
  branchId: string,
): Promise<CatalogSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [categoriesResult, productsResult, groupsResult, stationsResult] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, sort_order, fulfillment, is_active")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select(
        "id, category_id, kitchen_station_id, name, description, price_minor, tax_rate, fulfillment, sold_out_on, is_active",
      )
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("name"),
    supabase
      .from("option_groups")
      .select("id, name, kind, min_select, max_select, is_active")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("kitchen_stations")
      .select("id, name, color, is_active")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("name"),
  ]);

  const error = [
    categoriesResult.error,
    productsResult.error,
    stationsResult.error,
    groupsResult.error,
  ].find(Boolean);
  if (error) throw new Error("Menü verileri Supabase üzerinden okunamadı.");

  const today = todayInTurkey();
  const groupRows = (groupsResult.data || []) as GroupRow[];
  const groupIds = groupRows.map((group) => group.id);
  const [choicesResult, linksResult] = groupIds.length
    ? await Promise.all([
        supabase
          .from("option_choices")
          .select("id, group_id, name, price_delta_minor, is_active, sold_out_on")
          .eq("tenant_id", tenantId)
          .in("group_id", groupIds)
          .order("sort_order")
          .order("name"),
        supabase
          .from("product_option_groups")
          .select("product_id, group_id")
          .eq("tenant_id", tenantId)
          .in("group_id", groupIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (choicesResult.error || linksResult.error) throw new Error("Ürün seçenekleri okunamadı.");
  const choiceRows = (choicesResult.data || []) as ChoiceRow[];
  const linkRows = (linksResult.data || []) as { product_id: string; group_id: string }[];
  const optionGroups: OptionGroupAdmin[] = groupRows.map((group) => ({
    id: group.id,
    name: group.name,
    kind: group.kind,
    minSelect: group.min_select,
    maxSelect: group.max_select,
    isActive: group.is_active,
    choices: choiceRows
      .filter((choice) => choice.group_id === group.id)
      .map((choice) => ({
        id: choice.id,
        name: choice.name,
        priceDeltaMinor: Number(choice.price_delta_minor),
        soldOut: choice.sold_out_on === today,
        isActive: choice.is_active,
      })),
    productIds: linkRows.filter((link) => link.group_id === group.id).map((link) => link.product_id),
  }));
  const sellableGroups = (productId: string): OptionGroup[] =>
    optionGroups
      .filter((group) => group.isActive && group.productIds.includes(productId))
      .map((group) => ({
        id: group.id,
        name: group.name,
        kind: group.kind,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        choices: group.choices
          .filter((choice) => choice.isActive)
          .map((choice) => ({ id: choice.id, name: choice.name, priceDeltaMinor: choice.priceDeltaMinor, soldOut: choice.soldOut })),
      }))
      .filter((group) => group.choices.length > 0);
  const categoryRows = (categoriesResult.data || []) as CategoryRow[];
  const stationRows = (stationsResult.data || []) as StationRow[];
  const categoryNames = new Map(categoryRows.map((item) => [item.id, item.name]));
  const stationNames = new Map(stationRows.map((item) => [item.id, item.name]));

  const categories: MenuCategory[] = categoryRows.map((item) => ({
    id: item.id,
    name: item.name,
    sortOrder: item.sort_order,
    fulfillment: item.fulfillment,
    isActive: item.is_active,
  }));
  const kitchenStations: KitchenStationOption[] = stationRows.map((item) => ({
    id: item.id,
    name: item.name,
    color: item.color,
    isActive: item.is_active,
  }));
  const products: MenuProduct[] = ((productsResult.data || []) as ProductRow[]).map(
    (item) => ({
      id: item.id,
      categoryId: item.category_id,
      categoryName: categoryNames.get(item.category_id) || "Kategori yok",
      name: item.name,
      description: item.description,
      priceMinor: Number(item.price_minor),
      taxRate: Number(item.tax_rate),
      kitchenStationId: item.kitchen_station_id,
      kitchenStationName: item.kitchen_station_id
        ? stationNames.get(item.kitchen_station_id) || null
        : null,
      fulfillment: item.fulfillment,
      soldOut: item.sold_out_on === today,
      optionGroups: sellableGroups(item.id),
      isActive: item.is_active,
    }),
  );

  return { categories, products, kitchenStations, optionGroups };
}
