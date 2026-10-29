import { normalizeEmail, normalizePhoneDigits } from './crm-person-identifiers.util';

/**
 * Client duplicate detection (Add Client warning, list highlighting, CSV export).
 *
 * Clients are matched on any of:
 * - normalized name — case/spacing-insensitive, with role suffixes such as
 *   "(owner)", "[agent]" or "- Owner" stripped, so "Vipin Choudhary (owner)"
 *   and "vipin  choudhary" are the same person;
 * - email — primary + additional emails, case-insensitive;
 * - phone — `phone` and `whatsappNumber`, compared on national digits so
 *   "+91 98765 43210", "919876543210" and "9876543210" match.
 */

export type ClientDuplicateReason = 'name' | 'email' | 'phone';

export type ClientDuplicateCandidate = {
  _id?: unknown;
  name?: string | null;
  email?: string | null;
  additionalEmails?: string[] | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  twobighaUserId?: string | null;
  createdAt?: Date | string | null;
};

export type ClientDuplicateGroup = {
  group: number;
  /** Union of why members match each other. */
  reasons: ClientDuplicateReason[];
  /** True when members only share a name (no common email / phone) — riskier to auto-merge. */
  nameOnly: boolean;
  /** Suggested record to keep: richest data first, then oldest. */
  masterId: string;
  members: Array<{
    _id: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string | null;
    hasTwobighaUser: boolean;
  }>;
};

export type ClientDuplicateMatch = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  reasons: ClientDuplicateReason[];
};

export type ClientDuplicateInfo = {
  /** 1-based group number shared by every record in the same duplicate cluster. */
  group: number;
  /** Records in the cluster, including this one. */
  groupSize: number;
  reasons: ClientDuplicateReason[];
  matches: ClientDuplicateMatch[];
};

const ROLE_SUFFIX_RE = /[\s\-–—|,:/]+(owner|agent|user|broker|seller|buyer)\s*$/i;

export function clientNameKey(name: string | null | undefined): string {
  let s = String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  s = s.replace(ROLE_SUFFIX_RE, '');
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clientEmailKeys(c: ClientDuplicateCandidate): string[] {
  const keys = new Set<string>();
  for (const raw of [c.email, ...(c.additionalEmails || [])]) {
    const k = normalizeEmail(raw);
    if (k && k.includes('@')) keys.add(k);
  }
  return [...keys];
}

function clientPhoneKeys(c: ClientDuplicateCandidate): string[] {
  const keys = new Set<string>();
  for (const raw of [c.phone, c.whatsappNumber]) {
    const d = normalizePhoneDigits(raw);
    if (d.length >= 7) keys.add(d);
  }
  return [...keys];
}

function candidateKeys(c: ClientDuplicateCandidate): Array<[ClientDuplicateReason, string]> {
  const out: Array<[ClientDuplicateReason, string]> = [];
  const nk = clientNameKey(c.name);
  if (nk && nk !== 'unknown') out.push(['name', nk]);
  for (const k of clientEmailKeys(c)) out.push(['email', k]);
  for (const k of clientPhoneKeys(c)) out.push(['phone', k]);
  return out;
}

const REASON_ORDER: ClientDuplicateReason[] = ['email', 'phone', 'name'];

function sortReasons(set: Set<ClientDuplicateReason>): ClientDuplicateReason[] {
  return REASON_ORDER.filter((r) => set.has(r));
}

export class ClientDuplicateIndex {
  private readonly byKey = new Map<string, string[]>();
  private readonly rows = new Map<string, ClientDuplicateCandidate>();
  private readonly groupOf = new Map<string, number>();
  private readonly groupSizes = new Map<number, number>();

  constructor(rows: ClientDuplicateCandidate[]) {
    for (const r of rows) {
      const id = String(r._id ?? '');
      if (!id) continue;
      this.rows.set(id, r);
      for (const [reason, key] of candidateKeys(r)) {
        const k = `${reason}:${key}`;
        const list = this.byKey.get(k);
        if (list) list.push(id);
        else this.byKey.set(k, [id]);
      }
    }
    this.buildGroups();
  }

  /** Union-find over shared keys so transitive matches land in one group. */
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
    for (const id of this.rows.keys()) parent.set(id, id);
    for (const ids of this.byKey.values()) {
      for (let i = 1; i < ids.length; i++) {
        const a = find(ids[0]);
        const b = find(ids[i]);
        if (a !== b) parent.set(b, a);
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
      this.groupSizes.set(g, list.length);
      for (const id of list) this.groupOf.set(id, g);
    }
  }

  /** Number of records that belong to some duplicate group. */
  get duplicateRecordCount(): number {
    return this.groupOf.size;
  }

  get duplicateGroupCount(): number {
    return this.groupSizes.size;
  }

  /**
   * Existing records matching `candidate` (an indexed record or an unsaved
   * payload). `excludeId` drops the record itself.
   */
  findMatches(
    candidate: ClientDuplicateCandidate,
    excludeId?: string,
  ): ClientDuplicateMatch[] {
    const self = excludeId ?? (candidate._id != null ? String(candidate._id) : '');
    const reasonsById = new Map<string, Set<ClientDuplicateReason>>();
    for (const [reason, key] of candidateKeys(candidate)) {
      for (const id of this.byKey.get(`${reason}:${key}`) || []) {
        if (id === self) continue;
        const set = reasonsById.get(id) || new Set<ClientDuplicateReason>();
        set.add(reason);
        reasonsById.set(id, set);
      }
    }
    return [...reasonsById.entries()].map(([id, set]) => {
      const r = this.rows.get(id)!;
      return {
        _id: id,
        name: String(r.name || ''),
        email: String(r.email || ''),
        phone: String(r.phone || ''),
        reasons: sortReasons(set),
      };
    });
  }

  /** Every duplicate cluster with a suggested master (most complete record, then oldest). */
  groups(): ClientDuplicateGroup[] {
    const byGroup = new Map<number, string[]>();
    for (const [id, g] of this.groupOf) {
      const list = byGroup.get(g);
      if (list) list.push(id);
      else byGroup.set(g, [id]);
    }
    const score = (r: ClientDuplicateCandidate) =>
      (r.twobighaUserId ? 8 : 0) +
      (String(r.email || '').trim() ? 4 : 0) +
      (String(r.phone || '').trim() ? 2 : 0) +
      (clientNameKey(r.name) ? 1 : 0);
    const time = (r: ClientDuplicateCandidate) => {
      const t = r.createdAt ? new Date(r.createdAt as any).getTime() : NaN;
      return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
    };
    const out: ClientDuplicateGroup[] = [];
    for (const [group, ids] of [...byGroup.entries()].sort((a, b) => a[0] - b[0])) {
      const rows = ids.map((id) => this.rows.get(id)!);
      rows.sort((a, b) => score(b) - score(a) || time(a) - time(b));
      const reasons = new Set<ClientDuplicateReason>();
      for (const r of rows) {
        for (const m of this.findMatches(r, String(r._id))) {
          for (const reason of m.reasons) reasons.add(reason);
        }
      }
      out.push({
        group,
        reasons: sortReasons(reasons),
        nameOnly: !reasons.has('email') && !reasons.has('phone'),
        masterId: String(rows[0]._id),
        members: rows.map((r) => ({
          _id: String(r._id),
          name: String(r.name || ''),
          email: String(r.email || ''),
          phone: String(r.phone || ''),
          createdAt: r.createdAt ? new Date(r.createdAt as any).toISOString() : null,
          hasTwobighaUser: !!r.twobighaUserId,
        })),
      });
    }
    return out;
  }

  /** Duplicate info for an indexed record, or null when it has no duplicates. */
  infoFor(id: string): ClientDuplicateInfo | null {
    const group = this.groupOf.get(id);
    const row = this.rows.get(id);
    if (!group || !row) return null;
    const matches = this.findMatches(row, id);
    const reasons = new Set<ClientDuplicateReason>();
    for (const m of matches) for (const r of m.reasons) reasons.add(r);
    return {
      group,
      groupSize: this.groupSizes.get(group) || matches.length + 1,
      reasons: sortReasons(reasons),
      matches,
    };
  }
}

/** Fields to project when loading clients into a `ClientDuplicateIndex`. */
export const CLIENT_DUPLICATE_PROJECTION =
  '_id name email additionalEmails phone whatsappNumber twobighaUserId createdAt';

/** Same cap as the admin lead/contact duplicate scan. */
export const CLIENT_DUPLICATE_SCAN_LIMIT = 25_000;

export const CLIENT_DUPLICATE_REASON_LABELS: Record<ClientDuplicateReason, string> = {
  email: 'Same email',
  phone: 'Same phone',
  name: 'Same name',
};
