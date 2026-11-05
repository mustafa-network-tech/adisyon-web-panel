"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionErrorMessage, optionGroupInputSchema } from "./option-validation";

type Result = { ok: boolean; message: string };

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const route = { tenant: z.string().trim().min(1).max(100), branch: z.string().trim().min(1).max(100) };

function refresh(tenant: string, branch: string) {
  revalidatePath(`/app/${tenant}/${branch}/ayarlar/secenekler`);
  revalidatePath(`/app/${tenant}/${branch}/ayarlar/menu`);
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
}

export async function saveOptionGroupAction(input: unknown): Promise<Result> {
  const values = optionGroupInputSchema.safeParse(input);
  if (!values.success) {
    const issue = values.error.issues.find((item) => item.message && !item.message.startsWith("Invalid"))?.message;
    return { ok: false, message: optionErrorMessage(issue, "Grup bilgilerini kontrol edin: ad, en az bir seçenek ve benzersiz seçenek adları gerekir.") };
  }
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["catalog.manage"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_option_group", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_group_id: values.data.groupId || null,
    target_name: values.data.name,
    target_kind: values.data.kind,
    target_required: values.data.required,
    target_max_select: values.data.kind === "variant" ? null : values.data.maxSelect,
    target_is_active: values.data.isActive,
    target_choices: values.data.choices.map((choice) => ({
      id: choice.id || null,
      name: choice.name,
      priceDeltaMinor: choice.priceDeltaMinor,
      isActive: choice.isActive,
    })),
    target_product_ids: values.data.productIds,
  });
  if (error) return { ok: false, message: optionErrorMessage(error.message, "Seçenek grubu kaydedilemedi.") };

  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: "Seçenek grubu kaydedildi." };
}

export async function deleteOptionGroupAction(input: unknown): Promise<Result> {
  const values = z.object({ ...route, groupId: uuid }).safeParse(input);
  if (!values.success) return { ok: false, message: "Silinecek grup seçilmedi." };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["catalog.manage"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_option_group", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_group_id: values.data.groupId,
  });
  if (error) return { ok: false, message: optionErrorMessage(error.message, "Seçenek grubu silinemedi.") };

  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: "Seçenek grubu silindi. Geçmiş siparişler etkilenmez." };
}

export async function setOptionChoiceAvailabilityAction(input: unknown): Promise<Result> {
  const values = z.object({ ...route, choiceId: uuid, soldOut: z.boolean() }).safeParse(input);
  if (!values.success) return { ok: false, message: "Seçenek bilgisi geçersiz." };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["catalog.availability"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_option_choice_availability", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_choice_id: values.data.choiceId,
    target_sold_out: values.data.soldOut,
  });
  if (error) return { ok: false, message: optionErrorMessage(error.message, "Seçenek durumu değiştirilemedi.") };

  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: values.data.soldOut ? "Seçenek bugünlük tükendi." : "Seçenek tekrar açıldı." };
}
