import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

// The token itself is 32 random bytes (64 hex chars), so brute-forcing it
// directly isn't realistic - this rate limit is a basic backstop, same
// posture as every other public endpoint in this app.
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`reset-password:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = resetPasswordSchema.parse(body);

    const tokenHash = crypto.createHash("sha256").update(parsed.token).digest("hex");
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    const isValid = resetToken && !resetToken.usedAt && resetToken.expiresAt > new Date();
    if (!isValid) {
      return NextResponse.json({ error: "This reset link is invalid or has expired. Please request a new one." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await logAudit({
      userId: resetToken.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "User",
      entityId: resetToken.userId,
    });

    return NextResponse.json({ message: "Password updated. You can now sign in." });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      return NextResponse.json({ error: "Invalid input", details: (err as any).issues }, { status: 400 });
    }
    captureError(err);
    return NextResponse.json({ error: "Could not reset password. Please try again." }, { status: 500 });
  }
}
