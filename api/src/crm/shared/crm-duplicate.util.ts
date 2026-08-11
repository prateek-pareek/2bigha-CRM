import {
  displayName,
  linkedInProfileKey,
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizePhoneDigits,
} from './crm-person-identifiers.util';

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = row[j];
      row[j] = cur;
    }
  }
  return row[n];
}

export function nameKey(first?: string, last?: string): string {
  return `${String(first || '').trim().toLowerCase()}|${String(last || '').trim().toLowerCase()}`;
}

/** 0–1 similarity on full display name tokens. */
export function nameSimilarity(
  f1?: string,
  l1?: string,
  f2?: string,
  l2?: string,
): number {
  const a = nameKey(f1, l1).replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  const b = nameKey(f2, l2).replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d = levenshtein(a, b);
  const max = Math.max(a.length, b.length, 1);
  return Math.max(0, 1 - d / max);
}

export function normalizeOrgName(s: string | undefined | null): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isEmptyScalar(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

export type LeanPerson = {
  _id: unknown;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobileNo?: string;
  organization?: string;
  linkedinUrl?: string;
  converted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  leadOwner?: string;
};

export function toDuplicateSummary(r: LeanPerson) {
  return {
    id: String(r._id),
    name: displayName(r.firstName, r.lastName),
    email: r.email || '',
    phone: r.phone || '',
    mobileNo: r.mobileNo || '',
    organization: r.organization || '',
    linkedinUrl: r.linkedinUrl || '',
    converted: !!r.converted,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    leadOwner: r.leadOwner || '',
  };
}

export function emailKey(e: string | undefined | null): string {
  return normalizeEmail(e);
}

/** Primary + additional emails (normalized), for scan/import/migration dedupe. */
export function allEmailKeys(r: {
  email?: string | null;
  additionalEmails?: string[] | null;
}): string[] {
  const keys = new Set<string>();
  const primary = emailKey(r.email);
  if (primary) keys.add(primary);
  for (const raw of r.additionalEmails || []) {
    const k = emailKey(raw);
    if (k) keys.add(k);
  }
  return [...keys];
}

/**
 * When merging people, keep master's primary email and fold every other
 * distinct email (dup primaries + all additional) into additionalEmails.
 */
export function mergePersonEmailFields(
  master: { email?: unknown; additionalEmails?: unknown },
  dups: Array<{ email?: unknown; additionalEmails?: unknown }>,
): { email?: string; additionalEmails: string[] } {
  const masterPrimary = emailKey(master.email as string);
  const extras = new Set<string>();

  const pushExtras = (emails: unknown) => {
    if (!Array.isArray(emails)) return;
    for (const raw of emails) {
      const k = emailKey(String(raw));
      if (k && k !== masterPrimary) extras.add(k);
    }
  };

  pushExtras(master.additionalEmails);
  for (const dup of dups) {
    const dupPrimary = emailKey(dup.email as string);
    if (dupPrimary && dupPrimary !== masterPrimary) extras.add(dupPrimary);
    pushExtras(dup.additionalEmails);
  }

  const out: { email?: string; additionalEmails: string[] } = {
    additionalEmails: [],
  };
  if (masterPrimary) out.email = masterPrimary;
  else {
    for (const dup of dups) {
      const k = emailKey(dup.email as string);
      if (k) {
        out.email = k;
        break;
      }
    }
  }
  if (out.email) extras.delete(out.email);
  out.additionalEmails = [...extras];
  return out;
}

export function phoneKeys(r: {
  phone?: string;
  mobileNo?: string;
}): string[] {
  const keys = new Set<string>();
  const p = normalizePhoneDigits(r.phone);
  const m = normalizePhoneDigits(r.mobileNo);
  if (p.length >= 7) keys.add(p);
  if (m.length >= 7) keys.add(m);
  return [...keys];
}

export function linkedInKey(r: { linkedinUrl?: string }): string {
  return linkedInProfileKey(r.linkedinUrl) || normalizeLinkedInUrl(r.linkedinUrl);
}

/** Admin duplicate scan caps (raise carefully — in-memory grouping). */
export const DUPLICATE_SCAN_LIMIT = 25_000;
export const DUPLICATE_FUZZY_ORG_BUCKET_MAX = 80;
export const DUPLICATE_FUZZY_MIN_SIMILARITY = 0.88;

const LEAD_MERGE_SCALAR = [
  'firstName',
  'middleName',
  'lastName',
  'email',
  'mobileNo',
  'phone',
  'organization',
  'jobTitle',
  'source',
  'industry',
  'annualRevenue',
  'noOfEmployees',
  'leadOwner',
  'website',
  'linkedinUrl',
  'territory',
  'image',
  'recordId',
  'clientId',
  'leadCategory',
  'group',
  'notes',
] as const;

const CONTACT_MERGE_SCALAR = [
  ...LEAD_MERGE_SCALAR,
  'telegram',
  'gender',
  'salutation',
  'address',
] as const;

export function mergePersonScalarFields<
  T extends Record<string, unknown>,
>(master: T, duplicate: T, keys: readonly string[]): Partial<T> {
  const patch: Partial<T> = {};
  for (const k of keys) {
    const mk = master[k];
    const dk = duplicate[k];
    if (!isEmptyScalar(mk)) continue;
    if (!isEmptyScalar(dk)) {
      (patch as Record<string, unknown>)[k] = dk;
    }
  }
  return patch;
}

export function unionStringArrays(a: string[] = [], b: string[] = []): string[] {
  const set = new Set<string>();
  for (const x of a) {
    const t = String(x).trim().toLowerCase();
    if (t) set.add(String(x).trim());
  }
  for (const x of b) {
    const t = String(x).trim().toLowerCase();
    if (t) set.add(String(x).trim());
  }
  return [...set];
}

export function unionObjectIdStrings(
  a: unknown[] = [],
  b: unknown[] = [],
): string[] {
  const set = new Set<string>();
  for (const x of a) {
    if (x != null) set.add(String(x));
  }
  for (const x of b) {
    if (x != null) set.add(String(x));
  }
  return [...set];
}

export function shallowMergeCustomFields(
  master: Record<string, unknown> | undefined,
  dup: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...(dup || {}), ...(master || {}) };
}

export { LEAD_MERGE_SCALAR, CONTACT_MERGE_SCALAR };
