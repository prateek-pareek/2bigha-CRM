"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, RefreshCw, Tag, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
} from "@/lib/crm/shared/chart-theme";
import { EmptyDash, fmtMoney, fmtMoneyIfAllowed } from "./dashboardShared";

const PIPELINE_BAR_COLORS = [
  "#c4b5fd",
  "#86efac",
  "#fde68a",
  "#fca5a5",
  "#93c5fd",
  "#fdba74",
  "#a5b4fc",
  "#f9a8d4",
];

function ZoomHint({ onReset }: { onReset?: () => void }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <p className="text-[10px] font-medium text-[var(--text-muted)]">
        Drag the brush below to zoom · scroll chart area
      </p>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] font-semibold text-[var(--primary)] hover:underline"
        >
          Reset zoom
        </button>
      ) : null}
    </div>
  );
}

type TipRow = { value?: number | string; name?: string; color?: string };

function asTipRows(payload: unknown): TipRow[] {
  return Array.isArray(payload) ? (payload as TipRow[]) : [];
}

function CompactTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: unknown;
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  const rows = asTipRows(payload);
  if (!active || !rows.length) return null;
  const row = rows[0];
  const raw = Number(row.value ?? 0);
  const display = valueFormatter ? valueFormatter(raw) : String(row.value ?? "");
  return (
    <div className="rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 py-1.5 shadow-[var(--crm-shadow-raised)]">
      <p className="text-[10px] font-medium text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-bold tabular-nums text-[var(--text-main)]">{display}</p>
    </div>
  );
}

export function TrendChip({
  delta,
  label,
  className,
}: {
  delta?: number | null;
  label?: string;
  className?: string;
}) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
        up ? "text-[var(--success)]" : "text-[var(--error)]",
        className,
      )}
    >
      {up ? "+" : ""}
      {delta.toFixed(1)}%{label ? ` ${label}` : ""}
    </span>
  );
}

/** Dreams-style MTD / YTD revenue tiles inside Total Revenue */
export function RevenuePeriodTiles({
  mtd,
  ytd,
  mtdDelta,
  ytdDelta,
  canViewRevenue,
  dateLabel,
}: {
  mtd: number;
  ytd: number;
  mtdDelta?: number;
  ytdDelta?: number;
  canViewRevenue: boolean;
  dateLabel: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="relative overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white pl-1 shadow-[var(--crm-shadow-input)]">
        <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-[var(--crm-radius-ui)] bg-[var(--warning,#ff9f43)]" />
        <div className="relative px-4 py-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--warning,#ff9f43)_15%,white)] text-[var(--warning,#ff9f43)]">
            <ArrowRight size={16} strokeWidth={2.5} />
          </div>
          <p className="text-xs font-medium text-[var(--text-muted)]">Total MTD Revenue</p>
          <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-[var(--text-main)] sm:text-2xl">
            {fmtMoneyIfAllowed(mtd, canViewRevenue)}
          </p>
          <TrendChip delta={mtdDelta} label="Month Till Date" className="mt-2" />
          <div
            className="pointer-events-none absolute bottom-2 right-3 flex h-12 items-end gap-0.5 opacity-30"
            aria-hidden
          >
            {[40, 65, 45, 80, 55, 70].map((h, i) => (
              <span
                key={i}
                className="w-1.5 rounded-t-sm bg-[#c4b5fd]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white pl-1 shadow-[var(--crm-shadow-input)]">
        <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-[var(--crm-radius-ui)] bg-[var(--primary)]" />
        <div className="relative px-4 py-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
            <ArrowRight size={16} strokeWidth={2.5} />
          </div>
          <p className="text-xs font-medium text-[var(--text-muted)]">Total YTD Revenue</p>
          <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-[var(--text-main)] sm:text-2xl">
            {fmtMoneyIfAllowed(ytd, canViewRevenue)}
          </p>
          <TrendChip delta={ytdDelta} label="Year Till Date" className="mt-2" />
          <div
            className="pointer-events-none absolute bottom-2 right-3 flex h-12 items-end gap-0.5 opacity-30"
            aria-hidden
          >
            {[55, 40, 70, 50, 85, 60].map((h, i) => (
              <span
                key={i}
                className="w-1.5 rounded-t-sm bg-[#c4b5fd]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <p className="sr-only">{dateLabel}</p>
      </div>
    </div>
  );
}

/** Semicircle conversion gauge with zoom via brush on underlying series when provided */
export function ConversionGauge({
  rate,
  delta,
  subtitle,
}: {
  rate: number;
  delta?: number | null;
  subtitle?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(rate) ? rate : 0));
  const data = [{ name: "rate", value: clamped, fill: CRM_CHART_PRIMARY }];

  return (
    <div className="flex h-full flex-col">
      {subtitle ? (
        <p className="-mt-1 mb-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
      ) : null}
      <div className="relative mx-auto w-full max-w-[280px] flex-1" style={{ minHeight: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="85%"
            innerRadius="70%"
            outerRadius="110%"
            startAngle={180}
            endAngle={0}
            data={data}
            barSize={14}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: "#eef0f3" }}
              dataKey="value"
              cornerRadius={8}
              className="stroke-none"
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center">
          <p className="text-[10px] font-semibold text-[var(--text-muted)]">
            0 · 20 · 40 · 60 · 80 · 100
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-end gap-2 pt-1">
        <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--text-main)]">
          {clamped.toFixed(1)}%
        </p>
        <TrendChip delta={delta} label="vs prior" className="mb-1" />
      </div>
    </div>
  );
}

/** Deals won vs lost — summary boxes + multi-ring donut (zoom via hover detail) */
export function DealsWonLostPanel({
  won,
  lost,
  wonDelta,
  lostDelta,
  vsLastMonth,
  onRefresh,
}: {
  won: number;
  lost: number;
  wonDelta?: number | null;
  lostDelta?: number | null;
  vsLastMonth?: number | null;
  onRefresh?: () => void;
}) {
  const gradId = useId().replace(/:/g, "");
  const total = won + lost;
  const pieData = [
    { name: "Won", value: Math.max(won, 0), color: CRM_CHART_SECONDARY },
    { name: "Lost", value: Math.max(lost, 0), color: CRM_CHART_PRIMARY },
  ].filter((d) => d.value > 0);

  const outerRing = pieData.length
    ? pieData
    : [{ name: "Empty", value: 1, color: "#e5e7eb" }];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <TrendChip
            delta={vsLastMonth}
            label="vs last month"
            className="text-[11px]"
          />
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-[var(--radius-md)] border border-[var(--border-color)] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
            aria-label="Refresh deals won vs lost"
          >
            <RefreshCw size={14} />
          </button>
        ) : null}
      </div>

      <div className="grid flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(140px,160px)]">
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[#fff8eb] px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[color-mix(in_srgb,var(--warning,#ff9f43)_20%,white)] text-[var(--warning,#ff9f43)]">
                <Tag size={15} />
              </span>
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)]">Deals Won</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--text-main)]">{won}</p>
              </div>
            </div>
            <TrendChip delta={wonDelta} label="vs prior" className="mt-2" />
          </div>
          <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[#fff1f0] px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[var(--error-light)] text-[var(--error)]">
                <XCircle size={15} />
              </span>
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)]">Deals Lost</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--text-main)]">{lost}</p>
              </div>
            </div>
            <TrendChip delta={lostDelta} label="vs prior" className="mt-2" />
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id={`wonLost-${gradId}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={CRM_CHART_SECONDARY} />
                  <stop offset="100%" stopColor={CRM_CHART_PRIMARY} />
                </linearGradient>
              </defs>
              <Pie
                data={outerRing}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={total > 0 ? 3 : 0}
                strokeWidth={0}
              >
                {outerRing.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color || CRM_CHART_SERIES[i]} />
                ))}
              </Pie>
              <Pie
                data={outerRing}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="38%"
                outerRadius="52%"
                paddingAngle={total > 0 ? 2 : 0}
                strokeWidth={0}
              >
                {outerRing.map((entry, i) => (
                  <Cell
                    key={`inner-${entry.name}`}
                    fill={entry.color || CRM_CHART_SERIES[i]}
                    fillOpacity={0.55}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={CRM_CHART_TOOLTIP.contentStyle}
                labelStyle={CRM_CHART_TOOLTIP.labelStyle}
                itemStyle={CRM_CHART_TOOLTIP.itemStyle}
                formatter={(value, name) => {
                  const n = Number(value) || 0;
                  const pct =
                    total > 0 ? ((n / total) * 100).toFixed(0) : "0";
                  return [`${n} (${pct}%)`, String(name)];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-lg font-bold tabular-nums text-[var(--text-main)]">{total}</p>
            <p className="text-[10px] font-medium text-[var(--text-muted)]">Closed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Horizontal striped pipeline stage bars — zoom by focusing stage list */
export function PipelineStageBars({
  rows,
  canViewRevenue,
  totalValue,
  totalDelta,
}: {
  rows: Array<{ stage: string; count: number; value?: number }>;
  canViewRevenue: boolean;
  totalValue: number;
  totalDelta?: number | null;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const data = useMemo(() => {
    const mapped = rows
      .map((r) => ({
        stage: r.stage,
        count: Number(r.count || 0),
        value: Number(r.value || 0),
      }))
      .filter((r) => r.count > 0 || r.value > 0)
      .sort((a, b) => (b.value || b.count) - (a.value || a.count))
      .slice(0, 8);
    return focus ? mapped.filter((r) => r.stage === focus) : mapped;
  }, [rows, focus]);

  const maxVal = Math.max(
    1,
    ...data.map((r) => (canViewRevenue && r.value > 0 ? r.value : r.count)),
  );

  if (data.length === 0 && !focus) {
    return <EmptyDash message="No open pipeline stages for this view." />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-[var(--text-main)] sm:text-3xl">
          {fmtMoneyIfAllowed(totalValue, canViewRevenue)}
        </p>
        <TrendChip delta={totalDelta} label="vs prior" className="mb-1" />
        {focus ? (
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="ml-auto text-[10px] font-semibold text-[var(--primary)] hover:underline"
          >
            Show all stages
          </button>
        ) : (
          <p className="ml-auto text-[10px] font-medium text-[var(--text-muted)]">
            Click a bar to zoom into a stage
          </p>
        )}
      </div>
      <div className="space-y-3">
        {data.map((row, i) => {
          const amount = canViewRevenue && row.value > 0 ? row.value : row.count;
          const pct = Math.max(8, Math.round((amount / maxVal) * 100));
          const color = PIPELINE_BAR_COLORS[i % PIPELINE_BAR_COLORS.length];
          const label = canViewRevenue && row.value > 0
            ? `${row.stage} — ${fmtMoney(row.value)}`
            : `${row.stage} — ${row.count}`;
          return (
            <button
              key={row.stage}
              type="button"
              onClick={() => setFocus((f) => (f === row.stage ? null : row.stage))}
              className="group block w-full text-left"
            >
              <div
                className="relative h-9 overflow-hidden rounded-[6px]"
                style={{
                  backgroundImage: `repeating-linear-gradient(
                    -45deg,
                    color-mix(in srgb, ${color} 18%, white),
                    color-mix(in srgb, ${color} 18%, white) 4px,
                    color-mix(in srgb, ${color} 8%, white) 4px,
                    color-mix(in srgb, ${color} 8%, white) 8px
                  )`,
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 flex items-center rounded-[6px] px-3 transition-all duration-300 group-hover:brightness-95"
                  style={{ width: `${pct}%`, background: color }}
                >
                  <span className="truncate text-xs font-semibold text-[var(--text-main)]">
                    {label}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Zoomable spline area — Sales Growth */
export function SalesGrowthAreaChart({
  data,
  canViewRevenue,
}: {
  data: Array<{ name: string; revenue: number; leads: number }>;
  canViewRevenue: boolean;
}) {
  const gradId = useId().replace(/:/g, "");
  const [brushKey, setBrushKey] = useState(0);
  const key = canViewRevenue ? "revenue" : "leads";

  const formatted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatTrendLabel(d.name),
      })),
    [data],
  );

  if (formatted.length === 0) {
    return <EmptyDash message="No sales trend for this window." />;
  }

  return (
    <div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={brushKey}
            data={formatted}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`salesGrowth-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0} />
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
              tickFormatter={(v) =>
                canViewRevenue ? compactMoney(Number(v)) : String(v)
              }
            />
            <Tooltip
              content={(props) => (
                <CompactTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string}
                  valueFormatter={(v) =>
                    canViewRevenue ? fmtMoney(v) : `${v} deals`
                  }
                />
              )}
            />
            <Area
              type="monotone"
              dataKey={key}
              stroke={CRM_CHART_PRIMARY}
              fill={`url(#salesGrowth-${gradId})`}
              strokeWidth={2.5}
              activeDot={{ r: 5, fill: CRM_CHART_PRIMARY, stroke: "#fff", strokeWidth: 2 }}
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
      </div>
      <ZoomHint onReset={() => setBrushKey((k) => k + 1)} />
    </div>
  );
}

/** Zoomable step-line — Avg Deal Size */
export function AvgDealSizeStepChart({
  data,
  avgValue,
  delta,
  canViewRevenue,
}: {
  data: Array<{ name: string; avg: number }>;
  avgValue: number;
  delta?: number | null;
  canViewRevenue: boolean;
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
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-[var(--text-main)]">
          {fmtMoneyIfAllowed(avgValue, canViewRevenue)}
        </p>
        <TrendChip delta={delta} label="vs prior" className="mb-0.5" />
      </div>
      {formatted.length === 0 ? (
        <EmptyDash message="No deal-size trend for this window." />
      ) : (
        <>
          <div className="h-[240px] w-full">
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
                <YAxis
                  tick={CRM_CHART_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v) => compactMoney(Number(v))}
                />
                <Tooltip
                  content={(props) => (
                    <CompactTooltip
                      active={props.active}
                      payload={props.payload}
                      label={props.label as string}
                      valueFormatter={(v) => fmtMoney(v)}
                    />
                  )}
                />
                <Line
                  type="stepAfter"
                  dataKey="avg"
                  stroke="#5b21b6"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#5b21b6", stroke: "#fff", strokeWidth: 2 }}
                />
                <Brush
                  dataKey="label"
                  height={22}
                  stroke="#5b21b6"
                  fill="color-mix(in srgb, #5b21b6 8%, white)"
                  travellerWidth={8}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ZoomHint onReset={() => setBrushKey((k) => k + 1)} />
        </>
      )}
    </div>
  );
}

export function PeriodSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[34px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2.5 text-xs font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] outline-none focus:border-[var(--primary)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DashCardHeader({
  title,
  subtitle,
  actions,
  accent = true,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {accent ? (
            <span
              className="crm-line-title inline-block h-4 w-[3px] shrink-0 rounded-[1px]"
              style={{ background: "var(--crm-line-title)" }}
              aria-hidden
            />
          ) : null}
          <h2 className="truncate text-base font-semibold leading-none text-[var(--text-main)]">
            {title}
          </h2>
        </div>
        {subtitle ? (
          <div className="mt-1.5 text-xs text-[var(--text-muted)]">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function formatTrendLabel(name: string): string {
  if (!name) return "";
  // YYYY-MM-DD → short day/month
  if (/^\d{4}-\d{2}-\d{2}/.test(name)) {
    const d = new Date(name);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }
  }
  // YYYY-MM → Mon
  if (/^\d{4}-\d{2}$/.test(name)) {
    const d = new Date(`${name}-01`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { month: "short" });
    }
  }
  return name;
}

function compactMoney(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}
