import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireAuth, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { changePasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

/**
 * Self-service password change for an already-authenticated admin (either
 * role) - distinct from /api/auth/reset-password, which is the unauthenticated
 * email-link flow for when a password is forgotten entirely. This one always
 * requires the CURRENT password, so a hijacked-but-not-fully-compromised
 * session (e.g. someone at an unlocked laptop) still can't lock the real
 * owner out without knowing it.
 *
 * Rate-limited per user id (not per IP, since this is authenticated) so a
 * script with a valid session can't brute-force the current password.
 */
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireAuth();

    const rateLimit = checkRateLimit(`change-password:${sessionUser.id}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = changePasswordSchema.parse(body);

    // Session doesn't carry passwordHash - load the real record to verify against.
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const currentValid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
    if (!currentValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    if (parsed.currentPassword === parsed.newPassword) {
      return NextResponse.json({ error: "New password must be different from your current password" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    await logAudit({
      userId: user.id,
      departmentId: user.departmentId,
      action: "PASSWORD_CHANGED",
      entity: "User",
      entityId: user.id,
    });

    return NextResponse.json({ message: "Password updated." });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err && typeof err === "object" && "issues" in err) {
      return NextResponse.json({ error: "Invalid input", details: (err as any).issues }, { status: 400 });
    }
    captureError(err);
    return NextResponse.json({ error: "Could not update password. Please try again." }, { status: 500 });
  }
}
