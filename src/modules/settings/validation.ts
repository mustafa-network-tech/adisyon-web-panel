import { z } from "zod";

const optionalDateTime = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)));

export const tenantConfigurationSchema = z.object({
  tenantName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160),
  branchName: z.string().trim().min(2).max(120),
  brandName: z.string().trim().min(2).max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  orderNumberPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/),
  receiptFooter: z.string().trim().max(500),
  serviceChargePercent: z.coerce.number().min(0).max(100),
});

export const invitationSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  roleId: z.uuid(),
  validHours: z.coerce.number().int().min(1).max(168),
});

export const memberAccessSchema = z.object({
  membershipId: z.uuid(),
  status: z.enum(["invited", "active", "suspended"]),
  roleId: z.uuid(),
  branchIds: z.array(z.uuid()).min(1),
});

export const subscriptionSchema = z
  .object({
    tenantId: z.uuid(),
    planCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
    status: z.enum(["trial", "active", "suspended", "cancelled"]),
    startsAt: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value))),
    endsAt: optionalDateTime,
    notes: z.string().trim().max(500),
    userLimit: z.coerce.number().int().min(1).max(10000),
    branchLimit: z.coerce.number().int().min(1).max(1000),
  })
  .refine(
    (value) => value.endsAt === null || Date.parse(value.endsAt) > Date.parse(value.startsAt),
    { path: ["endsAt"] },
  );

export const memberExtrasSchema = z.object({
  membershipId: z.uuid(),
  permissionCodes: z.array(
    z.enum(["settings.manage", "catalog.manage", "users.manage", "reports.history"]),
  ),
  stationIds: z.array(z.uuid()),
});

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  branchName: z.string().trim().min(2).max(120),
});

export const assignMemberSchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
  roleCode: z.enum(["owner", "tenant_admin", "manager", "cashier", "kitchen", "waiter"]),
});
