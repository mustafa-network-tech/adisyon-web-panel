export const permissions = [
  "tables.read",
  "orders.create",
  "orders.update",
  "orders.cancel",
  "kitchen.read",
  "kitchen.update",
  "payments.create",
  "payments.refund",
  "cash.open",
  "cash.close",
  "reports.read",
  "reports.history",
  "settings.manage",
  "catalog.manage",
  "users.manage",
  "staff.view",
  "shifts.manage",
  "staff.manage",
  "payroll.manage",
  "attendance.manage",
  "discounts.apply",
] as const;

export type Permission = (typeof permissions)[number];

export const systemRoles = [
  "owner",
  "tenant_admin",
  "manager",
  "cashier",
  "kitchen",
  "waiter",
] as const;

/** Tenant-scope roles reach every branch; the rest only assigned branches. */
export const tenantScopeRoles = ["owner", "tenant_admin"] as const satisfies readonly SystemRole[];

export type SystemRole = (typeof systemRoles)[number];

export function isPermission(value: string): value is Permission {
  return permissions.includes(value as Permission);
}

export const workspaceSections = {
  tables: ["tables.read"],
  kitchen: ["kitchen.read"],
  checkout: [
    "payments.create",
    "payments.refund",
    "cash.open",
    "cash.close",
    "reports.read",
  ],
  settings: ["settings.manage", "catalog.manage", "users.manage"],
  orders: ["orders.create", "orders.update"],
  staff: ["staff.view", "shifts.manage", "staff.manage", "payroll.manage", "attendance.manage"],
} as const satisfies Record<string, readonly Permission[]>;

export function hasAnyPermission(
  granted: readonly Permission[],
  required: readonly Permission[],
) {
  return required.some((permission) => granted.includes(permission));
}

export function getWorkspaceHomeSegment(granted: readonly Permission[]) {
  if (hasAnyPermission(granted, workspaceSections.tables)) return "masalar";
  if (hasAnyPermission(granted, workspaceSections.kitchen)) return "mutfak";
  if (hasAnyPermission(granted, workspaceSections.checkout)) return "kasa";
  if (hasAnyPermission(granted, workspaceSections.settings)) return "ayarlar";
  return null;
}
