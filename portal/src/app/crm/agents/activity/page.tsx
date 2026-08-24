"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Loader2 } from "lucide-react";
import {
  fetchSalesAgentMetrics,
  fetchSalesAgentRuns,
  type SalesAgentMetrics,
  type SalesAgentRun,
} from "@/lib/crm/sales-agent";

function recordHref(run: SalesAgentRun) {
  const base =
    run.recordType === "Lead"
      ? "/crm/leads"
      : "/crm/contacts";
  return `${base}/${run.recordId}`;
}

export default function SalesAgentActivityPage() {
  const [runs, setRuns] = useState<SalesAgentRun[]>([]);
  const [metrics, setMetrics] = useState<SalesAgentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, m] = await Promise.all([
        fetchSalesAgentRuns({ limit: 50 }),
        fetchSalesAgentMetrics(),
      ]);
      setRuns(r);
      setMetrics(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-violet-500/10 text-violet-600">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales agent activity</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Run history, tool usage, and agent performance metrics.
          </p>
        </div>
      </div>

      {metrics && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total runs", value: metrics.totalRuns },
            { label: "Pending approvals", value: metrics.pendingApprovals },
            { label: "Approval rate", value: `${Math.round(metrics.approvalRate * 100)}%` },
            { label: "Runs (7d)", value: metrics.runsLast7Days },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-main)]">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {runs.map((run) => (
          <article
            key={run._id}
            className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  {run.trigger.replace(/_/g, " ")} · {run.recordType}
                </p>
                <Link href={recordHref(run)} className="text-xs text-primary hover:underline">
                  Open record
                </Link>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                  run.status === "completed"
                    ? "bg-emerald-50 text-emerald-700"
                    : run.status === "pending_approval"
                      ? "bg-amber-50 text-amber-700"
                      : run.status === "failed"
                        ? "bg-red-50 text-red-700"
                        : "bg-slate-100 text-slate-600"
                }`}
              >
                {run.status.replace(/_/g, " ")}
              </span>
            </div>
            {run.summary && (
              <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-3">{run.summary}</p>
            )}
            {run.toolCalls && run.toolCalls.length > 0 && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Tools: {run.toolCalls.map((t) => t.name).join(", ")}
              </p>
            )}
            {run.createdAt && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {new Date(run.createdAt).toLocaleString()}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
