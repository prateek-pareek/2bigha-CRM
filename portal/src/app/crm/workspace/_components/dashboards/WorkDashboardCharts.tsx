"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TERTIARY,
} from "@/lib/crm/shared/chart-theme";
import { EmptyDash } from "./dashboardShared";
import {
  KpiTile,
  InteractiveChartShell,
} from "./DashboardInteractiveShell";
import { useChartKeyboardZoom } from "./useChartKeyboardZoom";

export { KpiTile as WorkKpiTile };

const ANIM = { isAnimationActive: true, animationDuration: 750, animationEasing: "ease-out" as const };

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

function formatTrendLabel(name: string): string {
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

/** Donut — work-queue category mix (Traffic Sources style). */
export function WorkQueueDonut({
  title,
  subtitle,
  rows,
  emptyMessage = "No work-queue items in this view.",
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
        .sort((a, b) => b.value - a.value),
    [rows, hidden],
  );
  const total = data.reduce((s, r) => s + r.value, 0);

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[320px]"
      onResetZoom={() => setHidden({})}
      zoomHint="Click a legend row to hide/show · reset restores all segments"
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 sm:flex-row sm:items-stretch">
          <div className="relative mx-auto h-full min-h-[200px] w-full max-w-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={96}
                  paddingAngle={2}
                  strokeWidth={0}
                  {...ANIM}
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
              <p className="text-[10px] font-medium text-[var(--text-muted)]">
                Queue items
              </p>
            </div>
          </div>
          <ul className="flex w-full max-w-xs flex-col justify-center space-y-2.5">
            {rows
              .filter((r) => (Number(r.value) || 0) > 0)
              .sort((a, b) => Number(b.value) - Number(a.value))
              .map((row, i) => {
                const dimmed = !!hidden[row.name];
                return (
                  <li key={row.name}>
                    <button
                      type="button"
                      onClick={() =>
                        setHidden((h) => ({ ...h, [row.name]: !h[row.name] }))
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-sm transition-opacity hover:bg-[var(--surface-dim)]"
                      style={{ opacity: dimmed ? 0.4 : 1 }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            background:
                              CRM_CHART_SERIES[i % CRM_CHART_SERIES.length],
                          }}
                        />
                        <span className="truncate text-xs font-medium text-[var(--text-main)]">
                          {row.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--text-main)]">
                        {Number(row.value).toLocaleString("en-IN")}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </InteractiveChartShell>
  );
}

/**
 * Dreams-style hybrid bar + area chart (Revenue Analytics look).
 * Primary bars + soft area overlay, brush + keyboard zoom.
 */
export function WorkAnalyticsComboChart({
  title,
  subtitle,
  rows,
  primaryKey = "primary",
  secondaryKey = "secondary",
  primaryLabel = "Focus",
  secondaryLabel = "Queue",
  totalLabel,
  periodOptions,
  period,
  onPeriodChange,
  emptyMessage = "No analytics for this view.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<Record<string, string | number>>;
  primaryKey?: string;
  secondaryKey?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  totalLabel?: string;
  periodOptions?: Array<{ value: string; label: string }>;
  period?: string;
  onPeriodChange?: (v: string) => void;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const gradId = useId().replace(/:/g, "");
  const [resetKey, setResetKey] = useState(0);

  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: formatTrendLabel(String(r.name ?? r.label ?? "")),
        primary: Number(r[primaryKey] ?? r.value ?? 0) || 0,
        secondary: Number(r[secondaryKey] ?? 0) || 0,
      })),
    [rows, primaryKey, secondaryKey],
  );

  const totalPrimary = data.reduce((s, r) => s + r.primary, 0);
  const zoom = useChartKeyboardZoom({ length: data.length, resetKey });
  const hasData = data.some((r) => r.primary > 0 || r.secondary > 0);

  const periodToggle =
    periodOptions && period && onPeriodChange ? (
      <div className="flex overflow-hidden rounded-[6px] border border-[var(--border-color)]">
        {periodOptions.map((opt) => {
          const active = period === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPeriodChange(opt.value)}
              className={
                active
                  ? "bg-[var(--primary)] px-2.5 py-1 text-[11px] font-semibold text-white"
                  : "bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <InteractiveChartShell
      title={title}
      subtitle={
        subtitle ??
        (totalLabel
          ? `${totalPrimary.toLocaleString("en-IN")} ${totalLabel}`
          : undefined)
      }
      actions={
        <>
          {periodToggle}
          {actions}
        </>
      }
      heightClassName="h-[320px]"
      onResetZoom={() => {
        zoom.resetZoom();
        setResetKey((k) => k + 1);
      }}
    >
      {!hasData ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div {...zoom.focusProps}>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-color)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CRM_CHART_PRIMARY }}
              />
              {primaryLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-color)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "#c5c5c5" }}
              />
              {secondaryLabel}
            </span>
          </div>
          <ResponsiveContainer width="100%" height="88%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`workArea-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CRM_CHART_GRID}
                vertical
                horizontal={false}
              />
              <XAxis
                dataKey="name"
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                width={36}
                allowDecimals={false}
              />
              <Tooltip content={<CompactTooltip />} />
              <Area
                type="monotone"
                dataKey="secondary"
                name={secondaryLabel}
                stroke="#94a3b8"
                fill={`url(#workArea-${gradId})`}
                strokeWidth={1.5}
                {...ANIM}
              />
              <Bar
                dataKey="primary"
                name={primaryLabel}
                fill={CRM_CHART_PRIMARY}
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
                {...ANIM}
              />
              {data.length > 3 ? (
                <Brush
                  dataKey="name"
                  height={22}
                  stroke={CRM_CHART_PRIMARY}
                  fill="color-mix(in srgb, var(--primary) 8%, white)"
                  travellerWidth={8}
                  startIndex={zoom.brushProps.startIndex}
                  endIndex={zoom.brushProps.endIndex}
                  onChange={zoom.brushProps.onChange}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </InteractiveChartShell>
  );
}

/** Vertical colored bars — Pipeline Statistics style (Today's focus / categories). */
export function WorkPipelineStatChart({
  title,
  subtitle,
  rows,
  emptyMessage = "No focus items for this view.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ name: string; value: number }>;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const [resetKey, setResetKey] = useState(0);
  const data = useMemo(
    () =>
      rows
        .map((r) => ({
          name: r.name,
          value: Number(r.value) || 0,
        }))
        .filter((r) => r.value > 0),
    [rows],
  );
  const zoom = useChartKeyboardZoom({ length: data.length, resetKey, minWindow: 1 });
  const colors = [
    CRM_CHART_PRIMARY,
    CRM_CHART_SECONDARY,
    "#7c3aed",
    CRM_CHART_SUCCESS,
    CRM_CHART_TERTIARY,
  ];

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
      onResetZoom={() => {
        zoom.resetZoom();
        setResetKey((k) => k + 1);
      }}
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div {...zoom.focusProps}>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.map((row, i) => (
              <div key={row.name} className="min-w-0">
                <p className="truncate text-[10px] font-medium text-[var(--text-muted)]">
                  {row.name}
                </p>
                <p className="text-sm font-bold tabular-nums text-[var(--text-main)]">
                  {row.value.toLocaleString("en-IN")}
                </p>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height="72%">
            <ComposedChart
              data={data}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CRM_CHART_GRID}
                vertical={false}
              />
              <XAxis dataKey="name" hide />
              <YAxis
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip content={<CompactTooltip />} />
              <Bar
                dataKey="value"
                name="Items"
                radius={[8, 8, 0, 0]}
                maxBarSize={48}
                {...ANIM}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Bar>
              {data.length > 3 ? (
                <Brush
                  dataKey="name"
                  height={18}
                  stroke={CRM_CHART_PRIMARY}
                  travellerWidth={8}
                  startIndex={zoom.brushProps.startIndex}
                  endIndex={zoom.brushProps.endIndex}
                  onChange={zoom.brushProps.onChange}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </InteractiveChartShell>
  );
}

/** Pill-track bars — Profit Earned style (task urgency). */
export function WorkTaskStatusChart({
  title,
  subtitle,
  rows,
  emptyMessage = "No tasks in this workspace view.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ name: string; value: number }>;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const [resetKey, setResetKey] = useState(0);
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name,
        value: Number(r.value) || 0,
      })),
    [rows],
  );
  const max = Math.max(1, ...data.map((r) => r.value));
  const hasData = data.some((r) => r.value > 0);
  const zoom = useChartKeyboardZoom({ length: data.length, resetKey, minWindow: 1 });
  const visible = data.slice(zoom.range.startIndex, zoom.range.endIndex + 1);
  const colors = [
    CRM_CHART_PRIMARY,
    CRM_CHART_SECONDARY,
    CRM_CHART_SUCCESS,
    CRM_CHART_TERTIARY,
  ];

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
      onResetZoom={() => {
        zoom.resetZoom();
        setResetKey((k) => k + 1);
      }}
    >
      {!hasData ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div {...zoom.focusProps} className={`${zoom.focusProps.className} flex flex-col justify-end gap-3`}>
          <div className="flex h-full items-end justify-between gap-2 px-1">
            {visible.map((row, i) => {
              const pct = Math.max(8, Math.round((row.value / max) * 100));
              const color = colors[(zoom.range.startIndex + i) % colors.length];
              return (
                <div
                  key={row.name}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                  title={`${row.name}: ${row.value}`}
                >
                  <span className="text-[10px] font-bold tabular-nums text-[var(--text-main)]">
                    {row.value}
                  </span>
                  <div className="relative flex w-full max-w-[28px] flex-1 items-end overflow-hidden rounded-full bg-[var(--surface-dim)]">
                    <span
                      className="absolute bottom-0 left-0 right-0 rounded-full transition-[height] duration-700 ease-out"
                      style={{
                        height: `${pct}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[9px] font-semibold text-[var(--text-muted)]">
                    {row.name}
                  </span>
                </div>
              );
            })}
          </div>
          {data.length > 4 ? (
            <p className="text-center text-[10px] text-[var(--text-muted)]">
              Focus chart · + / − zoom · ← → pan
            </p>
          ) : null}
        </div>
      )}
    </InteractiveChartShell>
  );
}

/** Area — relative workload mix with brush + keyboard zoom. */
export function WorkloadMixAreaChart({
  title,
  subtitle,
  rows,
  emptyMessage = "No workload signals yet.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ name: string; value: number }>;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const gradId = useId().replace(/:/g, "");
  const [resetKey, setResetKey] = useState(0);
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name,
        items: Number(r.value) || 0,
      })),
    [rows],
  );
  const hasData = data.some((r) => r.items > 0);
  const zoom = useChartKeyboardZoom({ length: data.length, resetKey, minWindow: 1 });

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[280px]"
      onResetZoom={() => {
        zoom.resetZoom();
        setResetKey((k) => k + 1);
      }}
    >
      {!hasData ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <div {...zoom.focusProps}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
            >
              <defs>
                <linearGradient id={`workLoadFill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={CRM_CHART_PRIMARY}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={CRM_CHART_PRIMARY}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CRM_CHART_GRID}
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-10}
                textAnchor="end"
                height={52}
              />
              <YAxis
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                width={36}
                allowDecimals={false}
              />
              <Tooltip content={<CompactTooltip />} />
              <Area
                type="monotone"
                dataKey="items"
                name="Items"
                stroke={CRM_CHART_PRIMARY}
                fill={`url(#workLoadFill-${gradId})`}
                strokeWidth={2.5}
                {...ANIM}
              />
              <Bar
                dataKey="items"
                name="Volume"
                fill={CRM_CHART_PRIMARY}
                fillOpacity={0.2}
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
                legendType="none"
                {...ANIM}
              />
              {data.length > 3 ? (
                <Brush
                  dataKey="name"
                  height={22}
                  stroke={CRM_CHART_PRIMARY}
                  fill="color-mix(in srgb, var(--primary) 8%, white)"
                  travellerWidth={8}
                  startIndex={zoom.brushProps.startIndex}
                  endIndex={zoom.brushProps.endIndex}
                  onChange={zoom.brushProps.onChange}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </InteractiveChartShell>
  );
}
