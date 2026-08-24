"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Filter, Users } from "lucide-react";
import type { BoardReportPayload } from "@/components/crm/reports/panels/CrmBoardInsightsPanel";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel, CrmKpiCard, CrmSegmentedControl } from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_LEGEND,
  CRM_CHART_SERIES,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
} from "@/lib/crm/shared/chart-theme";
import { cn } from "@/lib/utils";

export type DailyIntakeRow = {
  date: string;
  platform: string;
  owner: string;
  count: number;
};

type DayWindow = "3" | "7" | "14" | "all";
type ViewMode = "detail" | "by_platform" | "by_employee";

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function lastNDates(dates: string[], n: number): Set<string> {
  const sorted = [...new Set(dates)].sort();
  return new Set(sorted.slice(-n));
}

type Props = {
  days?: string;
  owner?: string;
  /** Optional preloaded board payload (skips fetch when present). */
  board?: BoardReportPayload | null;
  className?: string;
};

export default function CrmDailyIntakeDetailPanel({
  days = "30",
  owner = "All",
  board: boardProp = null,
  className,
}: Props) {
  const [board, setBoard] = useState<BoardReportPayload | null>(boardProp);
  const [loading, setLoading] = useState(!boardProp);
  const [dayWindow, setDayWindow] = useState<DayWindow>("7");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [viewMode, setViewMode] = useState<ViewMode>("detail");

  useEffect(() => {
    if (boardProp) {
      setBoard(boardProp);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = getCrmAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      try {
        const qs = new URLSearchParams({ days, owner });
        const res = await fetch(`${CRM_API_URL}/crm/reports/board?${qs}`, { headers });
        if (!cancelled) {
          setBoard(res.ok ? await res.json() : null);
        }
      } catch {
        if (!cancelled) setBoard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, owner, boardProp]);

  // Prefer shell employee filter when set; local filter further narrows when shell is All.
  useEffect(() => {
    if (owner && owner !== "All") {
      setEmployeeFilter(owner);
    }
  }, [owner]);

  const rawRows: DailyIntakeRow[] = useMemo(() => {
    if (!board) return [];
    return Array.isArray(board.leadsDailyDetail) ? board.leadsDailyDetail : [];
  }, [board]);

  const platforms = useMemo(
    () => uniqueSorted(rawRows.map((r) => r.platform || "Unknown")),
    [rawRows],
  );
  const employees = useMemo(
    () => uniqueSorted(rawRows.map((r) => r.owner || "Unassigned")),
    [rawRows],
  );

  const filteredRows = useMemo(() => {
    let rows = rawRows;
    if (dayWindow !== "all") {
      const keep = lastNDates(
        rows.map((r) => r.date),
        Number(dayWindow),
      );
      rows = rows.filter((r) => keep.has(r.date));
    }
    if (platformFilter !== "All") {
      rows = rows.filter((r) => r.platform === platformFilter);
    }
    if (employeeFilter !== "All") {
      const needle = employeeFilter.toLowerCase();
      rows = rows.filter((r) => (r.owner || "").toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => {
      if (a.date === b.date) {
        if (a.platform === b.platform) return b.count - a.count;
        return a.platform.localeCompare(b.platform);
      }
      return a.date < b.date ? 1 : -1;
    });
  }, [rawRows, dayWindow, platformFilter, employeeFilter]);

  const totalCount = useMemo(
    () => filteredRows.reduce((s, r) => s + (Number(r.count) || 0), 0),
    [filteredRows],
  );

  const uniqueDays = useMemo(
    () => uniqueSorted(filteredRows.map((r) => r.date)).length,
    [filteredRows],
  );

  const chartByDayPlatform = useMemo(() => {
    const dates = uniqueSorted(filteredRows.map((r) => r.date));
    const topPlatforms = (() => {
      const totals = new Map<string, number>();
      for (const r of filteredRows) {
        totals.set(r.platform, (totals.get(r.platform) || 0) + r.count);
      }
      return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([p]) => p);
    })();

    return dates.map((date) => {
      const row: Record<string, string | number> = {
        date,
        label: shortDate(date),
      };
      for (const p of topPlatforms) {
        row[p] = filteredRows
          .filter((r) => r.date === date && r.platform === p)
          .reduce((s, r) => s + r.count, 0);
      }
      return row;
    });
  }, [filteredRows]);

  const chartPlatforms = useMemo(() => {
    if (!chartByDayPlatform.length) return [] as string[];
    return Object.keys(chartByDayPlatform[0]).filter((k) => k !== "date" && k !== "label");
  }, [chartByDayPlatform]);

  const pivotByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      map.set(r.owner, (map.get(r.owner) || 0) + r.count);
    }
    return [...map.entries()]
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const pivotByPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      map.set(r.platform, (map.get(r.platform) || 0) + r.count);
    }
    return [...map.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const entityLabel = "Leads";
  const entitySingular = "lead";

  if (loading) {
    return (
      <div className={cn("grid animate-pulse gap-4 md:grid-cols-2", className)}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[220px] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-surface-dim md:last:col-span-2"
          />
        ))}
      </div>
    );
  }

  if (!board) {
    return (
      <p className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-main)]">
        Could not load daily {entitySingular} intake detail.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 py-2.5 shadow-[var(--crm-shadow-card)]">
        <Filter size={14} className="text-[var(--text-muted)]" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Daily {entityLabel.toLowerCase()} filters
        </span>

        <CrmSegmentedControl
          value={dayWindow}
          onChange={(v) => setDayWindow(v as DayWindow)}
          options={[
            { value: "3", label: "3 days" },
            { value: "7", label: "7 days" },
            { value: "14", label: "14 days" },
            { value: "all", label: "Full period" },
          ]}
        />

        <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          Platform
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 text-sm font-medium text-[var(--text-main)]"
          >
            <option value="All">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          Employee
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="h-8 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 text-sm font-medium text-[var(--text-main)]"
          >
            <option value="All">All employees</option>
            {employees.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>

        <CrmSegmentedControl
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { value: "detail", label: "Detail" },
            { value: "by_platform", label: "By platform" },
            { value: "by_employee", label: "By employee" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CrmKpiCard
          label={`${entityLabel} in view`}
          value={totalCount}
          icon={<Users size={18} />}
          sub={
            dayWindow === "all"
              ? "Selected period"
              : `Last ${dayWindow} calendar days with data`
          }
        />
        <CrmKpiCard
          label="Days covered"
          value={uniqueDays}
          icon={<CalendarDays size={18} />}
          sub="Distinct intake days"
        />
        <CrmKpiCard
          label="Employees active"
          value={pivotByEmployee.length}
          icon={<Users size={18} />}
          sub={platformFilter === "All" ? "Across all platforms" : platformFilter}
        />
      </div>

      <CrmChartPanel
        title={`${entityLabel} added by day × platform`}
        subtitle="Stacked by acquisition platform (LinkedIn, Website, opportunity source, …)"
        icon={<CalendarDays className="h-4 w-4" />}
        bodyClassName="pt-2"
      >
        <div className="h-[280px] w-full">
          {chartByDayPlatform.every((r) =>
            chartPlatforms.every((p) => !Number(r[p])),
          ) ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              No {entitySingular} intake for these filters
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartByDayPlatform} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...CRM_CHART_TOOLTIP} />
                <Legend {...CRM_CHART_LEGEND} />
                {chartPlatforms.map((p, i) => (
                  <Bar
                    key={p}
                    dataKey={p}
                    stackId="intake"
                    fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]}
                    name={p}
                    radius={i === chartPlatforms.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CrmChartPanel>

      {viewMode === "detail" ? (
        <section className="overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-card)]">
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Daily {entityLabel.toLowerCase()} detail
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Each row is day × platform × employee — filter to see who added LinkedIn / other
              platform {entitySingular}s on a given day.
            </p>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-dim)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Platform / source</th>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5 text-right">{entityLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      No rows for the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr
                      key={`${r.date}-${r.platform}-${r.owner}`}
                      className="hover:bg-[var(--surface-dim)]/60"
                    >
                      <td className="px-4 py-2.5 tabular-nums text-[var(--text-main)]">
                        <span className="font-medium">{shortDate(r.date)}</span>
                        <span className="ml-2 text-xs text-[var(--text-muted)]">{r.date}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--text-main)]">
                        {r.platform}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main)]">{r.owner}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--text-main)]">
                        {r.count}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {viewMode === "by_platform" ? (
        <section className="overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-card)]">
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              {entityLabel} by platform
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Totals for the filtered day window (LinkedIn, Website, opportunity platforms, …).
            </p>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--surface-dim)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Platform</th>
                  <th className="px-4 py-2.5 text-right">{entityLabel}</th>
                  <th className="px-4 py-2.5 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {pivotByPlatform.map((r) => {
                  const pct =
                    totalCount > 0 ? Math.round((r.count / totalCount) * 1000) / 10 : 0;
                  return (
                    <tr key={r.platform}>
                      <td className="px-4 py-2.5 font-medium">{r.platform}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {r.count}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-muted)]">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {viewMode === "by_employee" ? (
        <section className="overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-card)]">
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              {entityLabel} by employee
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Who added how many {entitySingular}s in the filtered days
              {platformFilter !== "All" ? ` on ${platformFilter}` : ""}.
            </p>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--surface-dim)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5 text-right">{entityLabel}</th>
                  <th className="px-4 py-2.5 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {pivotByEmployee.map((r) => {
                  const pct =
                    totalCount > 0 ? Math.round((r.count / totalCount) * 1000) / 10 : 0;
                  return (
                    <tr key={r.owner}>
                      <td className="px-4 py-2.5 font-medium">{r.owner}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {r.count}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-muted)]">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
