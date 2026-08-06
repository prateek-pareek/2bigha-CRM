"use client";

import NextLink from "next/link";
import { ChevronRight } from "lucide-react";
import {
  CRM_CHART_INFO,
  CRM_CHART_PRIMARY,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import {
  EmptyHs,
  TabSectionSkeleton,
  HS_TEXT,
  HS_MUTED,
  type WorkspacePayload,
} from "./workspace-ui";
import { EmptyDash, ViewAllLink } from "./dashboards/dashboardShared";
import { DashCardHeader } from "./dashboards/SalesOverviewCharts";
import { WorkKpiTile } from "./dashboards/WorkDashboardCharts";

type Props = {
  ws: WorkspacePayload | null;
  error: string | null;
  isTabLoading: boolean;
};

export default function FollowUpsPanel({ ws, error, isTabLoading }: Props) {
  if (isTabLoading) return <TabSectionSkeleton className="min-h-[180px]" />;
  if (!ws) {
    return (
      <div className={cn(CRM_PANEL, "p-6")}>
        <EmptyHs
          message={
            error || "Workspace data is not available. Try refreshing the page."
          }
        />
      </div>
    );
  }

  const nextRunLabel = ws.upcomingFollowUps?.nextRunAt
    ? new Date(ws.upcomingFollowUps.nextRunAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <WorkKpiTile
          label="Pending sends"
          value={ws.upcomingFollowUps?.totalPending ?? 0}
          sub="Next 60 days (and overdue)"
          accent={CRM_CHART_INFO}
        />
        <WorkKpiTile
          label="Overdue follow-ups"
          value={ws.upcomingFollowUps?.overdueCount ?? 0}
          sub="Past scheduled time, still pending"
          accent={CRM_CHART_WARNING}
        />
        <div className="relative overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)]">
          <span
            className="absolute inset-y-0 left-0 w-1 rounded-l-[var(--crm-radius-ui)]"
            style={{ background: CRM_CHART_PRIMARY }}
            aria-hidden
          />
          <p className="text-xs font-medium text-[var(--text-muted)]">
            Next scheduled
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-main)]">
            {nextRunLabel}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {ws.upcomingFollowUps?.nextRunAt
              ? new Date(ws.upcomingFollowUps.nextRunAt).toLocaleTimeString(
                  undefined,
                  { hour: "numeric", minute: "2-digit" },
                )
              : "No pending follow-ups"}
          </p>
        </div>
      </div>

      <section className={cn(CRM_PANEL, "overflow-hidden")}>
        <DashCardHeader
          title="Follow-ups"
          subtitle="Pending workflow emails for leads and contacts — including overdue sends."
          actions={<ViewAllLink href="/crm/leads" label="Open leads" />}
        />
        <div className="p-4 sm:p-5">
          {!ws.upcomingFollowUps?.items.length ? (
            <EmptyDash message="No scheduled follow-up emails in the next 60 days for this view." />
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {ws.upcomingFollowUps.items.map((item) => {
                const href =
                  item.entityType === "Contact"
                    ? `/crm/contacts/${item.entityId}`
                    : `/crm/leads/${item.entityId}`;
                const when = new Date(item.runAt);
                return (
                  <li
                    key={String(
                      (item as { jobId?: string; id?: string }).jobId ||
                        (item as { id?: string }).id ||
                        `${item.entityId}-${item.runAt}`,
                    )}
                  >
                    <NextLink
                      href={href}
                      className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-3 hover:bg-[var(--background)]"
                    >
                      <div className="min-w-0">
                        <p className={cn("truncate text-sm font-medium", HS_TEXT)}>
                          {item.name}
                          {item.organization ? (
                            <span className={cn(" font-normal", HS_MUTED)}>
                              {" "}
                              · {item.organization}
                            </span>
                          ) : null}
                        </p>
                        <p className={cn("mt-0.5 text-sm", HS_MUTED)}>
                          {item.stepLabel}
                          {item.leadOwner ? ` · ${item.leadOwner}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {when.toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {item.overdue ? (
                          <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
                            Overdue
                          </span>
                        ) : null}
                        <span className="text-xs font-medium text-[var(--text-muted)]">
                          {item.entityType}
                        </span>
                        <ChevronRight className="h-4 w-4 text-[var(--border-color)]" />
                      </div>
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          )}
          {(ws.upcomingFollowUps?.totalPending ?? 0) >
            (ws.upcomingFollowUps?.items.length ?? 0) && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Showing {ws.upcomingFollowUps?.items.length ?? 0} of{" "}
              {ws.upcomingFollowUps?.totalPending ?? 0} pending sends.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
