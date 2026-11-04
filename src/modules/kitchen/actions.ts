"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { KitchenActionResult } from "./types";
import { kitchenTransitionInputSchema } from "./validation";

function failure(code: string, message: string): KitchenActionResult {
  return { ok: false, code, message };
}

function mapError(message: string): KitchenActionResult {
  const errors: Record<string, string> = {
    kitchen_status_conflict:
      "Fiş başka bir cihazda güncellendi. Güncel durum yükleniyor.",
    invalid_kitchen_transition: "Bu mutfak durum geçişine izin verilmiyor.",
    kitchen_ticket_not_found: "Mutfak fişi bulunamadı.",
    kitchen_order_not_active: "Bağlı sipariş artık aktif değil.",
    kitchen_transition_denied: "Bu işlem için mutfak güncelleme yetkisi gerekiyor.",
  };
  const code = Object.keys(errors).find((item) => message.includes(item));
  return failure(
    code || "kitchen_operation_failed",
    code ? errors[code] : "Mutfak fişi güncellenemedi.",
  );
}

export async function transitionKitchenTicketAction(
  input: unknown,
): Promise<KitchenActionResult> {
  const values = kitchenTransitionInputSchema.safeParse(input);
  if (!values.success) {
    return failure("invalid_input", "Mutfak geçiş bilgilerini kontrol edin.");
  }

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["kitchen.update"],
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_kitchen_ticket", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_ticket_id: values.data.ticketId,
    target_expected_status: values.data.expectedStatus,
    target_status: values.data.nextStatus,
    target_idempotency_key: values.data.idempotencyKey,
  });
  if (error) return mapError(error.message);

  revalidatePath(`/app/${values.data.tenant}/${values.data.branch}/mutfak`);
  revalidatePath(`/app/${values.data.tenant}/${values.data.branch}/masalar`);
  return { ok: true, message: "Mutfak fişi güncellendi." };
}
