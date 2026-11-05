"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CrudActionState } from "@/modules/settings/action-state";
import { parseCategoryInput, parseProductInput } from "./validation";

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

function refreshCatalogRoutes(tenant: string, branch: string) {
  revalidatePath(`/app/${tenant}/${branch}/ayarlar/menu`);
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
}

export async function upsertCategoryAction(
  _previousState: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");

  const context = await requireWorkspacePermission(
    route.tenant,
    route.branch,
    ["catalog.manage"],
  );
  const values = parseCategoryInput({
    id: formData.get("id") || "",
    name: formData.get("name"),
    fulfillment: formData.get("fulfillment") || "kitchen",
    isActive: formData.get("isActive") === "true",
  });
  if (!values.success) return errorState("Kategori bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const payload = {
    name: values.data.name,
    fulfillment: values.data.fulfillment,
    is_active: values.data.isActive,
  };

  const result = values.data.id
    ? await supabase
        .from("menu_categories")
        .update(payload)
        .eq("id", values.data.id)
        .eq("tenant_id", context.tenantId)
        .eq("branch_id", context.branchId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("menu_categories")
        .insert({
          ...payload,
          tenant_id: context.tenantId,
          branch_id: context.branchId,
        })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return errorState("Kategori kaydedilemedi. Aynı isimde bir kayıt olabilir.");
  }

  refreshCatalogRoutes(route.tenant, route.branch);
  return successState(values.data.id ? "Kategori güncellendi." : "Kategori eklendi.");
}

export async function upsertProductAction(
  _previousState: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");

  const context = await requireWorkspacePermission(
    route.tenant,
    route.branch,
    ["catalog.manage"],
  );
  const values = parseProductInput({
    id: formData.get("id") || "",
    categoryId: formData.get("categoryId"),
    kitchenStationId: formData.get("kitchenStationId") || "",
    fulfillment: formData.get("fulfillment") || "",
    name: formData.get("name"),
    description: formData.get("description") || "",
    price: formData.get("price"),
    taxRate: formData.get("taxRate"),
    isActive: formData.get("isActive") === "true",
  });
  if (!values.success) return errorState("Ürün bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { data: category } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", values.data.categoryId)
    .eq("tenant_id", context.tenantId)
    .eq("branch_id", context.branchId)
    .maybeSingle();
  if (!category) return errorState("Seçilen kategori bu şubeye ait değil.");

  if (values.data.kitchenStationId) {
    const { data: station } = await supabase
      .from("kitchen_stations")
      .select("id")
      .eq("id", values.data.kitchenStationId)
      .eq("tenant_id", context.tenantId)
      .eq("branch_id", context.branchId)
      .maybeSingle();
    if (!station) return errorState("Seçilen mutfak istasyonu bu şubeye ait değil.");
  }

  const payload = {
    category_id: values.data.categoryId,
    kitchen_station_id: values.data.kitchenStationId || null,
    fulfillment: values.data.fulfillment || null,
    name: values.data.name,
    description: values.data.description || null,
    price_minor: values.data.priceMinor,
    tax_rate: values.data.taxRate,
    is_active: values.data.isActive,
  };
  const result = values.data.id
    ? await supabase
        .from("products")
        .update(payload)
        .eq("id", values.data.id)
        .eq("tenant_id", context.tenantId)
        .eq("branch_id", context.branchId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("products")
        .insert({
          ...payload,
          tenant_id: context.tenantId,
          branch_id: context.branchId,
        })
        .select("id")
        .single();

  if (result.error || !result.data) return errorState("Ürün kaydedilemedi.");

  refreshCatalogRoutes(route.tenant, route.branch);
  return successState(values.data.id ? "Ürün güncellendi." : "Ürün eklendi.");
}

const availabilityId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Marks a product sold out for today (or back on sale). Resets by itself tomorrow. */
export async function setProductAvailabilityAction(input: {
  tenant: string;
  branch: string;
  productId: string;
  soldOut: boolean;
}): Promise<{ ok: boolean; message: string }> {
  if (!availabilityId.safeParse(input.productId).success || typeof input.soldOut !== "boolean") {
    return { ok: false, message: "Ürün bilgisi geçersiz." };
  }
  const context = await requireWorkspacePermission(input.tenant, input.branch, ["catalog.availability"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_product_availability", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_product_id: input.productId,
    target_sold_out: input.soldOut,
  });
  if (error) return { ok: false, message: "Ürün durumu değiştirilemedi." };

  refreshCatalogRoutes(input.tenant, input.branch);
  revalidatePath(`/app/${input.tenant}/${input.branch}/mutfak`);
  return { ok: true, message: input.soldOut ? "Ürün bugünlük tükendi olarak işaretlendi." : "Ürün tekrar satışta." };
}
