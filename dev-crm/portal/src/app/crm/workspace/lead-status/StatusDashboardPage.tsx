"use client";

import NextLink from "next/link";
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronRight, Clock, UserX, Users,
} from "lucide-react";
import WorkspaceShell from "../_components/WorkspaceShell";
import {
  EmptyHs, HsKpi, HsSection, SummarySectionLabel, TabSectionSkeleton,
  WorkspaceLeadLinkList, WorkspaceStackedListTabs, HS_PANEL, HS_TEXT, HS_MUTED, recordHref,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function StatusDashboardPage() {
  return (
    <WorkspaceShell section="lead_status">
      {({ ws, error, isTabLoading, hasAccess, leadFollowUpView, setLeadFollowUpView, selectedLeadFollowUpStats, leadIntakeView, setLeadIntakeView, leadIntakeStatusView, setLeadIntakeStatusView, leadIntakeRows, leadIntakeStatusTabs, filteredLeadIntakeRows }) => (

                  <div className="mt-0 outline-none space-y-4">
                  {!hasAccess("leads:read") ? (
                    <div className={cn(HS_PANEL, "p-6")}>
                      <EmptyHs message="You don’t have permission to view lead status." />
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
                        title="Weekly follow-up status"
                        subtitle="This week: how many new leads were added, how many have follow-up scheduling, how many are done, and who still needs action."
                      />
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLeadFollowUpView("today")}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                            leadFollowUpView === "today"
                              ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                              : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                          )}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeadFollowUpView("yesterday")}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                            leadFollowUpView === "yesterday"
                              ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                              : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                          )}
                        >
                          Yesterday
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeadFollowUpView("thisWeek")}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                            leadFollowUpView === "thisWeek"
                              ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                              : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                          )}
                        >
                          This week
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        <HsKpi
                          label={leadFollowUpView === "thisWeek" ? "Leads this week" : "Leads added"}
                          value={selectedLeadFollowUpStats?.totalLeadsAdded ?? 0}
                          sub={
                            leadFollowUpView === "today"
                              ? "Created today"
                              : leadFollowUpView === "yesterday"
                                ? "Created yesterday"
                                : "Created in current week"
                          }
                          icon={<Users className="h-4 w-4 text-[var(--hs-link)]" />}
                        />
                        <HsKpi
                          label="Scheduled"
                          value={selectedLeadFollowUpStats?.followUpScheduled ?? 0}
                          sub="Follow-up sequence scheduled"
                          icon={<Calendar className="h-4 w-4 text-[var(--hs-link)]" />}
                        />
                        <HsKpi
                          label="Follow-up done"
                          value={selectedLeadFollowUpStats?.followUpDone ?? 0}
                          sub="Sequence completed/stopped"
                          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        />
                        <HsKpi
                          label="Not scheduled"
                          value={selectedLeadFollowUpStats?.notScheduled ?? 0}
                          sub="No follow-up sequence yet"
                          icon={<UserX className="h-4 w-4 text-amber-700" />}
                        />
                        <HsKpi
                          label="Scheduled, not done"
                          value={selectedLeadFollowUpStats?.scheduledNotDone ?? 0}
                          sub="Scheduled but pending completion"
                          icon={<AlertTriangle className="h-4 w-4 text-rose-600" />}
                        />
                      </div>

                      <WorkspaceStackedListTabs
                        defaultValue="not_scheduled"
                        tabs={[
                          {
                            value: "not_scheduled",
                            label: "Not scheduled",
                            count: selectedLeadFollowUpStats?.notScheduled ?? 0,
                            action: { href: "/crm/leads", label: "Leads app" },
                            icon: <UserX className="h-3.5 w-3.5 text-amber-700" />,
                            content: !selectedLeadFollowUpStats?.notScheduledLeads?.length ? (
                              <EmptyHs message="All leads in this window have follow-up scheduled." />
                            ) : (
                              <WorkspaceLeadLinkList leads={selectedLeadFollowUpStats.notScheduledLeads} />
                            ),
                          },
                          {
                            value: "scheduled_pending",
                            label: "Scheduled, pending",
                            count: selectedLeadFollowUpStats?.scheduledNotDone ?? 0,
                            action: { href: "/crm/leads", label: "Leads app" },
                            icon: <Clock className="h-3.5 w-3.5 text-rose-600" />,
                            content: !selectedLeadFollowUpStats?.scheduledNotDoneLeads?.length ? (
                              <EmptyHs message="No scheduled follow-ups are pending completion." />
                            ) : (
                              <WorkspaceLeadLinkList leads={selectedLeadFollowUpStats.scheduledNotDoneLeads} />
                            ),
                          },
                        ]}
                      />

                      <SummarySectionLabel
                        title="Lead intake list"
                        subtitle="Filter newly created leads by Today, Yesterday, or This Week."
                      />
                      <HsSection
                        title="New leads"
                        action={{ href: "/crm/leads", label: "Leads app" }}
                        icon={<Users className="h-4 w-4 text-[var(--text-main)]" />}
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLeadIntakeView("today")}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              leadIntakeView === "today"
                                ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                                : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                            )}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setLeadIntakeView("yesterday")}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              leadIntakeView === "yesterday"
                                ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                                : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                            )}
                          >
                            Yesterday
                          </button>
                          <button
                            type="button"
                            onClick={() => setLeadIntakeView("thisWeek")}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              leadIntakeView === "thisWeek"
                                ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                                : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                            )}
                          >
                            This week
                          </button>
                        </div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLeadIntakeStatusView("all")}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              leadIntakeStatusView === "all"
                                ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                                : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                            )}
                          >
                            All ({leadIntakeRows.length})
                          </button>
                          {leadIntakeStatusTabs.map((tab) => (
                            <button
                              key={tab.name}
                              type="button"
                              onClick={() => setLeadIntakeStatusView(tab.name)}
                              className={cn(
                                "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                                leadIntakeStatusView === tab.name
                                  ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
                                  : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
                              )}
                            >
                              {tab.name} ({tab.count})
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const rows = filteredLeadIntakeRows;
                          if (!leadIntakeRows.length) {
                            return <EmptyHs message="No leads in this filter." />;
                          }
                          if (!rows.length) {
                            return <EmptyHs message="No leads in this status." />;
                          }
                          return (
                            <ul className="divide-y divide-[var(--surface-dim)]">
                              {rows.map((l) => (
                                <li key={`${l.entityType || "lead"}-${l.id}`}>
                                  <NextLink
                                    href={
                                      recordHref(
                                        l.entityType === "platformOpportunity"
                                          ? "platformopportunity"
                                          : "lead",
                                        l.id,
                                      ) || `/crm/leads/${l.id}`
                                    }
                                    className="flex items-start justify-between gap-3 py-3 hover:bg-[var(--background)] rounded-md -mx-2 px-2"
                                  >
                                    <div className="min-w-0">
                                      <p className={cn("text-sm font-medium truncate", HS_TEXT)}>{l.name}</p>
                                      <p className={cn("text-sm mt-0.5 truncate", HS_MUTED)}>
                                        {l.organization || l.email || "—"}
                                      </p>
                                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="inline-flex rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                                          {String(l.status || "New").trim() || "New"}
                                        </span>
                                        <span
                                          className={cn(
                                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                            l.entityType === "platformOpportunity"
                                              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200"
                                              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
                                          )}
                                        >
                                          {l.entityType === "platformOpportunity" ? "Platform" : "Lead"}
                                        </span>
                                      </p>
                                      <p className="text-sm text-[var(--text-muted)] mt-1">
                                        {new Date(l.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border-color)]" />
                                  </NextLink>
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </HsSection>
                    </>
                  )}
                </div>
      )}
    </WorkspaceShell>
  );
}
