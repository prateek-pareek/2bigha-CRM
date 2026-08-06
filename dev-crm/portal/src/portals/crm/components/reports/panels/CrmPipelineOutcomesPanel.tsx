"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  Cell,
  LabelList,
  FunnelChart,
  Funnel,
  PieChart,
  Pie,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Briefcase, Users, Activity, TrendingUp, HelpCircle, BarChart3, Reply } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel, CrmDropdown } from "@/components/crm/ui";
import { CRM_CHART_PRIMARY, CRM_CHART_SECONDARY, CRM_CHART_SERIES } from "@/lib/crm/shared/chart-theme";
import CrmVennDiagram from "../charts/CrmVennDiagram";

type DealStageRow = { name: string; value: number };
type LeadConv = { total: number; converted: number; rate: number };
type ActRow = { _id: string; count: number };
type Pipeline = { _id: string; name: string };
type OwnerRow = { owner: string; count: number };
type UserBrief = { _id: string; firstName: string; lastName: string };
type PipelineVolumeRow = { name: string; total: number };
type FollowUpReplyStats = {
  avgFollowUpsAtReply: number;
  repliedConversations: number;
  totalFollowUpSendsInPeriod: number;
};

const BAR_COLORS = CRM_CHART_SERIES;

export default function CrmPipelineOutcomesPanel({
  days = "30",
  owner = "All",
}: {
  days?: string;
  owner?: string;
}) {
  const [deals, setDeals] = useState<DealStageRow[]>([]);
  const [leads, setLeads] = useState<LeadConv | null>(null);
  const [acts, setActs] = useState<ActRow[]>([]);
  const [leadsByOwner, setLeadsByOwner] = useState<OwnerRow[]>([]);
  const [dealsByOwner, setDealsByOwner] = useState<OwnerRow[]>([]);
  const [dealsByPipeline, setDealsByPipeline] = useState<PipelineVolumeRow[]>([]);
  const [followUpStats, setFollowUpStats] = useState<FollowUpReplyStats | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [pipelineId, setPipelineId] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState(owner);

  useEffect(() => {
    setOwnerFilter(owner);
  }, [owner]);

  useEffect(() => {
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, { headers }),
      fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, { headers })
    ])
      .then(async ([pRes, uRes]) => {
        if (pRes.ok) setPipelines(await pRes.json());
        if (uRes.ok) setUsers(await uRes.json());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    (async () => {
      setLoading(true);
      const f: string[] = [];
      const queryParams = new URLSearchParams();
      if (pipelineId && pipelineId !== "all") {
        queryParams.set("pipeline", pipelineId);
      }
      if (ownerFilter && ownerFilter !== "All") {
        queryParams.set("owner", ownerFilter);
      }
      if (days) queryParams.set("days", days);
      try {
        const [dRes, lRes, aRes, bRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/reports/deals?${queryParams.toString()}`, { headers }),
          fetch(`${CRM_API_URL}/crm/reports/leads?${queryParams.toString()}`, { headers }),
          fetch(`${CRM_API_URL}/crm/reports/activities?${queryParams.toString()}`, { headers }),
          fetch(`${CRM_API_URL}/crm/reports/board?${queryParams.toString()}`, { headers }),
        ]);
        if (dRes.ok) {
          const j = await dRes.json();
          setDeals(Array.isArray(j) ? j : []);
        } else f.push("deals");
        if (lRes.ok) setLeads(await lRes.json());
        else f.push("leads");
        if (aRes.ok) {
          const j = await aRes.json();
          setActs(Array.isArray(j) ? j : []);
        } else f.push("activities");
        if (bRes.ok) {
          const j = await bRes.json();
          setLeadsByOwner(Array.isArray(j.leadsByOwner) ? j.leadsByOwner.slice(0, 8) : []);
          setDealsByOwner(Array.isArray(j.dealsByOwner) ? j.dealsByOwner.slice(0, 8) : []);
          setDealsByPipeline(
            Array.isArray(j.openDealsByPipeline)
              ? j.openDealsByPipeline
                  .map((p: { pipelineName?: string; total?: number }) => ({
                    name: p.pipelineName || "Unassigned",
                    total: Number(p.total) || 0,
                  }))
                  .sort((a: PipelineVolumeRow, b: PipelineVolumeRow) => b.total - a.total)
                  .slice(0, 8)
              : [],
          );
          setFollowUpStats(j.followUpReplyAnalytics ?? null);
        } else f.push("board");
      } catch {
        f.push("network");
      }
      setFailed(f);
      setLoading(false);
    })();
  }, [pipelineId, ownerFilter, days]);

  if (loading) {
    return (
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 animate-pulse">
        <div className="h-72 rounded-xl bg-slate-100 border border-[#e2e8f0]" />
        <div className="h-72 rounded-xl bg-slate-100 border border-[#e2e8f0]" />
        <div className="h-72 rounded-xl bg-slate-100 border border-[#e2e8f0]" />
        <div className="h-72 rounded-xl bg-slate-100 border border-[#e2e8f0]" />
      </div>
    );
  }

  const actTotal = acts.reduce((s, r) => s + (r.count || 0), 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Filter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div className="flex flex-wrap items-center gap-3">
          {pipelines.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">Pipeline:</span>
              <CrmDropdown
                value={pipelineId}
                onChange={setPipelineId}
                options={[
                  { value: "all", label: "All pipelines" },
                  ...pipelines.map((p) => ({ value: p._id, label: p.name })),
                ]}
              />
            </div>
          )}

          {users.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">Employee:</span>
              <CrmDropdown
                value={ownerFilter}
                onChange={setOwnerFilter}
                options={[
                  { value: "All", label: "All employees" },
                  ...users.map((u) => ({
                    value: `${u.firstName} ${u.lastName}`.trim(),
                    label: `${u.firstName} ${u.lastName}`,
                  })),
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {failed.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Some sections could not load (permissions or network). Missing: {failed.join(", ")}.
        </p>
      )}

      {/* 2x2 Grid with Reference UI Design Styling */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        
        {/* Lead Conversion Card */}
        <div className="flex flex-col justify-between rounded-xl border border-[#e2e8f0] bg-white p-5 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xl font-bold tracking-tight text-[#1e293b] flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dcfce7] text-[#15803d]">
                <Users className="h-4 w-4" />
              </div>
              <span>Lead Conversion</span>
            </h3>
          </div>
          {leads ? (
            <>
              <div className="flex items-baseline gap-2 my-1">
                <span className="text-4xl font-bold tracking-tight text-[#1e293b] leading-[26px]">
                  {leads.rate != null ? `${Math.round(leads.rate * 10) / 10}%` : "—"}
                </span>
                <TrendingUp className="h-4 w-4 text-[#10b981]" />
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                <span className="font-bold text-slate-800">{leads.converted ?? 0}</span> converted ·{" "}
                <span className="font-bold text-slate-800">{leads.total ?? 0}</span> in pipeline
              </p>
              
              <div className="mt-4 border-t border-[#f1f5f9] pt-3">
                <CrmVennDiagram
                  height={170}
                  setA={{ label: "All Leads", value: leads.total || 0, color: CRM_CHART_PRIMARY }}
                  setB={{ label: "Converted", value: leads.converted || 0, color: CRM_CHART_SECONDARY }}
                  intersection={{ label: "Won", value: leads.converted || 0 }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">No lead snapshot available.</p>
          )}
        </div>

        {/* Open Deals by Stage Funnel Card */}
        <div className="flex flex-col justify-between lg:col-span-2 rounded-xl border border-border bg-card p-5 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <span>Deals By Stage</span>
            </h3>
            {pipelines.length > 0 && (
              <select
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-text-primary shadow-xs outline-none hover:border-primary/40"
              >
                <option value="all">Sales Pipeline</option>
                {pipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {deals.length === 0 ? (
            <p className="text-sm text-text-muted py-12 text-center">No deal pipeline data yet.</p>
          ) : (
            <div className="h-[240px] sm:h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[...deals].sort((a, b) => b.value - a.value)}
                  margin={{ top: 16, right: 12, left: -16, bottom: 8 }}
                  barSize={36}
                >
                  <defs>
                    <linearGradient id="colorDealsByStage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CRM_CHART_PRIMARY} stopOpacity={1} />
                      <stop offset="100%" stopColor={CRM_CHART_SECONDARY} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-text-primary)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--color-secondary)', opacity: 0.6 }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: "var(--color-card)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <Bar dataKey="value" name="Deals" fill="url(#colorDealsByStage)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" fill={CRM_CHART_PRIMARY} fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {followUpStats && (
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
            <Reply className="h-4 w-4 text-primary" />
            Follow-up reply effectiveness
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-text-main">
              {followUpStats.avgFollowUpsAtReply != null
                ? followUpStats.avgFollowUpsAtReply.toFixed(1)
                : "—"}
            </span>
            <span className="text-xs text-text-muted">avg follow-ups before reply</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-text-main">
              {followUpStats.totalFollowUpSendsInPeriod > 0
                ? `${Math.round(
                    (followUpStats.repliedConversations / followUpStats.totalFollowUpSendsInPeriod) * 1000,
                  ) / 10}%`
                : "—"}
            </span>
            <span className="text-xs text-text-muted">
              reply rate ({followUpStats.repliedConversations} of {followUpStats.totalFollowUpSendsInPeriod} follow-ups)
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <CrmChartPanel title="Top Closers (Deals by Employee)" icon={<BarChart3 className="h-4 w-4" />} bodyClassName="pt-0">
          {dealsByOwner.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No deal assignment data available.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsByOwner} margin={{ left: -16, right: 0, top: 16, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="colorDealsByOwner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CRM_CHART_PRIMARY} stopOpacity={1}/>
                      <stop offset="100%" stopColor={CRM_CHART_SECONDARY} stopOpacity={0.85}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-border)" opacity={0.6} />
                  <XAxis dataKey="owner" tick={{ fontSize: 11, fill: "var(--color-text-primary)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" tick={{ fontSize: 11, fill: "var(--color-text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'var(--color-secondary)', opacity: 0.5}}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: '0 12px 24px -8px rgb(0 0 0 / 0.15)', fontSize: 12, fontWeight: 600, padding: '12px 16px', backgroundColor: 'var(--color-card)', color: 'var(--color-text-primary)' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Bar dataKey="count" fill="url(#colorDealsByOwner)" name="Total Deals" radius={[6, 6, 0, 0]} barSize={26}>
                    <LabelList dataKey="count" position="top" fill={CRM_CHART_PRIMARY} fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CrmChartPanel>

        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>Top Sourcers (Leads by Employee)</span>
            </h3>
          </div>
          {leadsByOwner.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No lead assignment data available.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadsByOwner} margin={{ left: -16, right: 0, top: 16, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="colorLeadsByOwner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CRM_CHART_PRIMARY} stopOpacity={1}/>
                      <stop offset="100%" stopColor={CRM_CHART_SECONDARY} stopOpacity={0.85}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-border)" opacity={0.6} />
                  <XAxis dataKey="owner" tick={{ fontSize: 11, fill: "var(--color-text-primary)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" tick={{ fontSize: 11, fill: "var(--color-text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'var(--color-secondary)', opacity: 0.5}}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: '0 12px 24px -8px rgb(0 0 0 / 0.15)', fontSize: 12, fontWeight: 600, padding: '12px 16px', backgroundColor: 'var(--color-card)', color: 'var(--color-text-primary)' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Bar dataKey="count" fill="url(#colorLeadsByOwner)" name="Total Leads" radius={[6, 6, 0, 0]} barSize={26}>
                    <LabelList dataKey="count" position="top" fill={CRM_CHART_PRIMARY} fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <CrmChartPanel title="Open deals by pipeline" icon={<Briefcase className="h-4 w-4" />} bodyClassName="pt-0">
          {dealsByPipeline.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No pipeline breakdown available.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsByPipeline} margin={{ left: -16, right: 8, top: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-dim)", opacity: 0.5 }}
                    contentStyle={{
                      borderRadius: "16px",
                      border: "none",
                      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "12px 16px",
                      backgroundColor: "rgba(255,255,255,0.95)",
                    }}
                  />
                  <Bar dataKey="total" fill={CRM_CHART_SECONDARY} name="Open deals" radius={[6, 6, 0, 0]} barSize={24}>
                    <LabelList dataKey="total" position="top" fill="#64748b" fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CrmChartPanel>

        <CrmChartPanel title="Deal outcomes vs lead conversion" icon={<TrendingUp className="h-4 w-4" />} bodyClassName="pt-0">
          <div className="grid h-[250px] content-center gap-3 px-2">
            <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Open deals (stage funnel)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-main)]">
                {deals.reduce((s, r) => s + (Number(r.value) || 0), 0)}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Lead conversion rate
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--success)]">
                {leads?.rate != null ? `${Math.round(leads.rate * 10) / 10}%` : "—"}
              </p>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Use pipeline and employee filters above for deeper period analysis. Live closing risk stays on Work → Deals Dashboard.
            </p>
          </div>
        </CrmChartPanel>
      </div>

      <div className="rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-text-muted">
          <Activity className="h-4 w-4 text-primary" />
          CRM activities by type (all time)
        </div>
        {acts.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No activity breakdown yet.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-[250px] w-full border-r-0 lg:border-r border-[#f1f5f9] pr-0 lg:pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={acts.map(r => ({ name: r._id || "Unknown", value: r.count }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={4}
                    label={({ name, percent }) => (percent != null && percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : "")}
                    labelLine={true}
                  >
                    {acts.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)", fontSize: 12, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-bold text-[#1e293b]">
                    <th className="py-3 px-4 font-bold text-[#1e293b]">Type</th>
                    <th className="py-3 px-4 text-right font-bold text-[#1e293b]">Count</th>
                    <th className="py-3 px-4 font-bold text-[#1e293b]">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {[...acts]
                    .sort((a, b) => (b.count || 0) - (a.count || 0))
                    .map((row) => {
                      const pct = actTotal > 0 ? Math.round(((row.count || 0) / actTotal) * 1000) / 10 : 0;
                      return (
                        <tr key={String(row._id)} className="hover:bg-[#f8fafc]/80 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-[#0f172a]">{row._id || "Unknown"}</td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-700">{row.count}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 max-w-[120px] rounded-full bg-[#f1f5f9] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#2563eb]"
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="text-xs text-[#64748b] font-medium tabular-nums w-10">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Health Summary */}
      <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-5 sm:p-6 shadow-sm">
        <h3 className="text-md font-bold text-[#1e40af] mb-2 flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          Pipeline Health Summary
        </h3>
        <p className="text-xs text-slate-700 font-medium leading-relaxed">
          The lead conversion rate is currently sitting at <span className="font-bold text-[#1e40af]">{leads?.rate != null ? `${Math.round(leads?.rate * 10) / 10}%` : "—"}</span>, with <span className="font-bold text-[#1e40af]">{leads?.converted ?? 0}</span> leads successfully transitioning into the deal pipeline. The activity volume indicates <span className="font-bold text-[#1e40af]">{actTotal}</span> total CRM touches across the period. To improve conversion rates, focus on the stages in the <strong>Deals By Stage</strong> chart with the largest drop-offs, and ensure sales agents are balancing their activity mix across multiple channels.
        </p>
      </div>
    </div>
  );
}
