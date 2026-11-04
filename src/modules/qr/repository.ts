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
  return (data as PublicMenu | null) ?? null;
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
  const [tablesResult, areasResult, settingsResult] = await Promise.all([
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
    supabase
      .from("branch_qr_settings")
      .select("ordering_enabled")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .maybeSingle(),
  ]);

  if (tablesResult.error || areasResult.error || settingsResult.error) {
    throw new Error("QR menü verileri okunamadı.");
  }

  const areaNames = new Map(
    (areasResult.data || []).map((area) => [area.id as string, area.name as string]),
  );
  return {
    orderingEnabled: Boolean(settingsResult.data?.ordering_enabled),
    tables: ((tablesResult.data || []) as TableRow[]).map((table) => ({
      id: table.id,
      label: table.label,
      areaName: areaNames.get(table.area_id) || "Alan yok",
      qrToken: table.qr_token,
    })),
  };
}
