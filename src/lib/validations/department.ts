import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(10),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens only"),
  description: z.string().optional(),
  academicSessionId: z.string().min(1),
  fresherAmount: z.coerce.number().nonnegative(),
  continuingAmount: z.coerce.number().nonnegative(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;

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
