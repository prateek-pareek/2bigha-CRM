"use client";

import NextLink from "next/link";
import { AlertTriangle, Calendar, Clock, Mail, ChevronRight } from "lucide-react";
import WorkspaceShell from "../_components/WorkspaceShell";
import {
  EmptyHs, HsKpi, HsSection, SummarySectionLabel, TabSectionSkeleton,
  HS_PANEL, HS_TEXT, HS_MUTED,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function FollowUpsDashboardPage() {
  return (
    <WorkspaceShell section="follow_ups">
      {({ ws, error, isTabLoading, hasAccess }) => (

                  <div className="mt-0 outline-none space-y-4">
                  {!hasAccess("leads:read") ? (
                    <div className={cn(HS_PANEL, "p-6")}>
                      <EmptyHs message="You don’t have permission to view scheduled follow-ups." />
                    </div>
                  ) : isTabLoading ? (
                    <TabSectionSkeleton className="min-h-[220px]" />
                  ) : !ws ? (
                    <div className={cn(HS_PANEL, "p-6")}>
                      <EmptyHs
                        message={
                          error ||
                          "Workspace data is not available. Try refreshing the page."
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <SummarySectionLabel
                        title="Scheduled follow-ups"
                        subtitle="Pending workflow emails for your leads and contacts — including overdue sends still waiting to run."
                      />
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 mb-4">
                        <HsKpi
                          label="Pending sends"
                          value={ws.upcomingFollowUps?.totalPending ?? 0}
                          sub="Next 60 days (and overdue)"
                          icon={<Mail className="h-4 w-4 text-[var(--hs-link)]" />}
                        />
                        <HsKpi
                          label="Next scheduled"
                          value={
                            ws.upcomingFollowUps?.nextRunAt
                              ? new Date(ws.upcomingFollowUps.nextRunAt).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )
                              : "—"
                          }
                          sub={
                            ws.upcomingFollowUps?.nextRunAt
                              ? new Date(ws.upcomingFollowUps.nextRunAt).toLocaleTimeString(
                                  undefined,
                                  { hour: "numeric", minute: "2-digit" },
                                )
                              : "No pending follow-ups"
                          }
                          icon={<Clock className="h-4 w-4 text-[var(--hs-link)]" />}
                        />
                        <HsKpi
                          label="Overdue"
                          value={ws.upcomingFollowUps?.overdueCount ?? 0}
                          sub="Past scheduled time, still pending"
                          icon={<AlertTriangle className="h-4 w-4 text-rose-600" />}
                        />
                      </div>
                      <HsSection
                        title="Upcoming & overdue"
                        icon={<Calendar className="h-4 w-4 text-[var(--text-main)]" />}
                      >
                        {!ws.upcomingFollowUps?.items.length ? (
                          <EmptyHs message="No scheduled follow-up emails in the next 60 days for this view." />
                        ) : (
                          <ul className="divide-y divide-[var(--surface-dim)]">
                            {ws.upcomingFollowUps.items.map((item, idx) => {
                              const href =
                                item.entityType === "Contact"
                                  ? `/crm/contacts/${item.entityId}`
                                  : `/crm/leads/${item.entityId}`;
                              const when = new Date(item.runAt);
                              return (
                                <li key={String((item as any).jobId || (item as any).id) + "-" + Math.random()}>
                                  <NextLink
                                    href={href}
                                    className="flex items-start justify-between gap-3 py-3 hover:bg-[var(--background)] rounded-md -mx-2 px-2"
                                  >
                                    <div className="min-w-0">
                                      <p className={cn("text-sm font-medium truncate", HS_TEXT)}>
                                        {item.name}
                                        {item.organization ? (
                                          <span className={cn(" font-normal", HS_MUTED)}>
                                            {" "}
                                            · {item.organization}
                                          </span>
                                        ) : null}
                                      </p>
                                      <p className={cn("text-sm mt-0.5", HS_MUTED)}>
                                        {item.stepLabel}
                                        {item.leadOwner ? ` · ${item.leadOwner}` : ""}
                                      </p>
                                      <p className="text-sm text-[var(--text-muted)] mt-1">
                                        {when.toLocaleString(undefined, {
                                          weekday: "short",
                                          month: "short",
                                          day: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                      {item.overdue ? (
                                        <span className="text-xs font-semibold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
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
                      </HsSection>
                    </>
                  )}
                </div>
      )}
    </WorkspaceShell>
  );
}
