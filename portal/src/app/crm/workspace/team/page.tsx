"use client";

import React, { useState, useEffect } from "react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { DashboardShell, DateRangeFilter } from "@/components/crm/dashboards/DashboardShell";
import { ChartCard, CustomChartTooltip } from "@/components/crm/dashboards/ChartCard";
import { LeaderboardTable } from "@/components/crm/dashboards/LeaderboardTable";
import { Dropdown } from "@/app/crm/workspace/_components/workspace-ui";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Scatter,
  ScatterChart,
  ZAxis,
} from "recharts";
import { Users, Crosshair, PhoneCall, CheckCircle } from "lucide-react";

// Utility function to calculate trend percentage
const calculateTrend = (current: number, previous: number): number => {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!prev || prev === 0) return 0;
  const result = Math.round(((curr - prev) / prev) * 100);
  return isNaN(result) ? 0 : result;
};

export default function TeamDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_month");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);
  const [teamAgents, setTeamAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

  // Fetch team members/agents list
  useEffect(() => {
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, { headers })
      .then(r => {
        if (!r.ok) throw new Error("Failed to fetch team members");
        return r.json();
      })
      .then((users: any[]) => {
        if (Array.isArray(users)) {
          setTeamAgents(users.map(u => ({
            value: u._id || u.id,
            label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.name
          })));
        }
      })
      .catch(err => console.error("Error fetching team members:", err));
  }, []);

  // Fetch dashboard data - wire selectedAgent filter to API
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const agentParam = selectedAgent !== "all" ? `&agent=${selectedAgent}` : "";

    Promise.all([
      fetch(`${CRM_API_URL}/crm/dashboard/team?window=${dateRange}${agentParam}`, { headers })
        .then(r => {
          if (!r.ok) throw new Error(`Team dashboard error: ${r.status}`);
          return r.json();
        }),
      fetch(`${CRM_API_URL}/crm/dashboard/team/leaderboard?window=${dateRange}${agentParam}`, { headers })
        .then(r => {
          if (!r.ok) throw new Error(`Leaderboard error: ${r.status}`);
          return r.json();
        })
    ])
      .then(([resDashboard, resLeaderboard]) => {
        if (active) {
          setData(resDashboard || {});
          setLeaderboardData(Array.isArray(resLeaderboard) ? resLeaderboard : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Failed to load dashboard data");
          setLoading(false);
          console.error("Dashboard fetch error:", err);
        }
      });
    return () => { active = false; };
  }, [dateRange, selectedAgent]);

  const targetData = React.useMemo(() => {
    if (!Array.isArray(data?.trend)) return [];
    return data.trend.map((t: any) => ({
      name: t.date || t.week || 'Unknown',
      actual: Number(t.dealsWon) || Number(t.actual) || 0,
      target: Number(t.target) || 0
    }));
  }, [data]);

  // Activity heatmap data from API - no more random data!
  const activityHeatmapData = React.useMemo(() => {
    if (!Array.isArray(data?.activityHeatmap)) return [];
    return data.activityHeatmap.map((a: any) => ({
      day: a.day || 'Unknown',
      hour: a.hour || 'Unknown',
      value: Number(a.value) || Number(a.count) || 0
    }));
  }, [data]);

  // Calculate KPI values with proper formulas
  const stats = data?.metrics || {};
  const prevStats = prevData?.metrics || {};

  const dealsWon = Number(stats.totalWon) || 0;
  const prevDealsWon = Number(prevStats.totalWon) || 0;
  const dealsWonTrend = calculateTrend(dealsWon, prevDealsWon);

  // Conversion rate formula: (leadsConverted / totalLeads) * 100
  const leadsConverted = Number(stats.leadsConverted) || 0;
  const totalLeads = Number(stats.totalLeads) || 0;
  const conversionRate = totalLeads > 0 ? Math.round((leadsConverted / totalLeads) * 100) : 0;
  const prevLeadsConverted = Number(prevStats.leadsConverted) || 0;
  const prevTotalLeads = Number(prevStats.totalLeads) || 0;
  const prevConversionRate = prevTotalLeads > 0 ? Math.round((prevLeadsConverted / prevTotalLeads) * 100) : 0;
  const conversionTrend = calculateTrend(conversionRate, prevConversionRate);

  const responseTime = Number(stats.avgResponseTime) || 0;
  const prevResponseTime = Number(prevStats.avgResponseTime) || 0;
  const responseTimeTrend = calculateTrend(responseTime, prevResponseTime);

  const totalLeadsTrend = calculateTrend(totalLeads, prevTotalLeads);

  if (error) {
    return (
      <DashboardShell
        title="Team Lead Dashboard"
        description="Monitor team performance, agent activity, and target achievements."
        dateRange={dateRange}
        setDateRange={setDateRange}
      >
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700 text-sm">
          <p className="font-semibold mb-2">Error loading dashboard</p>
          <p>{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
            }}
            className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </DashboardShell>
    );
  }

  const extraFilters = (
    <div className="inline-flex h-[38px] items-center gap-2 rounded-[5px] border border-[var(--border-color)] bg-white px-2.5 shadow-[var(--crm-shadow-input)] dark:bg-black dark:border-white/10">
      <Users size={16} className="text-[var(--text-muted)]" aria-hidden />
      <Dropdown
        value={selectedAgent}
        onChange={setSelectedAgent}
        widthClass="min-w-[160px] border-0 shadow-none bg-transparent h-[34px]"
        options={[
          { value: "all", label: "All Team Members" },
          ...teamAgents
        ]}
      />
    </div>
  );

  return (
    <DashboardShell
      title="Team Lead Dashboard"
      description="Monitor team performance, agent activity, and target achievements."
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={extraFilters}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Team Deals Won"
          value={dealsWon}
          trend={`${dealsWonTrend > 0 ? '+' : ''}${dealsWonTrend}%`}
          icon={CheckCircle}
          trendDown={dealsWonTrend < 0}
        />
        <KPICard
          title="Team Conversion Rate"
          value={`${conversionRate}%`}
          trend={`${conversionTrend > 0 ? '+' : ''}${conversionTrend}%`}
          icon={Crosshair}
          trendDown={conversionTrend < 0}
        />
        <KPICard
          title="Avg Response Time"
          value={`${responseTime.toFixed(1)} hrs`}
          trend={`${responseTimeTrend > 0 ? '+' : ''}${responseTimeTrend}%`}
          icon={PhoneCall}
          trendDown={responseTimeTrend > 0}
        />
        <KPICard
          title="Total Team Leads"
          value={totalLeads}
          trend={`${totalLeadsTrend > 0 ? '+' : ''}${totalLeadsTrend}%`}
          icon={Users}
          trendDown={totalLeadsTrend < 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard
          title="Team Target vs Actuals"
          description="Weekly progression of deals closed against set targets."
          className="min-h-[350px]"
          contentClassName="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={targetData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <Tooltip content={<CustomChartTooltip />} />
              <Bar dataKey="actual" name="Actual Deals" fill="#0c66e4" radius={[4, 4, 0, 0]} barSize={40} />
              <Line type="monotone" dataKey="target" name="Target Deals" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Team Activity Heatmap"
          description="High activity periods based on calls, emails, and meetings."
          className="min-h-[350px]"
          contentClassName="h-[300px]"
        >
          {activityHeatmapData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              No activity data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <XAxis dataKey="hour" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis dataKey="day" type="category" reversed axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <ZAxis dataKey="value" range={[0, 400]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomChartTooltip />} />
                <Scatter data={activityHeatmapData} fill="#8b5cf6" opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Leaderboard */}
      <div className="grid grid-cols-1 gap-6 mt-6">
        <LeaderboardTable
          title="Team Members Leaderboard"
          data={leaderboardData}
          loading={loading}
        />
      </div>
    </DashboardShell>
  );
}

function KPICard({ title, value, trend, icon: Icon, trendDown = false }: any) {
  const trendStr = String(trend || "0").replace("%", "");
  const trendNum = parseInt(trendStr) || 0;
  const isNegative = trendNum < 0;
  const shouldHighlightRed = (trendDown && trendNum > 0) || (!trendDown && isNegative);
  const displayTrend = isNaN(trendNum) ? "0%" : `${trendNum > 0 ? '+' : ''}${trendNum}%`;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div>
        <h4 className="text-2xl font-bold text-card-foreground">{value ?? "N/A"}</h4>
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`text-xs font-semibold ${shouldHighlightRed ? 'text-rose-500 bg-rose-50 dark:bg-rose-500/10' : 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'} px-2 py-0.5 rounded-full`}>
            {displayTrend}
          </span>
          <span className="text-xs text-muted-foreground">vs last period</span>
        </div>
      </div>
    </div>
  );
}
