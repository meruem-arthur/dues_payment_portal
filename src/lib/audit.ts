import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function logAudit(params: {
  userId?: string | null;
  departmentId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        departmentId: params.departmentId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    // Audit logging must never break the primary operation.
    console.error("Failed to write audit log", err);
  }
}
