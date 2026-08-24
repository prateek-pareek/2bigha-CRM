"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { GitBranch, Search, ExternalLink, HelpCircle } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import CrmVennDiagram from '../../reports/charts/CrmVennDiagram';
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel } from "@/components/crm/ui";

type WorkflowListRow = { _id: string; name: string };

type ExecutionRow = {
  _id: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  trigger: string;
  status: "success" | "skipped" | "failed";
  skipReason?: string;
  errorMessage?: string;
  branchLabel?: string;
  actionResults?: string[];
  createdAt: string;
};

function crmEntityHref(entityType: string, entityId: string): string | null {
  const id = String(entityId);
  switch (entityType) {
    case "Lead":
      return `/crm/leads/${id}`;
    case "Contact":
      return `/crm/contacts/${id}`;
    case "Organization":
      return `/crm/organizations/${id}`;
    default:
      return null;
  }
}

interface CrmWorkflowActivityPanelProps {
  days: string;
}

export default function CrmWorkflowActivityPanel({ days }: CrmWorkflowActivityPanelProps) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowListRow[]>([]);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  const periodDays = Math.min(366, Math.max(1, parseInt(days, 10) || 30));

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(false);
      const token = getCrmAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const execQs = new URLSearchParams({
        limit: "500",
        days: String(periodDays),
      });
      try {
        const [wRes, eRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/workflows`, { headers }),
          fetch(`${CRM_API_URL}/crm/workflows/executions/list?${execQs}`, { headers }),
        ]);
        if (!wRes.ok || !eRes.ok) {
          if (!cancelled) {
            setLoadError(true);
            setWorkflows([]);
            setExecutions([]);
          }
          return;
        }
        const [wJson, eJson] = await Promise.all([wRes.json(), eRes.json()]);
        if (cancelled) return;
        setWorkflows(Array.isArray(wJson) ? wJson : []);
        setExecutions(Array.isArray(eJson) ? eJson : []);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setWorkflows([]);
          setExecutions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [periodDays]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workflows) m.set(String(w._id), w.name);
    return m;
  }, [workflows]);

  const byWorkflow = useMemo(() => {
    const m = new Map<
      string,
      { workflowId: string; name: string; total: number; success: number; skipped: number; failed: number }
    >();
    for (const e of executions) {
      const wid = String(e.workflowId);
      const name = nameById.get(wid) || "Deleted or unknown workflow";
      const cur = m.get(wid) || { workflowId: wid, name, total: 0, success: 0, skipped: 0, failed: 0 };
      cur.total += 1;
      if (e.status === "success") cur.success += 1;
      else if (e.status === "skipped") cur.skipped += 1;
      else cur.failed += 1;
      m.set(wid, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [executions, nameById]);

  const q = search.trim().toLowerCase();
  const filteredSummary = q
    ? byWorkflow.filter((row) => row.name.toLowerCase().includes(q))
    : byWorkflow;

  const recentRuns = executions.slice(0, 18);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-[var(--radius-md)] bg-primary/10 text-primary shrink-0">
            <GitBranch size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-main tracking-tight">Workflow activity</h2>
            <p className="text-xs text-text-muted font-medium mt-1 leading-relaxed max-w-2xl">
              Runs in the selected period (up to 500 most recent matches). Owner filter applies to overview and template
              stats, not to this table — open a record to see its owner.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="search"
              placeholder="Search workflows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-52 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card py-2 pl-9 pr-3 text-xs font-medium text-text-main shadow-sm outline-none focus:border-primary/40"
            />
          </div>
          <Link
            href="/crm/settings/workflows"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-card px-3 py-2 text-xs font-bold text-primary shadow-sm hover:bg-primary/5 transition-colors"
          >
            Manage workflows
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {byWorkflow.length > 0 && !loading && !loadError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="bg-card border border-[var(--border-color)] rounded-[var(--radius-md)] p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-text-muted mb-4">Run Outcomes</h3>
            <CrmVennDiagram
              height={220}
              setA={{ label: "Total Runs", value: byWorkflow.reduce((s, r) => s + r.total, 0), color: "#94a3b8" }}
              setB={{ label: "Success", value: byWorkflow.reduce((s, r) => s + r.success, 0), color: "#10b981" }}
              intersection={{ label: "Completed", value: byWorkflow.reduce((s, r) => s + r.success, 0) }}
            />
          </div>
          
          <CrmChartPanel title="Top Workflows" bodyClassName="pt-0">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byWorkflow.slice(0, 5)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "var(--text-main)" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="success" stackId="a" fill="#10b981" name="Success" maxBarSize={24}>
                    <LabelList dataKey="success" position="inside" fill="#fff" fontSize={10} formatter={(v: any) => v || ""} />
                  </Bar>
                  <Bar dataKey="skipped" stackId="a" fill="#f59e0b" name="Skipped" maxBarSize={24}>
                    <LabelList dataKey="skipped" position="inside" fill="#fff" fontSize={10} formatter={(v: any) => v || ""} />
                  </Bar>
                  <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="failed" position="inside" fill="#fff" fontSize={10} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CrmChartPanel>

          <div className="rounded-[var(--radius-md)] border border-[var(--hs-link)] bg-[var(--hs-link)]/5 p-5 shadow-sm lg:col-span-2">
            <h3 className="text-sm font-bold text-[var(--hs-link)] mb-2 flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Workflow Execution Summary
            </h3>
            <p className="text-xs text-text-main leading-relaxed">
              In the last {periodDays} days, your CRM automations executed <span className="font-bold">{byWorkflow.reduce((s, r) => s + r.total, 0)}</span> times across {byWorkflow.length} distinct workflows. 
              The most active automation was <strong>{byWorkflow[0]?.name}</strong> with {byWorkflow[0]?.total} runs. 
              {byWorkflow.reduce((s, r) => s + r.failed, 0) > 0 ? ` There were ${byWorkflow.reduce((s, r) => s + r.failed, 0)} failed executions; check the recent runs log below for error details to prevent stalled pipelines.` : ` All executions completed without any hard failures, indicating a healthy automation environment.`}
            </p>
          </div>
        </div>
      )}

      <div className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] overflow-hidden shadow-sm">
        <p className="px-6 py-3 text-xs text-text-muted font-medium leading-relaxed border-b border-slate-50 bg-surface-dim/30">
          Period: last {periodDays} days · Full run log and recent executions are on Report → Workflows.
        </p>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-2">
              <div className="h-4 bg-surface-dim rounded animate-pulse" />
              <div className="h-4 bg-surface-dim rounded animate-pulse w-5/6" />
              <div className="h-4 bg-surface-dim rounded animate-pulse w-4/6" />
            </div>
          ) : loadError ? (
            <p className="p-8 text-sm text-text-muted text-center">Could not load workflow activity. Check permissions (workflows:read).</p>
          ) : !byWorkflow.length ? (
            <p className="p-8 text-sm text-text-muted text-center">
              No workflow runs in this period yet. Triggers will appear here after automations fire.
            </p>
          ) : !filteredSummary.length ? (
            <p className="p-8 text-sm text-text-muted text-center">No workflows match your search.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-surface-dim/50 text-[9px] font-semibold text-text-muted">
                  <th className="px-4 py-3 font-black">Workflow</th>
                  <th className="px-4 py-3 text-right font-black">Runs</th>
                  <th className="px-4 py-3 text-right font-black">Success</th>
                  <th className="px-4 py-3 text-right font-black">Skipped</th>
                  <th className="px-4 py-3 text-right font-black">Failed</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.map((row) => (
                  <tr key={row.workflowId} className="border-b border-slate-50 hover:bg-surface-dim/20">
                    <td className="px-4 py-3 font-bold text-text-main max-w-[240px] truncate">
                      {nameById.has(row.workflowId) ? (
                        <Link
                          href={`/crm/settings/workflows/${row.workflowId}`}
                          className="text-primary hover:underline"
                          title={row.name}
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span title={row.name}>{row.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-main">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-semibold">{row.success}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-800 font-semibold">{row.skipped}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-700 font-semibold">{row.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && !loadError && recentRuns.length > 0 && (
        <div className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] overflow-hidden shadow-sm">
          <div className="px-6 py-3 border-b border-slate-50 bg-surface-dim/30">
            <h3 className="text-xs font-bold text-text-main tracking-tight">Recent runs</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">Newest first, same period and fetch window as above.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-surface-dim/50 text-[9px] font-semibold text-text-muted">
                  <th className="px-4 py-3 font-black">Time</th>
                  <th className="px-4 py-3 font-black">Workflow</th>
                  <th className="px-4 py-3 font-black">Status</th>
                  <th className="px-4 py-3 font-black">Record</th>
                  <th className="px-4 py-3 font-black">Details</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((e) => {
                  const wid = String(e.workflowId);
                  const wfName = nameById.get(wid) || "—";
                  const href = crmEntityHref(e.entityType, e.entityId);
                  return (
                    <tr key={e._id} className="border-b border-slate-50 hover:bg-surface-dim/20">
                      <td className="whitespace-nowrap px-4 py-3 text-text-muted tabular-nums">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 font-semibold text-text-main">
                        {nameById.has(wid) ? (
                          <Link href={`/crm/settings/workflows/${wid}`} className="text-primary hover:underline">
                            {wfName}
                          </Link>
                        ) : (
                          wfName
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ring-1 ${
                            e.status === "success"
                              ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                              : e.status === "skipped"
                                ? "bg-amber-50 text-amber-900 ring-amber-100"
                                : "bg-rose-50 text-rose-800 ring-rose-100"
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-text-muted">
                        <span className="text-text-main/80">{e.entityType}</span>
                        {href ? (
                          <Link href={href} className="ml-1.5 font-mono text-xs text-primary hover:underline">
                            {String(e.entityId)}
                          </Link>
                        ) : (
                          <span className="ml-1.5 font-mono text-xs">{String(e.entityId)}</span>
                        )}
                      </td>
                      <td className="max-w-[360px] px-4 py-3 text-xs leading-relaxed text-text-muted">
                        <div className="space-y-1">
                          {e.branchLabel ? (
                            <p>
                              <span className="font-semibold text-text-main/80">Branch:</span>{" "}
                              {e.branchLabel}
                            </p>
                          ) : null}
                          {e.errorMessage ? (
                            <p className="text-rose-700">
                              <span className="font-semibold">Error:</span> {e.errorMessage}
                            </p>
                          ) : null}
                          {e.skipReason ? (
                            <p className="text-amber-800">
                              <span className="font-semibold">Skipped:</span> {e.skipReason}
                            </p>
                          ) : null}
                          {Array.isArray(e.actionResults) && e.actionResults.length > 0 ? (
                            <p className="line-clamp-2">
                              <span className="font-semibold text-text-main/80">Steps:</span>{" "}
                              {e.actionResults.slice(-2).join(" | ")}
                            </p>
                          ) : (
                            <p className="text-text-muted/60">—</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
