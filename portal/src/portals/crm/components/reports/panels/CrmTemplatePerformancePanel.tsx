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
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel } from "@/components/crm/ui";
import { CRM_CHART_PRIMARY } from "@/lib/crm/shared/chart-theme";

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
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-[#dcfce7] text-[#15803d] shrink-0 shadow-sm">
            <Mail size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#1e293b] tracking-tight">Email Template Performance</h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed max-w-2xl">
              Opens and clicks from tracked CRM sends (inbox and workflows) linked to saved templates.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <input
              type="search"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-52 rounded-lg border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-xs font-semibold text-[var(--color-text-main)] shadow-sm outline-none focus:border-[#2563eb]"
            />
          </div>
          <Link
            href="/crm/settings/email-templates"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-bold text-[#2563eb] shadow-sm hover:bg-[#eff6ff] transition-colors"
          >
            Manage Templates
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
        {data?.note && (
          <p className="px-6 py-3 text-xs text-[var(--color-text-muted)] font-medium leading-relaxed border-b border-[#f1f5f9] bg-[#f8fafc]">
            {data.note}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-white shadow-xs">
          {loading ? (
            <div className="p-8 space-y-2">
              <div className="h-4 bg-[#f1f5f9] rounded animate-pulse" />
              <div className="h-4 bg-[#f1f5f9] rounded animate-pulse w-5/6" />
              <div className="h-4 bg-[#f1f5f9] rounded animate-pulse w-4/6" />
            </div>
          ) : !filtered.length ? (
            <p className="p-8 text-sm text-[var(--color-text-muted)] text-center">
              {data?.templates?.length ? "No templates match your search." : "No template sends in this period yet."}
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-bold text-[#1e293b]">
                  <th className="py-3 px-4 font-bold text-[#1e293b]">Template</th>
                  <th className="py-3 px-4 text-right font-bold text-[#1e293b]">Sends</th>
                  <th className="py-3 px-4 text-right font-bold text-[#1e293b]">Opened</th>
                  <th className="py-3 px-4 text-right font-bold text-[#1e293b]">Open %</th>
                  <th className="py-3 px-4 text-right font-bold text-[#1e293b]">Clicks</th>
                  <th className="py-3 px-4 text-right font-bold text-[#1e293b]">Click %</th>
                  <th className="py-3 px-4 text-right font-bold text-[#15803d]">Leads Converted</th>
                  <th className="py-3 px-4 text-right font-bold text-[#b91c1c]">Leads Lost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {filtered.map((row) => (
                  <tr key={row.templateId} className="hover:bg-[#f8fafc]/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-[#0f172a] max-w-[220px] truncate" title={row.name}>
                      {row.name}
                      {!row.isActive && (
                        <span className="ml-2 text-[10px] font-bold text-amber-600 uppercase bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Inactive</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-medium text-[#64748b]">{row.sends}</td>
                    <td className="py-3.5 px-4 text-right tabular-nums text-[#10b981] font-semibold">
                      {row.uniqueOpened}
                      <span className="text-[#64748b] font-normal text-xs"> ({row.totalOpens})</span>
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#0f172a]">{row.openRatePercent}%</td>
                    <td className="py-3.5 px-4 text-right tabular-nums text-[#2563eb] font-semibold">{row.uniqueClicked}</td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-medium text-[#64748b]">{row.clickRatePercent}%</td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#10b981]">{row.leadsConverted}</td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#ef4444]">{row.leadsNotConverted}</td>
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
          <CrmChartPanel title="Efficiency Matrix (Sends vs Open Rate)" bodyClassName="pt-0">
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
                  <Line yAxisId="right" type="monotone" dataKey="openRatePercent" name="Open Rate %" stroke={CRM_CHART_PRIMARY} strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CrmChartPanel>
          <div className="bg-card border border-emerald-100/50 rounded-[var(--crm-radius-ui)] overflow-hidden shadow-sm p-6">
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
