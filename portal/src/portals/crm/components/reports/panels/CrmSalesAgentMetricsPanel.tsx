"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { fetchSalesAgentMetrics, type SalesAgentMetrics } from "@/lib/crm/sales-agent";
import { CrmChartPanel } from "@/components/crm/ui";
import { CRM_CHART_PRIMARY } from "@/lib/crm/shared/chart-theme";

interface CrmSalesAgentMetricsPanelProps {
  days: string;
}

function recordHref(recordType: string, recordId: string) {
  const base =
    recordType === "Lead"
      ? "/crm/leads"
      : recordType === "Deal"
        ? "/crm/deals"
        : "/crm/contacts";
  return `${base}/${recordId}`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-main">{value}</p>
      {sub ? <p className="mt-1 text-xs text-text-muted">{sub}</p> : null}
    </div>
  );
}

export default function CrmSalesAgentMetricsPanel({ days }: CrmSalesAgentMetricsPanelProps) {
  const [metrics, setMetrics] = useState<SalesAgentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodDays = Math.min(366, Math.max(1, parseInt(days, 10) || 30));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSalesAgentMetrics(periodDays);
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent metrics");
    } finally {
      setLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card p-8 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sales agent metrics…
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="rounded-[var(--radius-md)] border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700">
        {error || "Metrics unavailable"}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
            <Bot size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-main">Sales agent performance</h2>
            <p className="text-sm text-text-muted">
              Supervised AI runs, approvals, and emails sent — last {periodDays} days.
            </p>
          </div>
        </div>
        <Link
          href="/crm/agents/inbox"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-dim)]"
        >
          Approval inbox
          {metrics.pendingApprovals > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
              {metrics.pendingApprovals}
            </span>
          ) : null}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Runs in period" value={metrics.runsInPeriod ?? metrics.runsLast30Days} />
        <StatCard
          label="Approval rate"
          value={`${Math.round((metrics.approvalRate || 0) * 100)}%`}
          sub={`${metrics.approvedActions} approved · ${metrics.rejectedActions} rejected`}
        />
        <StatCard label="Emails sent" value={metrics.emailsSentInPeriod ?? 0} sub="Approved agent sends" />
        <StatCard label="Pending now" value={metrics.pendingApprovals} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CrmChartPanel title="Runs by trigger (Radar)" bodyClassName="pt-0">
          {(metrics.runsByTrigger || []).length === 0 ? (
            <p className="text-sm text-text-muted">No runs in this period.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={metrics.runsByTrigger}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="trigger" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 'auto']} />
                  <Radar name="Runs" dataKey="count" stroke={CRM_CHART_PRIMARY} fill={CRM_CHART_PRIMARY} fillOpacity={0.4} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CrmChartPanel>

        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-muted">
            Runs by agent role
          </h3>
          {(metrics.runsByRole || []).length === 0 ? (
            <p className="text-sm text-text-muted">No runs in this period.</p>
          ) : (
            <ul className="space-y-2">
              {(metrics.runsByRole || []).map((row) => (
                <li key={row.role} className="flex items-center justify-between text-sm">
                  <span className="uppercase text-text-main">{row.role}</span>
                  <span className="font-semibold tabular-nums text-text-muted">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(metrics.approvalsByAction || []).length > 0 && (
        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-muted">
            Approvals by action type
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-text-muted">
                  <th className="pb-2 font-semibold">Action</th>
                  <th className="pb-2 font-semibold">Approved</th>
                  <th className="pb-2 font-semibold">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {(metrics.approvalsByAction || []).map((row) => (
                  <tr key={row.action} className="border-b border-slate-50">
                    <td className="py-2 capitalize">{row.action.replace(/_/g, " ")}</td>
                    <td className="py-2 tabular-nums text-emerald-600">{row.approved}</td>
                    <td className="py-2 tabular-nums text-rose-600">{row.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(metrics.recentRuns || []).length > 0 && (
        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
              Recent agent runs
            </h3>
            <Link
              href="/crm/agents/activity"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {(metrics.recentRuns || []).map((run) => {
              const href = recordHref(run.recordType, run.recordId);
              return (
                <li key={run.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-main">
                      {run.trigger.replace(/_/g, " ")} · {run.agentRole}
                    </p>
                    {run.summary ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{run.summary}</p>
                    ) : null}
                    <Link
                      href={href}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {run.recordType} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                      run.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : run.status === "pending_approval"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {run.status.replace(/_/g, " ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
