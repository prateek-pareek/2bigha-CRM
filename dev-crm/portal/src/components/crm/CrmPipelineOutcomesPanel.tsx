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
import { Briefcase, Users, Activity, TrendingUp, HelpCircle, BarChart3 } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import CrmVennDiagram from "./CrmVennDiagram";

type DealStageRow = { name: string; value: number };
type LeadConv = { total: number; converted: number; rate: number };
type ActRow = { _id: string; count: number };
type Pipeline = { _id: string; name: string };
type OwnerRow = { owner: string; count: number };
type UserBrief = { _id: string; firstName: string; lastName: string };

const BAR_COLORS = ["var(--hs-link)", "var(--hs-link)", "#425b76", "#16a34a", "#d97706", "#7c3aed"];

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
      .catch(() => {
        // Ignore silent failure for options
      });
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
          fetch(
            `${CRM_API_URL}/crm/reports/activities?${queryParams.toString()}`,
            { headers },
          ),
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
      <div className="grid gap-6 md:grid-cols-2 animate-pulse">
        <div className="h-48 rounded-[3px] bg-surface-dim border border-border" />
        <div className="h-48 rounded-[3px] bg-surface-dim border border-border" />
        <div className="h-64 md:col-span-2 rounded-[3px] bg-surface-dim border border-border" />
      </div>
    );
  }

  const actTotal = acts.reduce((s, r) => s + (r.count || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4">
        {pipelines.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-muted">Pipeline:</span>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="h-9 rounded-[3px] border border-input bg-surface px-3 py-1 text-sm text-text-main shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All pipelines</option>
              {pipelines.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {users.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-muted">Employee:</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="h-9 rounded-[3px] border border-input bg-surface px-3 py-1 text-sm text-text-main shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="All">All employees</option>
              {users.map((u) => (
                <option key={u._id} value={`${u.firstName} ${u.lastName}`.trim()}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <p className="rounded-[3px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Some sections could not load (permissions or network). Missing: {failed.join(", ")}.
          Deals need <code className="font-mono">deals:read</code>, leads need{" "}
          <code className="font-mono">leads:read</code>, activities need{" "}
          <code className="font-mono">activities:read</code>.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-[3px] border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-muted">
            <Users className="h-4 w-4 text-primary" />
            Lead conversion
          </div>
          {leads ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text-main">
                  {leads.rate != null ? `${Math.round(leads.rate * 10) / 10}%` : "—"}
                </span>
                <TrendingUp className="h-4 w-4 text-text-muted" />
              </div>
              <p className="mt-2 text-xs text-text-muted">
                <span className="font-semibold text-text-main">{leads.converted ?? 0}</span> converted ·{" "}
                <span className="font-semibold text-text-main">{leads.total ?? 0}</span> still in pipeline
              </p>
              
              <div className="mt-6 border-t border-[#ebecf0] pt-4">
                <CrmVennDiagram
                  height={180}
                  setA={{ label: "All Leads", value: leads.total || 0, color: "var(--hs-link)" }}
                  setB={{ label: "Converted", value: leads.converted || 0, color: "#10b981" }}
                  intersection={{ label: "Won", value: leads.converted || 0 }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted">No lead snapshot available.</p>
          )}
        </div>

        <div className="rounded-[3px] border border-border bg-card p-5 shadow-sm md:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-muted">
            <Briefcase className="h-4 w-4 text-primary" />
            Open deals by stage
          </div>
          {deals.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No deal pipeline data yet.</p>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border-color)",
                      fontSize: 12,
                    }}
                  />
                  <Funnel
                    dataKey="value"
                    data={[...deals].sort((a, b) => b.value - a.value)}
                    isAnimationActive
                  >
                    <LabelList position="right" fill="var(--text-main)" stroke="none" dataKey="name" fontSize={11} />
                    <LabelList position="center" fill="#fff" stroke="none" dataKey="value" fontSize={12} formatter={(val: any) => val || ""} />
                    {deals.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[3px] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-text-muted">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top Closers (Deals by Employee)
          </div>
          {dealsByOwner.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No deal assignment data available.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsByOwner} margin={{ left: -16, right: 0, top: 16, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="colorDealsByOwner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#34d399" stopOpacity={1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="owner" tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', fontSize: 13, fontWeight: 600, padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Bar dataKey="count" fill="url(#colorDealsByOwner)" name="Total Deals" radius={[6, 6, 0, 0]} barSize={24}>
                    <LabelList dataKey="count" position="top" fill="#64748b" fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-[3px] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-text-muted">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top Sourcers (Leads by Employee)
          </div>
          {leadsByOwner.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No lead assignment data available.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadsByOwner} margin={{ left: -16, right: 0, top: 16, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="colorLeadsByOwner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="owner" tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', fontSize: 13, fontWeight: 600, padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Bar dataKey="count" fill="url(#colorLeadsByOwner)" name="Total Leads" radius={[6, 6, 0, 0]} barSize={24}>
                    <LabelList dataKey="count" position="top" fill="#64748b" fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[3px] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-text-muted">
          <Activity className="h-4 w-4 text-primary" />
          CRM activities by type (all time)
        </div>
        {acts.length === 0 ? (
          <p className="text-sm text-text-muted">No activity breakdown yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-[250px] w-full border-r border-[#ebecf0] pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={acts.map(r => ({ name: r._id || "Unknown", value: r.count }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => (percent != null && percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : "")}
                    labelLine={true}
                  >
                    {acts.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-bold uppercase tracking-wider text-text-muted">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4 text-right">Count</th>
                    <th className="py-2">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  {[...acts]
                    .sort((a, b) => (b.count || 0) - (a.count || 0))
                    .map((row) => {
                      const pct = actTotal > 0 ? Math.round(((row.count || 0) / actTotal) * 1000) / 10 : 0;
                      return (
                        <tr key={String(row._id)} className="text-text-main">
                          <td className="py-2.5 pr-4 font-medium">{row._id || "Unknown"}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{row.count}</td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 max-w-[120px] rounded-full bg-surface-dim">
                                <div
                                  className="h-full rounded-full bg-primary/80"
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="text-xs text-text-muted tabular-nums w-10">{pct}%</span>
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

      <div className="rounded-[3px] border border-[var(--hs-link)] bg-[var(--hs-link)]/5 p-5 shadow-sm mt-8">
        <h3 className="text-sm font-bold text-[var(--hs-link)] mb-2 flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          Pipeline Health Summary
        </h3>
        <p className="text-xs text-text-main leading-relaxed">
          The lead conversion rate is currently sitting at <span className="font-bold">{leads?.rate != null ? `${Math.round(leads?.rate * 10) / 10}%` : "—"}</span>, with <span className="font-bold">{leads?.converted ?? 0}</span> leads successfully transitioning into the deal pipeline. The activity volume indicates <span className="font-bold">{actTotal}</span> total CRM touches across the period. To improve conversion rates, focus on the stages in the <strong>Open deals by stage</strong> chart with the largest drop-offs, and ensure sales agents are balancing their activity mix across multiple channels (calls, emails, meetings).
        </p>
      </div>
    </div>
  );
}
