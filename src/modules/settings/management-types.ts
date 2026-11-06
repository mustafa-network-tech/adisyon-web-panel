export type TenantConfiguration = {
  tenantName: string;
  legalName: string;
  branchName: string;
  brandName: string;
  primaryColor: string;
  orderNumberPrefix: string;
  receiptFooter: string;
};

export type TeamBranch = { id: string; name: string };
export type TeamRole = { id: string; code: string; name: string; scope: "tenant" | "branch" };
export type TeamStation = { id: string; name: string; branchName: string };
/**
 * The extra permissions a business manager may add on top of a role. ONE list: the screen, the validation schema
 * (validation.ts) and the database (set_member_extras, migration 0041) all accept exactly these codes.
 * "İndirim" only works together with the cash desk permission: discounts exist only while taking a payment.
 */
export const grantablePermissionCodes = [
  "settings.manage",
  "catalog.manage",
  "users.manage",
  "reports.history",
  "attendance.manage",
  "payroll.manage",
  "discounts.apply",
  "catalog.availability",
] as const;
export const grantablePermissions = [
  { code: "settings.manage", label: "Ayarlar" },
  { code: "catalog.manage", label: "Menü ve ürünler" },
  { code: "users.manage", label: "Kullanıcı yönetimi" },
  { code: "reports.history", label: "Geçmiş raporlar" },
  { code: "attendance.manage", label: "Puantaj onayı" },
  { code: "payroll.manage", label: "Maaş ve prim" },
  { code: "discounts.apply", label: "Kasada indirim / promosyon" },
  { code: "catalog.availability", label: "Ürün tükendi işaretleme" },
] as const satisfies ReadonlyArray<{ code: (typeof grantablePermissionCodes)[number]; label: string }>;
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

/** Somebody who typed the business name and code and waits for a manager's decision. */
export type JoinRequest = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
};

export type TeamSnapshot = {
  branches: TeamBranch[];
  roles: TeamRole[];
  members: TeamMember[];
  joinRequests: JoinRequest[];
  /** The business code; only business wide managers get it (null for branch managers). */
  joinCode: string | null;
  stations: TeamStation[];
  canGrantExtras: boolean;
};

export type SettingsActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  /** Set after the business code was renewed. */
  joinCode?: string;
};

export const initialSettingsActionState: SettingsActionState = {
  status: "idle",
  message: null,
};
