import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DiningArea,
  DiningSnapshot,
  RestaurantTable,
  TableStatus,
} from "./types";

type AreaRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type TableRow = {
  id: string;
  area_id: string;
  label: string;
  capacity: number;
  operational_status: TableStatus;
  sort_order: number;
};

export async function getDiningSnapshot(
  tenantId: string,
  branchId: string,
): Promise<DiningSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [areasResult, tablesResult] = await Promise.all([
    supabase
      .from("dining_areas")
      .select("id, name, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("restaurant_tables")
      .select("id, area_id, label, capacity, operational_status, sort_order")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("label"),
  ]);

  const error = areasResult.error || tablesResult.error;
  if (error) throw new Error("Salon ve masa verileri Supabase üzerinden okunamadı.");

  const areaRows = (areasResult.data || []) as AreaRow[];
  const areaNames = new Map(areaRows.map((item) => [item.id, item.name]));
  const areas: DiningArea[] = areaRows.map((item) => ({
    id: item.id,
    name: item.name,
    sortOrder: item.sort_order,
    isActive: item.is_active,
  }));
  const tables: RestaurantTable[] = ((tablesResult.data || []) as TableRow[]).map(
    (item) => ({
      id: item.id,
      areaId: item.area_id,
      areaName: areaNames.get(item.area_id) || "Alan yok",
      label: item.label,
      capacity: item.capacity,
      status: item.operational_status,
      sortOrder: item.sort_order,
    }),
  );

  return { areas, tables };
}
