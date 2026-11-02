import { BadRequestException } from '@nestjs/common';

/** Task metadata keys that make up the auto-escalation deadline. Only seniors may change them after creation. */
export const TASK_ESCALATION_KEYS = ['autoEscalate', 'escalateAt'] as const;

export function parseEscalationDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Normalises `autoEscalate` / `escalateAt` on a task metadata object (in place).
 * `escalateAt` is always stored as an ISO string so the cron can range-query it.
 * Turning auto-escalation off clears the deadline.
 */
export function normalizeTaskEscalationMeta(
  meta: Record<string, any>,
  opts: { requireFuture?: boolean } = {},
): Record<string, any> {
  const hasAt = meta.escalateAt !== undefined;
  const hasFlag = meta.autoEscalate !== undefined;
  if (!hasAt && !hasFlag) return meta;

  const at = parseEscalationDate(meta.escalateAt);
  if (hasAt && meta.escalateAt && !at) {
    throw new BadRequestException('Invalid escalation date/time');
  }
  const flag = hasFlag
    ? meta.autoEscalate === true || meta.autoEscalate === 'true'
    : Boolean(at);

  if (!flag) {
    meta.autoEscalate = false;
    meta.escalateAt = null;
    return meta;
  }
  if (!at) {
    throw new BadRequestException(
      'Set an escalation date and time to enable auto-escalation',
    );
  }
  if (opts.requireFuture && at.getTime() <= Date.now()) {
    throw new BadRequestException('Escalation date/time must be in the future');
  }
  meta.autoEscalate = true;
  meta.escalateAt = at.toISOString();
  return meta;
}

/** True when the patch changes the escalation deadline relative to what is stored. */
export function escalationDeadlineChanged(
  prev: Record<string, any>,
  next: Record<string, any>,
): boolean {
  const prevOn = prev.autoEscalate === true;
  const nextOn = next.autoEscalate === true;
  if (prevOn !== nextOn) return true;
  const a = parseEscalationDate(prev.escalateAt)?.getTime() ?? null;
  const b = parseEscalationDate(next.escalateAt)?.getTime() ?? null;
  return a !== b;
}
