import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CatalogSnapshot,
  KitchenStationOption,
  MenuCategory,
  MenuProduct,
} from "./types";

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
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
  is_active: boolean;
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
  const [categoriesResult, productsResult, stationsResult] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select(
        "id, category_id, kitchen_station_id, name, description, price_minor, tax_rate, is_active",
      )
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
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
  ].find(Boolean);
  if (error) throw new Error("Menü verileri Supabase üzerinden okunamadı.");

  const categoryRows = (categoriesResult.data || []) as CategoryRow[];
  const stationRows = (stationsResult.data || []) as StationRow[];
  const categoryNames = new Map(categoryRows.map((item) => [item.id, item.name]));
  const stationNames = new Map(stationRows.map((item) => [item.id, item.name]));

  const categories: MenuCategory[] = categoryRows.map((item) => ({
    id: item.id,
    name: item.name,
    sortOrder: item.sort_order,
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
      isActive: item.is_active,
    }),
  );

  return { categories, products, kitchenStations };
}
