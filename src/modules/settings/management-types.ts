export type TenantConfiguration = {
  tenantName: string;
  legalName: string;
  branchName: string;
  brandName: string;
  primaryColor: string;
  orderNumberPrefix: string;
  receiptFooter: string;
  serviceChargeBasisPoints: number;
};

export type TeamBranch = { id: string; name: string };
export type TeamRole = { id: string; code: string; name: string };
export type MembershipStatus = "invited" | "active" | "suspended";

export type TeamMember = {
  id: string;
  userId: string;
  fullName: string;
  status: MembershipStatus;
  branchIds: string[];
  roleIds: string[];
};

export type PendingInvitation = {
  id: string;
  email: string;
  branchName: string;
  roleName: string;
  expiresAt: string;
};

export type TeamSnapshot = {
  branches: TeamBranch[];
  roles: TeamRole[];
  members: TeamMember[];
  invitations: PendingInvitation[];
};

export type SettingsActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  invitationUrl?: string;
};

export const initialSettingsActionState: SettingsActionState = {
  status: "idle",
  message: null,
};
