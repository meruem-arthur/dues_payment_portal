import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { requireAuth, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { resolveNotificationFailure } from "@/lib/notification-failures";

// POST /api/notifications/[id]/resolve
//
// "Mark fixed" on the dashboard's notification-failure alert. Lets an admin
// clear a failure the moment they've actually fixed the underlying cause
// (rotated an API key, verified a sender, added a valid number) instead of
// it just sitting there until the 24h lookback window ages it out on its
// own - which previously happened whether or not anything was ever fixed.
//
// Scoped in resolveNotificationFailure(): a DEPARTMENT_ADMIN can only
// resolve a failure belonging to their own department.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    const resolved = await resolveNotificationFailure(user, params.id);
    if (!resolved) {
      return NextResponse.json({ error: "Notification failure not found or not accessible" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    captureError(err);
    return NextResponse.json({ error: "Could not resolve this notification failure" }, { status: 500 });
  }
}
