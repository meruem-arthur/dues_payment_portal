import { z } from "zod";

export const studentLevelEnum = z.enum(["L100", "L200", "L300", "L400", "L500", "L600"]);

export const studentSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  referenceNumber: z.string().min(1, "Reference number is required"),
  studentIndexNo: z.string().optional().nullable(),
  level: studentLevelEnum,
  phone: z.string().min(9, "Valid phone number is required"),
  email: z.string().email().optional().or(z.literal("")).nullable(),
});

export type StudentInput = z.infer<typeof studentSchema>;

export const studentCsvRowSchema = z.object({
  name: z.string().min(2),
  reference_number: z.string().min(1),
  student_id: z.string().optional(),
  level: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")),
});
