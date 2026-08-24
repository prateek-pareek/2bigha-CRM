"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import WorkspaceShell, {
  type WorkspaceShellContext,
} from "../_components/WorkspaceShell";
import FollowUpsPanel from "../_components/FollowUpsPanel";
import TasksDuePanel from "../_components/TasksDuePanel";
import { EmptyHs, HS_PANEL } from "../_components/workspace-ui";
import { EmptyDash } from "../_components/dashboards/dashboardShared";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";

const CrmSalesAttention = dynamic(
  () => import("@/components/crm/reports/panels/CrmSalesAttention"),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[280px] animate-pulse rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)]"
        aria-hidden
      />
    ),
  },
);

/**
 * Dedicated Action Queue page — same detailed sections that previously lived on
 * Work Dashboard (Work queue, Follow-ups, Tasks due), all together.
 */
export default function QueueDashboardPage() {
  return (
    <WorkspaceShell section="work_queue">
      {(ctx) => <ActionQueueContent {...ctx} />}
    </WorkspaceShell>
  );
}

function ActionQueueContent({
  ws,
  loading,
  error,
  isTabLoading,
  hasAccess,
  owner,
  canSeeOwnerPicker,
  taskSearch,
  setTaskSearch,
  taskFilter,
  setTaskFilter,
  filteredTasks,
  renderedTasks,
  setVisibleTaskCount,
}: WorkspaceShellContext) {
  // Dedicated page: show the full task list, not the dashboard slice.
  useEffect(() => {
    if (!filteredTasks.length) return;
    setVisibleTaskCount(Math.max(filteredTasks.length, 25));
  }, [filteredTasks, setVisibleTaskCount]);

  if (
    !hasAccess("dashboard:read") &&
    !hasAccess("workspace-work:read") &&
    !hasAccess("leads:read")
  ) {
    return (
      <div className={cn(HS_PANEL, "p-6")}>
        <EmptyHs message="You don’t have permission to view the action queue." />
      </div>
    );
  }

  if (loading && !ws) {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn("min-h-[180px]", HS_PANEL, "bg-[var(--surface-dim)]")}
          />
        ))}
      </div>
    );
  }

  if (!ws) {
    return (
      <div className={cn(HS_PANEL, "p-6")}>
        <EmptyHs
          message={
            error ||
            "Workspace data is not available. Try refreshing the page."
          }
        />
      </div>
    );
  }

  const followUpsLoading = isTabLoading && !ws.upcomingFollowUps;

  return (
    <div className="mt-0 space-y-6 outline-none">
      {/* 1. Work queue */}
      <div className="space-y-3">
        {isTabLoading && !ws.attention ? (
          <div
            className={cn(
              CRM_PANEL,
              "min-h-[280px] animate-pulse bg-[var(--surface-dim)]",
            )}
          />
        ) : !ws.attention ? (
          <div className={cn(CRM_PANEL, "p-6")}>
            <EmptyDash message="Work queue data is not available yet." />
          </div>
        ) : (
          <CrmSalesAttention
            owner={canSeeOwnerPicker ? owner : "All"}
            prefetchedAttention={ws.attention}
            variant="hubspot"
            focusMode
            expanded
          />
        )}
      </div>

      {/* 2. Follow-ups */}
      {hasAccess("leads:read") ? (
        <FollowUpsPanel
          ws={ws}
          error={error}
          isTabLoading={followUpsLoading}
        />
      ) : null}

      {/* 3. Tasks due */}
      <TasksDuePanel
        ws={ws}
        taskSearch={taskSearch}
        setTaskSearch={setTaskSearch}
        taskFilter={taskFilter}
        setTaskFilter={setTaskFilter}
        filteredTasks={filteredTasks}
        renderedTasks={renderedTasks}
        setVisibleTaskCount={setVisibleTaskCount}
      />
    </div>
  );
}
