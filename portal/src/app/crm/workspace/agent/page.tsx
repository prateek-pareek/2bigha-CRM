"use client";

import React, { useState, useEffect } from "react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { DashboardShell, DateRangeFilter } from "@/components/crm/dashboards/DashboardShell";
import { ChartCard, CustomChartTooltip } from "@/components/crm/dashboards/ChartCard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Activity, Target, ListTodo, Inbox } from "lucide-react";

const TASK_COLORS = ["#22c55e", "#f59e0b", "#ef4444"];

// Utility function to calculate trend percentage
const calculateTrend = (current: number, previous: number): number => {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!prev || prev === 0) return 0;
  const result = Math.round(((curr - prev) / prev) * 100);
  return isNaN(result) ? 0 : result;
};

export default function AgentDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_week");
  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`${CRM_API_URL}/crm/dashboard/agent?window=${dateRange}`, {
      headers,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Agent dashboard error: ${r.status}`);
        return r.json();
      })
      .then((res) => {
        if (active) {
          setData(res || {});
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

  // Aggregate fetched data into chart formats with consistent field handling
  const activityData = React.useMemo(() => {
    if (!Array.isArray(data?.activity)) return [];
    return data.activity.map((a: any) => {
      // Handle both type and _id field names
      const activityType = a.type || a._id || 'Other';
      const count = Number(a.count) || 0;
      return {
        name: activityType,
        value: count,
        count: count
      };
    });
  }, [data]);

  const taskStatusData = React.useMemo(() => {
    if (!Array.isArray(data?.tasks)) return [];
    return data.tasks.map((t: any) => ({
      name: t.status || t._id || 'Unknown',
      value: Number(t.count) || 0
    }));
  }, [data]);

  const funnelData = React.useMemo(() => {
    if (!Array.isArray(data?.funnel)) return [];
    return data.funnel.map((f: any) => ({
      name: f.stage || f.name || 'Unknown',
      value: Number(f.count) || 0
    }));
  }, [data]);

  // Calculate KPI values with proper formulas
  const stats = data?.summary?.thisWeek || {};
  const prevStats = prevData?.summary?.thisWeek || {};

  const activeLeads = Number(stats.activeLeads) || 0;
  const prevActiveLeads = Number(prevStats.activeLeads) || 0;
  const activeLeadsTrend = calculateTrend(activeLeads, prevActiveLeads);

  const tasksDue = Number(stats.tasksDue) || 0;
  const prevTasksDue = Number(prevStats.tasksDue) || 0;
  const tasksDueTrend = calculateTrend(tasksDue, prevTasksDue);

  const unreadEmails = Number(stats.unreadEmails) || 0;
  const prevUnreadEmails = Number(prevStats.unreadEmails) || 0;
  const unreadEmailsTrend = calculateTrend(unreadEmails, prevUnreadEmails);

  const callsMade = Number(stats.callsMade) || 0;
  const prevCallsMade = Number(prevStats.callsMade) || 0;
  const callsMadeTrend = calculateTrend(callsMade, prevCallsMade);

  // Calculate conversion rate from funnel data
  const totalInFunnel = funnelData.reduce((sum: number, f: any) => sum + f.value, 0);
  const converted = funnelData.find((f: any) => f.name?.toLowerCase().includes('converted') || f.name?.toLowerCase().includes('won'))?.value || 0;
  const conversionRate = totalInFunnel > 0 ? Math.round((converted / totalInFunnel) * 100) : 0;

  if (error) {
    return (
      <DashboardShell
        title="Agent Dashboard"
        description="Track your daily performance, upcoming tasks, and pipeline progress."
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
      title="Agent Dashboard"
      description="Track your daily performance, upcoming tasks, and pipeline progress."
      dateRange={dateRange}
      setDateRange={setDateRange}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="My Active Leads"
          value={activeLeads}
          trend={`${activeLeadsTrend > 0 ? '+' : ''}${activeLeadsTrend}%`}
          icon={Target}
          trendDown={activeLeadsTrend < 0}
        />
        <KPICard
          title="Tasks Due Today"
          value={tasksDue}
          trend={`${tasksDueTrend > 0 ? '+' : ''}${tasksDueTrend}%`}
          icon={ListTodo}
          trendDown={tasksDueTrend > 0}
        />
        <KPICard
          title="Unread Emails"
          value={unreadEmails}
          trend={`${unreadEmailsTrend > 0 ? '+' : ''}${unreadEmailsTrend}%`}
          icon={Inbox}
          trendDown={unreadEmailsTrend > 0}
        />
        <KPICard
          title="Calls Made"
          value={callsMade}
          trend={`${callsMadeTrend > 0 ? '+' : ''}${callsMadeTrend}%`}
          icon={Activity}
          trendDown={callsMadeTrend < 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartCard
          title="My Daily Activity"
          description="Activity breakdown by type over time."
          className="lg:col-span-2 min-h-[350px]"
          contentClassName="h-[300px]"
        >
          {activityData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              No activity data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Bar dataKey="value" name="Count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Task Status"
          description="Breakdown of your current tasks."
          className="min-h-[350px]"
          contentClassName="h-[300px]"
        >
          {taskStatusData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              No task data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomChartTooltip />} />
                <Pie
                  data={taskStatusData}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {taskStatusData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={TASK_COLORS[index % TASK_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <ChartCard
          title="My Conversion Funnel"
          description={`Drop-off rates across stages for your assigned leads (Conversion Rate: ${conversionRate}%)`}
          className="min-h-[350px]"
          contentClassName="h-[300px]"
        >
          {funnelData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              No funnel data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ top: 10, right: 10, left: 80, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.2 }} />
                <Bar dataKey="value" name="Leads" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
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
