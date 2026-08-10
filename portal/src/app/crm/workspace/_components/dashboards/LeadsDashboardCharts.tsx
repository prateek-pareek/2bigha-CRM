"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Search } from "lucide-react";
import NextLink from "next/link";
import { cn } from "@/lib/utils";
import {
  CrmListMutedText,
  CrmListOrgCell,
  CrmListPersonCell,
  CrmListStatusBadge,
  CrmTable,
} from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { CRM_BTN_GHOST, CRM_INPUT } from "@/lib/crm/ui";
import {
  dashLeadId,
  dashLeadName,
  EmptyDash,
  type DashRecentLead,
} from "./dashboardShared";
import {
  DealKpiTile,
  InteractiveCategoryBarChart,
  InteractiveChartShell,
  InteractiveDealsTrendChart,
  InteractiveHorizontalStageChart,
  InteractiveStageBarChart,
  PeriodSelect,
} from "./DealsDashboardCharts";

export {
  DealKpiTile as LeadKpiTile,
  InteractiveCategoryBarChart,
  InteractiveChartShell,
  InteractiveDealsTrendChart,
  InteractiveHorizontalStageChart,
  InteractiveStageBarChart,
  PeriodSelect,
};

function CompactTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 py-1.5 shadow-[var(--crm-shadow-raised)]">
      {label ? (
        <p className="mb-1 text-[10px] font-medium text-[var(--text-muted)]">{label}</p>
      ) : null}
      {payload.map((row, i) => (
        <p
          key={`${row.name}-${i}`}
          className="flex items-center gap-2 text-sm font-bold tabular-nums text-[var(--text-main)]"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: row.color || CRM_CHART_SERIES[i] }}
          />
          <span className="text-xs font-medium text-[var(--text-muted)]">
            {row.name}
          </span>
          {Number(row.value ?? 0).toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
}

/** Donut — Leads By Stage / Status (reference pie) */
export function InteractiveLeadsPieChart({
  title,
  subtitle,
  rows,
  emptyMessage = "No lead stage data yet.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ name: string; value: number }>;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const data = useMemo(
    () =>
      [...rows]
        .map((r) => ({
          name: r.name || "Unknown",
          value: Number(r.value) || 0,
        }))
        .filter((r) => r.value > 0 && !hidden[r.name])
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [rows, hidden],
  );
  const total = data.reduce((s, r) => s + r.value, 0);

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[300px]"
      onResetZoom={() => setHidden({})}
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 sm:flex-row">
          <div className="relative h-full min-h-[200px] w-full max-w-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  isAnimationActive
                  animationDuration={700}
                >
                  {data.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CompactTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold tabular-nums text-[var(--text-main)]">
                {total.toLocaleString("en-IN")}
              </p>
              <p className="text-[10px] font-medium text-[var(--text-muted)]">Total</p>
            </div>
          </div>
          <ul className="w-full max-w-xs space-y-2">
            {data.map((row, i) => (
              <li key={row.name}>
                <button
                  type="button"
                  onClick={() =>
                    setHidden((h) => ({ ...h, [row.name]: !h[row.name] }))
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-[var(--surface-dim)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background:
                          CRM_CHART_SERIES[i % CRM_CHART_SERIES.length],
                      }}
                    />
                    <span className="truncate font-medium text-[var(--text-main)]">
                      {row.name}
                    </span>
                  </span>
                  <span className="tabular-nums text-[var(--text-muted)]">
                    {row.value}
                    {total > 0 ? (
                      <span className="ml-1 text-[10px]">
                        ({Math.round((row.value / total) * 100)}%)
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InteractiveChartShell>
  );
}

/** Zoomable area — Leads Created Over Time (reference spline area) */
export function InteractiveLeadsAreaChart({
  title,
  subtitle,
  data,
  emptyMessage = "No leads created in this window.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  data: Array<{ label: string; leads: number }>;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const gradId = useId().replace(/:/g, "");
  const [brushKey, setBrushKey] = useState(0);

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[300px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {data.length === 0 || data.every((d) => !d.leads) ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={brushKey}
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`leadsArea-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <Tooltip content={<CompactTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
            <Area
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke="#7c3aed"
              fill={`url(#leadsArea-${gradId})`}
              strokeWidth={2.5}
              activeDot={{ r: 5, fill: "#7c3aed", stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive
              animationDuration={700}
            />
            <Brush
              dataKey="label"
              height={22}
              stroke="#7c3aed"
              fill="color-mix(in srgb, #7c3aed 8%, white)"
              travellerWidth={8}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/** Funnel bars — Created → Open → Qualified → Converted */
export function InteractiveConversionFunnel({
  title,
  subtitle,
  rows,
  emptyMessage = "No funnel data for this window.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ label: string; val: number }>;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const colors = [CRM_CHART_WARNING, "#3b82f6", "#f59e0b", CRM_CHART_SUCCESS];
  const data = rows.filter((r) => Number(r.val) >= 0);

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[260px]"
    >
      {data.every((r) => !r.val) ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
            <XAxis dataKey="label" tick={CRM_CHART_TICK} tickLine={false} axisLine={false} />
            <YAxis
              allowDecimals={false}
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<CompactTooltip />} />
            <Bar dataKey="val" name="Leads" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Enhanced leads table ───────────────────────────────────────────────── */

type LeadSortKey = "name" | "company" | "phone" | "status" | "owner" | "source";

export type EnhancedLeadRow = DashRecentLead & {
  leadOwner?: string;
  source?: string;
  industry?: string;
  territory?: string;
  createdAt?: string | Date;
  converted?: boolean;
};

export function EnhancedRecentLeadsTable({
  leads,
  emptyMessage = "No recently created leads for this view.",
}: {
  leads: EnhancedLeadRow[];
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<LeadSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) {
      const s = (l.status || l.stage || "New").trim();
      if (s) set.add(s);
    }
    return ["all", ...Array.from(set).sort()];
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = leads.filter((l) => {
      const status = (l.status || l.stage || "New").trim();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        dashLeadName(l),
        l.organization,
        l.company,
        l.phone,
        l.mobile,
        l.email,
        status,
        l.leadOwner,
        l.source,
        l.industry,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av =
        sortKey === "name"
          ? dashLeadName(a)
          : sortKey === "company"
            ? String(a.organization || a.company || "")
            : sortKey === "phone"
              ? String(a.phone || a.mobile || "")
              : sortKey === "status"
                ? String(a.status || a.stage || "")
                : sortKey === "owner"
                  ? String(a.leadOwner || "")
                  : String(a.source || "");
      const bv =
        sortKey === "name"
          ? dashLeadName(b)
          : sortKey === "company"
            ? String(b.organization || b.company || "")
            : sortKey === "phone"
              ? String(b.phone || b.mobile || "")
              : sortKey === "status"
                ? String(b.status || b.stage || "")
                : sortKey === "owner"
                  ? String(b.leadOwner || "")
                  : String(b.source || "");
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [leads, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, leads]);

  const toggleSort = (key: LeadSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Lead Name",
      "Company",
      "Phone",
      "Email",
      "Status",
      "Owner",
      "Source",
      "Industry",
    ];
    const lines = filtered.map((l) =>
      [
        dashLeadName(l),
        l.organization || l.company || "",
        l.phone || l.mobile || "",
        l.email || "",
        l.status || l.stage || "",
        l.leadOwner || "",
        l.source || "",
        l.industry || "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recent-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortTh = ({
    label,
    col,
  }: {
    label: string;
    col: LeadSortKey;
  }) => (
    <th className="sticky top-0 z-[1] bg-[var(--surface-dim)]">
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 font-semibold"
      >
        {label}
        {sortKey === col ? (
          <span className="text-[10px] text-[var(--primary)]">
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
      </button>
    </th>
  );

  if (leads.length === 0) {
    return (
      <div className="p-6">
        <EmptyDash message={emptyMessage} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] px-3 py-2.5">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className={cn(CRM_INPUT, "h-8 pl-8 text-xs")}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 text-xs font-medium"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className={cn(CRM_BTN_GHOST, "h-8 gap-1 px-2 text-xs")}
        >
          <Download size={14} />
          Export
        </button>
      </div>

      <div className="max-h-[420px] overflow-auto">
        <CrmTable className="min-w-[780px]">
          <thead>
            <tr>
              <SortTh label="Lead Name" col="name" />
              <SortTh label="Company Name" col="company" />
              <SortTh label="Phone" col="phone" />
              <SortTh label="Status" col="status" />
              <SortTh label="Owner" col="owner" />
              <SortTh label="Source" col="source" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-[var(--text-muted)]">
                  No leads match your filters.
                </td>
              </tr>
            ) : (
              pageRows.map((l) => {
                const id = dashLeadId(l);
                const name = dashLeadName(l);
                const company = l.organization || l.company || "—";
                const phone = l.phone || l.mobile || "—";
                const status = l.status || l.stage || "New";
                const initials = name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2);

                return (
                  <tr key={id || name}>
                    <td>
                      {id ? (
                        <NextLink
                          href={`/crm/leads/${id}`}
                          className="group block min-w-0"
                        >
                          <CrmListPersonCell
                            name={name}
                            initials={initials}
                            subtitle={l.email || undefined}
                            toneSeed={name}
                          />
                        </NextLink>
                      ) : (
                        <CrmListPersonCell
                          name={name}
                          initials={initials}
                          toneSeed={name}
                        />
                      )}
                    </td>
                    <td>
                      <CrmListOrgCell name={company} />
                    </td>
                    <td>
                      <CrmListMutedText>{phone}</CrmListMutedText>
                    </td>
                    <td>
                      <CrmListStatusBadge label={status} />
                    </td>
                    <td>
                      <CrmListMutedText>
                        {l.leadOwner || "—"}
                      </CrmListMutedText>
                    </td>
                    <td>
                      <CrmListMutedText>{l.source || "—"}</CrmListMutedText>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </CrmTable>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-muted)]">
        <span>
          {filtered.length} lead{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={cn(CRM_BTN_GHOST, "h-8 px-2 text-xs disabled:opacity-40")}
          >
            Prev
          </button>
          <span className="tabular-nums">
            {pageSafe} / {totalPages}
          </span>
          <button
            type="button"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className={cn(CRM_BTN_GHOST, "h-8 px-2 text-xs disabled:opacity-40")}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
