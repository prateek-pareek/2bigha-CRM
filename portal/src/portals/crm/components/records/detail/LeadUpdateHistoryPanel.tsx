"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { cn } from "@/lib/utils";

type AuditLogEntry = {
  _id: string;
  user?: { firstName?: string; lastName?: string; email?: string } | string | null;
  action: string;
  module: string;
  entityId?: string;
  changes?: Record<string, { old?: unknown; new?: unknown }> | null;
  description?: string;
  createdAt: string;
};

type Props = {
  /** Mongo _id of the record whose change history should be shown (lead, crm-user, etc). */
  entityId?: string | null;
  /** Optional — renders inline without the outer card chrome (e.g. inside an existing tab body). */
  bare?: boolean;
  emptyLabel?: string;
};

function actionBadgeClasses(action: string) {
  switch (action?.toLowerCase()) {
    case "create":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "delete":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-amber-50 text-amber-900 border-amber-200";
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function actorLabel(user: AuditLogEntry["user"]): string {
  if (!user) return "Unknown user";
  if (typeof user === "string") return user;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Unknown user";
}

/**
 * Generic per-entity "Update History" timeline. Reads the existing audit-log
 * endpoint (GET /crm/audit-logs/entity/:id) — no dedicated backend for this,
 * it's the same interceptor-captured log the global Settings > Audit Logs page
 * uses, just scoped to one record. Reused by the Lead detail page and by the
 * Team Members profile-history tab.
 */
export default function LeadUpdateHistoryPanel({ entityId, bare, emptyLabel }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(() => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  useEffect(() => {
    if (!entityId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/audit-logs/entity/${entityId}`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError(res.status === 403 ? "You don't have access to this history." : "Could not load history.");
          return;
        }
        const data = await res.json();
        if (!cancelled) setEntries(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("Network error while loading history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId, authHeaders]);

  const body = loading ? (
    <div className="flex justify-center py-6 text-text-muted">
      <Loader2 size={16} className="animate-spin" />
    </div>
  ) : error ? (
    <p className="py-4 text-sm text-text-muted">{error}</p>
  ) : entries.length === 0 ? (
    <p className="py-4 text-sm text-text-muted">{emptyLabel ?? "No changes have been recorded yet."}</p>
  ) : (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const changeRows = entry.changes ? Object.entries(entry.changes) : [];
        return (
          <li key={entry._id} className="rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <span>{actorLabel(entry.user)}</span>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    actionBadgeClasses(entry.action),
                  )}
                >
                  {entry.action}
                </span>
              </div>
              <span className="text-xs text-text-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
            {entry.description ? (
              <p className="mt-1.5 text-sm text-text-muted">{entry.description}</p>
            ) : null}
            {changeRows.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {changeRows.map(([field, diff]) => (
                  <li key={field} className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-semibold text-text-primary">{field}:</span>
                    <span className="text-text-muted line-through">{formatValue(diff?.old)}</span>
                    <span className="text-text-muted">→</span>
                    <span className="font-medium text-text-primary">{formatValue(diff?.new)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  if (bare) return body;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
        <History size={13} aria-hidden />
        Update History
      </h3>
      {body}
    </div>
  );
}
