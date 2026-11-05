"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseAreas, parseMenu, parseStations, parseTables } from "@/modules/onboarding/parse";
import { setupErrorMessage } from "@/modules/onboarding/status";
import type { CrudActionState } from "@/modules/settings/action-state";

const error = (message: string): CrudActionState => ({ status: "error", message });
const success = (message: string): CrudActionState => ({ status: "success", message });

const idSchema = z.uuid();

function refresh(tenantId: string) {
  revalidatePath("/mk-admin");
  revalidatePath(`/mk-admin/kurulum/${tenantId}`);
}

const statusSchema = z.object({
  tenantId: idSchema,
  status: z.enum(["assisted_in_progress", "info_needed", "setup_completed", "trial_ready"]),
  note: z.string().trim().max(1000),
});

/** Moves an assisted setup to its next status; the database checks the allowed transitions. */
export async function setSetupStatusAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  await requirePlatformAdmin();
  const values = statusSchema.safeParse({
    tenantId: formData.get("tenantId"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!values.success) return error("Durum bilgisi geçersiz.");
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("platform_set_setup_status", {
    target_tenant_id: values.data.tenantId,
    target_status: values.data.status,
    target_note: values.data.note || null,
  });
  if (rpcError) return error(setupErrorMessage(rpcError.message));
  refresh(values.data.tenantId);
  return success("Kurulum durumu güncellendi.");
}

const sectionSchema = z.object({
  tenantId: idSchema,
  section: z.enum(["areas", "tables", "stations", "menu"]),
  text: z.string().max(40000),
});

/** Creates halls, tables, stations or menu items for the business. Nothing else can be created here. */
export async function applySetupSectionAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  await requirePlatformAdmin();
  const values = sectionSchema.safeParse({
    tenantId: formData.get("tenantId"),
    section: formData.get("section"),
    text: formData.get("text") ?? "",
  });
  if (!values.success) return error("Form bilgisi geçersiz.");
  const { tenantId, section, text } = values.data;
  const supabase = await createSupabaseServerClient();

  let result;
  if (section === "areas") {
    const parsed = parseAreas(text);
    if (!parsed.ok) return error(parsed.error);
    result = await supabase.rpc("platform_setup_apply_areas", { target_tenant_id: tenantId, target_names: parsed.rows });
  } else if (section === "tables") {
    const parsed = parseTables(text);
    if (!parsed.ok) return error(parsed.error);
    result = await supabase.rpc("platform_setup_apply_tables", { target_tenant_id: tenantId, target_items: parsed.rows });
  } else if (section === "stations") {
    const parsed = parseStations(text);
    if (!parsed.ok) return error(parsed.error);
    result = await supabase.rpc("platform_setup_apply_stations", { target_tenant_id: tenantId, target_items: parsed.rows });
  } else {
    const parsed = parseMenu(text);
    if (!parsed.ok) return error(parsed.error);
    result = await supabase.rpc("platform_setup_apply_menu", { target_tenant_id: tenantId, target_items: parsed.rows });
  }

  if (result.error) return error(setupErrorMessage(result.error.message));
  const created = typeof (result.data as { created?: number } | null)?.created === "number" ? (result.data as { created: number }).created : 0;
  refresh(tenantId);
  return success(created > 0 ? `${created} kayıt oluşturuldu.` : "Yeni kayıt yok; bu kayıtlar zaten mevcut.");
}
