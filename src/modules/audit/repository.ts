import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/modules/staff/dates";
import { categoryPrefixes } from "./labels";

export const AUDIT_PAGE_SIZE = 50;

export type AuditEntry = {
  id: number;
  action: string;
  entityType: string;
  actorName: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageCount: number;
};

type Filters = { category?: string; from?: string; to?: string; page?: number };

export async function getAuditPage(tenantId: string, filters: Filters): Promise<AuditPage> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, Math.floor(filters.page || 1));
  const offset = (page - 1) * AUDIT_PAGE_SIZE;

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, actor_user_id, metadata, created_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1);

  const prefixes = categoryPrefixes(filters.category);
  if (prefixes) query = query.or(prefixes.map((prefix) => `action.like.${prefix}%`).join(","));
  // Days are Turkish calendar days (UTC+3 all year).
  if (isIsoDate(filters.from)) query = query.gte("created_at", `${filters.from}T00:00:00+03:00`);
  if (isIsoDate(filters.to)) query = query.lte("created_at", `${filters.to}T23:59:59.999+03:00`);

  const { data, count, error } = await query;
  if (error) throw new Error("Denetim kayıtları okunamadı.");

  const rows = data || [];
  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter(Boolean))] as string[];
  const profiles = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [], error: null };
  const names = new Map((profiles.data || []).map((row) => [row.id as string, row.full_name as string]));

  const total = count ?? rows.length;
  return {
    entries: rows.map((row) => ({
      id: Number(row.id),
      action: row.action as string,
      entityType: row.entity_type as string,
      actorName: row.actor_user_id ? names.get(row.actor_user_id as string) || "Ekip üyesi" : "Müşteri / sistem",
      createdAt: row.created_at as string,
      metadata: (row.metadata || {}) as Record<string, unknown>,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}
