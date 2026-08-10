"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import {
  Phone,
  PhoneCall,
  UserX,
  Clock,
  History,
  ChevronRight,
  ListTodo,
} from "lucide-react";
import WorkspaceShell, {
  type WorkspaceShellContext,
} from "../_components/WorkspaceShell";
import {
  EmptyHs,
  HsKpi,
  HsSection,
  ActivityList,
  SummarySectionLabel,
  TabSectionSkeleton,
  HS_PANEL,
  INITIAL_WORKSPACE_ITEMS,
  WORKSPACE_ITEMS_INCREMENT,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

const CrmSalesAttention = dynamic(
  () => import("@/components/crm/reports/panels/CrmSalesAttention"),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[200px] rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] animate-pulse"
        aria-hidden
      />
    ),
  },
);

function isCallActivity(type?: string) {
  const t = String(type || "").trim().toLowerCase();
  return t === "call" || t === "calls" || t.includes("call");
}

function CallsWorkspaceBody(ctx: WorkspaceShellContext) {
  const {
    ws,
    error,
    isTabLoading,
    owner,
    canSeeOwnerPicker,
    hasAccess,
    metrics,
    filteredActivities,
  } = ctx;

  const [visibleCallCount, setVisibleCallCount] = useState(INITIAL_WORKSPACE_ITEMS);

  useEffect(() => {
    setVisibleCallCount(INITIAL_WORKSPACE_ITEMS);
  }, [owner, filteredActivities.length]);

  const callActivities = useMemo(
    () => filteredActivities.filter((a) => isCallActivity(a.type)),
    [filteredActivities],
  );
  const renderedCalls = callActivities.slice(0, visibleCallCount);
  const neverCount = ws?.attention?.neverContactedLeads?.length ?? 0;
  const staleCount = ws?.attention?.staleLeads?.length ?? 0;

  if (
    !hasAccess("dashboard:read") &&
    !hasAccess("workspace-calls:read") &&
    !hasAccess("activities:read") &&
    !hasAccess("leads:read")
  ) {
    return (
      <div className={cn(HS_PANEL, "p-6")}>
        <EmptyHs message="You don’t have permission to view the call workspace." />
      </div>
    );
  }

  if (isTabLoading) {
    return <TabSectionSkeleton className="min-h-[280px]" />;
  }

  if (!ws) {
    return (
      <div className={cn(HS_PANEL, "p-6")}>
        <EmptyHs
          message={
            error || "Workspace data is not available. Try refreshing the page."
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-0 space-y-6 outline-none">
      <SummarySectionLabel
        title="Telecalling workspace"
        subtitle="Dial queue for never-contacted and stale leads, plus calls logged in this period."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HsKpi
          label="Need first call"
          value={neverCount}
          sub="No outreach logged"
          icon={<UserX className="h-4 w-4 text-[var(--hs-link)]" />}
        />
        <HsKpi
          label="Stale follow-up"
          value={staleCount}
          sub="Due for another touch"
          icon={<Clock className="h-4 w-4 text-[var(--hs-link)]" />}
        />
        <HsKpi
          label="Calls logged"
          value={callActivities.length}
          sub="In selected window"
          icon={<PhoneCall className="h-4 w-4 text-[var(--hs-link)]" />}
        />
        <HsKpi
          label="Attention total"
          value={neverCount + staleCount}
          sub={`${metrics.overdueTasks} overdue tasks`}
          icon={<ListTodo className="h-4 w-4 text-[var(--hs-link)]" />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <NextLink
          href="/crm/calls"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
        >
          <Phone className="h-3.5 w-3.5 text-[var(--primary)]" />
          Log a call
          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </NextLink>
        <NextLink
          href="/crm/leads"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
        >
          Open leads
          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </NextLink>
        <NextLink
          href="/crm/calls"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
        >
          <History className="h-3.5 w-3.5 text-[var(--primary)]" />
          Full call logs
          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </NextLink>
      </div>

      {hasAccess("leads:read") || hasAccess("dashboard:read") ? (
        <HsSection
          title="Dial queue"
          icon={<Phone className="h-4 w-4 text-[var(--text-main)]" />}
        >
          <CrmSalesAttention
            owner={canSeeOwnerPicker ? owner : "All"}
            prefetchedAttention={ws.attention}
            variant="hubspot"
            focusMode
            queueKeys={["never", "stale"]}
            defaultQueueKey="never"
          />
        </HsSection>
      ) : null}

      <HsSection
        title="Recent calls"
        icon={<PhoneCall className="h-4 w-4 text-[var(--text-main)]" />}
      >
        {!callActivities.length ? (
          <EmptyHs message="No calls logged in this period. Use Log a call or open a lead to dial." />
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              {callActivities.length} call
              {callActivities.length === 1 ? "" : "s"} in this window
            </p>
            <ActivityList items={renderedCalls} dense={false} />
            {renderedCalls.length < callActivities.length ? (
              <button
                type="button"
                onClick={() =>
                  setVisibleCallCount((p) => p + WORKSPACE_ITEMS_INCREMENT)
                }
                className="mt-3 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--hs-link)] hover:bg-[var(--background)]"
              >
                Show more calls
              </button>
            ) : null}
          </>
        )}
      </HsSection>
    </div>
  );
}

export default function CallsDashboardPage() {
  return (
    <WorkspaceShell section="calls">
      {(ctx) => <CallsWorkspaceBody {...ctx} />}
    </WorkspaceShell>
  );
}
