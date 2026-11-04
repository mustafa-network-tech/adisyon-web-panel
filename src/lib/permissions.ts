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
