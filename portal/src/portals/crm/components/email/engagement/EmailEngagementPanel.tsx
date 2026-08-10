"use client";

import { useEffect, useState } from "react";
import { Eye, MousePointerClick, Info } from "lucide-react";
import type { CrmEmailTrackingRow } from "@/lib/crm/crm-email-tracking";
import {
  fetchCrmEmailTrackingConfig,
  formatCrmEmailOpenBadge,
} from "@/lib/crm/crm-email-tracking";

export default function EmailEngagementPanel({ rows }: { rows: CrmEmailTrackingRow[] }) {
  const [trackingLocalOnly, setTrackingLocalOnly] = useState(false);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    let cancelled = false;
    void fetchCrmEmailTrackingConfig(token).then((cfg) => {
      if (!cancelled) setTrackingLocalOnly(Boolean(cfg?.localOnly));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Email Engagement
        </h3>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 max-w-[220px]"
          title="Opens use a tracking pixel; some clients block images. Clicks count when recipients follow links routed through CRM tracking."
        >
          <Info size={12} className="shrink-0 opacity-70" />
          <span className="leading-tight">Pixel opens may be blocked by recipient.</span>
        </span>
      </div>
      {trackingLocalOnly ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          Tracking pixel URL is set to localhost. External recipients cannot load it, so opens
          will stay at <strong>Not opened</strong> until{" "}
          <code className="text-[11px]">TRACKING_BASE_URL</code> points to your public API
          (for example an ngrok tunnel in local dev).
        </p>
      ) : null}
      <ul className="space-y-3">
        {rows.map((row) => {
          const clicks = row.clicks?.length ?? 0;
          const openBadge = formatCrmEmailOpenBadge(row);
          return (
            <li
              key={row._id}
              className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)]/80 bg-[var(--surface-dim)]/40 px-3 py-2.5"
            >
              <p className="text-sm font-semibold text-text-main line-clamp-2">
                {row.subject || "(No subject)"}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-text-muted truncate flex-1 min-w-0" title={row.recipient}>
                  {row.fromEmail ? (
                    <>
                      From <span className="font-semibold text-text-main">{row.fromEmail}</span>
                      <span className="mx-1 text-text-muted/60">·</span>
                    </>
                  ) : null}
                  To {row.recipient}
                </p>
                {row._recordContext ? (
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-text-muted bg-surface-dim px-2 py-0.5 rounded-md border border-border">
                    On {row._recordContext}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[#e0f4f7] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)]">
                  <Eye size={12} className="shrink-0 text-[var(--hs-link)]" aria-hidden />
                  {openBadge.label}
                  {openBadge.lastAt ? (
                    <span className="font-medium text-[var(--text-muted)]">
                      · last {openBadge.lastAt}
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)]">
                  <MousePointerClick size={12} className="shrink-0 text-[#425b76]" aria-hidden />
                  {clicks === 0
                    ? "No link clicks"
                    : `${clicks} link click${clicks === 1 ? "" : "s"}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
