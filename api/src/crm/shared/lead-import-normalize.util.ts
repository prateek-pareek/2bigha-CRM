/**
 * Pure helpers that coerce bulk-import (CSV/XLSX) cell values into the exact values the
 * Lead schema accepts. Spreadsheet cells arrive as free text ("not answered", "PM", "",
 * "Seller"), while the schema enums only accept canonical values — anything else makes
 * `leadModel.create` throw "is not a valid enum value", failing the whole row.
 */

export type LeadVertical = 'property_listing' | 'property_management';

export const LEAD_CALL_STATUSES = [
  'Not Called',
  'Completed',
  'Missed',
  'Busy',
  'Failed',
  'Not Answered',
] as const;

export const LEAD_ROLES = ['USER', 'AGENT', 'OWNER'] as const;

/** Blank = absent: undefined/null, or a string that is empty after trimming. */
export function isBlankImportValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  return typeof v === 'string' && v.trim() === '';
}

const squash = (v: unknown) =>
  String(v).trim().toLowerCase().replace(/[\s_\-./]+/g, ' ').trim();

const CALL_STATUS_SYNONYMS: Record<string, (typeof LEAD_CALL_STATUSES)[number]> = {
  'not called': 'Not Called',
  'not yet called': 'Not Called',
  'pending': 'Not Called',
  'new': 'Not Called',
  'yet to call': 'Not Called',
  'completed': 'Completed',
  'complete': 'Completed',
  'connected': 'Completed',
  'answered': 'Completed',
  'called': 'Completed',
  'done': 'Completed',
  'missed': 'Missed',
  'missed call': 'Missed',
  'busy': 'Busy',
  'line busy': 'Busy',
  'failed': 'Failed',
  'fail': 'Failed',
  'unreachable': 'Failed',
  'not reachable': 'Failed',
  'switched off': 'Failed',
  'invalid number': 'Failed',
  'not answered': 'Not Answered',
  'no answer': 'Not Answered',
  'unanswered': 'Not Answered',
  'not picked': 'Not Answered',
  'not picked up': 'Not Answered',
  'no response': 'Not Answered',
  'did not pick': 'Not Answered',
  'dnp': 'Not Answered',
  'rnr': 'Not Answered',
};

/** Returns the canonical call status, or null when the text is not recognisable. */
export function normalizeImportCallStatus(raw: unknown): string | null {
  if (isBlankImportValue(raw)) return null;
  return CALL_STATUS_SYNONYMS[squash(raw)] ?? null;
}

/** Returns the canonical vertical, or null when the text is not recognisable. */
export function normalizeImportLeadVertical(raw: unknown): LeadVertical | null {
  if (isBlankImportValue(raw)) return null;
  const v = squash(raw);
  if (v === 'pl' || v.includes('listing')) return 'property_listing';
  if (v === 'pm' || v.includes('management')) return 'property_management';
  return null;
}

const ROLE_SYNONYMS: Record<string, (typeof LEAD_ROLES)[number]> = {
  'user': 'USER',
  '2 bigha user': 'USER',
  '2bigha user': 'USER',
  'buyer': 'USER',
  'tenant': 'USER',
  'agent': 'AGENT',
  'real estate agent': 'AGENT',
  'broker': 'AGENT',
  'builder': 'AGENT',
  'owner': 'OWNER',
  'property owner': 'OWNER',
  'seller': 'OWNER',
  'landlord': 'OWNER',
};

/** Returns the canonical lead/client role, or null when the text is not recognisable. */
export function normalizeImportRole(raw: unknown): (typeof LEAD_ROLES)[number] | null {
  if (isBlankImportValue(raw)) return null;
  return ROLE_SYNONYMS[squash(raw)] ?? null;
}

/**
 * Normalizes the enum-backed lead columns of one mapped import row in place.
 * - Blank cells are removed so the schema defaults apply ('Not Called', 'USER', …).
 * - A blank Lead Vertical falls back to `defaultLeadVertical` (e.g. the PM Leads page).
 * - Recognisable free text is mapped to the canonical value.
 * - Unrecognisable Call Status / Lead Vertical throw a readable row error instead of
 *   Mongoose's "is not a valid enum value" message.
 * - An unrecognisable Role becomes USER (same fallback the Add Lead form uses) and is
 *   reported via the returned `invalidRole` flag.
 */
export function normalizeLeadImportRow(
  row: Record<string, any>,
  opts: { defaultLeadVertical?: LeadVertical } = {},
): { invalidRole: boolean } {
  for (const key of Object.keys(row)) {
    if (isBlankImportValue(row[key])) delete row[key];
  }

  if (row.callStatus !== undefined) {
    const cs = normalizeImportCallStatus(row.callStatus);
    if (!cs) {
      throw new Error(
        `Call Status "${String(row.callStatus).trim()}" is not recognised. Use one of: ${LEAD_CALL_STATUSES.join(', ')} (or leave it blank).`,
      );
    }
    row.callStatus = cs;
  }

  if (row.leadVertical !== undefined) {
    const lv = normalizeImportLeadVertical(row.leadVertical);
    if (!lv) {
      throw new Error(
        `Lead Vertical "${String(row.leadVertical).trim()}" is not recognised. Use "Property Listing" or "Property Management" (or leave it blank).`,
      );
    }
    row.leadVertical = lv;
  } else if (opts.defaultLeadVertical) {
    row.leadVertical = opts.defaultLeadVertical;
  }

  let invalidRole = false;
  if (row.role !== undefined) {
    const role = normalizeImportRole(row.role);
    invalidRole = !role;
    row.role = role ?? 'USER';
  }

  return { invalidRole };
}

/**
 * Picks the stage for an imported lead: the file's Stage when it names a stage of the
 * target pipeline (case-insensitive), otherwise the pipeline's first stage.
 */
export function resolveImportStageName(
  stages: { name: string; order?: number }[] | undefined,
  requested: unknown,
): string | undefined {
  const sorted = [...(stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!sorted.length) return undefined;
  if (!isBlankImportValue(requested)) {
    const want = String(requested).trim().toLowerCase();
    const hit = sorted.find((s) => String(s.name).trim().toLowerCase() === want);
    if (hit) return hit.name;
  }
  return sorted[0].name;
}
