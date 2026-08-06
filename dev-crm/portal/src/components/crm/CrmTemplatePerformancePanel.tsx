"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Mail, Search, ExternalLink } from "lucide-react";
import { 
  ResponsiveContainer,
  LabelList,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";

export interface TemplatePerformanceRow {
  templateId: string;
  name: string;
  type: string;
  isActive: boolean;
  sends: number;
  uniqueOpened: number;
  totalOpens: number;
  openRatePercent: number;
  totalClicks: number;
  uniqueClicked: number;
  clickRatePercent: number;
  leadsConverted: number;
  leadsNotConverted: number;
}

interface CrmTemplatePerformancePanelProps {
  days: string;
  owner: string;
}

export default function CrmTemplatePerformancePanel({ days, owner }: CrmTemplatePerformancePanelProps) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{
    periodDays: number;
    templates: TemplatePerformanceRow[];
    note: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const token = getCrmAuthToken();
      const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const q = new URLSearchParams({ days, owner });
      try {
        const res = await fetch(`${CRM_API_URL}/crm/reports/email-templates?${q}`, { headers: authHeaders });
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [days, owner]);

  const filtered =
    data?.templates?.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-[3px] bg-emerald-100 text-emerald-700 shrink-0">
            <Mail size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-main tracking-tight">Email template performance</h2>
            <p className="text-xs text-text-muted font-medium mt-1 leading-relaxed max-w-2xl">
              Opens and clicks from tracked CRM sends (inbox and workflows) when a send is linked to a saved template.
              Filters match the period and owner selectors above.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="search"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-52 rounded-[3px] border border-[#dfe1e6] bg-card py-2 pl-9 pr-3 text-xs font-medium text-text-main shadow-sm outline-none focus:border-primary/40"
            />
          </div>
          <Link
            href="/crm/settings/email-templates"
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#dfe1e6] bg-card px-3 py-2 text-xs font-bold text-primary shadow-sm hover:bg-primary/5 transition-colors"
          >
            Manage templates
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="bg-card border border-[#ebecf0] rounded-[32px] overflow-hidden shadow-sm">
        {data?.note && (
          <p className="px-6 py-3 text-xs text-text-muted font-medium leading-relaxed border-b border-slate-50 bg-surface-dim/30">
            {data.note}
          </p>
        )}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-2">
              <div className="h-4 bg-surface-dim rounded animate-pulse" />
              <div className="h-4 bg-surface-dim rounded animate-pulse w-5/6" />
              <div className="h-4 bg-surface-dim rounded animate-pulse w-4/6" />
            </div>
          ) : !filtered.length ? (
            <p className="p-8 text-sm text-text-muted text-center">
              {data?.templates?.length ? "No templates match your search." : "No template sends in this period yet."}
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#ebecf0] bg-surface-dim/50 text-[9px] font-semibold text-text-muted">
                  <th className="px-4 py-3 font-black">Template</th>
                  <th className="px-4 py-3 text-right font-black">Sends</th>
                  <th className="px-4 py-3 text-right font-black">Opened</th>
                  <th className="px-4 py-3 text-right font-black">Open %</th>
                  <th className="px-4 py-3 text-right font-black">Click sends</th>
                  <th className="px-4 py-3 text-right font-black">Click %</th>
                  <th className="px-4 py-3 text-right font-black text-emerald-700">Leads Converted</th>
                  <th className="px-4 py-3 text-right font-black text-rose-700">Leads Lost</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.templateId} className="border-b border-slate-50 hover:bg-surface-dim/20">
                    <td className="px-4 py-3 font-bold text-text-main max-w-[220px] truncate" title={row.name}>
                      {row.name}
                      {!row.isActive && (
                        <span className="ml-2 text-[9px] font-black text-amber-600 uppercase">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-main">{row.sends}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-semibold">
                      {row.uniqueOpened}
                      <span className="text-text-muted font-normal text-xs"> ({row.totalOpens})</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-main">{row.openRatePercent}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-sky-700 font-semibold">{row.uniqueClicked}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-muted">{row.totalClicks}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-main">{row.clickRatePercent}%</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600 bg-emerald-50/50">{row.leadsConverted}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-600 bg-rose-50/50">{row.leadsNotConverted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* NEW SCATTER CHART SECTION */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-card border border-[#ebecf0] rounded-[32px] overflow-hidden shadow-sm p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-muted">
              Efficiency Matrix (Sends vs Open Rate)
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filtered} margin={{ top: 10, right: 20, bottom: 10, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                  <XAxis dataKey="templateName" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="sends" name="Sends" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={40}>
                    <LabelList dataKey="sends" position="top" fill="var(--text-muted)" fontSize={10} formatter={(v: any) => v || ""} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="openRatePercent" name="Open Rate %" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-card border border-emerald-100/50 rounded-[32px] overflow-hidden shadow-sm p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-emerald-700">
              Lead Conversion Impact (Sends vs Converted)
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filtered} margin={{ top: 10, right: 20, bottom: 10, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                  <XAxis dataKey="templateName" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="leadsConverted" name="Converted" stackId="a" fill="#10b981" barSize={40}>
                    <LabelList dataKey="leadsConverted" position="inside" fill="#fff" fontSize={10} formatter={(v: any) => v || ""} />
                  </Bar>
                  <Bar dataKey="leadsNotConverted" name="Lost" stackId="a" fill="#rose-600" fillOpacity={0.2} stroke="#rose-600" barSize={40}>
                    <LabelList dataKey="leadsNotConverted" position="inside" fill="var(--text-muted)" fontSize={10} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
