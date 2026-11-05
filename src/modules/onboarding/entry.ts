import { parsePlanParam, planIdForCode, type PlanCode } from "./plans";

/**
 * What the visitor chose before signing up: a package (from a price card) and/or
 * "setup support" (from the secondary call to action). Both travel in the URL, so
 * both are re-validated everywhere they are read: unknown values are dropped.
 */
export type EntryChoice = { plan: PlanCode | null; support: boolean };

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export function parseEntry(params: Params): EntryChoice {
  return {
    plan: parsePlanParam(read(params, "paket")),
    support: read(params, "kurulum") === "destek",
  };
}

/** "?paket=profesyonel&kurulum=destek" or "" when nothing was chosen. */
export function entryQuery(choice: EntryChoice) {
  const parts: string[] = [];
  if (choice.plan) parts.push(`paket=${planIdForCode(choice.plan)}`);
  if (choice.support) parts.push("kurulum=destek");
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Page the new business lands on after it was created. */
export function setupLandingPath(tenantSlug: string, branchSlug: string, choice: Pick<EntryChoice, "support">) {
  return `/app/${tenantSlug}/${branchSlug}/kurulum${choice.support ? "?yontem=destek" : ""}`;
}
