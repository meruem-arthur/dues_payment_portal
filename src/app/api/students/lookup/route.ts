import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const lookupSchema = z.object({
  departmentSlug: z.string(),
  paymentType: z.enum(["FRESHER", "CONTINUING"]),
  referenceNumber: z.string().min(1),
});

// Same public trust model as /api/payments/initiate: no session required,
// and a department admin's data is already reachable by anyone who knows a
// valid reference number for that department (initiate's error messages
// already confirm existence). This endpoint exists purely so the "review
// before you pay" confirm screen can show the student's real name (fetched
// from the DB) instead of asking them to retype it - it never creates,
// modifies, or charges anything.
//
// Rate-limited the same as initiate, since it's the same kind of
// reference-number-guessing surface.
const RATE_LIMIT_MAX_REQUESTS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`students:lookup:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const input = lookupSchema.parse(body);

    const department = await prisma.department.findUnique({ where: { slug: input.departmentSlug } });
    if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });
    if (department.status === "ARCHIVED") {
      return NextResponse.json({ error: "This department is no longer accepting payments" }, { status: 410 });
    }

    // Continuing students are always pre-loaded ahead of time (see
    // /api/payments/initiate) - a missing record here is a genuine
    // "check your reference number" case, never self-registration. This
    // endpoint is never called for FRESHER (they type their own name, no
    // lookup needed - see pay-button.tsx), but it's handled the same way
    // defensively in case that ever changes.
    const student = await prisma.student.findFirst({
      where: {
        departmentId: department.id,
        academicSessionId: department.academicSessionId,
        referenceNumber: input.referenceNumber,
      },
      select: { fullName: true, level: true, paymentStatus: true },
    });
    if (!student) {
      return NextResponse.json({ error: "No student found with that reference number in this department" }, { status: 404 });
    }

    const expectedPaymentType = student.level === "L100" ? "FRESHER" : "CONTINUING";
    if (input.paymentType !== expectedPaymentType) {
      const message =
        expectedPaymentType === "FRESHER"
          ? "You're registered as a Level 100 student — use the First Year link"
          : "You're registered as a continuing student - use the continuing student link";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (student.paymentStatus === "SUCCESS") {
      return NextResponse.json(
        { error: "You've already paid — check your SMS for your receipt." },
        { status: 409 }
      );
    }

    return NextResponse.json({ fullName: student.fullName });
  } catch (err) {
    captureError(err);
    return NextResponse.json({ error: "Could not look up that reference number. Please try again." }, { status: 500 });
  }
}
