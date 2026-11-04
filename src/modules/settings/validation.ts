import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

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

export const provisionTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160),
  slug: slugSchema,
  branchName: z.string().trim().min(2).max(120),
  branchSlug: slugSchema,
  ownerEmail: z.email().max(254).transform((value) => value.toLowerCase()),
  planCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  status: z.enum(["trial", "active", "suspended", "cancelled"]),
  endsAt: optionalDateTime,
  notes: z.string().trim().max(500),
});

export const subscriptionSchema = z
  .object({
    tenantId: z.uuid(),
    planCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
    status: z.enum(["trial", "active", "suspended", "cancelled"]),
    startsAt: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value))),
    endsAt: optionalDateTime,
    notes: z.string().trim().max(500),
  })
  .refine(
    (value) => value.endsAt === null || Date.parse(value.endsAt) > Date.parse(value.startsAt),
    { path: ["endsAt"] },
  );
