import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { qrTokenSchema } from "./validation";
import type { PublicMenu, QrAdminSnapshot } from "./types";

export async function getPublicMenu(token: string): Promise<PublicMenu | null> {
  if (!qrTokenSchema.safeParse(token).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_menu", {
    target_token: token,
  });
  if (error) throw new Error("Menü okunamadı.");
  const menu = data as PublicMenu | null;
  if (!menu) return null;
  return {
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      products: category.products.map((product) => ({ ...product, soldOut: product.soldOut ?? false, optionGroups: product.optionGroups ?? [] })),
    })),
  };
}

type TableRow = {
  id: string;
  label: string;
  qr_token: string;
  area_id: string;
};

export async function getQrAdminSnapshot(
  tenantId: string,
  branchId: string,
): Promise<QrAdminSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [tablesResult, areasResult] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("id, label, qr_token, area_id")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("label"),
    supabase
      .from("dining_areas")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId),
  ]);

  if (tablesResult.error || areasResult.error) {
    throw new Error("QR menü verileri okunamadı.");
  }

  const areaNames = new Map(
    (areasResult.data || []).map((area) => [area.id as string, area.name as string]),
  );
  return {
    tables: ((tablesResult.data || []) as TableRow[]).map((table) => ({
      id: table.id,
      label: table.label,
      areaName: areaNames.get(table.area_id) || "Alan yok",
      qrToken: table.qr_token,
    })),
  };
}
