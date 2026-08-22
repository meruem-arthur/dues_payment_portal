import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getEmailProvider } from "@/lib/email/provider-factory";
import { logAudit } from "@/lib/audit";

// Public, unauthenticated endpoint - same class of exposure as
// /api/payments/initiate, so it gets the same treatment: rate-limited, and
// deliberately vague in its response either way, so this can never be used
// to check which emails have an account here (a classic user-enumeration
// hole for "forgot password" flows).
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_RESPONSE = {
  message: "If an account exists for that email, we've sent a link to reset the password.",
};

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`forgot-password:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = forgotPasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email: parsed.email.toLowerCase().trim() },
    });

    // Always the same response and status code whether or not the account
    // exists or is active - only the work done differs, never what's sent
    // back to the caller.
    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    // Invalidate any earlier unused tokens for this user so only the most
    // recently requested link works - tidier, and closes the (minor) window
    // where an old, still-unexpired link would otherwise keep working too.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;

    const emailProvider = getEmailProvider();
    await emailProvider.send({
      to: user.email,
      subject: "Reset your Dues Payment Portal password",
      body: `Hi ${user.name},\n\nA password reset was requested for your account. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email - your password won't be changed.`,
    });

    await logAudit({
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entity: "User",
      entityId: user.id,
    });

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      return NextResponse.json({ error: "Invalid input", details: (err as any).issues }, { status: 400 });
    }
    captureError(err);
    // Even on an unexpected error, don't leak whether the account exists -
    // return the same generic message rather than a 500 with details.
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
