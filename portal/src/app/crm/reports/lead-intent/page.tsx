"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmPageHeader } from "@/components/crm/ui";

type Analytics = {
  byIntent: Array<{ intent: string; count: number }>;
  byDay: Array<{ date: string; count: number }>;
  byAgent: Array<{ agentId: string; count: number }>;
};

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-dim)]">
        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--text-main)]">
        {count}
      </span>
    </div>
  );
}

/** Lead Intent Analytics — date + agent filters over the LeadIntentEvent history. */
export default function LeadIntentAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agentId, setAgentId] = useState("");

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (agentId) params.set("agentId", agentId);
      const res = await fetch(`${CRM_API_URL}/crm/lead-intent/analytics?${params.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      setData(res.ok ? await res.json() : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, dateFrom, dateTo, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxIntent = Math.max(1, ...(data?.byIntent.map((r) => r.count) ?? [0]));

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Lead Intent Analytics"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Reports" }, { label: "Lead Intent" }]}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
        />
        <span className="text-xs text-[var(--text-muted)]">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
        />
        <input
          type="text"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Agent ID (optional)"
          className="h-9 w-48 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : !data ? (
        <p className="text-sm text-[var(--text-muted)]">No data available.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Intent breakdown
            </h3>
            {data.byIntent.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No intents recorded in this range.</p>
            ) : (
              <div className="space-y-2.5">
                {data.byIntent.map((row) => (
                  <Bar key={row.intent} label={row.intent} count={row.count} max={maxIntent} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Recorded by day
            </h3>
            {data.byDay.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No activity in this range.</p>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 text-xs">
                {data.byDay.map((row) => (
                  <div key={row.date} className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">{row.date}</span>
                    <span className="font-semibold text-[var(--text-main)]">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 lg:col-span-2">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">By agent</h3>
            {data.byAgent.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No agent activity in this range.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.byAgent.map((row) => (
                  <div
                    key={row.agentId}
                    className="flex items-center justify-between rounded-md border border-[var(--border-color)] px-3 py-1.5 text-xs"
                  >
                    <span className="truncate text-[var(--text-muted)]">{row.agentId}</span>
                    <span className="font-semibold text-[var(--text-main)]">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
