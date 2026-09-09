"use client";

import React, { useState, useEffect } from "react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { DashboardShell, DateRangeFilter } from "@/components/crm/dashboards/DashboardShell";
import { ChartCard, CustomChartTooltip } from "@/components/crm/dashboards/ChartCard";
import { LeaderboardTable } from "@/components/crm/dashboards/LeaderboardTable";
import { TeamPerformanceTable } from "@/components/crm/dashboards/TeamPerformanceTable";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Users, TrendingUp, Handshake, Target, CheckSquare, MessageSquare, PhoneCall } from "lucide-react";

const COLORS = ["#0c66e4", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

// Utility function to calculate trend percentage
const calculateTrend = (current: number, previous: number): number => {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!prev || prev === 0) return 0;
  const result = Math.round(((curr - prev) / prev) * 100);
  return isNaN(result) ? 0 : result;
};

export default function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_week");
  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch(`${CRM_API_URL}/crm/dashboard/admin?window=${dateRange}`, { headers })
        .then(r => {
          if (!r.ok) throw new Error(`Admin dashboard error: ${r.status}`);
          return r.json();
        }),
      fetch(`${CRM_API_URL}/crm/dashboard/admin/leaderboard?window=${dateRange}`, { headers })
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
  }, [dateRange]);

  const revenueData = React.useMemo(() => {
    if (!Array.isArray(data?.dashboard?.revenueTrend)) return [];
    return data.dashboard.revenueTrend.map((t: any) => ({
      date: t.date || 'Unknown',
      revenue: Number(t.revenue) || 0,
      target: Number(t.target) || 0
    }));
  }, [data]);

  const sourceData = React.useMemo(() => {
    if (!Array.isArray(data?.health?.sources)) return [];
    return data.health.sources.map((s: any) => ({
      name: s.source || s.name || 'Unknown',
      value: Number(s.count) || Number(s.value) || 0
    }));
  }, [data]);

  const teamData = React.useMemo(() => {
    if (!Array.isArray(data?.dashboard?.teamPerformance)) return [];
    return data.dashboard.teamPerformance.map((t: any) => ({
      name: t.team || t.name || 'Unknown',
      closed: Number(t.closed) || 0,
      pending: Number(t.pending) || 0
    }));
  }, [data]);

  // Calculate KPI values with proper formulas
  const d = data?.dashboard || {};
  const dp = prevData?.dashboard || {};

  const totalRevenue = Number(d.totalRevenue) || 0;
  const prevTotalRevenue = Number(dp.totalRevenue) || 0;
  const revenueTrend = calculateTrend(totalRevenue, prevTotalRevenue);

  const dealsClosed = Number(d.dealsClosed) || 0;
  const prevDealsClosed = Number(dp.dealsClosed) || 0;
  const dealsTrend = calculateTrend(dealsClosed, prevDealsClosed);

  const newLeads = Number(d.totalLeads) || 0;
  const prevNewLeads = Number(dp.totalLeads) || 0;
  const leadsTrend = calculateTrend(newLeads, prevNewLeads);

  // Conversion rate formula: (leadsConverted / totalLeads) * 100
  const leadsConverted = Number(d.leadsConverted) || 0;
  const conversionRate = newLeads > 0 ? Math.round((leadsConverted / newLeads) * 100) : 0;
  const prevConversionRate = prevNewLeads > 0 && dp.leadsConverted ? Math.round((Number(dp.leadsConverted) / prevNewLeads) * 100) : 0;
  const conversionTrend = calculateTrend(conversionRate, prevConversionRate);

  const whatsappSent = Number(d.whatsappSent) || 0;
  const prevWhatsappSent = Number(dp.whatsappSent) || 0;
  const whatsappTrend = calculateTrend(whatsappSent, prevWhatsappSent);

  const ivrAnswered = Number(d.ivrAnswered) || 0;
  const prevIvrAnswered = Number(dp.ivrAnswered) || 0;
  const ivrTrend = calculateTrend(ivrAnswered, prevIvrAnswered);

  const tasksCompleted = Number(d.tasksCompleted) || 0;
  const prevTasksCompleted = Number(dp.tasksCompleted) || 0;
  const tasksTrend = calculateTrend(tasksCompleted, prevTasksCompleted);

  if (error) {
    return (
      <DashboardShell
        title="Admin Dashboard"
        description="Organization-wide CRM metrics, revenue trends, and pipeline health."
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

  return (
    <DashboardShell
      title="Admin Dashboard"
      description="Organization-wide CRM metrics, revenue trends, and pipeline health."
      dateRange={dateRange}
      setDateRange={setDateRange}
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Revenue"
          value={`₹${totalRevenue.toLocaleString()}`}
          trend={`${revenueTrend > 0 ? '+' : ''}${revenueTrend}%`}
          icon={TrendingUp}
          trendDown={revenueTrend < 0}
        />
        <KPICard
          title="Total Deals Closed"
          value={dealsClosed}
          trend={`${dealsTrend > 0 ? '+' : ''}${dealsTrend}%`}
          icon={Handshake}
          trendDown={dealsTrend < 0}
        />
        <KPICard
          title="New Leads"
          value={newLeads}
          trend={`${leadsTrend > 0 ? '+' : ''}${leadsTrend}%`}
          icon={Users}
          trendDown={leadsTrend < 0}
        />
        <KPICard
          title="Overall Conversion Rate"
          value={`${conversionRate}%`}
          trend={`${conversionTrend > 0 ? '+' : ''}${conversionTrend}%`}
          icon={Target}
          trendDown={conversionTrend < 0}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KPICard
          title="WhatsApp Messages Sent"
          value={whatsappSent}
          trend={`${whatsappTrend > 0 ? '+' : ''}${whatsappTrend}%`}
          icon={MessageSquare}
          trendDown={whatsappTrend < 0}
        />
        <KPICard
          title="Answered Calls (IVR)"
          value={ivrAnswered}
          trend={`${ivrTrend > 0 ? '+' : ''}${ivrTrend}%`}
          icon={PhoneCall}
          trendDown={ivrTrend < 0}
        />
        <KPICard
          title="Tasks Completed"
          value={tasksCompleted}
          trend={`${tasksTrend > 0 ? '+' : ''}${tasksTrend}%`}
          icon={CheckSquare}
          trendDown={tasksTrend < 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
        {/* Revenue Trend Chart */}
        <ChartCard
          title="Revenue Trend"
          description="Actual revenue vs target across the selected period."
          className="xl:col-span-2 min-h-[350px]"
          contentClassName="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0c66e4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0c66e4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(val) => `$${val / 1000}k`} />
              <Tooltip content={<CustomChartTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0c66e4" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              <Area type="monotone" dataKey="target" name="Target" stroke="#cbd5e1" strokeDasharray="5 5" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Lead Sources */}
        <ChartCard
          title="Lead Sources"
          description="Distribution of incoming leads by channel."
          className="min-h-[350px]"
          contentClassName="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomChartTooltip />} />
              <Pie
                data={sourceData}
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {sourceData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <ChartCard
          title="Team Performance Comparison"
          description="Closed vs Pending deals across all teams."
          className="min-h-[350px]"
          contentClassName="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <Tooltip content={<CustomChartTooltip />} />
              <Bar dataKey="closed" name="Closed Deals" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar dataKey="pending" name="Pending Deals" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6">
        <TeamPerformanceTable
          title="Team-wise Performance"
          data={data?.teamMetrics?.teams || []}
          loading={loading}
        />
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 gap-6 mt-6">
        <LeaderboardTable
          title="Org-wide Leaderboard — Top Agents"
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
