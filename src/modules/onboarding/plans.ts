import { pricingPlans, type PricingPlan } from "@/lib/pricing";

export type PlanCode = "START" | "PRO" | "MULTI";

const codeByPlanId: Record<PricingPlan["id"], PlanCode> = {
  baslangic: "START",
  profesyonel: "PRO",
  "cok-subeli": "MULTI",
};

/**
 * Turns the `paket` URL parameter into a plan code. The URL is only a hint:
 * unknown values are dropped here, and the database validates the code again
 * when the business is created.
 */
export function parsePlanParam(value: string | string[] | null | undefined): PlanCode | null {
  if (typeof value !== "string") return null;
  const plan = pricingPlans.find((item) => item.id === value);
  return plan ? codeByPlanId[plan.id] : null;
}

export function planIdForCode(code: PlanCode): PricingPlan["id"] {
  const entry = (Object.entries(codeByPlanId) as [PricingPlan["id"], PlanCode][]).find(([, planCode]) => planCode === code);
  return entry ? entry[0] : "baslangic";
}

export function planForCode(code: PlanCode) {
  return pricingPlans.find((item) => item.id === planIdForCode(code)) ?? pricingPlans[0];
}

export const defaultPlanCode: PlanCode = "START";
