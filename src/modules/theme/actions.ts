"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  theme: z.enum(["classic", "ocean", "burgundy"]),
});

export async function setThemeAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const values = schema.safeParse(input);
  if (!values.success) return { ok: false, message: "Tema seçimi geçersiz." };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["settings.manage"]);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_tenant_theme", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_theme: values.data.theme,
  });
  if (error) return { ok: false, message: "Tema kaydedilemedi." };

  // The theme shows in every workspace page and on the QR menu.
  revalidatePath(`/app/${values.data.tenant}`, "layout");
  return { ok: true, message: "Tema kaydedildi." };
}
