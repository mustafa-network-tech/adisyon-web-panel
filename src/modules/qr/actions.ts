"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QrActionResult } from "./types";
import { callWaiterInputSchema, rotateTokenInputSchema } from "./validation";

export async function rotateTableQrAction(
  input: unknown,
): Promise<QrActionResult> {
  const values = rotateTokenInputSchema.safeParse(input);
  if (!values.success) return { ok: false, message: "Masa bilgisi geçersiz." };

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["settings.manage"],
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("rotate_table_qr_token", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_table_id: values.data.tableId,
  });
  if (error) return { ok: false, message: "QR kod yenilenemedi." };

  revalidatePath(`/app/${values.data.tenant}/${values.data.branch}/ayarlar/qr-menu`);
  return {
    ok: true,
    message: "QR kod yenilendi. Eski basılı kod artık çalışmaz; yenisini yazdırın.",
  };
}

const callErrors: Record<string, string> = {
  tenant_read_only: "Bu işletme şu anda çağrı alamıyor. Lütfen yakındaki bir çalışanı çağırın.",
  tenant_setup_pending: "Bu işletme henüz çağrı almaya başlamadı. Lütfen yakındaki bir çalışanı çağırın.",
  qr_not_found: "Bu QR kod geçerli değil. Lütfen yakındaki bir çalışanı çağırın.",
  call_rate_limited: "Çok sık çağrı yaptınız. Çalışanlarımız yolda; lütfen biraz bekleyin.",
};

export type CallWaiterResult =
  | { ok: true; status: "sent" | "already_pending" }
  | { ok: false; message: string };

export async function callWaiterAction(input: unknown): Promise<CallWaiterResult> {
  const values = callWaiterInputSchema.safeParse(input);
  if (!values.success) return { ok: false, message: "Çağrı bilgisi geçersiz." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("call_waiter", {
    target_token: values.data.token,
    target_kind: values.data.kind,
  });
  if (error) {
    const code = Object.keys(callErrors).find((key) => error.message.includes(key));
    return { ok: false, message: code ? callErrors[code] : "Çağrı gönderilemedi. Lütfen yakındaki bir çalışanı çağırın." };
  }
  const status = (data as { status?: unknown } | null)?.status;
  if (status !== "sent" && status !== "already_pending") return { ok: false, message: "Çağrı yanıtı doğrulanamadı." };
  return { ok: true, status };
}
