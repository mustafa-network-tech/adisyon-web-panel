"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlanUsage } from "@/modules/plan/repository";
import { isReadOnlyError, readOnlyMessage } from "@/modules/plan/usage";
import type { CrudActionState } from "@/modules/settings/action-state";

const error = (message: string): CrudActionState => ({ status: "error", message });

const schema = z.object({
  tenant: z.string().min(1).max(80),
  branch: z.string().min(1).max(80),
  name: z.string().trim().min(2, "Şube adı en az 2 karakter olmalı.").max(120, "Şube adı en fazla 120 karakter olabilir."),
});

/** Adds a branch. Only tenant-scope roles pass the database check; the plan's branch limit is enforced there too. */
export async function createBranchAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const values = schema.safeParse({ tenant: formData.get("tenant"), branch: formData.get("branch"), name: formData.get("name") });
  if (!values.success) return error(values.error.issues[0]?.message ?? "Şube adını girin.");

  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["settings.manage"]);
  const supabase = await createSupabaseServerClient();
  const { data, error: rpcError } = await supabase.rpc("create_branch", {
    target_tenant_id: context.tenantId,
    target_name: values.data.name,
  });

  if (rpcError) {
    if (isReadOnlyError(rpcError.message)) return error(readOnlyMessage);
    if (rpcError.message.includes("branch_limit_reached")) {
      const usage = await getPlanUsage(context.tenantId, context.branchId);
      return error(`Paketinizin şube sınırına ulaştınız${usage?.branchLimit ? ` (${usage.branchLimit})` : ""}. Çok Şubeli pakete geçmek için bizimle iletişime geçin.`);
    }
    if (rpcError.message.includes("branch_manage_denied")) return error("Şube eklemek için işletme sahibi veya işletme yöneticisi olmalısınız.");
    return error("Şube eklenemedi. Lütfen tekrar deneyin.");
  }

  const payload = data as { branchSlug?: string } | null;
  if (!payload?.branchSlug) return error("Şube yanıtı doğrulanamadı.");
  revalidatePath(`/app/${values.data.tenant}`, "layout");
  // The new branch starts empty: go straight to its halls and tables.
  redirect(`/app/${values.data.tenant}/${payload.branchSlug}/ayarlar/salonlar`);
}

const reactivateSchema = z.object({ tenant: z.string().min(1).max(80), branch: z.string().min(1).max(80), branchId: z.uuid() });

/** The owner / business manager switches a passive branch back on. The plan's branch limit is enforced in the database. */
export async function reactivateBranchAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const values = reactivateSchema.safeParse({ tenant: formData.get("tenant"), branch: formData.get("branch"), branchId: formData.get("branchId") });
  if (!values.success) return error("Şube bilgisi eksik.");
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["settings.manage"]);
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("set_branch_active", {
    target_tenant_id: context.tenantId,
    target_branch_id: values.data.branchId,
    target_active: true,
  });
  if (rpcError) {
    if (isReadOnlyError(rpcError.message)) return error(readOnlyMessage);
    if (rpcError.message.includes("branch_limit_reached")) return error("Paketinizin şube sınırına ulaştınız. Önce paketinizi yükseltin.");
    if (rpcError.message.includes("branch_manage_denied")) return error("Şubeyi yeniden açmak için işletme sahibi veya işletme yöneticisi olmalısınız.");
    return error("Şube yeniden açılamadı. Lütfen tekrar deneyin.");
  }
  revalidatePath(`/app/${values.data.tenant}`, "layout");
  return { status: "success", message: "Şube yeniden açıldı." };
}
