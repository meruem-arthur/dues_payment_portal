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

export const departmentAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  departmentId: z.string().min(1),
});
