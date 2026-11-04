export type SubscriptionStatus = "trial" | "active" | "suspended" | "cancelled";

export type TenantSummary = {
  id: string;
  name: string;
  branches: number;
  users: number;
  subscriptionStatus: SubscriptionStatus;
  expiresAt: string;
};
