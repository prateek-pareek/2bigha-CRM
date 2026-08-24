"use client";

/**
 * Generic interactive-chart chrome shared across the workspace dashboards
 * (zoom reset · fullscreen · export) plus small animated-number primitives.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRM_BTN_GHOST, CRM_BTN_ICON } from "@/lib/crm/ui";
import { fmtMoney } from "./dashboardShared";
import { DashCardHeader, TrendChip } from "./SalesOverviewCharts";

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

/* ─── Mini KPI tile with animation ───────────────────────────────────────── */

export function KpiTile({
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
