import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { SessionUser } from "./auth";

export async function logAudit(params: {
  entity: string;
  entityId?: number | null;
  action: string;
  user?: SessionUser | null;
  changes?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      entity: params.entity,
      entityId: params.entityId ?? null,
      action: params.action,
      userId: params.user?.id ?? null,
      userName: params.user?.fullName ?? null,
      changes: params.changes ?? {},
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
