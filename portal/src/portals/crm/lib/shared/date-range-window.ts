/**
 * One period vocabulary for dashboards and reports.
 * Preset keys are sent to the API as-is. A custom range is `YYYY-MM-DD,YYYY-MM-DD`.
 * Those shapes match `parseDateRange` / `normalizeWindow` on the reporting API.
 */

export const CRM_DATE_RANGE_PRESETS = [
  { value: "all_time", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
] as const;

export type CrmDateRangePreset = (typeof CRM_DATE_RANGE_PRESETS)[number]["value"];

const PRESET_LABELS: Record<string, string> = {
  ...Object.fromEntries(CRM_DATE_RANGE_PRESETS.map((preset) => [preset.value, preset.label])),
  this_quarter: "This quarter",
  this_year: "This year",
  last_month: "Last month",
  "7": "Last 7 days",
  "15": "Last 15 days",
  "30": "Last 30 days",
  "75": "Last 75 days",
  "100": "Last 100 days",
};

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatDay(date: Date, withYear: boolean): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
}

/** Human label for a preset key or a `from,to` window. */
export function formatDateWindowLabel(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "Select period";
  const known = PRESET_LABELS[raw] || PRESET_LABELS[raw.toLowerCase()];
  if (known) return known;
  if (!raw.includes(",")) return raw;

  const [fromRaw, toRaw] = raw.split(",", 2);
  const from = parseYmd(String(fromRaw || "").slice(0, 10));
  const to = parseYmd(String(toRaw || "").slice(0, 10));
  if (!from || !to) return raw.replace(",", " – ");
  const sameYear = from.getFullYear() === to.getFullYear();
  if (from.getTime() === to.getTime()) return formatDay(from, true);
  return `${formatDay(from, !sameYear)} – ${formatDay(to, true)}`;
}

export function windowFromPresetLabel(label: string): string {
  const match = CRM_DATE_RANGE_PRESETS.find(
    (preset) => preset.label.toLowerCase() === label.trim().toLowerCase(),
  );
  return match?.value ?? "all_time";
}

/**
 * Concrete local dates for callers that filter by `from`/`to` (form submissions).
 * Preset keys stay as keys for dashboard and report APIs.
 * `all_time` has no bounds.
 */
export function concreteRangeForWindow(window: string): { from: string; to: string } | null {
  const raw = String(window || "").trim();
  const key = raw.toLowerCase();
  if (!raw || key === "all_time") return null;

  if (raw.includes(",")) {
    const [fromRaw, toRaw] = raw.split(",", 2);
    const from = String(fromRaw || "").trim().slice(0, 10);
    const to = String(toRaw || "").trim().slice(0, 10);
    if (!parseYmd(from) || !parseYmd(to)) return null;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  const today = new Date();
  const end = ymd(today);
  if (key === "today") return { from: end, to: end };
  if (key === "yesterday") {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    const day = ymd(date);
    return { from: day, to: day };
  }
  if (key === "this_week") {
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
    return { from: ymd(monday), to: end };
  }
  if (key === "last_7_days") {
    const start = new Date(today);
    start.setDate(today.getDate() - 7);
    return { from: ymd(start), to: end };
  }
  if (key === "this_month") {
    return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
  }
  if (key === "last_30_days" || key === "30") {
    const start = new Date(today);
    start.setDate(today.getDate() - 30);
    return { from: ymd(start), to: end };
  }
  if (key === "7") {
    const start = new Date(today);
    start.setDate(today.getDate() - 7);
    return { from: ymd(start), to: end };
  }
  return null;
}
