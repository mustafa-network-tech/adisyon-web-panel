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
  "settings.manage",
  "catalog.manage",
  "users.manage",
] as const;

export type Permission = (typeof permissions)[number];

export const systemRoles = [
  "owner",
  "manager",
  "waiter",
  "kitchen",
  "cashier",
  "viewer",
] as const;

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
