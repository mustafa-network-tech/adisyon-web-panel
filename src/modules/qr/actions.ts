"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CustomerOrderResult, QrActionResult } from "./types";
import {
  callWaiterInputSchema,
  customerOrderInputSchema,
  rotateTokenInputSchema,
  setOrderingInputSchema,
} from "./validation";

export async function setQrOrderingAction(
  input: unknown,
): Promise<QrActionResult> {
  const values = setOrderingInputSchema.safeParse(input);
  if (!values.success) return { ok: false, message: "Ayar bilgisi geçersiz." };

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["settings.manage"],
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_branch_qr_settings", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_ordering_enabled: values.data.enabled,
  });
  if (error) return { ok: false, message: "Ayar kaydedilemedi." };

  revalidatePath(`/app/${values.data.tenant}/${values.data.branch}/ayarlar/qr-menu`);
  return {
    ok: true,
    message: values.data.enabled
      ? "Müşteriler artık QR menüden sipariş verebilir."
      : "QR menü yalnızca görüntüleme modunda. Siparişleri garson alacak.",
  };
}

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

const customerErrors: Record<string, string> = {
  qr_ordering_disabled: "Bu işletme QR menüden sipariş almıyor. Lütfen garsonu çağırın.",
  table_not_available: "Bu masa şu anda siparişe açık değil. Lütfen garsonu çağırın.",
  product_not_available: "Seçtiğiniz ürünlerden biri artık satışta değil. Menüyü yenileyin.",
  product_sold_out: "Seçtiğiniz ürünlerden biri bugün tükendi. Menüyü yenileyin.",
  product_station_required: "Ürünlerden biri şu an QR ile sipariş edilemiyor. Lütfen garsonu çağırın.",
  qr_rate_limited: "Çok sık sipariş verdiniz. Birkaç saniye sonra tekrar deneyin.",
  qr_not_found: "Bu QR kod geçerli değil. Lütfen garsonu çağırın.",
};

export async function placeCustomerOrderAction(
  input: unknown,
): Promise<CustomerOrderResult> {
  const values = customerOrderInputSchema.safeParse(input);
  if (!values.success) {
    return { ok: false, code: "invalid_input", message: "Sipariş bilgilerini kontrol edin." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("place_customer_order", {
    target_token: values.data.token,
    target_items: values.data.items,
    target_idempotency_key: values.data.idempotencyKey,
  });

  if (error) {
    const code = Object.keys(customerErrors).find((key) => error.message.includes(key));
    return {
      ok: false,
      code: code || "order_failed",
      message: code ? customerErrors[code] : "Sipariş gönderilemedi. Lütfen garsonu çağırın.",
    };
  }

  const payload = data as { orderNumber?: unknown } | null;
  if (!payload || typeof payload.orderNumber !== "number") {
    return { ok: false, code: "invalid_response", message: "Sipariş yanıtı doğrulanamadı." };
  }
  return { ok: true, orderNumber: payload.orderNumber };
}

const callErrors: Record<string, string> = {
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
