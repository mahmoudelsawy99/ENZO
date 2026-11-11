import type { ClientSession } from 'mongoose';
import { saveDoc } from '../../shared/persist.js';
import { AuditLog } from './audit.model.js';

export async function writeAudit(
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    changes?: Record<string, unknown>;
  },
  session: ClientSession | null = null,
): Promise<void> {
  const entry = new AuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
  });
  if (input.changes) {
    entry.set('changes', input.changes);
  }
  await saveDoc(entry, session);
}

export function auditTime(value: unknown): string {
  return value instanceof Date ? value.toISOString() : '';
}
