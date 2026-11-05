"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { getPlanUsage } from "@/modules/plan/repository";
import { limitReachedMessage } from "@/modules/plan/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CrudActionState } from "@/modules/settings/action-state";
import { parseDiningAreaInput, parseRestaurantTableInput } from "./validation";

function errorState(message: string): CrudActionState {
  return { status: "error", message };
}

function successState(message: string): CrudActionState {
  return { status: "success", message };
}

function readRoute(formData: FormData) {
  const tenant = formData.get("tenant");
  const branch = formData.get("branch");
  return typeof tenant === "string" && typeof branch === "string"
    ? { tenant, branch }
    : null;
}

function refreshDiningRoutes(tenant: string, branch: string) {
  revalidatePath(`/app/${tenant}/${branch}/ayarlar/salonlar`);
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
}

export async function upsertDiningAreaAction(
  _previousState: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(
    route.tenant,
    route.branch,
    ["settings.manage"],
  );
  const values = parseDiningAreaInput({
    id: formData.get("id") || "",
    name: formData.get("name"),
    isActive: formData.get("isActive") === "true",
  });
  if (!values.success) return errorState("Salon bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const payload = { name: values.data.name, is_active: values.data.isActive };
  const result = values.data.id
    ? await supabase
        .from("dining_areas")
        .update(payload)
        .eq("id", values.data.id)
        .eq("tenant_id", context.tenantId)
        .eq("branch_id", context.branchId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("dining_areas")
        .insert({
          ...payload,
          tenant_id: context.tenantId,
          branch_id: context.branchId,
        })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return errorState("Salon kaydedilemedi. Aynı isimde bir salon olabilir.");
  }

  refreshDiningRoutes(route.tenant, route.branch);
  return successState(values.data.id ? "Salon güncellendi." : "Salon eklendi.");
}

export async function upsertRestaurantTableAction(
  _previousState: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(
    route.tenant,
    route.branch,
    ["settings.manage"],
  );
  const values = parseRestaurantTableInput({
    id: formData.get("id") || "",
    areaId: formData.get("areaId"),
    label: formData.get("label"),
    capacity: formData.get("capacity"),
    status: formData.get("status"),
  });
  if (!values.success) return errorState("Masa bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { data: area } = await supabase
    .from("dining_areas")
    .select("id")
    .eq("id", values.data.areaId)
    .eq("tenant_id", context.tenantId)
    .eq("branch_id", context.branchId)
    .maybeSingle();
  if (!area) return errorState("Seçilen salon bu şubeye ait değil.");

  const payload = {
    area_id: values.data.areaId,
    label: values.data.label,
    capacity: values.data.capacity,
    operational_status: values.data.status,
  };
  const result = values.data.id
    ? await supabase
        .from("restaurant_tables")
        .update(payload)
        .eq("id", values.data.id)
        .eq("tenant_id", context.tenantId)
        .eq("branch_id", context.branchId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("restaurant_tables")
        .insert({
          ...payload,
          tenant_id: context.tenantId,
          branch_id: context.branchId,
        })
        .select("id")
        .single();

  if (result.error?.message.includes("table_limit_reached")) {
    const usage = await getPlanUsage(context.tenantId, context.branchId);
    return errorState(limitReachedMessage("table", usage?.tableLimit ?? null));
  }
  if (result.error || !result.data) {
    return errorState("Masa kaydedilemedi. Masa etiketi benzersiz olmalıdır.");
  }

  refreshDiningRoutes(route.tenant, route.branch);
  return successState(values.data.id ? "Masa güncellendi." : "Masa eklendi.");
}
