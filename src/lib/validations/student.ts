import { z } from "zod";

export const studentLevelEnum = z.enum(["L100", "L200", "L300", "L400"]);

// .trim() runs BEFORE .min() so a copy-pasted leading/trailing space (the
// classic case: a reference number pasted from a spreadsheet cell) can never
// silently produce a stored value that fails to match itself later - a
// mismatch here is what made a valid reference number look like "no student
// found" or, worse, register a duplicate self-registered fresher.
export const studentSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  referenceNumber: z.string().trim().min(1, "Reference number is required"),
  studentIndexNo: z.string().trim().optional().nullable(),
  level: studentLevelEnum,
  phone: z.string().trim().min(9, "Valid phone number is required"),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
});

export type StudentInput = z.infer<typeof studentSchema>;

export const studentCsvRowSchema = z.object({
  name: z.string().trim().min(2),
  reference_number: z.string().trim().min(1),
  student_id: z.string().trim().optional(),
  level: z.string().trim().min(1),
  phone: z.string().trim().min(9),
  email: z.string().trim().email().optional().or(z.literal("")),
});
