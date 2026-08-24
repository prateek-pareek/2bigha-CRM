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
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Download,
  Search,
  TrendingUp,
  Users,
  Handshake,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CrmListPersonCell,
  CrmSoftBadge,
  CrmTable,
} from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_LEGEND,
  CRM_CHART_PRIMARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
} from "@/lib/crm/shared/chart-theme";
import { CRM_BTN_GHOST, CRM_BTN_ICON, CRM_INPUT, CRM_PANEL } from "@/lib/crm/ui";
import {
  EmptyDash,
  fmtMoney,
  fmtMoneyIfAllowed,
} from "./dashboardShared";
import {
  DashCardHeader,
  PeriodSelect,
  TrendChip,
} from "./SalesOverviewCharts";
import {
  AnimatedMetric,
  InteractiveChartShell,
} from "./DashboardInteractiveShell";

/* ─── Shared helpers ─────────────────────────────────────────────────────── */

const REGION_COLORS = [
  "#3b82f6",
  "#14b8a6",
  "#f97316",
  "#0d9488",
  "#8b5cf6",
  "#eab308",
  "#ec4899",
  "#64748b",
];

const KPI_TONES = {
  green: {
    bg: "color-mix(in srgb, #28c76f 14%, white)",
    fg: "#28c76f",
    glow: "0 0 20px color-mix(in srgb, #28c76f 28%, transparent)",
    delta: "text-[#28c76f]",
  },
  red: {
    bg: "color-mix(in srgb, #e41f07 12%, white)",
    fg: "#e41f07",
    glow: "0 0 20px color-mix(in srgb, #e41f07 24%, transparent)",
    delta: "text-[#e41f07]",
  },
  purple: {
    bg: "color-mix(in srgb, #8b5cf6 14%, white)",
    fg: "#7c3aed",
    glow: "0 0 20px color-mix(in srgb, #8b5cf6 26%, transparent)",
    delta: "text-[#7c3aed]",
  },
  yellow: {
    bg: "color-mix(in srgb, #ff9f43 16%, white)",
    fg: "#e08920",
    glow: "0 0 20px color-mix(in srgb, #ff9f43 28%, transparent)",
    delta: "text-[#e08920]",
  },
} as const;

export type GrowthKpiTone = keyof typeof KPI_TONES;

function compactMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}

function formatTrendLabel(name: string): string {
  if (!name) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(name)) {
    const d = new Date(name);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }
  }
  if (/^\d{4}-\d{2}$/.test(name)) {
    const d = new Date(`${name}-01`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { month: "short" });
    }
  }
  return name;
}

type TipRow = { value?: number | string; name?: string; color?: string };

function asTipRows(payload: unknown): TipRow[] {
  return Array.isArray(payload) ? (payload as TipRow[]) : [];
}

function CompactTip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: unknown;
  label?: string;
  valueFormatter?: (v: number, name?: string) => string;
}) {
  const rows = asTipRows(payload);
  if (!active || !rows.length) return null;
  return (
    <div className="rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 py-1.5 shadow-[var(--crm-shadow-raised)]">
      {label ? (
        <p className="mb-1 text-[10px] font-medium text-[var(--text-muted)]">{label}</p>
      ) : null}
      {rows.map((row, i) => {
        const raw = Number(row.value ?? 0);
        const display = valueFormatter
          ? valueFormatter(raw, row.name)
          : String(row.value ?? "");
        return (
          <p
            key={`${row.name}-${i}`}
            className="flex items-center gap-2 text-sm font-bold tabular-nums text-[var(--text-main)]"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: row.color || CRM_CHART_SERIES[i % CRM_CHART_SERIES.length] }}
            />
            <span className="text-xs font-medium text-[var(--text-muted)]">
              {row.name}
            </span>
            {display}
          </p>
        );
      })}
    </div>
  );
}

/* ─── KPI summary card (reference style) ─────────────────────────────────── */

export function GrowthKpiCard({
  label,
  value,
  format = "number",
  delta,
  tone = "green",
  icon,
  sub = "vs prior period",
}: {
  label: string;
  value: number;
  format?: "number" | "money" | "percent";
  delta?: number | null;
  tone?: GrowthKpiTone;
  icon?: ReactNode;
  sub?: string;
}) {
  const t = KPI_TONES[tone];
  const deltaNum = delta != null && Number.isFinite(delta) ? Number(delta) : null;
  const Icon =
    icon ??
    (tone === "green" ? (
      <DollarSign size={18} />
    ) : tone === "red" ? (
      <Handshake size={18} />
    ) : tone === "purple" ? (
      <Users size={18} />
    ) : (
      <BarChart3 size={18} />
    ));

  return (
    <div className="group relative overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--crm-shadow-raised)]">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] transition-transform duration-200 group-hover:scale-105"
        style={{ background: t.bg, color: t.fg, boxShadow: t.glow }}
      >
        {Icon}
      </div>
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-main)] sm:text-[1.65rem]">
        <AnimatedMetric value={value} format={format} />
      </p>
      {deltaNum != null ? (
        <p className={cn("mt-2 inline-flex items-center gap-1 text-xs font-semibold tabular-nums", t.delta)}>
          <Clock size={12} className="opacity-70" />
          {deltaNum >= 0 ? "+" : ""}
          {deltaNum.toFixed(0)}% {sub}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">{sub}</p>
      )}
    </div>
  );
}

/* ─── Retention card ─────────────────────────────────────────────────────── */

export function RetentionCard({
  retainedPct,
  churnedPct,
  onRefresh,
}: {
  retainedPct: number;
  churnedPct: number;
  onRefresh?: () => void;
}) {
  const retained = Math.max(0, Math.min(100, retainedPct));
  const churned = Math.max(0, Math.min(100, churnedPct));

  return (
    <section className={cn(CRM_PANEL, "flex h-full flex-col overflow-hidden")}>
      <DashCardHeader
        title="Retention"
        actions={
          onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className={CRM_BTN_ICON}
              aria-label="Refresh retention"
              title="Refresh"
            >
              <TrendingUp size={14} />
            </button>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col justify-center gap-5 p-4 sm:p-5">
        <RetentionRow
          label={`${retained.toFixed(0)}% Retained`}
          pct={retained}
          tone="success"
          spark={[40, 55, 48, 62, 70, 68, 82]}
        />
        <RetentionRow
          label={`${churned.toFixed(0)}% Churned`}
          pct={churned}
          tone="danger"
          spark={[70, 62, 55, 48, 40, 32, 18]}
        />
      </div>
    </section>
  );
}

function RetentionRow({
  label,
  pct,
  tone,
  spark,
}: {
  label: string;
  pct: number;
  tone: "success" | "danger";
  spark: number[];
}) {
  const color = tone === "success" ? CRM_CHART_SUCCESS : CRM_CHART_PRIMARY;
  const Arrow = tone === "success" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center gap-3">
      <svg width="56" height="28" viewBox="0 0 56 28" className="shrink-0" aria-hidden>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={spark
            .map((v, i) => {
              const x = (i / Math.max(1, spark.length - 1)) * 54 + 1;
              const y = 26 - (v / 100) * 24;
              return `${x},${y}`;
            })
            .join(" ")}
        />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-[var(--text-main)]">{label}</p>
          <Arrow size={14} style={{ color }} />
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-dim)]">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Revenue progress bars (reference style) ────────────────────────────── */

export function RevenueProgressChart({
  data,
  canViewRevenue,
  title = "Revenue",
  subtitle,
  actions,
}: {
  data: Array<{ name: string; revenue: number }>;
  canViewRevenue: boolean;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const formatted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatTrendLabel(d.name),
      })),
    [data],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {formatted.length === 0 ? (
        <EmptyDash message="No revenue trend in this window." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            key={brushKey}
            data={formatted}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="28%"
          >
            <defs>
              <linearGradient id="growthRevBar" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ff4d4d" />
                <stop offset="100%" stopColor="#ff85a2" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => (canViewRevenue ? compactMoney(Number(v)) : String(v))}
            />
            <Tooltip
              content={(props) => (
                <CompactTip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string}
                  valueFormatter={(v) =>
                    canViewRevenue ? fmtMoney(v) : String(v)
                  }
                />
              )}
            />
            <Bar
              dataKey="revenue"
              name="Revenue"
              fill="url(#growthRevBar)"
              radius={[6, 6, 0, 0]}
              background={{ fill: "#eef1f4" }}
              isAnimationActive
            />
            <Brush
              dataKey="label"
              height={22}
              stroke={CRM_CHART_PRIMARY}
              fill="color-mix(in srgb, var(--primary) 8%, white)"
              travellerWidth={8}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Region-wise growth donut ───────────────────────────────────────────── */

export function RegionGrowthDonut({
  data,
  title = "Region-wise Growth",
  subtitle,
  actions,
}: {
  data: Array<{ name: string; value: number }>;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const pieData = useMemo(
    () =>
      data
        .filter((d) => Number(d.value) > 0)
        .map((d) => ({
          name: d.name || "Unspecified",
          value: Number(d.value) || 0,
        })),
    [data],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
    >
      {pieData.length === 0 ? (
        <EmptyDash message="No regional growth data in this window." />
      ) : (
        <div className="relative h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
                isAnimationActive
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={(props) => (
                  <CompactTip
                    active={props.active}
                    payload={props.payload}
                    valueFormatter={(v, name) => {
                      const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
                      return `${v.toLocaleString("en-IN")} (${pct}%) · ${name || ""}`;
                    }}
                  />
                )}
              />
              <Legend {...CRM_CHART_LEGEND} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-[var(--text-muted)]">Total</p>
            <p className="text-lg font-bold tabular-nums text-[var(--text-main)]">
              {total > 0 ? "100%" : "0%"}
            </p>
          </div>
        </div>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Growth trend spline area ───────────────────────────────────────────── */

export function GrowthTrendAreaChart({
  data,
  canViewRevenue,
  title = "Growth Trend",
  subtitle,
  actions,
  seriesKey = "revenue",
  seriesName = "Revenue",
}: {
  data: Array<{ name: string; revenue?: number; leads?: number; value?: number }>;
  canViewRevenue: boolean;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  seriesKey?: "revenue" | "leads" | "value";
  seriesName?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const [brushKey, setBrushKey] = useState(0);
  const key = !canViewRevenue && seriesKey === "revenue" ? "leads" : seriesKey;

  const formatted = useMemo(
    () =>
      data.map((d) => ({
        label: formatTrendLabel(d.name),
        revenue: Number(d.revenue) || 0,
        leads: Number(d.leads) || 0,
        value: Number(d.value ?? d.revenue ?? d.leads) || 0,
      })),
    [data],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[320px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {formatted.every((r) => {
        const v =
          key === "revenue" ? r.revenue : key === "leads" ? r.leads : r.value;
        return v === 0;
      }) ? (
        <EmptyDash message="No growth trend in this window." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={brushKey}
            data={formatted}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`growthTrend-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} />
            <XAxis
              dataKey="label"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) =>
                key === "revenue" || key === "value"
                  ? compactMoney(Number(v))
                  : String(v)
              }
            />
            <Tooltip
              content={(props) => (
                <CompactTip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string}
                  valueFormatter={(v) =>
                    key === "leads"
                      ? `${v.toLocaleString("en-IN")}`
                      : canViewRevenue
                        ? fmtMoney(v)
                        : `${v}`
                  }
                />
              )}
            />
            <Legend {...CRM_CHART_LEGEND} />
            <Area
              type="monotone"
              dataKey={key}
              name={seriesName}
              stroke={CRM_CHART_PRIMARY}
              fill={`url(#growthTrend-${gradId})`}
              strokeWidth={2.5}
              activeDot={{
                r: 5,
                fill: CRM_CHART_PRIMARY,
                stroke: "#fff",
                strokeWidth: 2,
              }}
              isAnimationActive
            />
            <Brush
              dataKey="label"
              height={22}
              stroke={CRM_CHART_PRIMARY}
              fill="color-mix(in srgb, var(--primary) 8%, white)"
              travellerWidth={8}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Dual-series comparison line ────────────────────────────────────────── */

export function GrowthComparisonLineChart({
  data,
  canViewRevenue,
  title,
  subtitle,
  actions,
}: {
  data: Array<{ name: string; leads: number; revenue: number }>;
  canViewRevenue: boolean;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const formatted = useMemo(
    () => data.map((d) => ({ ...d, label: formatTrendLabel(d.name) })),
    [data],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {formatted.every((r) => r.leads === 0 && r.revenue === 0) ? (
        <EmptyDash message="No comparison series in this window." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            key={brushKey}
            data={formatted}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis tick={CRM_CHART_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              content={(props) => (
                <CompactTip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string}
                  valueFormatter={(v, name) =>
                    name === "Revenue" && canViewRevenue
                      ? fmtMoney(v)
                      : String(v)
                  }
                />
              )}
            />
            <Legend {...CRM_CHART_LEGEND} />
            <Line
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke={CRM_CHART_PRIMARY}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {canViewRevenue ? (
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke={CRM_CHART_SUCCESS}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null}
            <Brush
              dataKey="label"
              height={22}
              stroke={CRM_CHART_PRIMARY}
              fill="color-mix(in srgb, var(--primary) 8%, white)"
              travellerWidth={8}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Category bar (owner / source / activity) ───────────────────────────── */

export function GrowthCategoryBarChart({
  data,
  title,
  subtitle,
  actions,
  valueLabel = "Count",
  color = CRM_CHART_SERIES[0],
}: {
  data: Array<{ name: string; value: number }>;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  valueLabel?: string;
  color?: string;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const rows = useMemo(
    () =>
      [...data]
        .filter((d) => Number(d.value) > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [data],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {rows.length === 0 ? (
        <EmptyDash message="No data for this breakdown." />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            key={brushKey}
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
            <XAxis
              dataKey="name"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={rows.length > 6 ? -25 : 0}
              textAnchor={rows.length > 6 ? "end" : "middle"}
              height={rows.length > 6 ? 56 : 28}
            />
            <YAxis
              allowDecimals={false}
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              content={(props) => (
                <CompactTip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string}
                />
              )}
            />
            <Bar
              dataKey="value"
              name={valueLabel}
              fill={color}
              radius={[4, 4, 0, 0]}
              isAnimationActive
            />
            <Brush
              dataKey="name"
              height={22}
              stroke={color}
              fill="color-mix(in srgb, var(--primary) 8%, white)"
              travellerWidth={8}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Target vs achievement ──────────────────────────────────────────────── */

export function TargetVsAchievementChart({
  forecast,
  achieved,
  canViewRevenue,
  title = "Target vs Achievement",
  subtitle,
}: {
  forecast: Array<{ name: string; value: number }>;
  achieved: number;
  canViewRevenue: boolean;
  title?: string;
  subtitle?: ReactNode;
}) {
  const target = forecast.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
  const rows = [
    { name: "Target", value: target },
    { name: "Achieved", value: achieved },
  ];

  return (
    <InteractiveChartShell title={title} subtitle={subtitle} heightClassName="h-[280px]">
      {!canViewRevenue ? (
        <EmptyDash message="Revenue access required for target tracking." />
      ) : target <= 0 && achieved <= 0 ? (
        <EmptyDash message="No forecast or achieved revenue in this window." />
      ) : (
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Achievement</p>
              <p className="text-2xl font-bold tabular-nums text-[var(--text-main)]">
                {pct.toFixed(1)}%
              </p>
            </div>
            <TrendChip delta={pct - 100} label="vs target" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-dim)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                <XAxis
                  type="number"
                  tick={CRM_CHART_TICK}
                  tickFormatter={(v) => compactMoney(Number(v))}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={CRM_CHART_TICK}
                  width={72}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={(props) => (
                    <CompactTip
                      active={props.active}
                      payload={props.payload}
                      label={props.label as string}
                      valueFormatter={(v) => fmtMoney(v)}
                    />
                  )}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive>
                  {rows.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? "#94a3b8" : CRM_CHART_PRIMARY}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Growth Overview table ──────────────────────────────────────────────── */

export type GrowthOverviewRow = {
  id: string;
  period: string;
  periodSort: number;
  customer: string;
  conversionRate: number;
  revenue: number;
  retentionRate: number;
  growth: number;
  status: "Up" | "Down" | "Flat";
};

type OverviewSortKey =
  | "period"
  | "customer"
  | "conversionRate"
  | "revenue"
  | "retentionRate"
  | "growth"
  | "status";

export function GrowthOverviewTable({
  rows,
  canViewRevenue,
  emptyMessage = "No growth overview rows for this window.",
}: {
  rows: GrowthOverviewRow[];
  canViewRevenue: boolean;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Up" | "Down" | "Flat">("all");
  const [sortKey, setSortKey] = useState<OverviewSortKey>("period");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return `${r.period} ${r.customer} ${r.status}`.toLowerCase().includes(q);
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av =
        sortKey === "period"
          ? a.periodSort
          : sortKey === "customer"
            ? a.customer
            : sortKey === "conversionRate"
              ? a.conversionRate
              : sortKey === "revenue"
                ? a.revenue
                : sortKey === "retentionRate"
                  ? a.retentionRate
                  : sortKey === "growth"
                    ? a.growth
                    : a.status;
      const bv =
        sortKey === "period"
          ? b.periodSort
          : sortKey === "customer"
            ? b.customer
            : sortKey === "conversionRate"
              ? b.conversionRate
              : sortKey === "revenue"
                ? b.revenue
                : sortKey === "retentionRate"
                  ? b.retentionRate
                  : sortKey === "growth"
                    ? b.growth
                    : b.status;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, rows]);

  const toggleSort = (key: OverviewSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "period" || key === "growth" || key === "revenue" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Period",
      "Customers",
      "Conversion Rate",
      "Revenue",
      "Retention Rate",
      "Growth",
      "Status",
    ];
    const lines = filtered.map((r) =>
      [
        r.period,
        r.customer,
        `${r.conversionRate.toFixed(1)}%`,
        canViewRevenue ? String(r.revenue) : "",
        `${r.retentionRate.toFixed(1)}%`,
        `${r.growth.toFixed(1)}%`,
        r.status,
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
    a.download = "growth-overview.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortTh = ({ label, col }: { label: string; col: OverviewSortKey }) => (
    <th>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 font-semibold"
      >
        {label}
        {sortKey === col ? (
          <span className="text-[10px] text-[var(--primary)]">
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        ) : null}
      </button>
    </th>
  );

  const rateTone = (n: number): "success" | "danger" | "info" | "secondary" => {
    if (n >= 70) return "success";
    if (n >= 40) return "info";
    if (n > 0) return "secondary";
    return "danger";
  };

  return (
    <section className={cn(CRM_PANEL, "overflow-hidden")}>
      <DashCardHeader
        title="Growth Overview"
        subtitle="Customer performance derived from live CRM records"
        actions={
          <button
            type="button"
            onClick={exportCsv}
            className={cn(CRM_BTN_ICON, "h-[34px] w-[34px]")}
            aria-label="Export CSV"
            title="Export CSV"
          >
            <Download size={14} />
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search period or customer…"
            className={cn(CRM_INPUT, "h-[34px] pl-8 text-xs")}
          />
        </div>
        <PeriodSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "Up", label: "Up" },
            { value: "Down", label: "Down" },
            { value: "Flat", label: "Flat" },
          ]}
        />
      </div>

      {pageRows.length === 0 ? (
        <div className="p-6">
          <EmptyDash message={emptyMessage} />
        </div>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <CrmTable className="min-w-[920px]">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--border-color)]">
              <tr>
                <SortTh label="Period" col="period" />
                <SortTh label="Customers" col="customer" />
                <SortTh label="Conversion Rate" col="conversionRate" />
                <SortTh label="Revenue" col="revenue" />
                <SortTh label="Retention Rate" col="retentionRate" />
                <SortTh label="Growth" col="growth" />
                <SortTh label="Status" col="status" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-[var(--surface-dim)]">
                  <td className="whitespace-nowrap text-sm font-medium text-[var(--text-main)]">
                    {r.period}
                  </td>
                  <td>
                    <CrmListPersonCell
                      name={r.customer}
                      initials={r.customer
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0] || "")
                        .join("")}
                    />
                  </td>
                  <td>
                    <CrmSoftBadge
                      tone={rateTone(r.conversionRate)}
                      label={`${r.conversionRate.toFixed(1)}%`}
                    />
                  </td>
                  <td className="tabular-nums text-sm font-medium text-[var(--text-main)]">
                    {fmtMoneyIfAllowed(r.revenue, canViewRevenue)}
                  </td>
                  <td>
                    <CrmSoftBadge
                      tone={rateTone(r.retentionRate)}
                      label={`${r.retentionRate.toFixed(1)}%`}
                    />
                  </td>
                  <td className="tabular-nums text-sm font-semibold text-[var(--text-main)]">
                    {r.growth >= 0 ? "+" : ""}
                    {r.growth.toFixed(1)}%
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex rounded-[6px] px-2 py-0.5 text-[11px] font-bold text-white",
                        r.status === "Up"
                          ? "bg-[#28c76f]"
                          : r.status === "Down"
                            ? "bg-[#e41f07]"
                            : "bg-[#64748b]",
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-4 py-3">
        <p className="text-xs text-[var(--text-muted)]">
          {filtered.length} row{filtered.length === 1 ? "" : "s"}
          {filtered.length !== rows.length ? ` (of ${rows.length})` : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={cn(CRM_BTN_GHOST, "h-8 px-2 text-xs disabled:opacity-40")}
          >
            Prev
          </button>
          <span className="text-xs font-medium tabular-nums text-[var(--text-muted)]">
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
    </section>
  );
}
