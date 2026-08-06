/** Inputs for heuristic lead score (0–100). */

export interface LeadScoreInput {
  email?: string;
  phone?: string;
  mobileNo?: string;
  organization?: string;
  jobTitle?: string;
  website?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  industry?: string;
  annualRevenue?: number;
  noOfEmployees?: string;
  /** 0–100 from pipeline stage probability or derived from stage order */
  stageFitPercent?: number;
  /** Activities on the lead in the last N days (any type) */
  activityCount30d?: number;
  /** Sum of open counts across outbound tracking rows for this lead */
  emailOpenSum?: number;
  /** Total link clicks across tracking rows */
  emailClickSum?: number;
}

function trim(s?: string): string {
  return (s || '').trim();
}

/** Parse employee band strings like "1-10", "201-500", or "50" into a representative number. */
export function parseEmployeeBand(raw?: string): number {
  if (!raw || typeof raw !== 'string') return 0;
  const s = raw.trim();
  const range = s.match(/^(\d+)\s*-\s*(\d+)/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return Math.max(a, b);
  }
  const nums = s.match(/\d+/g);
  if (!nums?.length) return 0;
  return Math.max(...nums.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
}

/**
 * Weighted score: profile completeness, company signals, pipeline stage, engagement.
 * Returns integer 0–100 and a small breakdown for display / debugging.
 */
export function computeLeadScore(input: LeadScoreInput): {
  score: number;
  breakdown: Record<string, number>;
} {
  const b: Record<string, number> = {};

  let completeness = 0;
  if (trim(input.email)) completeness += 7;
  if (trim(input.phone) || trim(input.mobileNo)) completeness += 7;
  if (trim(input.organization)) completeness += 7;
  if (trim(input.jobTitle)) completeness += 5;
  if (trim(input.website)) completeness += 4;
  if (trim(input.linkedinUrl)) completeness += 3;
  if (trim(input.twitterHandle)) completeness += 2;
  if (trim(input.industry)) completeness += 2;
  b.completeness = completeness;

  let firmographic = 0;
  const rev = input.annualRevenue;
  if (rev != null && typeof rev === 'number' && !Number.isNaN(rev) && rev > 0) {
    if (rev >= 10_000_000) firmographic += 12;
    else if (rev >= 1_000_000) firmographic += 9;
    else if (rev >= 100_000) firmographic += 6;
    else firmographic += 3;
  }
  const emp = parseEmployeeBand(input.noOfEmployees);
  if (emp >= 500) firmographic += 8;
  else if (emp >= 100) firmographic += 6;
  else if (emp >= 20) firmographic += 4;
  else if (emp >= 1) firmographic += 2;
  firmographic = Math.min(20, firmographic);
  b.firmographic = firmographic;

  const stagePct = Math.min(
    100,
    Math.max(0, Number(input.stageFitPercent) || 0),
  );
  b.stageFit = Math.round((stagePct / 100) * 30);

  const actPts = Math.min(8, (input.activityCount30d ?? 0) * 2);
  const openPts = Math.min(5, input.emailOpenSum ?? 0);
  const clickPts = Math.min(4, input.emailClickSum ?? 0);
  b.engagement = actPts + openPts + clickPts;

  let total = Math.round(
    b.completeness + b.firmographic + b.stageFit + b.engagement,
  );
  total = Math.min(100, Math.max(0, total));
  return { score: total, breakdown: b };
}
