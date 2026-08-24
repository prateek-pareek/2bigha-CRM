"use client";

import { useMemo } from "react";
import {
  CRM_CHART_INFO,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { type WorkspacePayload } from "../workspace-ui";
import { DashSkeleton } from "./dashboardShared";
import {
  WorkAnalyticsComboChart,
  WorkKpiTile,
  WorkloadMixAreaChart,
  WorkPipelineStatChart,
  WorkQueueDonut,
  WorkTaskStatusChart,
} from "./WorkDashboardCharts";

type Props = {
  ws: WorkspacePayload;
  error: string | null;
  isTabLoading: boolean;
  windowFilter: string;
};

function formatWindowLabel(windowFilter: string): string {
  if (windowFilter.includes(",")) {
    const [a, b] = windowFilter.split(",");
    return `${formatShortDate(a)} – ${formatShortDate(b)}`;
  }
  switch (windowFilter) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "this_week":
      return "This week";
    case "this_month":
      return "This month";
    case "last_30_days":
      return "Last 30 days";
    default:
      return "Selected window";
  }
}

function formatShortDate(ymd: string): string {
  const d = new Date(ymd.trim());
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function isDueToday(dueDate?: string): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function WorkDashboardView({
  ws,
  error,
  isTabLoading,
  windowFilter,
}: Props) {
  const windowLabel = formatWindowLabel(windowFilter);
  const attention = ws.attention;
  const todayFocus = ws.todayFocus;

  const queueCounts = useMemo(() => {
    const meetingInvites = attention.meetingInvites?.length ?? 0;
    const neverContacted = attention.neverContactedLeads?.length ?? 0;
    const stale = attention.staleLeads?.length ?? 0;
    const unopened = attention.unopenedTrackedEmails?.length ?? 0;
    const opened = attention.openedTrackedEmails?.length ?? 0;
    const replies = attention.replyReceivedEmails?.length ?? 0;
    const awaiting = attention.repliesAwaitingResponse?.length ?? 0;
    const total =
      meetingInvites +
      neverContacted +
      stale +
      unopened +
      opened +
      replies +
      awaiting;
    return {
      meetingInvites,
      neverContacted,
      stale,
      unopened,
      opened,
      replies,
      awaiting,
      total,
    };
  }, [attention]);

  const taskCounts = useMemo(() => {
    const tasks = ws.priorityTasks || [];
    let overdue = 0;
    let dueToday = 0;
    let noDue = 0;
    let scheduled = 0;
    for (const t of tasks) {
      if (t.overdue) overdue += 1;
      else if (!t.dueDate) noDue += 1;
      else if (isDueToday(t.dueDate)) dueToday += 1;
      else scheduled += 1;
    }
    return {
      total: tasks.length,
      overdue,
      dueToday,
      noDue,
      scheduled,
    };
  }, [ws.priorityTasks]);

  const followUpPending = ws.upcomingFollowUps?.totalPending ?? 0;
  const followUpOverdue =
    ws.upcomingFollowUps?.overdueCount ?? todayFocus?.overdueFollowUps ?? 0;

  const queueDonutRows = useMemo(
    () => [
      { name: "Meeting invites", value: queueCounts.meetingInvites },
      { name: "No outreach", value: queueCounts.neverContacted },
      { name: "Stale follow-up", value: queueCounts.stale },
      { name: "Not opened", value: queueCounts.unopened },
      { name: "Opened", value: queueCounts.opened },
      { name: "Client replies", value: queueCounts.replies },
      { name: "Awaiting reply", value: queueCounts.awaiting },
    ],
    [queueCounts],
  );

  const todayFocusRows = useMemo(
    () => [
      {
        name: "Overdue follow-ups",
        value: Number(todayFocus?.overdueFollowUps) || followUpOverdue,
      },
      {
        name: "Proposals waiting",
        value: Number(todayFocus?.proposalsAwaitingResponse) || 0,
      },
      {
        name: "Hot leads idle",
        value: Number(todayFocus?.hotLeadsNoAction) || 0,
      },
    ],
    [todayFocus, followUpOverdue],
  );

  const taskStatusRows = useMemo(
    () => [
      { name: "Overdue", value: taskCounts.overdue },
      { name: "Due today", value: taskCounts.dueToday },
      { name: "Upcoming", value: taskCounts.scheduled },
      { name: "No due date", value: taskCounts.noDue },
    ],
    [taskCounts],
  );

  const workloadMixRows = useMemo(
    () => [
      { name: "Work queue", value: queueCounts.total },
      { name: "Follow-ups", value: followUpPending },
      { name: "Tasks", value: taskCounts.total },
    ],
    [queueCounts.total, followUpPending, taskCounts.total],
  );

  /** Hybrid analytics series — activity bars vs soft pressure area. */
  const analyticsRows = useMemo(() => {
    const byDay = ws.leadsAddedByDay;
    if (byDay && byDay.length >= 3) {
      return byDay.slice(-14).map((d, i, arr) => {
        const total = Number(d.total) || 0;
        const prev = i > 0 ? Number(arr[i - 1].total) || 0 : total;
        return {
          name: d.date,
          primary: total,
          secondary: Math.round((total + prev) / 2),
        };
      });
    }
    return workloadMixRows.map((r) => ({
      name: r.name,
      primary: r.value,
      secondary: Math.round(r.value * 0.55),
    }));
  }, [ws.leadsAddedByDay, workloadMixRows]);

  if (isTabLoading && !attention) {
    return <DashSkeleton rows={5} />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {/* KPI strip — Dreams-style summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <WorkKpiTile
          label="Queue items"
          value={queueCounts.total}
          sub={windowLabel}
          accent={CRM_CHART_PRIMARY}
        />
        <WorkKpiTile
          label="Meeting invites"
          value={queueCounts.meetingInvites}
          sub="Client calendar invites"
          accent={CRM_CHART_INFO}
        />
        <WorkKpiTile
          label="No outreach"
          value={queueCounts.neverContacted}
          sub="Leads never contacted"
          accent={CRM_CHART_WARNING}
        />
        <WorkKpiTile
          label="Stale follow-up"
          value={queueCounts.stale}
          sub="Needs a fresh touch"
          accent={CRM_CHART_SECONDARY}
        />
        <WorkKpiTile
          label="Awaiting your reply"
          value={queueCounts.awaiting}
          sub="Inbound replies open"
          accent={CRM_CHART_WARNING}
        />
        <WorkKpiTile
          label="Overdue tasks"
          value={taskCounts.overdue}
          sub={`${taskCounts.total} tasks in view`}
          accent={CRM_CHART_PRIMARY}
        />
        <WorkKpiTile
          label="Overdue follow-ups"
          value={followUpOverdue}
          sub={`${followUpPending} pending sends`}
          accent={CRM_CHART_INFO}
        />
      </div>

      {/* Row: Workload analytics (hybrid) + Queue sources (donut) */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <WorkAnalyticsComboChart
            title="Workload analytics"
            totalLabel="items in view"
            primaryLabel="Activity"
            secondaryLabel="Pressure"
            rows={analyticsRows}
            emptyMessage="No workload analytics for this window."
          />
        </div>
        <div className="xl:col-span-2">
          <WorkQueueDonut
            title="Work queue mix"
            subtitle={`Attention buckets · ${windowLabel}`}
            rows={queueDonutRows}
          />
        </div>
      </div>

      {/* Row: Today's focus + Task urgency */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WorkPipelineStatChart
          title="Today’s focus"
          subtitle="Live CRM priorities for this owner & window"
          rows={todayFocusRows}
        />
        <WorkTaskStatusChart
          title="Task urgency"
          subtitle="Priority tasks by due status"
          rows={taskStatusRows}
        />
      </div>

      <WorkloadMixAreaChart
        title="Workload overview"
        subtitle="Queue, follow-ups, and tasks — focus chart then + / − to zoom"
        rows={workloadMixRows}
      />
    </div>
  );
}
