"use server";

import { z } from "zod";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  callId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
});

export async function acknowledgeWaiterCallAction(input: unknown): Promise<{ ok: boolean }> {
  const values = schema.safeParse(input);
  if (!values.success) return { ok: false };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["tables.read"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("acknowledge_waiter_call", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_call_id: values.data.callId,
  });
  return { ok: !error };
}
