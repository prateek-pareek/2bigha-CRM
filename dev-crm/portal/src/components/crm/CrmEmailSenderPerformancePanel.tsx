"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AtSign,
  ExternalLink,
  Search,
  Mail,
  HelpCircle,
  Activity,
  TrendingUp,
  TrendingDown,
  Send,
  BarChart3,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
  Hexagon,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";

export interface SenderPerformanceRow {
  fromEmail: string;
  sends: number;
  uniqueOpened: number;
  totalOpens: number;
  openRatePercent: number;
  totalClicks: number;
  uniqueClicked: number;
  clickRatePercent: number;
}

interface CrmEmailSenderPerformancePanelProps {
  days: string;
  owner: string;
}

function shortAddress(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email.length > 22 ? `${email.slice(0, 20)}…` : email;
  const localShort = (local || "").length > 12 ? `${(local || "").slice(0, 10)}…` : local || "";
  const domainShort = domain.length > 16 ? `${domain.slice(0, 14)}…` : domain;
  return `${localShort}@${domainShort}`;
}

function rateTone(rate: number) {
  if (rate >= 25) return "bg-emerald-50 text-emerald-700";
  if (rate >= 15) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export default function CrmEmailSenderPerformancePanel({
  days,
  owner,
}: CrmEmailSenderPerformancePanelProps) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"sends" | "openRate" | "opens">("sends");
  const [chartType, setChartType] = useState<"bar" | "line" | "area" | "radar">("bar");
  const [data, setData] = useState<{
    periodDays: number;
    senders: SenderPerformanceRow[];
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
        const res = await fetch(`${CRM_API_URL}/crm/reports/email-senders?${q}`, {
          headers: authHeaders,
        });
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (data?.senders ?? []).filter((row) =>
      row.fromEmail.toLowerCase().includes(q),
    );
    return [...rows].sort((a, b) => {
      if (sortBy === "openRate") return b.openRatePercent - a.openRatePercent;
      if (sortBy === "opens") return b.uniqueOpened - a.uniqueOpened;
      return b.sends - a.sends;
    });
  }, [data?.senders, search, sortBy]);

  const chartRows = useMemo(
    () =>
      filtered.slice(0, 10).map((row) => ({
        ...row,
        short: shortAddress(row.fromEmail),
        notOpened: Math.max(0, row.sends - row.uniqueOpened),
      })),
    [filtered],
  );

  const domainRows = useMemo(() => {
    const map = new Map<string, { domain: string; sends: number; opens: number; clicks: number }>();
    for (const row of filtered) {
      const domain = (row.fromEmail.split("@")[1] || "unknown").toLowerCase();
      const existing = map.get(domain) || { domain, sends: 0, opens: 0, clicks: 0 };
      existing.sends += row.sends;
      existing.opens += row.uniqueOpened;
      existing.clicks += row.uniqueClicked;
      map.set(domain, existing);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        openRate: r.sends > 0 ? Math.round((r.opens / r.sends) * 1000) / 10 : 0,
        clickRate: r.sends > 0 ? Math.round((r.clicks / r.sends) * 1000) / 10 : 0,
        short: r.domain.length > 20 ? `${r.domain.slice(0, 18)}…` : r.domain,
      }))
      .sort((a, b) => b.sends - a.sends)
      .slice(0, 8);
  }, [filtered]);

  const stats = useMemo(() => {
    if (!filtered.length) {
      return {
        totalSends: 0,
        totalOpens: 0,
        avgOpenRate: 0,
        topVolume: null as SenderPerformanceRow | null,
        bestRate: null as SenderPerformanceRow | null,
        weakestRate: null as SenderPerformanceRow | null,
      };
    }
    const totalSends = filtered.reduce((s, r) => s + r.sends, 0);
    const totalOpens = filtered.reduce((s, r) => s + r.uniqueOpened, 0);
    const avgOpenRate =
      totalSends > 0 ? Math.round((totalOpens / totalSends) * 1000) / 10 : 0;
    const withVolume = filtered.filter((r) => r.sends >= 3);
    const ratePool = withVolume.length ? withVolume : filtered;
    return {
      totalSends,
      totalOpens,
      avgOpenRate,
      topVolume: [...filtered].sort((a, b) => b.sends - a.sends)[0] ?? null,
      bestRate: [...ratePool].sort((a, b) => b.openRatePercent - a.openRatePercent)[0] ?? null,
      weakestRate: [...ratePool].sort((a, b) => a.openRatePercent - b.openRatePercent)[0] ?? null,
    };
  }, [filtered]);

  const chartHeight = Math.min(460, Math.max(280, chartRows.length * 42 + 48));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-3 rounded-[3px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shrink-0">
            <AtSign size={24} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-text-main tracking-tight">
              Sending address performance
            </h2>
            <p className="text-sm text-text-muted font-medium mt-1 leading-relaxed max-w-2xl">
              Volume and engagement by mailbox — sends, unique opens, open rate, and clicks for each
              from-address in the selected period.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="search"
              placeholder="Filter by email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 rounded-[3px] border border-[#dfe1e6]/60 bg-white/50 py-2.5 pl-10 pr-4 text-sm font-medium text-text-main shadow-sm outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <Link
            href="/crm/inbox"
            className="inline-flex items-center gap-2 rounded-[3px] bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm hover:bg-indigo-100 transition-colors"
          >
            Manage Inboxes
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-[3px] border border-[#ebecf0] bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <Send size={14} />
              <p className="text-[9px] font-semibold text-text-muted">
                Total sends
              </p>
            </div>
            <p className="text-xl font-bold tabular-nums text-text-main">{stats.totalSends}</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {stats.totalOpens} unique opens · {stats.avgOpenRate}% avg
            </p>
          </div>
          <div className="rounded-[3px] border border-[#ebecf0] bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Activity size={14} />
              <p className="text-[9px] font-semibold text-text-muted">
                Highest volume
              </p>
            </div>
            <p className="text-sm font-bold text-text-main truncate" title={stats.topVolume?.fromEmail}>
              {stats.topVolume ? shortAddress(stats.topVolume.fromEmail) : "—"}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {stats.topVolume?.sends ?? 0} sends · {stats.topVolume?.openRatePercent ?? 0}% open
            </p>
          </div>
          <div className="rounded-[3px] border border-emerald-100 bg-emerald-50/40 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <TrendingUp size={14} />
              <p className="text-[9px] font-semibold text-emerald-700/70">
                Best open rate
              </p>
            </div>
            <p className="text-sm font-bold text-emerald-800 truncate" title={stats.bestRate?.fromEmail}>
              {stats.bestRate ? shortAddress(stats.bestRate.fromEmail) : "—"}
            </p>
            <p className="text-[11px] text-emerald-700/80 mt-0.5">
              {stats.bestRate?.openRatePercent ?? 0}% · {stats.bestRate?.uniqueOpened ?? 0}/
              {stats.bestRate?.sends ?? 0} opened
            </p>
          </div>
          <div className="rounded-[3px] border border-rose-100 bg-rose-50/40 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <TrendingDown size={14} />
              <p className="text-[9px] font-semibold text-rose-700/70">
                Weakest open rate
              </p>
            </div>
            <p className="text-sm font-bold text-rose-800 truncate" title={stats.weakestRate?.fromEmail}>
              {stats.weakestRate ? shortAddress(stats.weakestRate.fromEmail) : "—"}
            </p>
            <p className="text-[11px] text-rose-700/80 mt-0.5">
              {stats.weakestRate?.openRatePercent ?? 0}% · {stats.weakestRate?.sends ?? 0} sends
            </p>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-[28px] border border-[#ebecf0] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Volume &amp; engagement by address
                </h3>
                <p className="text-xs text-text-muted mt-1">
                  Sends vs unique opens, with open rate % on the top {Math.min(10, chartRows.length)}{" "}
                  addresses
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-0.5 rounded-[3px] border border-[#dfe1e6] bg-[#f4f5f7]/80 p-0.5">
                  {(
                    [
                      ["bar", BarChart3, "Bar"],
                      ["line", LineChartIcon, "Line"],
                      ["area", AreaChartIcon, "Area"],
                      ["radar", Hexagon, "Radar"],
                    ] as const
                  ).map(([id, Icon, label]) => (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      onClick={() => setChartType(id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                        chartType === id
                          ? "bg-white text-indigo-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
                {(
                  [
                    ["sends", "Volume"],
                    ["opens", "Opens"],
                    ["openRate", "Open %"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSortBy(value)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                      sortBy === value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Sort: {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
                Sends
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                Unique opens
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                Open rate %
              </span>
            </div>

            <div className="w-full" style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "radar" ? (
                  <RadarChart data={chartRows} cx="50%" cy="50%" outerRadius="72%">
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="short" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "none",
                        boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "12px 14px",
                        backgroundColor: "rgba(255,255,255,0.97)",
                      }}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.fromEmail
                          ? String(payload[0].payload.fromEmail)
                          : ""
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
                    <Radar name="Sends" dataKey="sends" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                    <Radar name="Unique opens" dataKey="uniqueOpened" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                    <Radar name="Open rate %" dataKey="openRatePercent" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} />
                  </RadarChart>
                ) : chartType === "line" ? (
                  <LineChart data={chartRows} margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.7} />
                    <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "none",
                        boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "12px 14px",
                        backgroundColor: "rgba(255,255,255,0.97)",
                      }}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.fromEmail
                          ? String(payload[0].payload.fromEmail)
                          : ""
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
                    <Line type="monotone" dataKey="sends" name="Sends" stroke="#6366f1" strokeWidth={2.25} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="uniqueOpened" name="Unique opens" stroke="#10b981" strokeWidth={2.25} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="openRatePercent" name="Open rate %" stroke="#7c3aed" strokeWidth={2.25} dot={{ r: 3 }} />
                  </LineChart>
                ) : chartType === "area" ? (
                  <AreaChart data={chartRows} margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="senderAreaSends" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="senderAreaOpens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.7} />
                    <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "none",
                        boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "12px 14px",
                        backgroundColor: "rgba(255,255,255,0.97)",
                      }}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.fromEmail
                          ? String(payload[0].payload.fromEmail)
                          : ""
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
                    <Area type="monotone" dataKey="sends" name="Sends" stroke="#6366f1" fill="url(#senderAreaSends)" strokeWidth={2} />
                    <Area type="monotone" dataKey="uniqueOpened" name="Unique opens" stroke="#10b981" fill="url(#senderAreaOpens)" strokeWidth={2} />
                  </AreaChart>
                ) : (
                  <ComposedChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ left: 4, right: 28, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      vertical
                      stroke="#e2e8f0"
                      opacity={0.7}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <XAxis
                      xAxisId="rate"
                      type="number"
                      orientation="top"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 9, fill: "#7c3aed", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="short"
                      width={128}
                      tick={{ fontSize: 10, fill: "#334155", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#f1f5f9", opacity: 0.55 }}
                      contentStyle={{
                        borderRadius: 14,
                        border: "none",
                        boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "12px 14px",
                        backgroundColor: "rgba(255,255,255,0.97)",
                      }}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.fromEmail
                          ? String(payload[0].payload.fromEmail)
                          : ""
                      }
                      formatter={(value, name) => {
                        if (name === "Open rate %") return [`${value}%`, name];
                        return [value, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
                    <Bar
                      dataKey="sends"
                      name="Sends"
                      fill="#6366f1"
                      radius={[0, 6, 6, 0]}
                      barSize={12}
                      background={{ fill: "#f8fafc" }}
                    >
                      <LabelList
                        dataKey="sends"
                        position="right"
                        fill="#64748b"
                        fontSize={10}
                        fontWeight={700}
                        formatter={(v: any) => (v ? v : "")}
                      />
                    </Bar>
                    <Bar
                      dataKey="uniqueOpened"
                      name="Unique opens"
                      fill="#10b981"
                      radius={[0, 6, 6, 0]}
                      barSize={12}
                    >
                      <LabelList
                        dataKey="uniqueOpened"
                        position="right"
                        fill="#059669"
                        fontSize={10}
                        fontWeight={700}
                        formatter={(v: any) => (v ? v : "")}
                      />
                    </Bar>
                    <Line
                      xAxisId="rate"
                      type="monotone"
                      dataKey="openRatePercent"
                      name="Open rate %"
                      stroke="#7c3aed"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-[3px] bg-indigo-100 text-indigo-600 flex items-center justify-center mb-5">
                <HelpCircle className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-3">Sender health summary</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Across <span className="font-bold text-indigo-600">{filtered.length}</span> sending
                addresses, average unique open rate is{" "}
                <span className="font-bold text-slate-800">{stats.avgOpenRate}%</span>. Highest
                volume is{" "}
                <span className="font-bold text-slate-800">
                  {stats.topVolume ? shortAddress(stats.topVolume.fromEmail) : "—"}
                </span>{" "}
                ({stats.topVolume?.sends ?? 0} sends).
              </p>
              <div className="mt-4 space-y-2">
                <div className="rounded-[3px] border border-emerald-100 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700/70">
                    Best engagement
                  </p>
                  <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                    {stats.bestRate?.fromEmail ?? "—"}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    {stats.bestRate?.openRatePercent ?? 0}% open ·{" "}
                    {stats.bestRate?.clickRatePercent ?? 0}% click
                  </p>
                </div>
                <div className="rounded-[3px] border border-rose-100 bg-white px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-700/70">
                    Needs attention
                  </p>
                  <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                    {stats.weakestRate?.fromEmail ?? "—"}
                  </p>
                  <p className="text-[11px] text-rose-700 font-semibold">
                    {stats.weakestRate?.openRatePercent ?? 0}% open — pause or warm this inbox if
                    volume is high
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {filtered.length > 0 && domainRows.length > 0 && (
        <div className="rounded-[28px] border border-[#ebecf0] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Engagement by email domain
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Roll-up of sending addresses by @domain — volume, unique opens, and open rate
            </p>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600" />
              Sends
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
              Unique opens
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
              Open rate %
            </span>
          </div>
          <div className="w-full" style={{ height: Math.min(360, Math.max(220, domainRows.length * 40 + 40)) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={domainRows} layout="vertical" margin={{ left: 4, right: 28, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical stroke="#e2e8f0" opacity={0.7} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                <XAxis
                  xAxisId="rate"
                  type="number"
                  orientation="top"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 9, fill: "#7c3aed", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="short" width={120} tick={{ fontSize: 10, fill: "#334155", fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#f1f5f9", opacity: 0.55 }}
                  contentStyle={{
                    borderRadius: 14,
                    border: "none",
                    boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.15)",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "12px 14px",
                    backgroundColor: "rgba(255,255,255,0.97)",
                  }}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.domain ? `@${String(payload[0].payload.domain)}` : ""
                  }
                  formatter={(value, name) => (name === "Open rate %" ? [`${value}%`, name] : [value, name])}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600, color: "#64748b" }} />
                <Bar dataKey="sends" name="Sends" fill="#4f46e5" radius={[0, 6, 6, 0]} barSize={12} background={{ fill: "#f8fafc" }}>
                  <LabelList dataKey="sends" position="right" fill="#64748b" fontSize={10} fontWeight={700} formatter={(v: any) => v || ""} />
                </Bar>
                <Bar dataKey="opens" name="Unique opens" fill="#059669" radius={[0, 6, 6, 0]} barSize={12} />
                <Line
                  xAxisId="rate"
                  type="monotone"
                  dataKey="openRate"
                  name="Open rate %"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white/60 -xl border border-[#dfe1e6]/60 rounded-[32px] overflow-hidden shadow-xl shadow-indigo-500/5">
        {data?.note && (
          <div className="px-6 py-4 flex items-center gap-3 border-b border-[#ebecf0] bg-indigo-50/50">
            <Activity className="h-4 w-4 text-indigo-500 shrink-0" />
            <p className="text-sm text-indigo-900/80 font-semibold leading-relaxed">{data.note}</p>
          </div>
        )}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-4">
              <div className="h-5 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-5 bg-slate-100 rounded-lg animate-pulse w-5/6" />
              <div className="h-5 bg-slate-100 rounded-lg animate-pulse w-4/6" />
            </div>
          ) : !filtered.length ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 bg-[#f4f5f7] rounded-full flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-base font-bold text-slate-700 mb-1">No data found</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                {data?.senders?.length
                  ? "No addresses match your search criteria."
                  : "No tracked sends were found in the selected period."}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#dfe1e6]/60 bg-[#f4f5f7]/50 text-[10px] font-semibold text-slate-500">
                  <th className="px-6 py-4 font-black">From address</th>
                  <th className="px-6 py-4 text-right font-black">Sends</th>
                  <th className="px-6 py-4 text-right font-black">Opened</th>
                  <th className="px-6 py-4 text-right font-black">Not opened</th>
                  <th className="px-6 py-4 text-right font-black">Open %</th>
                  <th className="px-6 py-4 text-right font-black">Click sends</th>
                  <th className="px-6 py-4 text-right font-black">Clicks</th>
                  <th className="px-6 py-4 text-right font-black">Click %</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.fromEmail}
                    className="border-b border-[#ebecf0]/50 hover:bg-white transition-colors group"
                  >
                    <td
                      className="px-6 py-4 font-bold text-slate-800 max-w-[280px] truncate"
                      title={row.fromEmail}
                    >
                      {row.fromEmail}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-600">
                      {row.sends}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-emerald-600 font-bold">
                      {row.uniqueOpened}
                      <span className="text-emerald-400/80 font-medium text-xs ml-1">
                        ({row.totalOpens})
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-rose-600 font-bold">
                      {Math.max(0, row.sends - row.uniqueOpened)}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${rateTone(row.openRatePercent)}`}
                      >
                        {row.openRatePercent}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-purple-600 font-bold">
                      {row.uniqueClicked}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-500 font-medium">
                      {row.totalClicks}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold">
                      <span className="text-slate-700">{row.clickRatePercent}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-2 bg-white/60 -xl border border-[#dfe1e6]/60 rounded-[32px] p-6 shadow-xl shadow-indigo-500/5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-slate-800">Volume & Engagement by Address</h3>
              <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-indigo-500"></div>Sends</span>
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-purple-500"></div>Unique Opens</span>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filtered.slice(0, 8)} margin={{ left: -16, right: 0, top: 16, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="colorSends" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={1}/>
                    </linearGradient>
                    <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#c084fc" stopOpacity={1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis
                    dataKey="fromEmail"
                    tick={{ fontSize: 11, fill: "var(--text-main)", fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'var(--surface-dim)', opacity: 0.5}}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', fontSize: 13, fontWeight: 600, padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Bar dataKey="sends" fill="url(#colorSends)" name="Total Sends" radius={[6, 6, 0, 0]} barSize={24}>
                    <LabelList dataKey="sends" position="top" fill="#64748b" fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                  <Bar dataKey="uniqueOpened" fill="url(#colorOpens)" name="Unique Opens" radius={[6, 6, 0, 0]} barSize={24}>
                    <LabelList dataKey="uniqueOpened" position="top" fill="#64748b" fontSize={11} fontWeight={700} formatter={(v: any) => v || ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="rounded-[32px] border border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-white p-6 shadow-xl shadow-indigo-500/5 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-[3px] bg-indigo-100 text-indigo-600 flex items-center justify-center mb-5">
                <HelpCircle className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-3">
                Sender Health Summary
              </h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Across the <span className="font-bold text-indigo-600">{filtered.length}</span> active sending addresses, the highest volume sender is <span className="font-bold text-slate-800">{filtered.sort((a,b) => b.sends - a.sends)[0]?.fromEmail}</span> with {filtered.sort((a,b) => b.sends - a.sends)[0]?.sends} tracked sends. 
              </p>
              <div className="mt-4 p-4 bg-white rounded-[3px] border border-indigo-50/50 shadow-sm">
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  If you notice specific addresses with open rates below 20%, consider pausing outreach from those inboxes to protect your domain reputation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
