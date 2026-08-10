import { randomInt } from 'crypto';
import { Model } from 'mongoose';

/** 24-char hex string used as MongoDB ObjectId in routes. */
const MONGO_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export function isMongoObjectIdString(id: string): boolean {
  return MONGO_OBJECT_ID_RE.test(id);
}

/**
 * HubSpot-style numeric-ish public id (timestamp + random); unique per collection via sparse index.
 */
export function generateCrmRecordId(): string {
  const t = Date.now();
  const r = randomInt(1_000_000, 9_999_999_999);
  return `${t}${r}`;
}

export type AssignRecordIdResult =
  | { ok: true; recordId: string }
  | { ok: false; error: 'RECORD_ID_TAKEN' };

export async function assignUniqueRecordId(
  model: Model<unknown>,
  requested?: string | null,
): Promise<AssignRecordIdResult> {
  const trimmed =
    requested != null && String(requested).trim() !== ''
      ? String(requested).trim()
      : null;
  if (trimmed) {
    const taken = await model.exists({ recordId: trimmed });
    if (taken) return { ok: false, error: 'RECORD_ID_TAKEN' };
    return { ok: true, recordId: trimmed };
  }
  for (let i = 0; i < 24; i++) {
    const candidate = generateCrmRecordId();
    const clash = await model.exists({ recordId: candidate });
    if (!clash) return { ok: true, recordId: candidate };
  }
  throw new Error('Could not allocate unique CRM record ID');
}
