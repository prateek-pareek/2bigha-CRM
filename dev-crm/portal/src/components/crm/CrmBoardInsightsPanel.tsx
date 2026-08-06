"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { Activity, AlertTriangle, BarChart3, ChevronDown, ChevronUp, Mail, Send, TrendingUp, Users } from "lucide-react";
import CrmVennDiagram from "@/components/crm/CrmVennDiagram";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";

export type BoardReportPayload = {
  periodDays: number;
  leadsCreatedByDay: Array<{ date: string; count: number }>;
  leadsByOwner: Array<{ owner: string; count: number }>;
  dealsByOwner: Array<{ owner: string; count: number }>;
  leadConversion: {
    createdInPeriod: number;
    convertedInPeriod: number;
    conversionRate: number;
  };
  dealsCreatedInPeriod: number;
  clientsCreatedInPeriod: number;
  openLeadsByPipeline?: Array<{
    pipelineId: string | null;
    pipelineName: string;
    total: number;
    stages: Array<{ stage: string; count: number }>;
  }>;
  openDealsByPipeline?: Array<{
    pipelineId: string | null;
    pipelineName: string;
    total: number;
    stages: Array<{ stage: string; count: number }>;
  }>;
  emailEngagementSummary?: {
    sends: number;
    opened: number;
    notOpened: number;
    clicked: number;
    notClicked: number;
    replies: number;
    noReply: number;
    openRatePercent: number;
    clickRatePercent: number;
    replyRatePercent: number;
    totalOpenEvents: number;
    totalClicks: number;
  };
  emailOpensByDay: Array<{ date: string; sendsOpened: number }>;
  emailSendsByDay?: Array<{ date: string; sends: number }>;
  emailRepliesByDay?: Array<{ date: string; repliesReceived: number }>;
  followUpReplyAnalytics?: {
    repliesByAttempt: Array<{
      attempt: number;
      label: string;
      replies: number;
    }>;
    avgSendsAtReply: number;
    avgFollowUpsAtReply: number;
    repliedConversations: number;
    totalFollowUpSendsInPeriod: number;
    note: string;
  };
  channelPerformance?: Array<{
    channel: string;
    leads: number;
    converted: number;
    conversionRate: number;
    replies: number;
    deals: number;
    replyRate: number;
  }>;
  emailEngagementNote: string;
  emailByRecipient: Array<{
    recipient: string;
    sends: number;
    totalOpens: number;
    uniqueOpened: number;
  }>;
  emailByTemplate: Array<{
    templateId: string | null;
    templateName: string;
    sends: number;
    totalOpens: number;
    uniqueOpened: number;
    totalClicks: number;
    uniqueClicked: number;
  }>;
  emailByFromAddress: Array<{
    fromEmail: string;
    sends: number;
    totalOpens: number;
    uniqueOpened: number;
  }>;
  engagementByDay?: Array<{ date: string; count: number }>;
  engagementByType?: Array<{ type: string; count: number }>;
  engagementByRelatedType?: Array<{ relatedType: string; count: number }>;
  engagementByAuthor?: Array<{ authorId: string; name: string; count: number }>;
  totalHumanTouches?: number;
  outreachTrackedSends?: number;
  followUpHealth?: {
    openLeads: number;
    leadsTouchedRecently: number;
    staleLeads: number;
    touchCoveragePercent: number;
    staleDays: number;
  };
  engagementNote?: string;
};

type Props = {
  /** CRM user display name, or "All" — initial value when filters are local */
  ownerFilter: string;
  owners: Array<{ _id: string; firstName: string; lastName: string }>;
  defaultOpen?: boolean;
  className?: string;
  /** When set, period/owner match the parent (e.g. BI page) and dropdowns are hidden */
  pinnedFilters?: { days: string; owner: string };
};

export default function CrmBoardInsightsPanel({
  ownerFilter,
  owners,
  defaultOpen = true,
  className = "",
  pinnedFilters,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [days, setDays] = useState(pinnedFilters?.days || "30");
  const [owner, setOwner] = useState(pinnedFilters?.owner ?? ownerFilter);
  const [data, setData] = useState<BoardReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineKey, setPipelineKey] = useState<string>("all");

  const effectiveDays = pinnedFilters?.days ?? days;
  const effectiveOwner = pinnedFilters?.owner ?? owner;

  useEffect(() => {
    if (!pinnedFilters) setOwner(ownerFilter);
  }, [ownerFilter, pinnedFilters]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const token = getCrmAuthToken();
      try {
        const q = new URLSearchParams({ days: effectiveDays, owner: effectiveOwner });
        const res = await fetch(`${CRM_API_URL}/crm/reports/board?${q}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveDays, effectiveOwner]);

  const maxLeadsDay = Math.max(
    1,
    ...(data?.leadsCreatedByDay?.map((d) => d.count) ?? []),
  );
  const leadsAddedByDay = useMemo(() => {
    const rows = (data?.leadsCreatedByDay ?? []).map((r) => {
      const d = new Date(`${r.date}T12:00:00`);
      return {
        ...r,
        label: Number.isNaN(d.getTime())
          ? r.date
          : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        weekday: Number.isNaN(d.getTime())
          ? ""
          : d.toLocaleDateString(undefined, { weekday: "short" }),
      };
    });
    const withAvg = rows.map((row, index) => {
      const from = Math.max(0, index - 6);
      const slice = rows.slice(from, index + 1);
      const avg = slice.reduce((sum, r) => sum + r.count, 0) / slice.length;
      return { ...row, rollingAvg: Math.round(avg * 10) / 10, isPeak: row.count === maxLeadsDay && row.count > 0 };
    });
    return withAvg;
  }, [data?.leadsCreatedByDay, maxLeadsDay]);
  const leadsAddedStats = useMemo(() => {
    if (!leadsAddedByDay.length) return { total: 0, avg: 0, peakLabel: "—" };
    const total = leadsAddedByDay.reduce((s, r) => s + r.count, 0);
    const peak = [...leadsAddedByDay].sort((a, b) => b.count - a.count)[0];
    return {
      total,
      avg: Math.round((total / leadsAddedByDay.length) * 10) / 10,
      peakLabel: peak ? `${peak.weekday} ${peak.label} (${peak.count})` : "—",
    };
  }, [leadsAddedByDay]);
  const maxOpenDay = Math.max(
    1,
    ...(data?.emailOpensByDay?.map((d) => d.sendsOpened) ?? []),
  );
  const funnelByDay = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; leads: number; sends: number; opens: number; replies: number; touches: number }
    >();
    const ensure = (date: string) => {
      let row = byDate.get(date);
      if (!row) {
        row = { date, leads: 0, sends: 0, opens: 0, replies: 0, touches: 0 };
        byDate.set(date, row);
      }
      return row;
    };
    for (const row of data?.leadsCreatedByDay ?? []) {
      ensure(row.date).leads = row.count ?? 0;
    }
    for (const row of data?.emailSendsByDay ?? []) {
      ensure(row.date).sends = row.sends ?? 0;
    }
    for (const row of data?.emailOpensByDay ?? []) {
      ensure(row.date).opens = row.sendsOpened ?? 0;
    }
    for (const row of data?.emailRepliesByDay ?? []) {
      ensure(row.date).replies = row.repliesReceived ?? 0;
    }
    for (const row of data?.engagementByDay ?? []) {
      ensure(row.date).touches = row.count ?? 0;
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [
    data?.leadsCreatedByDay,
    data?.emailSendsByDay,
    data?.emailOpensByDay,
    data?.emailRepliesByDay,
    data?.engagementByDay,
  ]);
  const maxFunnelDay = Math.max(
    1,
    ...funnelByDay.flatMap((d) => [d.leads, d.sends, d.opens, d.replies, d.touches]),
  );
  const maxReplyDay = Math.max(
    1,
    ...(data?.emailRepliesByDay?.map((d) => d.repliesReceived) ?? []),
  );
  const maxEngagementDay = Math.max(
    1,
    ...(data?.engagementByDay?.map((d) => d.count) ?? []),
  );

  const pipelineOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.openLeadsByPipeline ?? []) {
      map.set(row.pipelineId || "__none__", row.pipelineName);
    }
    for (const row of data?.openDealsByPipeline ?? []) {
      map.set(row.pipelineId || "__none__", row.pipelineName);
    }
    return [
      { key: "all", label: "All pipelines" },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([key, label]) => ({ key, label })),
    ];
  }, [data?.openLeadsByPipeline, data?.openDealsByPipeline]);

  const selectedLeadStages = useMemo(() => {
    const rows = data?.openLeadsByPipeline ?? [];
    if (pipelineKey === "all") {
      const stageMap = new Map<string, number>();
      for (const p of rows) {
        for (const s of p.stages) {
          stageMap.set(s.stage, (stageMap.get(s.stage) || 0) + s.count);
        }
      }
      return [...stageMap.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count);
    }
    const match = rows.find((p) => (p.pipelineId || "__none__") === pipelineKey);
    return match?.stages ?? [];
  }, [data?.openLeadsByPipeline, pipelineKey]);

  const selectedDealStages = useMemo(() => {
    const rows = data?.openDealsByPipeline ?? [];
    if (pipelineKey === "all") {
      const stageMap = new Map<string, number>();
      for (const p of rows) {
        for (const s of p.stages) {
          stageMap.set(s.stage, (stageMap.get(s.stage) || 0) + s.count);
        }
      }
      return [...stageMap.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count);
    }
    const match = rows.find((p) => (p.pipelineId || "__none__") === pipelineKey);
    return match?.stages ?? [];
  }, [data?.openDealsByPipeline, pipelineKey]);

  const emailPie = useMemo(() => {
    const s = data?.emailEngagementSummary;
    if (!s || s.sends <= 0) return null;
    return {
      opens: [
        { name: "Opened", value: s.opened, color: "#16a34a" },
        { name: "Not opened", value: s.notOpened, color: "#cbd5e1" },
      ],
      clicks: [
        { name: "Clicked", value: s.clicked, color: "#7c3aed" },
        { name: "No click", value: s.notClicked, color: "#e2e8f0" },
      ],
      replies: [
        { name: "Replied", value: s.replies, color: "#0ea5e9" },
        { name: "No reply", value: s.noReply, color: "#f1f5f9" },
      ],
    };
  }, [data?.emailEngagementSummary]);

  const STAGE_COLORS = [
    "#2563eb",
    "#0ea5e9",
    "#14b8a6",
    "#22c55e",
    "#eab308",
    "#f97316",
    "#ef4444",
    "#a855f7",
    "#64748b",
    "#475569",
  ];

  return (
    <section
      className={`rounded-[28px] border border-[#ebecf0] bg-card/90 shadow-sm overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface-dim/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-[3px] bg-primary/10 text-primary shrink-0">
            <BarChart3 size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-main tracking-tight">
              Pipeline &amp; email insights
            </h2>
            <p className="text-xs text-text-muted font-medium truncate">
              Pipeline, outreach &amp; follow-up — calls, tasks, emails, and touch coverage on open leads
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/crm/reports"
            className="text-xs font-bold uppercase tracking-wider text-primary hover:underline px-2"
            onClick={(e) => e.stopPropagation()}
          >
            Full reports
          </Link>
          {open ? <ChevronUp size={18} className="text-text-muted" /> : <ChevronDown size={18} className="text-text-muted" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-50">
          <div className="flex flex-wrap items-center gap-3 pt-4">
            {!pinnedFilters && (
              <>
                <select
                  className="bg-surface-dim border border-border/60 rounded-[3px] px-3 py-2 text-xs font-bold text-text-main outline-none"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                >
                  <option value="15">Last 15 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="75">Last 75 days</option>
                  <option value="100">Last 100 days</option>
                </select>
                <select
                  className="bg-surface-dim border border-border/60 rounded-[3px] px-3 py-2 text-xs font-bold text-text-main outline-none min-w-[140px]"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="All">All owners</option>
                  {owners.map((o) => (
                    <option
                      key={o._id}
                      value={`${o.firstName} ${o.lastName}`.trim()}
                    >
                      {o.firstName} {o.lastName}
                    </option>
                  ))}
                </select>
              </>
            )}
            {loading && (
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Loading…
              </span>
            )}
          </div>

          {!data && !loading && (
            <p className="text-sm text-text-muted">Could not load insights.</p>
          )}

          {data && (
            <>
              <p className="text-xs text-text-muted leading-relaxed">{data.emailEngagementNote}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatPill
                  label="Leads created"
                  value={data.leadConversion.createdInPeriod}
                  icon={<Users size={14} />}
                />
                <StatPill
                  label="Converted"
                  value={`${data.leadConversion.convertedInPeriod} (${data.leadConversion.conversionRate}%)`}
                  icon={<TrendingUp size={14} />}
                />
                <StatPill
                  label="New deals"
                  value={data.dealsCreatedInPeriod}
                  icon={<BarChart3 size={14} />}
                />
                <StatPill
                  label="New clients"
                  value={data.clientsCreatedInPeriod}
                  icon={<Mail size={14} />}
                />
              </div>

              <div className="rounded-[3px] border border-[#ebecf0] bg-surface-dim/20 p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted">
                      Pipeline stage breakdown
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      Open leads and deals by stage — filter by pipeline to see funnel shape.
                    </p>
                  </div>
                  <select
                    className="h-9 min-w-[180px] rounded-[3px] border border-border/60 bg-white px-3 text-xs font-bold text-text-main outline-none"
                    value={pipelineKey}
                    onChange={(e) => setPipelineKey(e.target.value)}
                  >
                    {pipelineOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PipelineStageChart
                    title="Open leads by stage"
                    subtitle={pipelineKey === "all" ? "All pipelines combined" : pipelineOptions.find((p) => p.key === pipelineKey)?.label}
                    rows={selectedLeadStages}
                    colors={STAGE_COLORS}
                    emptyMessage="No open leads in this view"
                  />
                  <PipelineStageChart
                    title="Open deals by stage"
                    subtitle={pipelineKey === "all" ? "All pipelines combined" : pipelineOptions.find((p) => p.key === pipelineKey)?.label}
                    rows={selectedDealStages}
                    colors={STAGE_COLORS}
                    emptyMessage="No open deals in this view"
                  />
                </div>
              </div>

              {emailPie && data?.emailEngagementSummary && (
                <div className="rounded-[3px] border border-[#ebecf0] bg-surface-dim/20 p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted">
                      Email outreach breakdown
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      Tracked sends in period: {data.emailEngagementSummary.sends} · Open rate{" "}
                      {data.emailEngagementSummary.openRatePercent}% · Click rate{" "}
                      {data.emailEngagementSummary.clickRatePercent}% · Reply rate{" "}
                      {data.emailEngagementSummary.replyRatePercent}%
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <EngagementDonut title="Opens" data={emailPie.opens} centerLabel={`${data.emailEngagementSummary.openRatePercent}%`} />
                    <EngagementDonut title="Clicks" data={emailPie.clicks} centerLabel={`${data.emailEngagementSummary.clickRatePercent}%`} />
                    <EngagementDonut title="Replies" data={emailPie.replies} centerLabel={`${data.emailEngagementSummary.replyRatePercent}%`} />
                  </div>
                </div>
              )}

              {data.followUpHealth != null && data.engagementByDay != null && (
                <div className="pt-4 border-t border-[#ebecf0] space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-primary mb-1 flex items-center gap-2">
                      <Activity size={14} className="shrink-0" />
                      Engagement &amp; follow-up discipline
                    </h3>
                    <div className="rounded-[3px] border border-[var(--hs-link)] bg-[var(--hs-link)]/5 p-4 mb-4">
                      <h4 className="text-sm font-bold text-[var(--hs-link)] mb-1">Outreach Health</h4>
                      <p className="text-xs text-text-main leading-relaxed">
                        Currently, <span className="font-bold">{data.followUpHealth.touchCoveragePercent}%</span> of open leads have been touched recently, leaving <span className="font-bold">{data.followUpHealth.staleLeads}</span> leads stale for more than {data.followUpHealth.staleDays} days. Ensure sales representatives are utilizing active templates to increase touch coverage across all {data.followUpHealth.openLeads} active leads.
                        {data.engagementNote && <span className="ml-1 text-text-muted">{data.engagementNote}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatPill
                      label="Human touches (period)"
                      value={data.totalHumanTouches ?? 0}
                      icon={<Activity size={14} />}
                    />
                    <StatPill
                      label="Tracked email sends"
                      value={data.outreachTrackedSends ?? 0}
                      icon={<Send size={14} />}
                    />
                    <StatPill
                      label={`Open leads touched (${data.followUpHealth.staleDays}d)`}
                      value={`${data.followUpHealth.touchCoveragePercent}%`}
                      icon={<TrendingUp size={14} />}
                    />
                    <StatPill
                      label="Open leads — no recent touch"
                      value={data.followUpHealth.staleLeads}
                      icon={<AlertTriangle size={14} />}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-surface-dim/30 rounded-[3px] border border-[#ebecf0] p-5 flex flex-col items-center justify-center">
                      <h3 className="text-xs font-semibold text-text-muted mb-4 self-start w-full text-center">Touch Coverage (Venn)</h3>
                      <CrmVennDiagram
                        setA={{ label: "Open Leads", value: data.followUpHealth.openLeads, color: "#3b82f6" }}
                        setB={{ label: "Touched", value: data.totalHumanTouches ?? 0, color: "#10b981" }}
                        intersection={{ label: "Recently Touched", value: data.followUpHealth.leadsTouchedRecently }}
                        height={200}
                      />
                    </div>
                    <div className="flex flex-col justify-center space-y-4">
                      <p className="text-xs text-text-muted">
                        Open leads: {data.followUpHealth.openLeads}. Recently touched:{" "}
                        {data.followUpHealth.leadsTouchedRecently}. Stale (no activity in {data.followUpHealth.staleDays}{" "}
                        days): {data.followUpHealth.staleLeads}.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-xs font-semibold text-text-muted mb-2">
                        Logged touches by day
                      </h3>
                      <div className="h-[180px] w-full">
                        {data.engagementByDay.length === 0 ? (
                          <EmptyChart message="No activities in range" />
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.engagementByDay}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                allowDecimals={false}
                                domain={[0, maxEngagementDay] as [number, number]}
                              />
                              <Tooltip />
                              <Bar
                                dataKey="count"
                                fill="rgb(99, 102, 241)"
                                radius={[6, 6, 0, 0]}
                                name="Activities"
                              >
                                <LabelList dataKey="count" position="top" fill="var(--text-muted)" fontSize={10} formatter={(v: any) => v || ""} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-text-muted mb-2">
                        Touches by activity type
                      </h3>
                      <div className="rounded-[3px] border border-[#ebecf0] overflow-hidden max-h-[180px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs">
                          <thead className="bg-surface-dim/80 sticky top-0">
                            <tr className="text-left text-text-muted font-black uppercase tracking-tighter">
                              <th className="px-3 py-2">Type</th>
                              <th className="px-3 py-2 text-right">Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.engagementByType ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={2} className="px-3 py-6 text-center text-text-muted">
                                  No data
                                </td>
                              </tr>
                            ) : (
                              data.engagementByType!.map((row) => (
                                <tr key={row.type} className="border-t border-slate-50">
                                  <td className="px-3 py-2 font-medium text-text-main">{row.type}</td>
                                  <td className="px-3 py-2 text-right font-bold">{row.count}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <MiniTable
                      title="Effort by record"
                      col1="Record"
                      rows={(data.engagementByRelatedType ?? []).map((r, i) => ({
                        key: `${r.relatedType}-${i}`,
                        a: r.relatedType,
                        b: `${r.count} touches`,
                      }))}
                      empty="No activities"
                    />
                    <MiniTable
                      title="Team follow-up volume"
                      col1="Team member"
                      rows={(data.engagementByAuthor ?? []).map((r) => ({
                        key: r.authorId || r.name,
                        a: r.name,
                        b: `${r.count} activities`,
                      }))}
                      empty="No activities"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Leads added by day
                  </h3>
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    <div className="rounded-[3px] bg-blue-50/80 px-2.5 py-1.5">
                      <p className="text-[9px] font-black uppercase tracking-wider text-blue-700/70">Total</p>
                      <p className="text-sm font-bold tabular-nums text-blue-700">{leadsAddedStats.total}</p>
                    </div>
                    <div className="rounded-[3px] bg-[#f4f5f7] px-2.5 py-1.5">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Avg / day</p>
                      <p className="text-sm font-bold tabular-nums text-slate-700">{leadsAddedStats.avg}</p>
                    </div>
                    <div className="rounded-[3px] bg-amber-50/80 px-2.5 py-1.5">
                      <p className="text-[9px] font-black uppercase tracking-wider text-amber-700/70">Peak</p>
                      <p className="text-[11px] font-bold text-amber-700 leading-tight">{leadsAddedStats.peakLabel}</p>
                    </div>
                  </div>
                  <div className="h-[220px] w-full">
                    {leadsAddedByDay.length === 0 ? (
                      <EmptyChart />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={leadsAddedByDay} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, maxLeadsDay] as [number, number]} />
                          <Tooltip
                            labelFormatter={(_, payload) => {
                              const row = payload?.[0]?.payload as { weekday?: string; label?: string } | undefined;
                              return row ? `${row.weekday || ""} ${row.label || ""}`.trim() : "";
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <ReferenceLine y={leadsAddedStats.avg} stroke="#94a3b8" strokeDasharray="4 4" />
                          <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]} barSize={leadsAddedByDay.length > 20 ? 8 : 14}>
                            {leadsAddedByDay.map((row, i) => (
                              <Cell key={i} fill={row.isPeak ? "#f59e0b" : "#3b82f6"} fillOpacity={row.count === 0 ? 0.2 : 0.9} />
                            ))}
                            <LabelList dataKey="count" position="top" fill="var(--text-muted)" fontSize={9} formatter={(v: any) => v || ""} />
                          </Bar>
                          <Line type="monotone" dataKey="rollingAvg" name="7-day avg" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Leads vs outreach funnel by day
                  </h3>
                  <div className="h-[260px] w-full">
                    {funnelByDay.every(
                      (d) =>
                        d.leads === 0 &&
                        d.sends === 0 &&
                        d.opens === 0 &&
                        d.replies === 0 &&
                        d.touches === 0,
                    ) ? (
                      <EmptyChart message="No leads or outreach activity in this range" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={funnelByDay}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            allowDecimals={false}
                            domain={[0, maxFunnelDay] as [number, number]}
                          />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="leads" name="Leads added" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="sends" name="Email sends" stroke="#6366f1" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="opens" name="Email opens" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="replies" name="Email replies" stroke="#7c3aed" strokeWidth={2} dot={false} />
                          <Line
                            type="monotone"
                            dataKey="touches"
                            name="Touches"
                            stroke="#64748b"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Reply by follow-up # (avg {data.followUpReplyAnalytics?.avgFollowUpsAtReply ?? 0} follow-ups)
                  </h3>
                  <p className="text-[11px] text-text-muted mb-2">
                    Avg sends at reply: {data.followUpReplyAnalytics?.avgSendsAtReply ?? 0} ·{" "}
                    {data.followUpReplyAnalytics?.repliedConversations ?? 0} replied conversations
                  </p>
                  <div className="h-[240px] w-full">
                    {(data.followUpReplyAnalytics?.repliesByAttempt ?? []).length === 0 ? (
                      <EmptyChart message="No thread-matched replies in this range" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.followUpReplyAnalytics?.repliesByAttempt ?? []}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-16} textAnchor="end" height={52} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="replies" fill="rgb(124, 58, 237)" radius={[6, 6, 0, 0]} name="Replies">
                            <LabelList
                              dataKey="replies"
                              position="top"
                              fill="var(--text-muted)"
                              fontSize={10}
                              formatter={(v: any) => v || ""}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {data.followUpReplyAnalytics?.note && (
                    <p className="text-[10px] text-text-muted mt-2 leading-relaxed">
                      {data.followUpReplyAnalytics.note}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Channel performance (leads / replies / deals)
                  </h3>
                  <div className="h-[260px] w-full">
                    {(data.channelPerformance ?? []).length === 0 ? (
                      <EmptyChart message="No channel data in this range — check Lead Source / opportunity platform on new leads" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(data.channelPerformance ?? [])
                            .filter((r) => r && typeof r.channel === "string")
                            .slice(0, 8)
                            .map((r) => {
                              const channel = r.channel || "Unknown";
                              return {
                                ...r,
                                channel,
                                name: channel.length > 14 ? `${channel.slice(0, 12)}…` : channel,
                              };
                            })}
                          barGap={3}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip
                            labelFormatter={(_, payload) =>
                              payload?.[0]?.payload?.channel
                                ? String(payload[0].payload.channel)
                                : ""
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="leads" fill="#3b82f6" name="Leads" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="replies" fill="#7c3aed" name="Replies" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="deals" fill="#10b981" name="Deals" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {(data.channelPerformance ?? []).length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-[3px] border border-[#ebecf0]">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-surface-dim/60 text-text-muted uppercase tracking-wider">
                          <tr>
                            <th className="px-3 py-2 font-bold">Channel</th>
                            <th className="px-3 py-2 font-bold">Leads</th>
                            <th className="px-3 py-2 font-bold">Replies</th>
                            <th className="px-3 py-2 font-bold">Deals</th>
                            <th className="px-3 py-2 font-bold">Conv %</th>
                            <th className="px-3 py-2 font-bold">Reply %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.channelPerformance ?? []).slice(0, 10).map((row) => (
                            <tr key={row.channel} className="border-t border-[#ebecf0]">
                              <td className="px-3 py-2 font-semibold text-text-main">{row.channel}</td>
                              <td className="px-3 py-2 tabular-nums">{row.leads}</td>
                              <td className="px-3 py-2 tabular-nums">{row.replies}</td>
                              <td className="px-3 py-2 tabular-nums">{row.deals}</td>
                              <td className="px-3 py-2 tabular-nums">{row.conversionRate}%</td>
                              <td className="px-3 py-2 tabular-nums">{row.replyRate}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Opens by day (tracked sends)
                  </h3>
                  <div className="h-[200px] w-full">
                    {data.emailOpensByDay.length === 0 ? (
                      <EmptyChart message="No opens in this range" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.emailOpensByDay}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, maxOpenDay] as [number, number]} />
                          <Tooltip />
                          <Bar dataKey="sendsOpened" fill="rgb(16, 185, 129)" radius={[6, 6, 0, 0]} name="Sends opened">
                            <LabelList dataKey="sendsOpened" position="top" fill="var(--text-muted)" fontSize={10} formatter={(v: any) => v || ""} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Replies by day (thread replies)
                  </h3>
                  <div className="h-[200px] w-full">
                    {(data.emailRepliesByDay ?? []).length === 0 ? (
                      <EmptyChart message="No replies in this range" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.emailRepliesByDay}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, maxReplyDay] as [number, number]} />
                          <Tooltip />
                          <Bar dataKey="repliesReceived" fill="rgb(124, 58, 237)" radius={[6, 6, 0, 0]} name="Replies">
                            <LabelList dataKey="repliesReceived" position="top" fill="var(--text-muted)" fontSize={10} formatter={(v: any) => v || ""} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Leads by owner
                  </h3>
                  <div className="rounded-[3px] border border-[#ebecf0] overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-dim/80 sticky top-0">
                        <tr className="text-left text-text-muted font-black uppercase tracking-tighter">
                          <th className="px-3 py-2">Owner</th>
                          <th className="px-3 py-2 text-right">Leads</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.leadsByOwner.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-6 text-center text-text-muted">
                              No leads in range
                            </td>
                          </tr>
                        ) : (
                          data.leadsByOwner.map((row) => (
                            <tr key={row.owner} className="border-t border-slate-50">
                              <td className="px-3 py-2 font-medium text-text-main truncate max-w-[200px]">
                                {row.owner}
                              </td>
                              <td className="px-3 py-2 text-right font-bold">{row.count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-2">
                    Volume &amp; engagement by address
                  </h3>
                  <div className="rounded-[3px] border border-[#ebecf0] overflow-hidden max-h-[280px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-dim/80 sticky top-0">
                        <tr className="text-left text-text-muted font-black uppercase tracking-tighter">
                          <th className="px-3 py-2">From</th>
                          <th className="px-3 py-2 text-right">Sends</th>
                          <th className="px-3 py-2 text-right">Opened</th>
                          <th className="px-3 py-2 text-right">Open %</th>
                          <th className="px-3 py-2 text-right">Not opened</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.emailByFromAddress.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                              No tracked sends
                            </td>
                          </tr>
                        ) : (
                          [...data.emailByFromAddress]
                            .sort((a, b) => b.sends - a.sends)
                            .map((row) => {
                              const openRate =
                                row.sends > 0
                                  ? Math.round((row.uniqueOpened / row.sends) * 1000) / 10
                                  : 0;
                              return (
                                <tr key={row.fromEmail} className="border-t border-slate-50">
                                  <td
                                    className="px-3 py-2 font-medium text-text-main truncate max-w-[160px]"
                                    title={row.fromEmail}
                                  >
                                    {row.fromEmail}
                                  </td>
                                  <td className="px-3 py-2 text-right text-text-muted tabular-nums">
                                    {row.sends}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-emerald-600 tabular-nums">
                                    {row.uniqueOpened}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                                    <span
                                      className={
                                        openRate >= 25
                                          ? "text-emerald-600"
                                          : openRate >= 15
                                            ? "text-amber-600"
                                            : "text-rose-600"
                                      }
                                    >
                                      {openRate}%
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-rose-600 tabular-nums">
                                    {Math.max(0, row.sends - row.uniqueOpened)}
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-[3px] border border-[#ebecf0] bg-white p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-xs font-bold text-text-main">Recipient engagement</h4>
                      <p className="text-[10px] text-text-muted mt-0.5">Top recipient addresses by unique opens</p>
                    </div>
                  </div>
                  <div className="h-[280px] w-full">
                    {(data.emailByRecipient ?? []).length === 0 ? (
                      <EmptyChart message="No recipients in range" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={[...data.emailByRecipient]
                            .sort((a, b) => b.uniqueOpened - a.uniqueOpened || b.sends - a.sends)
                            .slice(0, 8)
                            .map((r) => {
                              const local = r.recipient.split("@")[0] || r.recipient;
                              const domain = r.recipient.split("@")[1] || "";
                              return {
                                ...r,
                                short:
                                  domain.length > 0
                                    ? `${local.length > 8 ? `${local.slice(0, 6)}…` : local}@${domain.length > 10 ? `${domain.slice(0, 8)}…` : domain}`
                                    : local.slice(0, 14),
                                openRate:
                                  r.sends > 0
                                    ? Math.round((r.uniqueOpened / r.sends) * 1000) / 10
                                    : 0,
                              };
                            })}
                          layout="vertical"
                          margin={{ left: 2, right: 16, top: 8, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-100" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <XAxis
                            xAxisId="rate"
                            type="number"
                            orientation="top"
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                            tick={{ fontSize: 9, fill: "#d97706" }}
                          />
                          <YAxis type="category" dataKey="short" width={108} tick={{ fontSize: 9, fontWeight: 600 }} />
                          <Tooltip
                            labelFormatter={(_, payload) =>
                              payload?.[0]?.payload?.recipient
                                ? String(payload[0].payload.recipient)
                                : ""
                            }
                            formatter={(value, name) =>
                              name === "Open rate %" ? [`${value}%`, name] : [value, name]
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="sends" name="Sends" fill="#94a3b8" radius={[0, 5, 5, 0]} barSize={10} />
                          <Bar dataKey="uniqueOpened" name="Unique opens" fill="#10b981" radius={[0, 5, 5, 0]} barSize={10} />
                          <Line
                            xAxisId="rate"
                            type="monotone"
                            dataKey="openRate"
                            name="Open rate %"
                            stroke="#d97706"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "#d97706", strokeWidth: 0 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div className="rounded-[3px] border border-[#ebecf0] bg-white p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-xs font-bold text-text-main">Engagement by sending domain</h4>
                      <p className="text-[10px] text-text-muted mt-0.5">From-address domains rolled up</p>
                    </div>
                  </div>
                  <div className="h-[280px] w-full">
                    {(() => {
                      const map = new Map<string, { domain: string; sends: number; opens: number }>();
                      for (const row of data.emailByFromAddress ?? []) {
                        const domain = (row.fromEmail.split("@")[1] || "unknown").toLowerCase();
                        const existing = map.get(domain) || { domain, sends: 0, opens: 0 };
                        existing.sends += row.sends;
                        existing.opens += row.uniqueOpened;
                        map.set(domain, existing);
                      }
                      const rows = [...map.values()]
                        .map((r) => ({
                          ...r,
                          short: r.domain.length > 16 ? `${r.domain.slice(0, 14)}…` : r.domain,
                          openRate: r.sends > 0 ? Math.round((r.opens / r.sends) * 1000) / 10 : 0,
                        }))
                        .sort((a, b) => b.sends - a.sends)
                        .slice(0, 8);
                      if (!rows.length) return <EmptyChart message="No domain data" />;
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={rows} layout="vertical" margin={{ left: 2, right: 16, top: 8, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-100" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                            <XAxis
                              xAxisId="rate"
                              type="number"
                              orientation="top"
                              domain={[0, 100]}
                              tickFormatter={(v) => `${v}%`}
                              tick={{ fontSize: 9, fill: "#7c3aed" }}
                            />
                            <YAxis type="category" dataKey="short" width={100} tick={{ fontSize: 10, fontWeight: 600 }} />
                            <Tooltip
                              labelFormatter={(_, payload) =>
                                payload?.[0]?.payload?.domain
                                  ? `@${String(payload[0].payload.domain)}`
                                  : ""
                              }
                              formatter={(value, name) =>
                                name === "Open rate %" ? [`${value}%`, name] : [value, name]
                              }
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="sends" name="Sends" fill="#4f46e5" radius={[0, 5, 5, 0]} barSize={10} />
                            <Bar dataKey="opens" name="Unique opens" fill="#059669" radius={[0, 5, 5, 0]} barSize={10} />
                            <Line
                              xAxisId="rate"
                              type="monotone"
                              dataKey="openRate"
                              name="Open rate %"
                              stroke="#7c3aed"
                              strokeWidth={2}
                              dot={{ r: 3, fill: "#7c3aed", strokeWidth: 0 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <MiniTable
                title="Templates & manual sends"
                col1="Template"
                rows={data.emailByTemplate.map((r, i) => ({
                  key: `${r.templateId || r.templateName}-${i}`,
                  a: r.templateName,
                  b: `${r.uniqueOpened} open / ${r.sends} send · ${r.uniqueClicked} click`,
                }))}
                empty="No email data"
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[3px] border border-[#ebecf0] bg-surface-dim/40 px-3 py-3 flex items-start gap-2">
      <span className="text-primary mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-text-main truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyChart({ message = "No data in range" }: { message?: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-text-muted border border-dashed border-[#dfe1e6] rounded-[3px]">
      {message}
    </div>
  );
}

function MiniTable({
  title,
  col1,
  rows,
  empty,
}: {
  title: string;
  col1: string;
  rows: Array<{ key: string; a: string; b: string }>;
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-text-muted mb-2">{title}</h3>
      <div className="rounded-[3px] border border-[#ebecf0] overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="bg-surface-dim/80 sticky top-0">
            <tr className="text-left text-text-muted font-black uppercase tracking-tighter">
              <th className="px-3 py-2">{col1}</th>
              <th className="px-3 py-2 text-right">Performance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-50">
                  <td className="px-3 py-2 font-medium text-text-main truncate max-w-[200px]">{r.a}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{r.b}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PipelineStageChart({
  title,
  subtitle,
  rows,
  colors,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  rows: Array<{ stage: string; count: number }>;
  colors: string[];
  emptyMessage: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const chartData = rows.map((r, i) => {
    const percent = total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0;
    return {
      name: r.stage.length > 20 ? `${r.stage.slice(0, 18)}…` : r.stage,
      fullStage: r.stage,
      count: r.count,
      percent,
      label: `${r.count} (${percent}%)`,
      color: colors[i % colors.length],
    };
  });
  const max = Math.max(1, ...chartData.map((r) => r.count));
  const chartHeight = Math.min(360, Math.max(220, chartData.length * 34 + 24));

  return (
    <div className="rounded-[3px] border border-[#ebecf0] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-text-main">{title}</h4>
          {subtitle ? <p className="text-[10px] text-text-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {total > 0 ? (
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            {total} total
          </p>
        ) : null}
      </div>
      <div className="w-full mt-3" style={{ height: chartHeight }}>
        {chartData.length === 0 ? (
          <EmptyChart message={emptyMessage} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 52, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="stroke-slate-100" />
              <XAxis type="number" domain={[0, max]} tick={{ fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value, _name, item) => {
                  const pct = (item?.payload as { percent?: number } | undefined)?.percent ?? 0;
                  return [`${value} (${pct}%)`, "Count"];
                }}
                labelFormatter={(_, payload) =>
                  (payload?.[0]?.payload as { fullStage?: string })?.fullStage || ""
                }
              />
              <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18} background={{ fill: "#f8fafc" }}>
                {chartData.map((row, i) => (
                  <Cell key={i} fill={row.color} />
                ))}
                <LabelList dataKey="label" position="right" fontSize={10} fontWeight={700} fill="#475569" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function EngagementDonut({
  title,
  data,
  centerLabel,
}: {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
  centerLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-[3px] border border-[#ebecf0] bg-white p-4">
      <p className="text-xs font-bold text-text-main text-center">{title}</p>
      <div className="relative h-[180px] w-full">
        {total <= 0 ? (
          <EmptyChart message="No sends" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any, name: any) => [v, name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8">
              <span className="text-sm font-bold text-text-main">{centerLabel}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
