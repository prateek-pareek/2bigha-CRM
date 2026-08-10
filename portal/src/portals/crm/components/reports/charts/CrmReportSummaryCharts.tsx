"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
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
import { Briefcase, Clock, Layers, Mail, MessageSquareReply, Timer } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel, CrmSegmentedControl } from "@/components/crm/ui";
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
import { cn } from "@/lib/utils";

type BucketRow = { bucket: string; label: string; count: number };
type TimingBucketRow = { bucket: string; label: string; hours: number; samples: number };

export type ReportSummaryPayload = {
  window: string;
  windowLabel: string;
  granularity: "hour" | "day";
  timezone: string;
  emailOpens: BucketRow[];
  emailReplies: BucketRow[];
  leadsByPipeline: Array<{ pipelineId: string | null; pipelineName: string; count: number }>;
  leadsByService: Array<{ serviceId: string | null; serviceName: string; count: number }>;
  leadTiming?: {
    avgOutreachHours: number;
    avgFollowUpHours: number;
    outreachSamples: number;
    followUpSamples: number;
    outreachByBucket: TimingBucketRow[];
    followUpByBucket: TimingBucketRow[];
    note?: string;
  };
  totals: {
    emailOpens: number;
    emailReplies: number;
    leadsAdded: number;
    avgOutreachHours?: number;
    avgFollowUpHours?: number;
  };
};

const WINDOW_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_30_days", label: "Last 30 days" },
];

const PIE_COLORS = CRM_CHART_SERIES;

function formatHoursLabel(hours: number): string {
  if (!hours || hours <= 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

export default function CrmReportSummaryCharts({
  owner = "All",
  className,
}: {
  owner?: string;
  className?: string;
}) {
  const [window, setWindow] = useState("today");
  const [data, setData] = useState<ReportSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const opensGradientId = `summaryOpens-${useId().replace(/:/g, "")}`;
  const repliesGradientId = `summaryReplies-${useId().replace(/:/g, "")}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const token = getCrmAuthToken();
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/reports/summary-charts?window=${encodeURIComponent(window)}&owner=${encodeURIComponent(owner)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [window, owner]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const timeAxisLabel =
    data?.granularity === "hour" ? "Hour of day (IST)" : "Date (IST)";
  const tzNote =
    data?.timezone === "Asia/Kolkata" ? "India time" : data?.timezone || "India time";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-1 shrink-0 rounded-sm bg-[#ff9f43]" aria-hidden />
            <h2 className="text-2xl font-bold text-[var(--color-text-main)] leading-[22px]">Daily summary</h2>
          </div>
          <p className="mt-1 text-md font-medium text-[var(--color-text-muted)] sm:pl-3.5">
            Email engagement, new leads, and outreach speed — calendar days in {tzNote}
          </p>
        </div>
        <div className="w-full lg:w-auto overflow-x-auto no-scrollbar pt-1 lg:pt-0">
          <CrmSegmentedControl value={window} onChange={setWindow} options={WINDOW_OPTIONS} />
        </div>
      </div>

      {loading && !data ? (
        <div className="grid animate-pulse gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[280px] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-surface-dim" />
          ))}
        </div>
      ) : !data ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-main)]">
          Could not load summary charts.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryChartCard
            icon={<Mail className="h-4 w-4" />}
            title="Email opens"
            subtitle={`${data.totals.emailOpens} unique opens · ${data.windowLabel}`}
            total={data.totals.emailOpens}
          >
            {data.emailOpens.every((r) => r.count === 0) ? (
              <ChartEmpty message="No email opens in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.emailOpens} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id={opensGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={CRM_CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                    interval={data.granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    labelFormatter={() => timeAxisLabel}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={CRM_CHART_SUCCESS}
                    strokeWidth={2}
                    fill={`url(#${opensGradientId})`}
                    name="Opens"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SummaryChartCard>

          <SummaryChartCard
            icon={<MessageSquareReply className="h-4 w-4" />}
            title="Email replies"
            subtitle={`${data.totals.emailReplies} replies · ${data.windowLabel}`}
            total={data.totals.emailReplies}
          >
            {data.emailReplies.every((r) => r.count === 0) ? (
              <ChartEmpty message="No email replies in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.emailReplies} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id={repliesGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CRM_CHART_SECONDARY} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={CRM_CHART_SECONDARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={CRM_CHART_TICK} axisLine={false} tickLine={false}
                    interval={data.granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={CRM_CHART_SECONDARY}
                    strokeWidth={2}
                    fill={`url(#${repliesGradientId})`}
                    name="Replies"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SummaryChartCard>

          <SummaryChartCard
            icon={<Briefcase className="h-4 w-4" />}
            title="Leads added by pipeline"
            subtitle={`${data.totals.leadsAdded} new leads · ${data.windowLabel}`}
            total={data.totals.leadsAdded}
          >
            {data.leadsByPipeline.length === 0 ? (
              <ChartEmpty message="No leads added in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.leadsByPipeline.slice(0, 8).map((r) => ({
                    name:
                      r.pipelineName.length > 16
                        ? `${r.pipelineName.slice(0, 14)}…`
                        : r.pipelineName,
                    fullName: r.pipelineName,
                    count: r.count,
                  }))}
                  layout="vertical"
                  margin={{ left: 4, right: 20, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10, fill: "var(--text-main)" }}
                  />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName
                        ? String(payload[0].payload.fullName)
                        : ""
                    }
                  />
                  <Bar dataKey="count" fill={CRM_CHART_PRIMARY} radius={[0, 6, 6, 0]} name="Leads">
                    <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SummaryChartCard>

          <SummaryChartCard
            icon={<Layers className="h-4 w-4" />}
            title="Leads by related service"
            subtitle={`Service interest · ${data.windowLabel}`}
            total={data.totals.leadsAdded}
          >
            {data.leadsByService.length === 0 ? (
              <ChartEmpty message="No leads with service data" />
            ) : data.leadsByService.length <= 6 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.leadsByService.map((r) => ({
                      name:
                        r.serviceName.length > 18
                          ? `${r.serviceName.slice(0, 16)}…`
                          : r.serviceName,
                      fullName: r.serviceName,
                      value: r.count,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={82}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      percent != null && percent > 0.08 ? `${name}` : ""
                    }
                  >
                    {data.leadsByService.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    formatter={(value) => [value, "Leads"]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName
                        ? String(payload[0].payload.fullName)
                        : ""
                    }
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.leadsByService.slice(0, 8).map((r) => ({
                    name:
                      r.serviceName.length > 16
                        ? `${r.serviceName.slice(0, 14)}…`
                        : r.serviceName,
                    fullName: r.serviceName,
                    count: r.count,
                  }))}
                  layout="vertical"
                  margin={{ left: 4, right: 20, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10, fill: "var(--text-main)" }}
                  />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName
                        ? String(payload[0].payload.fullName)
                        : ""
                    }
                  />
                  <Bar dataKey="count" fill={CRM_CHART_SECONDARY} radius={[0, 6, 6, 0]} name="Leads">
                    <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SummaryChartCard>

          <SummaryChartCard
            icon={<Clock className="h-4 w-4" />}
            title="Avg outreach time"
            subtitle={`Lead created → first email · ${data.leadTiming?.outreachSamples ?? 0} samples · ${data.windowLabel}`}
            total={formatHoursLabel(
              data.leadTiming?.avgOutreachHours ?? data.totals.avgOutreachHours ?? 0,
            )}
          >
            {!data.leadTiming || data.leadTiming.outreachSamples === 0 ? (
              <ChartEmpty message="No first outreach emails in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.leadTiming.outreachByBucket}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={CRM_CHART_TICK} axisLine={false} tickLine={false}
                    interval={data.granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis
                    tick={CRM_CHART_TICK} axisLine={false} tickLine={false}
                    tickFormatter={(v) => formatHoursLabel(Number(v))}
                  />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    formatter={(value, _name, item) => [
                      `${formatHoursLabel(Number(value))} avg (${item?.payload?.samples ?? 0} leads)`,
                      "Outreach",
                    ]}
                    labelFormatter={() => timeAxisLabel}
                  />
                  <Bar dataKey="hours" fill={CRM_CHART_PRIMARY} radius={[4, 4, 0, 0]} name="Avg hours" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SummaryChartCard>

          <SummaryChartCard
            icon={<Timer className="h-4 w-4" />}
            title="Avg follow-up time"
            subtitle={`Between tracked emails · ${data.leadTiming?.followUpSamples ?? 0} samples · ${data.windowLabel}`}
            total={formatHoursLabel(
              data.leadTiming?.avgFollowUpHours ?? data.totals.avgFollowUpHours ?? 0,
            )}
          >
            {!data.leadTiming || data.leadTiming.followUpSamples === 0 ? (
              <ChartEmpty message="No follow-up emails in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.leadTiming.followUpByBucket}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={CRM_CHART_TICK} axisLine={false} tickLine={false}
                    interval={data.granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis
                    tick={CRM_CHART_TICK} axisLine={false} tickLine={false}
                    tickFormatter={(v) => formatHoursLabel(Number(v))}
                  />
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    formatter={(value, _name, item) => [
                      `${formatHoursLabel(Number(value))} avg (${item?.payload?.samples ?? 0} sends)`,
                      "Follow-up",
                    ]}
                    labelFormatter={() => timeAxisLabel}
                  />
                  <Bar dataKey="hours" fill={CRM_CHART_WARNING} radius={[4, 4, 0, 0]} name="Avg hours" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SummaryChartCard>
        </div>
      )}
    </div>
  );
}

function SummaryChartCard({
  icon,
  title,
  subtitle,
  total,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  total: number | string;
  children: React.ReactNode;
}) {
  return (
    <CrmChartPanel
      title={title}
      subtitle={subtitle}
      icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fee2e2] text-[#ef4444]">{icon}</span>}
      actions={<span className="text-xl font-bold tabular-nums text-[#1f2020]">{total}</span>}
      className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
      bodyClassName="pt-0"
    >
      <div className="w-full h-[220px]">{children}</div>
    </CrmChartPanel>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-text-muted border border-dashed border-[var(--border-color)] rounded-[var(--radius-md)]">
      {message}
    </div>
  );
}
