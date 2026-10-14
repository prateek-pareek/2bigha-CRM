"use client";

import { RefreshCw } from "lucide-react";
import { SCOPE_LABEL, type PerformanceReport } from "../lib/performance-report";

/** Who the report covers (role scope), the period, freshness and a manual refresh. */
export function ReportScopeBar({
  report,
  loading,
  onRefresh,
  error,
}: {
  report: PerformanceReport | null;
  loading: boolean;
  onRefresh: () => void;
  error?: string | null;
}) {
  const un = report?.unattributed;
  const unParts = un
    ? [
        un.leadsCreated ? `${un.leadsCreated} leads` : "",
        un.calls ? `${un.calls} calls` : "",
        un.whatsappSent ? `${un.whatsappSent} WhatsApp messages` : "",
      ].filter(Boolean)
    : [];
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        {report ? (
          <>
            <span className="rounded-full bg-[var(--primary-light)] px-2.5 py-1 font-semibold text-[var(--primary)]">
              {SCOPE_LABEL[report.scope.tier]}
            </span>
            <span>
              {report.range.from === report.range.to ? report.range.from : `${report.range.from} → ${report.range.to}`}
            </span>
            <span>· Updated {new Date(report.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-2.5 py-1 font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      {error ? (
        <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs text-[#b91c1c]">{error}</div>
      ) : null}
      {unParts.length ? (
        <p className="text-xs text-[var(--text-muted)]">
          Includes {unParts.join(", ")} not linked to a CRM user (e.g. imports, webhooks, unmapped IVR numbers) — counted in
          totals, not in any agent row.
        </p>
      ) : null}
    </div>
  );
}
