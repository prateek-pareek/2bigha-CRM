/** Shared period + compare helpers for CRM Reports and Workspace dashboards. */

export type CompareMode = "off" | "previous" | "previous_year" | "custom";

export type PeriodMeta = {
  currentFrom?: string;
  currentTo?: string;
  compareFrom?: string;
  compareTo?: string;
  compareMode?: string;
  compareLabel?: string;
  currentLabel?: string;
  days?: number;
};

export const REPORT_PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "yesterday", label: "Yesterday" },
  { value: "7", label: "Last 7 days" },
  { value: "15", label: "Last 15 days" },
  { value: "30", label: "Last 30 days" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "75", label: "Last 75 days" },
  { value: "100", label: "Last 100 days" },
  { value: "custom", label: "Custom range" },
];

export const COMPARE_MODE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: "off", label: "No compare" },
  { value: "previous", label: "Prior period" },
  { value: "previous_year", label: "Same period last year" },
  { value: "custom", label: "Custom range" },
];

function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convert UI period presets to API `days` values (rolling count, yesterday, or YMD range). */
export function resolveReportPeriodParam(period: string): string {
  const raw = String(period || "30").trim();
  if (!raw || raw === "custom") return "30";
  if (raw === "yesterday") return "yesterday";
  if (raw.includes(",")) return raw;

  const now = new Date();
  if (raw === "this_week") {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    return `${toLocalYmd(monday)},${toLocalYmd(now)}`;
  }
  if (raw === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return `${toLocalYmd(start)},${toLocalYmd(now)}`;
  }
  if (raw === "last_7_days") return "7";
  return raw;
}

/** Build API `compare` query value, or undefined when compare is off. */
export function resolveCompareParam(
  mode: CompareMode,
  customFrom?: string,
  customTo?: string,
): string | undefined {
  if (mode === "off") return undefined;
  if (mode === "previous_year") return "previous_year";
  if (mode === "custom") {
    if (customFrom && customTo) return `${customFrom},${customTo}`;
    return undefined;
  }
  return "previous";
}

export function compareSubtitle(
  mode: CompareMode,
  periodMeta?: PeriodMeta | null,
): string {
  if (mode === "off") return "";
  if (periodMeta?.compareLabel) return periodMeta.compareLabel;
  switch (mode) {
    case "previous_year":
      return "vs same period last year";
    case "custom":
      return "vs custom period";
    default:
      return "vs prior period";
  }
}

export function appendCompareQuery(
  qs: URLSearchParams,
  mode: CompareMode,
  customFrom?: string,
  customTo?: string,
): void {
  const compare = resolveCompareParam(mode, customFrom, customTo);
  if (compare) qs.set("compare", compare);
}
