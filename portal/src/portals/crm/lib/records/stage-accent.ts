/** Dreams CRMS board accents (measured from leads.html topbars). */
const STAGE_ACCENTS = [
  "#ffa201", // secondary / contacted
  "#2f80ed", // info / not contacted
  "#1abe17", // success / closed
  "#ef1e1e", // danger / lost
  "#ab47bc", // purple
  "#00bcd4", // cyan
  "#fd7e14", // orange
  "#6366f1", // indigo
] as const;

export function crmStageAccent(stageName: string): string {
  const s = (stageName || "").trim().toLowerCase();
  if (!s) return STAGE_ACCENTS[0];
  if (/lost|reject|dead|fail|churn/.test(s)) return "#ef1e1e";
  if (/won|closed|done|complete|success/.test(s)) return "#1abe17";
  if (/not\s*contacted|new|open|prospect|unassigned|inbox/.test(s)) return "#2f80ed";
  if (/contacted|qualified|active|warm/.test(s)) return "#ffa201";
  if (/negotiat|proposal|demo|meeting|pilot/.test(s)) return "#ab47bc";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return STAGE_ACCENTS[hash % STAGE_ACCENTS.length];
}
