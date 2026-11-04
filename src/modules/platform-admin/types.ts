export type SubscriptionStatus = "trial" | "active" | "suspended" | "cancelled";

export type TenantSummary = {
  id: string;
  name: string;
  branches: number;
  users: number;
  subscriptionStatus: SubscriptionStatus;
  expiresAt: string;
};

export type PlatformMember = {
  userId: string;
  email: string | null;
  fullName: string | null;
  createdAt: string;
  tenants: Array<{
    tenantId: string;
    tenantName: string;
    status: string;
    roles: string[];
  }>;
};
