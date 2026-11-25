/**
 * Standard lead sources — mirror of the API's `src/crm/shared/lead-source.util.ts`
 * (keep the two in sync). `lead.source` holds one of these; the specific form /
 * campaign name lives in `lead.sourceDetail`.
 */
export const CRM_LEAD_SOURCES = [
  "Website",
  "Google Lead",
  "Meta Ads",
  "Referral",
  "Walk In",
  "Direct Call",
  "WhatsApp",
  "CRM Form",
  "2Bigha Platform",
  "Organic Search",
  "Social Media",
  "Paid Ads",
  "Email Campaign",
  "Offline",
  "Sales Copilot",
  "Other",
] as const;

export type CrmLeadSource = (typeof CRM_LEAD_SOURCES)[number];

/** Sources a person picks by hand in the lead form (integration-only ones are excluded). */
export const CRM_MANUAL_LEAD_SOURCES: readonly CrmLeadSource[] = [
  "Website",
  "Google Lead",
  "Meta Ads",
  "Referral",
  "Walk In",
  "Direct Call",
  "WhatsApp",
  "Other",
];

const key = (v: string) =>
  v
    .toLowerCase()
    .replace(/[\s_\-–—./]+/g, " ")
    .trim();

const ALIASES: Record<string, CrmLeadSource> = {
  web: "Website",
  "web site": "Website",
  "website form": "Website",
  google: "Google Lead",
  "google ads": "Google Lead",
  "google lead form": "Google Lead",
  "google leads": "Google Lead",
  meta: "Meta Ads",
  "meta ad": "Meta Ads",
  "meta lead ads": "Meta Ads",
  "meta leads": "Meta Ads",
  facebook: "Meta Ads",
  "facebook ads": "Meta Ads",
  "facebook lead ads": "Meta Ads",
  fb: "Meta Ads",
  instagram: "Meta Ads",
  "instagram ads": "Meta Ads",
  ig: "Meta Ads",
  walkin: "Walk In",
  "walk in": "Walk In",
  "direct call": "Direct Call",
  call: "Direct Call",
  "phone call": "Direct Call",
  "inbound call": "Direct Call",
  ivr: "Direct Call",
  whatsapp: "WhatsApp",
  "whats app": "WhatsApp",
  wa: "WhatsApp",
  form: "CRM Form",
  "crm form": "CRM Form",
  "2bigha": "2Bigha Platform",
  "2bigha platform": "2Bigha Platform",
  twobigha: "2Bigha Platform",
  "sales copilot": "Sales Copilot",
  organic: "Organic Search",
  seo: "Organic Search",
  "social media": "Social Media",
  social: "Social Media",
  "paid ads": "Paid Ads",
  ppc: "Paid Ads",
  "email campaign": "Email Campaign",
  email: "Email Campaign",
  offline: "Offline",
  referral: "Referral",
  reference: "Referral",
  other: "Other",
  others: "Other",
};

const BY_KEY = new Map<string, CrmLeadSource>(CRM_LEAD_SOURCES.map((s) => [key(s), s]));

/** Standard source for a typed / imported label, or null when it isn't a known one. */
export function matchCrmLeadSource(raw: unknown): CrmLeadSource | null {
  const value = raw == null ? "" : String(raw).trim();
  if (!value) return null;
  if (/^\s*meta\s*lead\s*ads\s*[—–-]/i.test(value)) return "Meta Ads";
  if (/^\s*form\s*[—–-]/i.test(value)) return "CRM Form";
  const k = key(value);
  return BY_KEY.get(k) || ALIASES[k] || null;
}

/** Dropdown options that still show a record's current (legacy / integration) value. */
export function leadSourceOptionsWith(current?: string | null): string[] {
  const base: string[] = [...CRM_MANUAL_LEAD_SOURCES];
  const v = String(current || "").trim();
  if (v && !base.includes(v)) base.push(v);
  return base;
}
