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
import { Briefcase, Layers, Loader2, Mail, MessageSquareReply } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { cn } from "@/lib/utils";

type BucketRow = { bucket: string; label: string; count: number };

export type ReportSummaryPayload = {
  window: string;
  windowLabel: string;
  granularity: "hour" | "day";
  emailOpens: BucketRow[];
  emailReplies: BucketRow[];
  leadsByPipeline: Array<{ pipelineId: string | null; pipelineName: string; count: number }>;
  leadsByService: Array<{ serviceId: string | null; serviceName: string; count: number }>;
  totals: {
    emailOpens: number;
    emailReplies: number;
    leadsAdded: number;
  };
};

const WINDOW_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_30_days", label: "Last 30 days" },
];

const PIE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ee5f3a", "#0ea5e9", "#64748b"];

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
      if (res.ok) setData(await res.json());
      else setData(null);
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
    data?.granularity === "hour" ? "Hour of day" : "Date";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">
            Daily summary
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            Email engagement and new leads — pipeline and service breakdown
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setWindow(opt.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                window === opt.value
                  ? "bg-primary/10 text-primary"
                  : "bg-slate-100 text-text-muted hover:bg-slate-200",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[280px] rounded-[28px] bg-surface-dim border border-[#ebecf0]" />
          ))}
        </div>
      ) : !data ? (
        <p className="rounded-[3px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    interval={data.granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    labelFormatter={() => timeAxisLabel}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
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
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    interval={data.granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#7c3aed"
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
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10, fill: "var(--text-main)" }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName
                        ? String(payload[0].payload.fullName)
                        : ""
                    }
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} name="Leads">
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
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
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
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10, fill: "var(--text-main)" }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName
                        ? String(payload[0].payload.fullName)
                        : ""
                    }
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Leads">
                    <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                  </Bar>
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
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-[#ebecf0] bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-[3px] bg-primary/10 text-primary shrink-0">{icon}</div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-main tracking-tight">{title}</h3>
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          </div>
        </div>
        <span className="text-lg font-bold tabular-nums text-text-main">{total}</span>
      </div>
      <div className="w-full h-[220px]">{children}</div>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-text-muted border border-dashed border-[#dfe1e6] rounded-[3px]">
      {message}
    </div>
  );
}
