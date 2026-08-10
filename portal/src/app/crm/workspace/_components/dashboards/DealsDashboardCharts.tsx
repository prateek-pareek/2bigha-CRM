"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import NextLink from "next/link";
import { cn } from "@/lib/utils";
import {
  CrmListMutedText,
  CrmListOrgCell,
  CrmListOwnerCell,
  CrmListStatusBadge,
  CrmSoftBadge,
  CrmTable,
} from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { CRM_BTN_GHOST, CRM_BTN_ICON, CRM_INPUT } from "@/lib/crm/ui";
import {
  dashDealId,
  dashDealOrg,
  dashDealOwner,
  dashDealTag,
  dashDealTitle,
  dealStatusLabel,
  EmptyDash,
  fmtMoney,
  fmtMoneyIfAllowed,
  type DashRecentDeal,
} from "./dashboardShared";
import {
  DashCardHeader,
  PeriodSelect,
  TrendChip,
} from "./SalesOverviewCharts";

/* ─── Animated counter ───────────────────────────────────────────────────── */

export function useAnimatedNumber(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = Number.isFinite(target) ? target : 0;
    if (from === to) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

export function AnimatedMetric({
  value,
  format = "number",
  className,
}: {
  value: number;
  format?: "number" | "money" | "percent";
  className?: string;
}) {
  const animated = useAnimatedNumber(value);
  const display =
    format === "money"
      ? fmtMoney(Math.round(animated))
      : format === "percent"
        ? `${animated.toFixed(1)}%`
        : Math.round(animated).toLocaleString("en-IN");
  return (
    <span className={cn("tabular-nums", className)}>{display}</span>
  );
}

/* ─── Chart shell: zoom reset · fullscreen · export ──────────────────────── */

type ExportFormat = "png" | "svg" | "pdf";

async function exportNode(
  node: HTMLElement,
  title: string,
  format: ExportFormat,
) {
  const { toPng, toSvg } = await import("html-to-image");
  const safe = title.replace(/[^\w\-]+/g, "_").slice(0, 48) || "chart";
  if (format === "svg") {
    const dataUrl = await toSvg(node, { cacheBust: true, pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${safe}.svg`;
    a.click();
    return;
  }
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  if (format === "png") {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${safe}.png`;
    a.click();
    return;
  }
  const { jsPDF } = await import("jspdf");
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load chart image"));
    img.src = dataUrl;
  });
  const pdf = new jsPDF({
    orientation: img.width >= img.height ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  pdf.addImage(dataUrl, "PNG", (pageW - w) / 2, margin, w, h);
  pdf.save(`${safe}.pdf`);
}

export function InteractiveChartShell({
  title,
  subtitle,
  actions,
  children,
  heightClassName = "h-[280px]",
  onResetZoom,
  zoomHint = "Drag the brush to zoom · focus chart then + / − / ← → to zoom & pan · 0 resets · export via download",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  heightClassName?: string;
  onResetZoom?: () => void;
  /** Override the footer hint under the chart. */
  zoomHint?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (!panelRef.current) return;
      setExporting(true);
      try {
        await exportNode(panelRef.current, title, format);
      } catch {
        /* ignore — export is best-effort */
      } finally {
        setExporting(false);
        setExportOpen(false);
      }
    },
    [title],
  );

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {actions}
      {onResetZoom ? (
        <button
          type="button"
          onClick={onResetZoom}
          className={CRM_BTN_ICON}
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          <RefreshCw size={14} />
        </button>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setExportOpen((o) => !o)}
          className={CRM_BTN_ICON}
          aria-label="Export chart"
          title="Export"
          disabled={exporting}
        >
          <Download size={14} />
        </button>
        {exportOpen ? (
          <div className="absolute right-0 z-20 mt-1 min-w-[120px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white py-1 shadow-[var(--crm-shadow-raised)]">
            {(["png", "svg", "pdf"] as ExportFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs font-medium text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                onClick={() => void runExport(fmt)}
              >
                Export {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setFullscreen((f) => !f)}
        className={CRM_BTN_ICON}
        aria-label={fullscreen ? "Exit fullscreen" : "Expand chart"}
        title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </div>
  );

  const body = (
    <section
      ref={panelRef}
      className={cn(
        "overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-card)]",
        fullscreen && "flex h-full flex-col",
      )}
    >
      <DashCardHeader title={title} subtitle={subtitle} actions={toolbar} />
      <div className={cn("p-4 sm:p-5", fullscreen && "flex-1")}>
        <div className={cn("w-full", fullscreen ? "h-[min(70vh,560px)]" : heightClassName)}>
          {children}
        </div>
        <p className="mt-2 text-[10px] font-medium text-[var(--text-muted)]">
          {zoomHint}
        </p>
      </div>
    </section>
  );

  if (!fullscreen) return body;

  return (
    <div className="fixed inset-0 z-[180] flex flex-col bg-black/50 p-3 sm:p-6">
      <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col">
        <button
          type="button"
          className={cn(CRM_BTN_GHOST, "absolute -top-1 right-0 z-10 bg-white")}
          onClick={() => setFullscreen(false)}
          aria-label="Close fullscreen"
        >
          <X size={16} />
        </button>
        <div className="min-h-0 flex-1 overflow-auto">{body}</div>
      </div>
    </div>
  );
}

function CompactTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; color?: string }>;
  label?: string;
  valueFormatter?: (v: number, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-[var(--border-color)] bg-white px-2.5 py-1.5 shadow-[var(--crm-shadow-raised)]">
      {label ? (
        <p className="mb-1 text-[10px] font-medium text-[var(--text-muted)]">{label}</p>
      ) : null}
      {payload.map((row, i) => {
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
              style={{ background: row.color || CRM_CHART_SERIES[i] }}
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

function compactNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}

/* ─── Interactive stage bar (vertical — matches reference) ───────────────── */

export function InteractiveStageBarChart({
  title,
  subtitle,
  rows,
  valueMode = "count",
  barColor,
  emptyMessage = "No stage data in this view.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ stage: string; count: number; value?: number }>;
  valueMode?: "count" | "value";
  barColor?: string;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const data = useMemo(
    () =>
      [...rows]
        .map((r) => ({
          name: r.stage,
          count: Number(r.count || 0),
          value: valueMode === "value" ? Number(r.value || 0) : Number(r.count || 0),
        }))
        .filter((r) => r.value > 0 && !hidden[r.name])
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [rows, valueMode, hidden],
  );

  const fill = barColor || CRM_CHART_PRIMARY;

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      onResetZoom={() => {
        setBrushKey((k) => k + 1);
        setHidden({});
      }}
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            key={brushKey}
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
            <XAxis
              dataKey="name"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis tick={CRM_CHART_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              content={
                <CompactTooltip
                  valueFormatter={(v) =>
                    valueMode === "value" ? fmtMoney(v) : `${v} deals`
                  }
                />
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
              onClick={(e) => {
                const key = String(e?.value || "");
                if (!key) return;
                setHidden((h) => ({ ...h, [key]: !h[key] }));
              }}
            />
            <Bar
              dataKey="value"
              name={valueMode === "value" ? "Pipeline value" : "Deals"}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              fill={fill}
              isAnimationActive
              animationDuration={600}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={barColor || CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]}
                />
              ))}
            </Bar>
            {data.length > 4 ? (
              <Brush
                dataKey="name"
                height={22}
                stroke={fill}
                fill="color-mix(in srgb, var(--primary) 8%, white)"
                travellerWidth={8}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/** Horizontal bars — Lost (red) / Won (green) stage charts from reference */
export function InteractiveHorizontalStageChart({
  title,
  subtitle,
  rows,
  tone = "danger",
  emptyMessage,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<{ stage: string; count: number; value?: number }>;
  tone?: "danger" | "success";
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const fill = tone === "success" ? CRM_CHART_SUCCESS : CRM_CHART_PRIMARY;
  const data = useMemo(
    () =>
      [...rows]
        .map((r) => ({
          name: r.stage,
          value: Number(r.count || 0),
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [rows],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[260px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage || "No deals in this view."} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            key={brushKey}
            layout="vertical"
            data={data}
            margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
            <XAxis type="number" tick={CRM_CHART_TICK} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<CompactTooltip valueFormatter={(v) => `${v} deals`} />}
            />
            <Bar
              dataKey="value"
              name="Deals"
              fill={fill}
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              isAnimationActive
              animationDuration={600}
            />
            {data.length > 5 ? (
              <Brush
                dataKey="name"
                height={22}
                stroke={fill}
                travellerWidth={8}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Trend / by-year line ───────────────────────────────────────────────── */

export function InteractiveDealsTrendChart({
  title,
  subtitle,
  data,
  series = [
    { key: "deals", name: "Deals", color: CRM_CHART_WARNING },
    { key: "revenue", name: "Revenue", color: CRM_CHART_PRIMARY },
  ],
  canViewRevenue,
  actions,
  emptyMessage = "No deal trend for this window.",
}: {
  title: string;
  subtitle?: ReactNode;
  data: Array<Record<string, string | number>>;
  series?: Array<{ key: string; name: string; color: string }>;
  canViewRevenue: boolean;
  actions?: ReactNode;
  emptyMessage?: string;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const visibleSeries = series.filter((s) => {
    if (s.key === "revenue" && !canViewRevenue) return false;
    return !hidden[s.key];
  });

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[300px]"
      onResetZoom={() => {
        setBrushKey((k) => k + 1);
        setHidden({});
      }}
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            key={brushKey}
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
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
              yAxisId="left"
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => compactNum(Number(v))}
            />
            {canViewRevenue ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={CRM_CHART_TICK}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => compactNum(Number(v))}
              />
            ) : null}
            <Tooltip
              content={
                <CompactTooltip
                  valueFormatter={(v, name) =>
                    /revenue/i.test(String(name || ""))
                      ? fmtMoney(v)
                      : `${v} deals`
                  }
                />
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
              onClick={(e) => {
                const key = series.find((s) => s.name === e?.value)?.key;
                if (!key) return;
                setHidden((h) => ({ ...h, [key]: !h[key] }));
              }}
            />
            {visibleSeries.map((s) => (
              <Line
                key={s.key}
                yAxisId={s.key === "revenue" ? "right" : "left"}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive
                animationDuration={700}
              />
            ))}
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

/* ─── Simple category bar (owner / pipeline / source / aging) ────────────── */

export function InteractiveCategoryBarChart({
  title,
  subtitle,
  rows,
  valueKey = "value",
  nameKey = "name",
  valueLabel = "Deals",
  color = CRM_CHART_SECONDARY,
  money = false,
  emptyMessage = "No data for this view.",
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: Array<Record<string, string | number>>;
  valueKey?: string;
  nameKey?: string;
  valueLabel?: string;
  color?: string;
  money?: boolean;
  emptyMessage?: string;
  actions?: ReactNode;
}) {
  const [brushKey, setBrushKey] = useState(0);
  const data = useMemo(
    () =>
      [...rows]
        .map((r) => ({
          name: String(r[nameKey] || "—"),
          value: Number(r[valueKey] || 0),
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [rows, nameKey, valueKey],
  );

  return (
    <InteractiveChartShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      heightClassName="h-[260px]"
      onResetZoom={() => setBrushKey((k) => k + 1)}
    >
      {data.length === 0 ? (
        <EmptyDash message={emptyMessage} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            key={brushKey}
            layout="vertical"
            data={data}
            margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
            <XAxis type="number" tick={CRM_CHART_TICK} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={CRM_CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={
                <CompactTooltip
                  valueFormatter={(v) => (money ? fmtMoney(v) : `${v} ${valueLabel.toLowerCase()}`)}
                />
              }
            />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
            <Bar
              dataKey="value"
              name={valueLabel}
              fill={color}
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              isAnimationActive
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </InteractiveChartShell>
  );
}

/* ─── Enhanced deals table ───────────────────────────────────────────────── */

type SortKey = "title" | "stage" | "value" | "owner" | "probability" | "status";

export function EnhancedRecentDealsTable({
  deals,
  canViewRevenue,
  emptyMessage = "No recently created deals for this view.",
}: {
  deals: DashRecentDeal[];
  canViewRevenue: boolean;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "won" | "lost">("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = deals.filter((d) => {
      const status = dealStatusLabel(d.status || d.stage).label.toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        dashDealTitle(d),
        d.stage,
        d.status,
        dashDealOwner(d),
        dashDealOrg(d),
        dashDealTag(d),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av =
        sortKey === "title"
          ? dashDealTitle(a)
          : sortKey === "stage"
            ? String(a.stage || "")
            : sortKey === "value"
              ? Number(a.dealValueINR ?? a.dealValue ?? 0)
              : sortKey === "owner"
                ? dashDealOwner(a)
                : sortKey === "probability"
                  ? Number(a.probability ?? 0)
                  : dealStatusLabel(a.status || a.stage).label;
      const bv =
        sortKey === "title"
          ? dashDealTitle(b)
          : sortKey === "stage"
            ? String(b.stage || "")
            : sortKey === "value"
              ? Number(b.dealValueINR ?? b.dealValue ?? 0)
              : sortKey === "owner"
                ? dashDealOwner(b)
                : sortKey === "probability"
                  ? Number(b.probability ?? 0)
                  : dealStatusLabel(b.status || b.stage).label;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [deals, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, deals]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Deal Name",
      "Stage",
      "Deal Value",
      "Tags",
      "Owner",
      "Probability",
      "Status",
    ];
    const lines = filtered.map((d) => {
      const status = dealStatusLabel(d.status || d.stage);
      const value = Number(d.dealValueINR ?? d.dealValue ?? 0);
      return [
        dashDealTitle(d),
        d.stage || "",
        canViewRevenue ? String(value) : "",
        dashDealTag(d) || "",
        dashDealOwner(d),
        String(Math.max(0, Math.min(100, Number(d.probability ?? 0)))),
        status.label,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recent-deals.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortTh = ({
    label,
    col,
  }: {
    label: string;
    col: SortKey;
  }) => (
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals…"
            className={cn(CRM_INPUT, "h-[34px] pl-8 text-xs")}
          />
        </div>
        <PeriodSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "open", label: "Open" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ]}
        />
        <button
          type="button"
          onClick={exportCsv}
          className={cn(CRM_BTN_ICON, "h-[34px] w-[34px]")}
          aria-label="Export CSV"
          title="Export CSV"
        >
          <Download size={14} />
        </button>
      </div>

      {pageRows.length === 0 ? (
        <div className="p-6">
          <EmptyDash message={emptyMessage} />
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <CrmTable className="min-w-[880px]">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--border-color)]">
              <tr>
                <SortTh label="Deal Name" col="title" />
                <SortTh label="Stage" col="stage" />
                <SortTh label="Deal Value" col="value" />
                <th>Tags</th>
                <SortTh label="Owner" col="owner" />
                <SortTh label="Probability" col="probability" />
                <SortTh label="Status" col="status" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d) => {
                const id = dashDealId(d);
                const title = dashDealTitle(d);
                const status = dealStatusLabel(d.status || d.stage);
                const stage = (d.stage || d.status || "—").trim() || "—";
                const value = Number(d.dealValueINR ?? d.dealValue ?? 0);
                const owner = dashDealOwner(d);
                const org = dashDealOrg(d);
                const tag = dashDealTag(d);
                const prob = Math.max(0, Math.min(100, Number(d.probability ?? 0)));
                const tagTone =
                  tag && /high|urgent|reject/i.test(tag)
                    ? "danger"
                    : tag && /low|rated/i.test(tag)
                      ? "secondary"
                      : tag && /collab|success|won/i.test(tag)
                        ? "success"
                        : "info";

                return (
                  <tr key={id || title} className="transition-colors hover:bg-[var(--surface-dim)]">
                    <td>
                      {id ? (
                        <NextLink href={`/crm/deals/${id}`} className="group block min-w-0">
                          <CrmListOrgCell name={title} subtitle={org || undefined} />
                        </NextLink>
                      ) : (
                        <CrmListOrgCell name={title} subtitle={org || undefined} />
                      )}
                    </td>
                    <td>
                      <CrmListMutedText>{stage}</CrmListMutedText>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-[#1f2020]">
                        {fmtMoneyIfAllowed(value, canViewRevenue)}
                      </span>
                    </td>
                    <td>
                      {tag ? (
                        <CrmSoftBadge label={tag} tone={tagTone} />
                      ) : (
                        <CrmListMutedText>—</CrmListMutedText>
                      )}
                    </td>
                    <td>
                      <CrmListOwnerCell name={owner} />
                    </td>
                    <td>
                      <span className="text-sm font-medium text-[#1f2020]">{prob}%</span>
                    </td>
                    <td>
                      {status.tone === "success" || status.tone === "danger" ? (
                        <CrmListStatusBadge label={status.label} />
                      ) : (
                        <CrmSoftBadge label={status.label} tone={status.tone} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </CrmTable>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
        <span>
          {filtered.length} deal{filtered.length === 1 ? "" : "s"}
          {filtered.length !== deals.length ? ` (of ${deals.length})` : ""}
        </span>
        <div className="flex items-center gap-2">
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

/* ─── Mini KPI tile with animation ───────────────────────────────────────── */

export function DealKpiTile({
  label,
  value,
  format = "number",
  sub,
  accent,
  delta,
}: {
  label: string;
  value: number;
  format?: "number" | "money" | "percent";
  sub?: string;
  accent?: string;
  delta?: number | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]">
      {accent ? (
        <span
          className="absolute inset-y-0 left-0 w-1 rounded-l-[var(--crm-radius-ui)]"
          style={{ background: accent }}
          aria-hidden
        />
      ) : null}
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-main)]">
        <AnimatedMetric value={value} format={format} />
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {sub ? <p className="text-[11px] text-[var(--text-muted)]">{sub}</p> : null}
        <TrendChip delta={delta} label="vs prior" />
      </div>
    </div>
  );
}

/** Re-export period select for local filters */
export { PeriodSelect };
