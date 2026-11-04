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
export type TeamRole = { id: string; code: string; name: string; scope: "tenant" | "branch" };
export type TeamStation = { id: string; name: string; branchName: string };
export const grantablePermissions = [
  { code: "settings.manage", label: "Ayarlar" },
  { code: "catalog.manage", label: "Menü ve ürünler" },
  { code: "users.manage", label: "Kullanıcı yönetimi" },
  { code: "reports.history", label: "Geçmiş raporlar" },
] as const;
export type MembershipStatus = "invited" | "active" | "suspended";

export type TeamMember = {
  id: string;
  userId: string;
  fullName: string;
  status: MembershipStatus;
  branchIds: string[];
  roleIds: string[];
  permissionCodes: string[];
  stationIds: string[];
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
  stations: TeamStation[];
  canGrantExtras: boolean;
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
