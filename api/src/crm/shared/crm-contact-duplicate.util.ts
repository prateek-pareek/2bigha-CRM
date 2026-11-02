import { normalizeEmail, normalizePhoneDigits } from './crm-person-identifiers.util';
import { clientNameKey } from './crm-client-duplicate.util';

/**
 * Contact duplicate detection (admin "Manage duplicates", contacts list highlighting).
 *
 * Two contacts are duplicates when:
 * - they share an email (primary or additional, case-insensitive) or a phone
 *   (`phone` / `mobileNo`, compared on national digits) — a strong match; or
 * - they have the same normalized full name AND their contact details do not
 *   contradict each other. Two "Rahul Sharma" records whose emails (or phones)
 *   are both filled in but different are treated as different people; a
 *   "Rahul Sharma" with no contact info next to one with an email is a match.
 *
 * Strong matches are unioned first, name matches are then applied between
 * whole clusters, so a name match can never chain two contradicting contacts
 * into one group.
 */

export type ContactDuplicateReason = 'name' | 'email' | 'phone';

export type ContactDuplicateCandidate = {
  _id?: unknown;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  additionalEmails?: string[] | null;
  phone?: string | null;
  mobileNo?: string | null;
  organization?: string | null;
  jobTitle?: string | null;
  leadOwner?: string | null;
  sourceLead?: unknown;
  createdAt?: Date | string | null;
};

export type ContactDuplicateMember = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  owner: string;
  createdAt: string | null;
};

export type ContactDuplicateGroup = {
  group: number;
  reasons: ContactDuplicateReason[];
  /** True when members only share a name — riskier to merge, never pre-selected in the UI. */
  nameOnly: boolean;
  /** Suggested record to keep: most complete first, then oldest. */
  masterId: string;
  members: ContactDuplicateMember[];
};

export type ContactDuplicateMatch = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  reasons: ContactDuplicateReason[];
};

export type ContactDuplicateInfo = {
  group: number;
  groupSize: number;
  reasons: ContactDuplicateReason[];
};

/** Fields to project when loading contacts into a `ContactDuplicateIndex`. */
export const CONTACT_DUPLICATE_PROJECTION =
  '_id firstName lastName email additionalEmails phone mobileNo organization jobTitle leadOwner sourceLead createdAt';

/** Same cap as the admin lead/contact duplicate scan. */
export const CONTACT_DUPLICATE_SCAN_LIMIT = 25_000;

/** Name buckets larger than this are generic names ("John Smith") — too noisy to auto-group. */
const NAME_BUCKET_MAX = 50;

const REASON_ORDER: ContactDuplicateReason[] = ['email', 'phone', 'name'];

const sortReasons = (set: Set<ContactDuplicateReason>) =>
  REASON_ORDER.filter((r) => set.has(r));

export function contactFullName(c: ContactDuplicateCandidate): string {
  return [c.firstName, c.lastName]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Normalized full name; '' when too weak to match on (single token, "unknown"). */
export function contactNameKey(c: ContactDuplicateCandidate): string {
  const key = clientNameKey(contactFullName(c));
  if (!key || key === 'unknown') return '';
  return key.includes(' ') ? key : '';
}

export function contactEmailKeys(c: ContactDuplicateCandidate): string[] {
  const keys = new Set<string>();
  for (const raw of [c.email, ...(c.additionalEmails || [])]) {
    const k = normalizeEmail(raw);
    if (k && k.includes('@')) keys.add(k);
  }
  return [...keys];
}

export function contactPhoneKeys(c: ContactDuplicateCandidate): string[] {
  const keys = new Set<string>();
  for (const raw of [c.phone, c.mobileNo]) {
    const d = normalizePhoneDigits(raw);
    if (d.length >= 7) keys.add(d);
  }
  return [...keys];
}

const orgKey = (c: ContactDuplicateCandidate) =>
  String(c.organization ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const intersects = (a: Set<string>, b: Set<string>) => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

/** Both sides filled in, nothing in common. */
const contradicts = (a: Set<string>, b: Set<string>) =>
  a.size > 0 && b.size > 0 && !intersects(a, b);

type Cluster = { emails: Set<string>; phones: Set<string>; orgs: Set<string> };

export class ContactDuplicateIndex {
  private readonly rows = new Map<string, ContactDuplicateCandidate>();
  private readonly emailIndex = new Map<string, string[]>();
  private readonly phoneIndex = new Map<string, string[]>();
  private readonly nameIndex = new Map<string, string[]>();
  private readonly groupOf = new Map<string, number>();
  private readonly groupMembers = new Map<number, string[]>();

  constructor(rows: ContactDuplicateCandidate[]) {
    const push = (m: Map<string, string[]>, k: string, id: string) => {
      const list = m.get(k);
      if (list) list.push(id);
      else m.set(k, [id]);
    };
    for (const r of rows) {
      const id = String(r._id ?? '');
      if (!id || this.rows.has(id)) continue;
      this.rows.set(id, r);
      for (const k of contactEmailKeys(r)) push(this.emailIndex, k, id);
      for (const k of contactPhoneKeys(r)) push(this.phoneIndex, k, id);
      const nk = contactNameKey(r);
      if (nk) push(this.nameIndex, nk, id);
    }
    this.buildGroups();
  }

  private buildGroups(): void {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let cur = x;
      while (parent.get(cur) !== root) {
        const next = parent.get(cur)!;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const cluster = new Map<string, Cluster>();
    for (const [id, r] of this.rows) {
      parent.set(id, id);
      const org = orgKey(r);
      cluster.set(id, {
        emails: new Set(contactEmailKeys(r)),
        phones: new Set(contactPhoneKeys(r)),
        orgs: new Set(org ? [org] : []),
      });
    }
    const union = (a: string, b: string): boolean => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      parent.set(rb, ra);
      const ca = cluster.get(ra)!;
      const cb = cluster.get(rb)!;
      for (const e of cb.emails) ca.emails.add(e);
      for (const p of cb.phones) ca.phones.add(p);
      for (const o of cb.orgs) ca.orgs.add(o);
      cluster.delete(rb);
      return true;
    };

    // 1. Strong edges: shared email / phone.
    for (const ids of [...this.emailIndex.values(), ...this.phoneIndex.values()]) {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }

    // 2. Name edges between clusters whose contact details do not contradict.
    for (const ids of this.nameIndex.values()) {
      if (ids.length < 2 || ids.length > NAME_BUCKET_MAX) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const ra = find(ids[i]);
          const rb = find(ids[j]);
          if (ra === rb) continue;
          const ca = cluster.get(ra)!;
          const cb = cluster.get(rb)!;
          if (contradicts(ca.emails, cb.emails)) continue;
          if (contradicts(ca.phones, cb.phones)) continue;
          // No shared contact point to vouch for it: different companies mean different people.
          const vouched = intersects(ca.emails, cb.emails) || intersects(ca.phones, cb.phones);
          if (!vouched && contradicts(ca.orgs, cb.orgs)) continue;
          union(ra, rb);
        }
      }
    }

    const members = new Map<string, string[]>();
    for (const id of this.rows.keys()) {
      const root = find(id);
      const list = members.get(root);
      if (list) list.push(id);
      else members.set(root, [id]);
    }
    let next = 1;
    for (const list of members.values()) {
      if (list.length < 2) continue;
      const g = next++;
      this.groupMembers.set(g, list);
      for (const id of list) this.groupOf.set(id, g);
    }
  }

  get duplicateRecordCount(): number {
    return this.groupOf.size;
  }

  get duplicateGroupCount(): number {
    return this.groupMembers.size;
  }

  private pairReasons(
    a: ContactDuplicateCandidate,
    b: ContactDuplicateCandidate,
  ): Set<ContactDuplicateReason> {
    const out = new Set<ContactDuplicateReason>();
    if (intersects(new Set(contactEmailKeys(a)), new Set(contactEmailKeys(b)))) out.add('email');
    if (intersects(new Set(contactPhoneKeys(a)), new Set(contactPhoneKeys(b)))) out.add('phone');
    const na = contactNameKey(a);
    if (na && na === contactNameKey(b)) out.add('name');
    return out;
  }

  /**
   * Existing contacts that match `candidate` (an indexed record or an unsaved
   * payload) by email / phone, or by name with no contradicting contact info.
   */
  findMatches(candidate: ContactDuplicateCandidate, excludeId?: string): ContactDuplicateMatch[] {
    const self = excludeId ?? (candidate._id != null ? String(candidate._id) : '');
    const emails = new Set(contactEmailKeys(candidate));
    const phones = new Set(contactPhoneKeys(candidate));
    const ids = new Set<string>();
    for (const k of emails) for (const id of this.emailIndex.get(k) || []) ids.add(id);
    for (const k of phones) for (const id of this.phoneIndex.get(k) || []) ids.add(id);
    const nk = contactNameKey(candidate);
    if (nk) {
      for (const id of this.nameIndex.get(nk) || []) {
        const other = this.rows.get(id)!;
        if (contradicts(emails, new Set(contactEmailKeys(other)))) continue;
        if (contradicts(phones, new Set(contactPhoneKeys(other)))) continue;
        ids.add(id);
      }
    }
    ids.delete(self);
    return [...ids].map((id) => {
      const r = this.rows.get(id)!;
      return {
        _id: id,
        name: contactFullName(r),
        email: String(r.email || ''),
        phone: String(r.mobileNo || r.phone || ''),
        reasons: sortReasons(this.pairReasons(candidate, r)),
      };
    });
  }

  /** Every duplicate cluster with a suggested master (most complete record, then oldest). */
  groups(): ContactDuplicateGroup[] {
    const score = (r: ContactDuplicateCandidate) =>
      (contactEmailKeys(r).length ? 8 : 0) +
      (contactPhoneKeys(r).length ? 4 : 0) +
      (String(r.organization || '').trim() ? 2 : 0) +
      (String(r.jobTitle || '').trim() || r.sourceLead ? 1 : 0);
    const time = (r: ContactDuplicateCandidate) => {
      const t = r.createdAt ? new Date(r.createdAt as any).getTime() : NaN;
      return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
    };
    const out: ContactDuplicateGroup[] = [];
    for (const [group, ids] of [...this.groupMembers.entries()].sort((a, b) => a[0] - b[0])) {
      const rows = ids.map((id) => this.rows.get(id)!);
      rows.sort((a, b) => score(b) - score(a) || time(a) - time(b));
      const reasons = new Set<ContactDuplicateReason>();
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          for (const r of this.pairReasons(rows[i], rows[j])) reasons.add(r);
        }
      }
      out.push({
        group,
        reasons: sortReasons(reasons),
        nameOnly: !reasons.has('email') && !reasons.has('phone'),
        masterId: String(rows[0]._id),
        members: rows.map((r) => ({
          _id: String(r._id),
          name: contactFullName(r),
          email: String(r.email || ''),
          phone: String(r.mobileNo || r.phone || ''),
          organization: String(r.organization || ''),
          owner: String(r.leadOwner || ''),
          createdAt: r.createdAt ? new Date(r.createdAt as any).toISOString() : null,
        })),
      });
    }
    return out;
  }

  /** Compact cluster info per duplicated contact id, for list-row highlighting. */
  infoById(): Record<string, ContactDuplicateInfo> {
    const out: Record<string, ContactDuplicateInfo> = {};
    for (const [group, ids] of this.groupMembers) {
      const rows = ids.map((id) => this.rows.get(id)!);
      const reasons = new Set<ContactDuplicateReason>();
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          for (const r of this.pairReasons(rows[i], rows[j])) reasons.add(r);
        }
      }
      const info = { group, groupSize: ids.length, reasons: sortReasons(reasons) };
      for (const id of ids) out[id] = info;
    }
    return out;
  }
}
