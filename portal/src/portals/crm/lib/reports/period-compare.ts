import { CRM_DATE_RANGE_PRESETS } from "@/lib/crm/shared/date-range-window";

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

export const REPORT_PERIOD_OPTIONS: { value: string; label: string }[] =
  CRM_DATE_RANGE_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }));

export const COMPARE_MODE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: "off", label: "No compare" },
  { value: "previous", label: "Prior period" },
  { value: "previous_year", label: "Same period last year" },
  { value: "custom", label: "Custom range" },
];

const API_PERIOD_KEYS = new Set([
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_7_days",
  "last_30_days",
  "all_time",
]);

/**
 * Pass preset keys and `YYYY-MM-DD,YYYY-MM-DD` through.
 * The reporting API resolves those in the reporting timezone.
 * Numeric day counts (legacy "7" / "30") still pass through.
 */
export function resolveReportPeriodParam(period: string): string {
  const raw = String(period || "last_30_days").trim();
  if (!raw || raw === "custom") return "last_30_days";
  const key = raw.toLowerCase();
  if (API_PERIOD_KEYS.has(key)) return key;
  if (raw.includes(",")) return raw;
  if (/^\d+$/.test(raw)) return raw;
  return "last_30_days";
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
