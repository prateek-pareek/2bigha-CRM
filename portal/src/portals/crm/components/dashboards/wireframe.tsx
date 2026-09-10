"use client";

/**
 * Shared presentational building blocks for the role-based dashboards
 * (CRM Role Dashboard Wireframe: Admin / Team Lead / Agent).
 * All values are passed in from the live `/crm/dashboard/*` API — these are
 * pure presentational components with no data of their own.
 */

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { CustomChartTooltip } from "@/components/crm/dashboards/ChartCard";

export const CHART_COLORS = ["#2563eb", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

export const STATUS_COLORS: Record<string, string> = {
  New: "#3b82f6",
  Contacted: "#f59e0b",
  Qualified: "#06b6d4",
  Converted: "#22c55e",
  Lost: "#ef4444",
  Approved: "#22c55e",
  Pending: "#f59e0b",
  Rejected: "#ef4444",
  Connected: "#22c55e",
  "Not Connected": "#f59e0b",
  Missed: "#ef4444",
};

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString();
}

export function timeAgo(input?: string | Date | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Titled panel with optional subtitle — the section container in the wireframe. */
export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-card shadow-sm ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <div>
            {title && <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Large "at a glance" KPI card. */
export function StatTile({
  title,
  value,
  sub,
  delta,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number | null;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-rose-600 dark:text-rose-400"
          : "text-card-foreground";
  const hasDelta = delta !== null && delta !== undefined;
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2">
        <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          {hasDelta && (
            <span
              className={`rounded-full px-1.5 py-0.5 font-semibold ${
                (delta as number) >= 0
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-500/10"
              }`}
            >
              {(delta as number) > 0 ? "+" : ""}
              {delta}%
            </span>
          )}
          {sub && <span className="text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

/** Compact labelled number cell (the small metric grids under each section). */
export function StatCell({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-rose-600 dark:text-rose-400"
          : "text-card-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function StatCellGrid({ children, cols = 5 }: { children: React.ReactNode; cols?: number }) {
  const colClass =
    cols === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : cols === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-3 lg:grid-cols-5";
  return <div className={`grid grid-cols-2 gap-2.5 ${colClass}`}>{children}</div>;
}

/** Stacked horizontal breakdown bar with a legend (Lead status, approval, call outcome). */
export function SegmentBar({
  segments,
  showPct = false,
}: {
  segments: { label: string; value: number; color?: string }[];
  showPct?: boolean;
}) {
  const total = segments.reduce((a, s) => a + (Number(s.value) || 0), 0);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments.map((s, i) => {
            const pct = (Number(s.value) || 0) / total;
            if (pct <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  width: `${pct * 100}%`,
                  backgroundColor: s.color || STATUS_COLORS[s.label] || CHART_COLORS[i % CHART_COLORS.length],
                }}
                title={`${s.label}: ${fmt(s.value)}`}
              />
            );
          })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color || STATUS_COLORS[s.label] || CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {s.label} — <span className="font-semibold text-card-foreground">{fmt(s.value)}</span>
            {showPct && total > 0 && ` (${Math.round(((Number(s.value) || 0) / total) * 100)}%)`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Target-vs-actual progress bars (Org / Team / My target achievement). */
export function TargetProgress({
  rows,
}: {
  rows: { label: string; actual: number; target: number | null; suffix?: string }[];
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((row, i) => {
        const target = row.target;
        const hasTarget = target !== null && target !== undefined && target > 0;
        const pct = hasTarget ? Math.min(100, Math.round((row.actual / (target as number)) * 100)) : 0;
        const color = !hasTarget ? "#94a3b8" : pct >= 90 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
        return (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-card-foreground">{row.label}</span>
              <span className="text-muted-foreground">
                {fmt(row.actual)} <span className="text-muted-foreground/60">/ {hasTarget ? fmt(target) : "—"}</span>
                {row.suffix}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${hasTarget ? pct : 0}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Month-wise progress — grouped bars, Leads vs Calls. */
export function MonthlyProgressChart({ data }: { data: { month: string; leads: number; calls: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No data for this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="leads" name="Leads" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Bar dataKey="calls" name="Calls" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Loading skeleton block. */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border bg-muted/40" />
      <div className="h-48 rounded-xl border border-border bg-muted/40" />
    </div>
  );
}

/** Error panel with retry. */
export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      <p className="mb-2 font-semibold">Couldn&apos;t load dashboard</p>
      <p className="mb-3 opacity-90">{message}</p>
      <button
        onClick={onRetry}
        className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
      >
        Retry
      </button>
    </div>
  );
}
