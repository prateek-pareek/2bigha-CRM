/**
 * Recharts palette aligned to CRMS / Dreams dashboard tokens.
 * Reference: https://crms.dreamstechnologies.com
 * Figma: CRMS Sales CRM Admin Panel UI Kit
 */

/** Primary series — Dreams corporate blue */
export const CRM_CHART_PRIMARY = "#2563eb";
/** Secondary series — Dreams cyan / accent */
export const CRM_CHART_SECONDARY = "#06b6d4";
/** Tertiary — purple accent */
export const CRM_CHART_TERTIARY = "#8b5cf6";
export const CRM_CHART_SUCCESS = "#10b981";
export const CRM_CHART_WARNING = "#ff9f43";
export const CRM_CHART_DANGER = "#ef4444";
export const CRM_CHART_INFO = "#3b82f6";
export const CRM_CHART_MUTED = "#707070";
export const CRM_CHART_SLATE = "#64748b";

/** Categorical fills (pies, multi-bar) — blue → green → amber → purple → coral → cyan → slate */
export const CRM_CHART_SERIES = [
  "#2563eb", // Blue
  "#10b981", // Green
  "#ff9f43", // Amber
  "#8b5cf6", // Purple
  "#ef4444", // Coral
  "#06b6d4", // Cyan
  "#64748b", // Slate
] as const;

export const CRM_CHART_GRID = "var(--border-color)";
export const CRM_CHART_AXIS = "var(--text-muted)";

/** Shared Recharts tick / grid props — Dreams flat chart look */
export const CRM_CHART_TICK = {
  fontSize: 10,
  fill: "var(--text-muted)",
  fontWeight: 600,
} as const;

export const CRM_CHART_AXIS_LINE = false as const;

export const CRM_CHART_TOOLTIP = {
  contentStyle: {
    borderRadius: 5,
    border: "1px solid var(--border-color)",
    background: "var(--card-bg)",
    boxShadow: "var(--crm-shadow-raised)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--text-main)", fontWeight: 600 },
  itemStyle: { color: "var(--text-muted)" },
} as const;

export const CRM_CHART_LEGEND = {
  wrapperStyle: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    paddingTop: 8,
  },
} as const;
