import { z } from "zod";
import { studentLevelEnum } from "./student";

export const departmentSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(10),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens only")
    .optional(), // auto-derived from name/code server-side when omitted
  description: z.string().optional(),
  academicSessionId: z.string().min(1),
  fresherAmount: z.coerce.number().nonnegative(),
  continuingAmount: z.coerce.number().nonnegative(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;

// ------------------------------------------------------------
// Full "Create Department" form (Phase 2): the single central
// configuration point covering payment provider, SMS, the first
// department admin account, and an optional initial student roster.
// ------------------------------------------------------------

export const paymentProviderSchema = z.object({
  provider: z.enum(["PAYSTACK", "HUBTEL"]),
  // The generic "Payment Link / Configuration" field from the form. What it
  // means is entirely up to the chosen provider's adapter - see
  // src/lib/payments/provider.interface.ts.
  configValue: z.string().optional(),
});

export const smsConfigSchema = z.object({
  senderId: z.string().min(1).max(11, "Sender ID must be 11 characters or fewer").optional().or(z.literal("")),
  messageTemplate: z.string().optional().or(z.literal("")),
});

export const departmentAdminCreateSchema = z.object({
  name: z.string().min(2, "Financial secretary name is required"),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  username: z.string().min(3).optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const initialStudentSchema = z.object({
  fullName: z.string().min(2),
  referenceNumber: z.string().min(1),
  studentIndexNo: z.string().optional().nullable(),
  level: studentLevelEnum,
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")).nullable(),
});

export const departmentCreateSchema = z.object({
  name: z.string().min(2, "Department name is required"),
  code: z.string().min(2).max(10, "Department code must be 10 characters or fewer"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens only")
    .optional(),
  academicSessionId: z.string().min(1, "Academic session is required"),

  fresherAmount: z.coerce.number().nonnegative(),
  continuingAmount: z.coerce.number().nonnegative(),

  // Small circular logo shown under the department name on the public
  // student page. Optional - a data URL (image/*), capped well under the
  // request body limit. Omitted entirely means no logo is shown.
  logoUrl: z
    .string()
    .refine((v) => v.startsWith("data:image/"), "Logo must be an image")
    .refine((v) => v.length < 700_000, "Logo image is too large")
    .optional()
    .or(z.literal("")),

  paymentProvider: paymentProviderSchema,
  sms: smsConfigSchema.optional(),
  admin: departmentAdminCreateSchema,
  students: z.array(initialStudentSchema).default([]),
});

export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const academicSessionSchema = z.object({
  name: z.string().min(4), // e.g. "2026/2027"
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export type AcademicSessionInput = z.infer<typeof academicSessionSchema>;

// ------------------------------------------------------------
// Payment provider configuration update (Phase 2 follow-up).
//
// Used by PATCH /api/departments/[id]/payment-config once a department
// already exists, so a Super Admin can paste in / rotate the real
// Paystack (or Hubtel) API credentials that the create-department form
// deliberately leaves out. Every field is optional so the endpoint can
// be called with a partial body (e.g. rotating just the secret key)
// without clobbering the rest of the configuration - see the route
// handler for the "blank means don't touch this field" convention
// applied to the secret-bearing fields.
// ------------------------------------------------------------
export const paymentProviderConfigUpdateSchema = z.object({
  provider: z.enum(["PAYSTACK", "HUBTEL"]).optional(),
  environment: z.enum(["TEST", "LIVE"]).optional(),
  publicKey: z.string().trim().max(500).optional(),
  secretKey: z.string().trim().max(500).optional(),
  webhookSecret: z.string().trim().max(500).optional(),
  configValue: z.string().trim().max(500).optional(),
});

export type PaymentProviderConfigUpdateInput = z.infer<typeof paymentProviderConfigUpdateSchema>;

// ------------------------------------------------------------
// SMS config: same "blank means unchanged" convention on apiKey,
// since it's the secret-bearing field here.
// ------------------------------------------------------------
export const smsConfigUpdateSchema = z.object({
  senderId: z.string().trim().min(1).max(11).optional(), // Africa's Talking alphanumeric sender id limit
  messageTemplate: z.string().trim().min(1).max(500).optional(),
  username: z.string().trim().max(200).optional(),
  apiKey: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
});

export type SmsConfigUpdateInput = z.infer<typeof smsConfigUpdateSchema>;

export const departmentAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  departmentId: z.string().min(1),
});
