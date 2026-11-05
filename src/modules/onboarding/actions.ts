"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CrudActionState } from "@/modules/settings/action-state";
import { setupErrorMessage } from "./status";

const error = (message: string): CrudActionState => ({ status: "error", message });
const success = (message: string): CrudActionState => ({ status: "success", message });

const routeSchema = z.object({
  tenant: z.string().min(1).max(80),
  branch: z.string().min(1).max(80),
});

function readRoute(formData: FormData) {
  const parsed = routeSchema.safeParse({ tenant: formData.get("tenant"), branch: formData.get("branch") });
  return parsed.success ? parsed.data : null;
}

function setupPath(route: { tenant: string; branch: string }) {
  return `/app/${route.tenant}/${route.branch}/kurulum`;
}

/** Tenant id comes from the signed-in user's own membership, never from the form. */
async function resolve(formData: FormData) {
  const route = readRoute(formData);
  if (!route) return null;
  const context = await requireWorkspaceAccess(route.tenant, route.branch);
  return { route, tenantId: context.tenantId };
}

export async function chooseSelfSetupAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const target = await resolve(formData);
  if (!target) return error("Çalışma alanı bilgisi eksik.");
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("set_setup_method", { target_tenant_id: target.tenantId, target_method: "self" });
  if (rpcError) return error(setupErrorMessage(rpcError.message));
  revalidatePath(setupPath(target.route));
  redirect(setupPath(target.route));
}

const requestSchema = z.object({
  details: z.string().trim().min(5, "Kurulum bilgilerini yazın.").max(20000, "Metin çok uzun."),
  notes: z.string().trim().max(1000),
});

/** Ask MK Digital Systems to prepare halls, tables, stations and the menu (and nothing else). */
export async function submitAssistedRequestAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const target = await resolve(formData);
  if (!target) return error("Çalışma alanı bilgisi eksik.");
  const values = requestSchema.safeParse({
    details: formData.get("details") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!values.success) return error(values.error.issues[0]?.message ?? "Formu kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("set_setup_method", {
    target_tenant_id: target.tenantId,
    target_method: "assisted",
    target_payload: values.data,
  });
  if (rpcError) return error(setupErrorMessage(rpcError.message));
  revalidatePath(setupPath(target.route));
  return success("Kurulum talebiniz MK Digital Systems ekibine iletildi.");
}

const stepSchema = z.enum(["areas", "tables", "stations", "menu"]);

export async function completeSetupStepAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const target = await resolve(formData);
  const step = stepSchema.safeParse(formData.get("step"));
  if (!target || !step.success) return error("Kurulum adımı geçersiz.");
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("complete_setup_step", { target_tenant_id: target.tenantId, target_step: step.data });
  if (rpcError) return error(setupErrorMessage(rpcError.message));
  revalidatePath(setupPath(target.route));
  redirect(setupPath(target.route));
}

/** Go back to edit an earlier step (also after all four were completed). */
export async function reopenSetupStepAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const target = await resolve(formData);
  const step = z.coerce.number().int().min(1).max(4).safeParse(formData.get("step"));
  if (!target || !step.success) return error("Kurulum adımı geçersiz.");
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("set_setup_step", { target_tenant_id: target.tenantId, target_step: step.data });
  if (rpcError) return error(setupErrorMessage(rpcError.message));
  revalidatePath(setupPath(target.route));
  redirect(`${setupPath(target.route)}?adim=${step.data}`);
}

/** The owner confirms; the database sets the 7 day window with its own clock. */
export async function startTrialAction(_previous: CrudActionState, formData: FormData): Promise<CrudActionState> {
  const target = await resolve(formData);
  if (!target) return error("Çalışma alanı bilgisi eksik.");
  if (formData.get("confirm") !== "on") return error("Denemeyi başlatmak için onay kutusunu işaretleyin.");
  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("start_trial", { target_tenant_id: target.tenantId });
  if (rpcError) return error(setupErrorMessage(rpcError.message));
  revalidatePath(`/app/${target.route.tenant}/${target.route.branch}`, "layout");
  redirect(`/app/${target.route.tenant}/${target.route.branch}/masalar`);
}
