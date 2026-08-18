import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { departmentCreateSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";

// GET: Super admin sees all departments (active by default; ?status=ARCHIVED
// or ?status=ALL to include archived ones). Department admin only ever sees
// their own, regardless of status, since they still need to see it if it's
// been archived out from under them.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const status = req.nextUrl.searchParams.get("status"); // "ACTIVE" | "ARCHIVED" | "ALL" | null

    const statusFilter = status === "ALL" ? {} : { status: status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE" };

    const departments = await prisma.department.findMany({
      where:
        user.role === "SUPER_ADMIN"
          ? (statusFilter as any)
          : { id: user.departmentId ?? "__none__" },
      include: {
        academicSession: true,
        _count: { select: { students: true, payments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ departments });
  } catch (err) {
    return handleError(err);
  }
}

// POST: the "CREATE DEPARTMENT" form - the single central configuration
// point. Creates the department, its payment provider config, SMS config,
// its first (financial secretary) admin account, and any students entered
// or uploaded at setup time, all in one transaction. Nothing here should
// ever import Paystack- or Hubtel-specific code - only the generic
// PaymentProviderType and the configValue/secretKey/publicKey bag get
// stored; the actual adapter is resolved later via getPaymentProvider().
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const parsed = departmentCreateSchema.parse(body);

    const [codeConflict, emailConflict, usernameConflict] = await Promise.all([
      prisma.department.findFirst({
        where: { academicSessionId: parsed.academicSessionId, code: parsed.code },
      }),
      prisma.user.findUnique({ where: { email: parsed.admin.email.toLowerCase().trim() } }),
      parsed.admin.username
        ? prisma.user.findUnique({ where: { username: parsed.admin.username } })
        : Promise.resolve(null),
    ]);

    if (codeConflict) {
      return NextResponse.json(
        { error: "A department with this code already exists for the selected academic session" },
        { status: 409 }
      );
    }
    if (emailConflict) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    if (usernameConflict) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }

    // Slug powers the public payment URL (/d/[slug]) and isn't part of the
    // form - derive it from the name and disambiguate on collision.
    const baseSlug = slugify(parsed.name) || slugify(parsed.code);
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.department.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++suffix}`;
    }

    // Duplicate reference numbers within the submitted roster are rejected
    // up front so the transaction can't partially fail on a unique
    // constraint after other records are already created.
    const seenRefs = new Set<string>();
    for (const s of parsed.students) {
      if (seenRefs.has(s.referenceNumber)) {
        return NextResponse.json(
          { error: `Duplicate reference number "${s.referenceNumber}" in the student list` },
          { status: 400 }
        );
      }
      seenRefs.add(s.referenceNumber);
    }

    const passwordHash = await bcrypt.hash(parsed.admin.password, 10);
    // Shared secret used by provider adapters that don't sign their own
    // webhooks (e.g. Hubtel) to authenticate inbound callbacks.
    const webhookSecret = crypto.randomBytes(24).toString("hex");

    const result = await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          name: parsed.name,
          code: parsed.code,
          slug,
          academicSessionId: parsed.academicSessionId,
          fresherAmount: parsed.fresherAmount,
          continuingAmount: parsed.continuingAmount,
          contactEmail: parsed.admin.email,
          contactPhone: parsed.admin.phone || null,
          logoUrl: parsed.logoUrl || null,
        },
      });

      await tx.paymentProviderConfiguration.create({
        data: {
          departmentId: department.id,
          provider: parsed.paymentProvider.provider,
          environment: "TEST",
          configValue: parsed.paymentProvider.configValue || null,
          webhookSecret,
        },
      });

      await tx.smsConfiguration.create({
        data: {
          departmentId: department.id,
          senderId: parsed.sms?.senderId || parsed.code.toUpperCase().slice(0, 11),
          ...(parsed.sms?.messageTemplate ? { messageTemplate: parsed.sms.messageTemplate } : {}),
        },
      });

      await tx.emailConfiguration.create({ data: { departmentId: department.id } });

      const admin = await tx.user.create({
        data: {
          name: parsed.admin.name,
          email: parsed.admin.email.toLowerCase().trim(),
          username: parsed.admin.username || null,
          phone: parsed.admin.phone || null,
          passwordHash,
          role: "DEPARTMENT_ADMIN",
          departmentId: department.id,
        },
      });

      let studentsCreated = 0;
      if (parsed.students.length > 0) {
        const created = await tx.student.createMany({
          data: parsed.students.map((s) => ({
            fullName: s.fullName,
            referenceNumber: s.referenceNumber,
            studentIndexNo: s.studentIndexNo || null,
            level: s.level,
            phone: s.phone,
            email: s.email || null,
            departmentId: department.id,
            academicSessionId: parsed.academicSessionId,
          })),
        });
        studentsCreated = created.count;
      }

      return { department, admin, studentsCreated };
    });

    await logAudit({
      userId: user.id,
      departmentId: result.department.id,
      action: "DEPARTMENT_CREATED",
      entity: "Department",
      entityId: result.department.id,
      metadata: {
        name: result.department.name,
        paymentProvider: parsed.paymentProvider.provider,
        adminEmail: result.admin.email,
        studentsCreated: result.studentsCreated,
      },
    });

    return NextResponse.json(
      {
        department: result.department,
        admin: { id: result.admin.id, email: result.admin.email, username: result.admin.username },
        studentsCreated: result.studentsCreated,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err && typeof err === "object" && "issues" in err) {
    // zod error
    return NextResponse.json({ error: "Invalid input", details: (err as any).issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
