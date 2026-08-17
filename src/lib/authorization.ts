import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * CRITICAL SECURITY MODULE.
 *
 * Every department-scoped API route MUST call requireDepartmentAccess()
 * before reading or writing department data. Frontend hiding of menu
 * items is NOT a substitute for this check.
 *
 * Rules:
 * - SUPER_ADMIN may access any department.
 * - DEPARTMENT_ADMIN may access ONLY the department they are assigned to.
 * - Any mismatch results in a 403, never a silent redirect that leaks data.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "DEPARTMENT_ADMIN";
  departmentId: string | null;
};

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Not authenticated") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "You do not have access to this department") {
    super(message);
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as SessionUser;
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError("Super admin only");
  return user;
}

/**
 * Verifies the current user may operate on the given departmentId.
 * Use this at the top of every department-scoped route handler.
 */
export async function requireDepartmentAccess(departmentId: string): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role === "SUPER_ADMIN") return user;
  if (user.role === "DEPARTMENT_ADMIN" && user.departmentId === departmentId) return user;
  throw new ForbiddenError();
}

/**
 * Helper for building a Prisma `where` clause that automatically scopes
 * a query to the caller's allowed department(s). SUPER_ADMIN with no
 * explicit departmentId filter sees everything; DEPARTMENT_ADMIN is
 * always pinned to their own department regardless of query params.
 */
export function scopedDepartmentWhere(user: SessionUser, requestedDepartmentId?: string | null) {
  if (user.role === "SUPER_ADMIN") {
    return requestedDepartmentId ? { departmentId: requestedDepartmentId } : {};
  }
  // DEPARTMENT_ADMIN: ignore any requested departmentId from the client entirely.
  return { departmentId: user.departmentId as string };
}
