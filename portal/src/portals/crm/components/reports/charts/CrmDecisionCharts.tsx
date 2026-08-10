"use client";

import { useMemo } from "react";
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
import { AlertTriangle, CheckCircle2, Briefcase, Layers, Target, Users, Activity } from "lucide-react";
import type { BoardReportPayload } from "@/components/crm/reports/panels/CrmBoardInsightsPanel";
import { CrmChartPanel } from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_INFO,
  CRM_CHART_LEGEND,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
} from "@/lib/crm/shared/chart-theme";
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
      { name: "Deals", count: board?.dealsCreatedInPeriod ?? 0 },
    ];
  }, [board?.leadConversion, board?.dealsCreatedInPeriod]);

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
          rowKey: r.authorId || r.name,
          name: r.name.length > 18 ? `${r.name.slice(0, 16)}…` : r.name,
          fullName: r.name,
          count: r.count,
        })),
    [board?.engagementByAuthor],
  );

  const dealsByOwner = useMemo(
    () =>
      (board?.dealsByOwner ?? [])
        .slice(0, 8)
        .map((r) => ({
          name: r.owner.length > 16 ? `${r.owner.slice(0, 14)}…` : r.owner,
          fullName: r.owner,
          count: r.count,
        })),
    [board?.dealsByOwner],
  );

  const relatedTypeMix = useMemo(
    () =>
      (board?.engagementByRelatedType ?? [])
        .map((r) => ({
          name: r.relatedType || "Other",
          value: r.count,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [board?.engagementByRelatedType],
  );

  if (!board) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1 shrink-0 rounded-sm bg-[var(--warning,#ff9f43)]" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-main)]">Decision insights</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Follow-up coverage, conversion, pipeline load, and rep activity
            </p>
          </div>
        </div>
        {board.followUpHealth && (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-semibold",
              board.followUpHealth.touchCoveragePercent >= 70
                ? "border-[var(--success)]/30 bg-[var(--success-light)] text-[var(--success)]"
                : board.followUpHealth.touchCoveragePercent >= 40
                  ? "border-[var(--warning)]/30 bg-[var(--warning-light)] text-[var(--text-main)]"
                  : "border-[var(--error)]/30 bg-[var(--error-light)] text-[var(--error)]",
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
        <CrmChartPanel
          title="Follow-up health"
          subtitle={`Open leads touched in last ${board.followUpHealth?.staleDays ?? 7} days vs stale`}
          icon={<Target className="h-4 w-4" />}
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {followUpSlices.length === 0 ? (
              <ChartEmpty message="No open leads" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={followUpSlices}
                    cx="50%"
                    cy="48%"
                    innerRadius={52}
                    outerRadius={80}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={2}
                  >
                    {followUpSlices.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? CRM_CHART_SUCCESS : CRM_CHART_SECONDARY} />
                    ))}
                  </Pie>
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Legend {...CRM_CHART_LEGEND} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        <CrmChartPanel
          title="Lead conversion funnel"
          subtitle="Created → converted → deals in period"
          icon={<Users className="h-4 w-4" />}
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {conversionData.every((r) => r.count === 0) ? (
              <ChartEmpty message="No leads in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversionData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" fontSize={11} fill="var(--text-main)" />
                    {conversionData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={[CRM_CHART_INFO, CRM_CHART_SUCCESS, CRM_CHART_PRIMARY][i % 3]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        <CrmChartPanel
          title="Pipeline volume"
          subtitle="Open leads and deals by pipeline"
          icon={<Layers className="h-4 w-4" />}
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {pipelineVolume.length === 0 ? (
              <ChartEmpty message="No open pipeline records" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineVolume} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Legend {...CRM_CHART_LEGEND} />
                  <Bar dataKey="leads" fill={CRM_CHART_INFO} name="Leads" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="deals" fill={CRM_CHART_PRIMARY} name="Deals" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        <CrmChartPanel
          title="Deals by owner"
          subtitle="Open deals owned by rep"
          icon={<Briefcase className="h-4 w-4" />}
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {dealsByOwner.length === 0 ? (
              <ChartEmpty message="No deals by owner" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsByOwner} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={CRM_CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                    }
                  />
                  <Bar dataKey="count" fill={CRM_CHART_PRIMARY} name="Deals" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        <CrmChartPanel
          title="Rep activity"
          subtitle="Human touches logged by author"
          icon={<Activity className="h-4 w-4" />}
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {authorActivity.length === 0 ? (
              <ChartEmpty message="No logged activity in this range" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={authorActivity} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="rowKey"
                    width={88}
                    tick={CRM_CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => {
                      const row = authorActivity.find((r) => r.rowKey === value);
                      return row?.name ?? "";
                    }}
                  />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                    }
                    formatter={(value) => [value, "Touches"]}
                  />
                  <Bar dataKey="count" fill={CRM_CHART_SECONDARY} name="Touches" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        {relatedTypeMix.length > 0 ? (
          <CrmChartPanel
            title="Touches by record type"
            subtitle="Where activity is logged"
            icon={<Layers className="h-4 w-4" />}
            bodyClassName="pt-2"
          >
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={relatedTypeMix}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {relatedTypeMix.map((_, i) => (
                      <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Legend {...CRM_CHART_LEGEND} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CrmChartPanel>
        ) : null}
      </div>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}
