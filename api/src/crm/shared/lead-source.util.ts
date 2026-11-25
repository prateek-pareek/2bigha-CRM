/**
 * Standard lead sources — one vocabulary for the lead form, Excel import, every
 * integration and reports. `Lead.source` holds one of these; the specific form /
 * campaign / page name goes in `Lead.sourceDetail` (e.g. source "Meta Ads",
 * sourceDetail "Jaipur plots — Oct"), so "group by source" stays meaningful.
 *
 * Keep in sync with portal `src/portals/crm/lib/leads/lead-sources.ts`.
 */
export const CRM_LEAD_SOURCES = [
  'Website',
  'Google Lead',
  'Meta Ads',
  'Referral',
  'Walk In',
  'Direct Call',
  'WhatsApp',
  'CRM Form',
  '2Bigha Platform',
  'Organic Search',
  'Social Media',
  'Paid Ads',
  'Email Campaign',
  'Offline',
  'Sales Copilot',
  'Other',
] as const;

export type CrmLeadSource = (typeof CRM_LEAD_SOURCES)[number];

const key = (v: string) =>
  v
    .toLowerCase()
    .replace(/[\s_\-–—./]+/g, ' ')
    .trim();

/** Exact (normalised) aliases → standard source. */
const ALIASES: Record<string, CrmLeadSource> = {
  web: 'Website',
  'web site': 'Website',
  'website form': 'Website',
  google: 'Google Lead',
  'google ads': 'Google Lead',
  'google lead form': 'Google Lead',
  'google leads': 'Google Lead',
  meta: 'Meta Ads',
  'meta ad': 'Meta Ads',
  'meta lead ads': 'Meta Ads',
  'meta leads': 'Meta Ads',
  facebook: 'Meta Ads',
  'facebook ads': 'Meta Ads',
  'facebook lead ads': 'Meta Ads',
  fb: 'Meta Ads',
  instagram: 'Meta Ads',
  'instagram ads': 'Meta Ads',
  ig: 'Meta Ads',
  walkin: 'Walk In',
  'walk in': 'Walk In',
  'direct call': 'Direct Call',
  call: 'Direct Call',
  'phone call': 'Direct Call',
  'inbound call': 'Direct Call',
  ivr: 'Direct Call',
  whatsapp: 'WhatsApp',
  'whats app': 'WhatsApp',
  wa: 'WhatsApp',
  form: 'CRM Form',
  'crm form': 'CRM Form',
  '2bigha': '2Bigha Platform',
  '2bigha platform': '2Bigha Platform',
  twobigha: '2Bigha Platform',
  'sales copilot': 'Sales Copilot',
  organic: 'Organic Search',
  seo: 'Organic Search',
  'social media': 'Social Media',
  social: 'Social Media',
  'paid ads': 'Paid Ads',
  ppc: 'Paid Ads',
  'email campaign': 'Email Campaign',
  email: 'Email Campaign',
  offline: 'Offline',
  referral: 'Referral',
  reference: 'Referral',
  other: 'Other',
  others: 'Other',
};

const BY_KEY = new Map<string, CrmLeadSource>(
  CRM_LEAD_SOURCES.map((s) => [key(s), s]),
);

/**
 * Labels integrations used to write as "<Source> — <detail>" before `sourceDetail`
 * existed (`Meta Lead Ads — <form>`, `Form — <form>`): split them back apart.
 */
const PREFIXED: Array<{ re: RegExp; source: CrmLeadSource }> = [
  { re: /^\s*meta\s*lead\s*ads\s*[—–-]\s*(.+)$/i, source: 'Meta Ads' },
  { re: /^\s*form\s*[—–-]\s*(.+)$/i, source: 'CRM Form' },
];

export type NormalizedLeadSource = {
  /** Standard source, or the trimmed original when it isn't a known one (never dropped). */
  source?: string;
  /** Form / campaign name recovered from a legacy "<Source> — <detail>" label. */
  detail?: string;
  /** True when `source` is one of CRM_LEAD_SOURCES. */
  known: boolean;
};

/** Map any incoming source label (form, import, webhook, AI) onto the standard list. */
export function normalizeLeadSource(raw: unknown): NormalizedLeadSource {
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : typeof raw === 'number'
        ? String(raw)
        : '';
  if (!value) return { source: undefined, known: false };
  for (const { re, source } of PREFIXED) {
    const m = value.match(re);
    if (m) return { source, detail: m[1].trim() || undefined, known: true };
  }
  const k = key(value);
  const hit = BY_KEY.get(k) || ALIASES[k];
  if (hit) return { source: hit, known: true };
  return { source: value, known: false };
}

/**
 * Normalise `dto.source` in place (create / update / import payloads); fills
 * `dto.sourceDetail` from a legacy prefixed label when the caller didn't set one.
 * Unknown labels are kept as typed — nothing is ever rejected or lost here.
 */
export function applyLeadSourceNormalization(dto: Record<string, any>): void {
  if (!dto || dto.source === undefined) return;
  if (dto.source === null) return;
  const n = normalizeLeadSource(dto.source);
  dto.source = n.source;
  if (
    n.detail &&
    (dto.sourceDetail == null || String(dto.sourceDetail).trim() === '')
  ) {
    dto.sourceDetail = n.detail;
  }
  if (typeof dto.sourceDetail === 'string') {
    dto.sourceDetail = dto.sourceDetail.trim() || undefined;
  }
}
