import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { requireDepartmentAccess, requireAuth, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { studentCsvRowSchema } from "@/lib/validations/student";
import { logAudit } from "@/lib/audit";

const LEVEL_MAP: Record<string, string> = {
  "100": "L100", "200": "L200", "300": "L300", "400": "L400", "500": "L500", "600": "L600",
  L100: "L100", L200: "L200", L300: "L300", L400: "L400", L500: "L500", L600: "L600",
};

/**
 * Step 1 (dryRun=true, default): parse + validate only, return a preview of
 * valid rows and errors. Nothing is written to the database.
 * Step 2 (dryRun=false): caller has reviewed the preview and confirmed;
 * only rows that passed validation in step 1 (re-validated here) are inserted.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { csvText, departmentId: bodyDepartmentId, academicSessionId, dryRun = true } = body;

    const departmentId = user.role === "SUPER_ADMIN" ? bodyDepartmentId : user.departmentId;
    if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    if (!academicSessionId) return NextResponse.json({ error: "academicSessionId is required" }, { status: 400 });
    await requireDepartmentAccess(departmentId);

    if (!csvText || typeof csvText !== "string") {
      return NextResponse.json({ error: "csvText is required" }, { status: 400 });
    }

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: "CSV could not be parsed", details: parsed.errors }, { status: 400 });
    }

    const rows = parsed.data as Record<string, string>[];
    const existingRefs = new Set(
      (
        await prisma.student.findMany({
          where: { departmentId, academicSessionId },
          select: { referenceNumber: true },
        })
      ).map((s) => s.referenceNumber)
    );

    const seenInFile = new Set<string>();
    const validRows: any[] = [];
    const errors: { row: number; reference?: string; message: string }[] = [];

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2; // account for header row
      const result = studentCsvRowSchema.safeParse(row);
      if (!result.success) {
        errors.push({
          row: rowNumber,
          reference: row.reference_number,
          message: result.error.issues.map((i) => i.message).join("; "),
        });
        return;
      }
      const data = result.data;
      const level = LEVEL_MAP[data.level.trim()];
      if (!level) {
        errors.push({ row: rowNumber, reference: data.reference_number, message: `Unrecognized level "${data.level}"` });
        return;
      }
      if (existingRefs.has(data.reference_number) || seenInFile.has(data.reference_number)) {
        errors.push({ row: rowNumber, reference: data.reference_number, message: "Duplicate reference number" });
        return;
      }
      seenInFile.add(data.reference_number);
      validRows.push({
        fullName: data.name,
        referenceNumber: data.reference_number,
        studentIndexNo: data.student_id || null,
        level,
        phone: data.phone,
        email: data.email || null,
        departmentId,
        academicSessionId,
      });
    });

    if (dryRun) {
      return NextResponse.json({
        preview: true,
        totalRows: rows.length,
        validCount: validRows.length,
        errorCount: errors.length,
        validRows,
        errors,
      });
    }

    // Confirmed insert: only rows that are valid are written, in one transaction.
    const created = await prisma.$transaction(validRows.map((r) => prisma.student.create({ data: r })));

    await logAudit({
      userId: user.id,
      departmentId,
      action: "STUDENTS_CSV_UPLOADED",
      entity: "Student",
      metadata: { insertedCount: created.length, errorCount: errors.length },
    });

    return NextResponse.json({ preview: false, insertedCount: created.length, errors });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  captureError(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
