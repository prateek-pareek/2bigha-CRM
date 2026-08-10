/**
 * Shared mapping from WorkspaceShell date/owner filters → CRM dashboard APIs.
 * Must stay aligned with api-hrms `resolveReportingCalendarWindow` / `parseDateRange`.
 */

const WORKSPACE_WINDOW_KEYS = new Set([
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_30_days",
]);

/**
 * Map shell `windowFilter` to `/crm/dashboard` & reports `days` query.
 * Presets are passed through as calendar keys (not rolling "1"/"7").
 * Custom ranges stay as `YYYY-MM-DD,YYYY-MM-DD`.
 */
export function windowToDashboardPeriod(windowFilter: string): string {
  const raw = String(windowFilter || "").trim();
  if (!raw) return "last_30_days";
  if (raw.includes(",")) return raw;
  const key = raw.toLowerCase();
  if (WORKSPACE_WINDOW_KEYS.has(key)) return key;
  return "last_30_days";
}

/**
 * Owner query for analytics APIs. Prefer ObjectId so filters work before
 * the owners list/label has finished loading (avoids silently falling back to All).
 */
export function resolveDashboardOwnerParam(
  ownerId: string,
  ownerLabel?: string | null,
): string {
  if (!ownerId || ownerId === "All") return "All";
  if (/^[a-f\d]{24}$/i.test(ownerId)) return ownerId;
  const label = (ownerLabel || "").trim();
  if (label && label !== "All") return label;
  return ownerId;
}
