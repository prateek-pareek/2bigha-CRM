"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { AlertTriangle, CheckCircle2, Target, Users, Activity } from "lucide-react";
import type { BoardReportPayload } from "@/components/crm/CrmBoardInsightsPanel";
import { cn } from "@/lib/utils";

type Props = {
  board: BoardReportPayload | null;
  className?: string;
};

export default function CrmDecisionCharts({ board, className }: Props) {
  const followUpSlices = useMemo(() => {
    const h = board?.followUpHealth;
    if (!h || h.openLeads <= 0) return [];
    return [
      { name: "Touched recently", value: h.leadsTouchedRecently },
      { name: "Stale", value: h.staleLeads },
    ].filter((r) => r.value > 0);
  }, [board?.followUpHealth]);

  const conversionData = useMemo(() => {
    const c = board?.leadConversion;
    if (!c) return [];
    return [
      { name: "Created", count: c.createdInPeriod },
      { name: "Converted", count: c.convertedInPeriod },
    ];
  }, [board?.leadConversion]);

  const pipelineVolume = useMemo(() => {
    const rows: { name: string; leads: number; deals: number }[] = [];
    const leadMap = new Map(
      (board?.openLeadsByPipeline ?? []).map((p) => [p.pipelineName, p.total]),
    );
    const dealMap = new Map(
      (board?.openDealsByPipeline ?? []).map((p) => [p.pipelineName, p.total]),
    );
    const names = new Set([...leadMap.keys(), ...dealMap.keys()]);
    for (const name of names) {
      rows.push({
        name: name.length > 16 ? `${name.slice(0, 14)}…` : name,
        leads: leadMap.get(name) ?? 0,
        deals: dealMap.get(name) ?? 0,
      });
    }
    return rows.sort((a, b) => b.leads + b.deals - (a.leads + a.deals)).slice(0, 8);
  }, [board?.openLeadsByPipeline, board?.openDealsByPipeline]);

  const authorActivity = useMemo(
    () =>
      (board?.engagementByAuthor ?? [])
        .slice(0, 8)
        .map((r) => ({
          // Unique category key — duplicate display names break Recharts hover/tooltip mapping.
          rowKey: r.authorId || r.name,
          name: r.name.length > 18 ? `${r.name.slice(0, 16)}…` : r.name,
          fullName: r.name,
          count: r.count,
        })),
    [board?.engagementByAuthor],
  );

  if (!board) return null;

  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--border-color)",
    fontSize: 12,
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">
            Decision insights
          </h2>
          <p className="mt-1 text-sm text-text-muted max-w-2xl">
            Key signals for standups and pipeline reviews — follow-up coverage, conversion, pipeline
            load, and rep activity without opening each module.
          </p>
        </div>
        {board.followUpHealth && (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-[3px] border px-3 py-2 text-xs font-semibold",
              board.followUpHealth.touchCoveragePercent >= 70
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : board.followUpHealth.touchCoveragePercent >= 40
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-rose-200 bg-rose-50 text-rose-900",
            )}
          >
            {board.followUpHealth.touchCoveragePercent >= 70 ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {board.followUpHealth.touchCoveragePercent}% leads touched · {board.followUpHealth.staleLeads}{" "}
            stale
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DecisionCard
          title="Follow-up health"
          subtitle={`Open leads touched in last ${board.followUpHealth?.staleDays ?? 7} days vs stale`}
          icon={<Target className="h-4 w-4" />}
        >
          {followUpSlices.length === 0 ? (
            <ChartEmpty message="No open leads" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={followUpSlices}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    percent != null && percent > 0.08 ? `${name} (${(percent * 100).toFixed(0)}%)` : ""
                  }
                >
                  {followUpSlices.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#16a34a" : "#f59e0b"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const total = followUpSlices.reduce((s, r) => s + r.value, 0);
                    const n = Number(value) || 0;
                    const pct = total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
                    return [`${n} leads (${pct}%)`, String(name)];
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DecisionCard>

        <DecisionCard
          title="Lead conversion"
          subtitle="Created vs converted in selected period"
          icon={<Users className="h-4 w-4" />}
        >
          {conversionData.every((r) => r.count === 0) ? (
            <ChartEmpty message="No leads in this period" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conversionData} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="count" position="top" fontSize={11} fill="var(--text-main)" />
                  {conversionData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#3b82f6" : "#16a34a"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </DecisionCard>

        <DecisionCard
          title="Pipeline volume"
          subtitle="Open leads and deals by pipeline"
          icon={<Target className="h-4 w-4" />}
        >
          {pipelineVolume.length === 0 ? (
            <ChartEmpty message="No open pipeline records" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineVolume} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="leads" fill="#3b82f6" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="deals" fill="var(--hs-link)" name="Deals" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DecisionCard>

        <DecisionCard
          title="Rep activity"
          subtitle="Human touches logged by author"
          icon={<Activity className="h-4 w-4" />}
        >
          {authorActivity.length === 0 ? (
            <ChartEmpty message="No logged activity in this range" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={authorActivity} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis
                  type="category"
                  dataKey="rowKey"
                  width={88}
                  tick={{ fontSize: 10, fill: "var(--text-main)" }}
                  tickFormatter={(value) => {
                    const row = authorActivity.find((r) => r.rowKey === value);
                    return row?.name ?? "";
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                  }
                  formatter={(value) => [value, "Touches"]}
                />
                <Bar dataKey="count" fill="#6366f1" name="Touches" radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </DecisionCard>
      </div>
    </div>
  );
}

function DecisionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-[#ebecf0] bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="shrink-0 rounded-[3px] bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-main">{title}</h3>
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        </div>
      </div>
      <div className="h-[240px] w-full">{children}</div>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[3px] border border-dashed border-[#dfe1e6] text-xs text-text-muted">
      {message}
    </div>
  );
}
