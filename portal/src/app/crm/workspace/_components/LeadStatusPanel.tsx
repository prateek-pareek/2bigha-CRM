"use client";

import NextLink from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  UserX,
  Users,
} from "lucide-react";
import {
  EmptyHs,
  HsKpi,
  HsSection,
  SummarySectionLabel,
  TabSectionSkeleton,
  WorkspaceLeadLinkList,
  WorkspaceStackedListTabs,
  HS_PANEL,
  HS_TEXT,
  HS_MUTED,
  recordHref,
  type LeadFollowUpStats,
  type WorkspacePayload,
} from "./workspace-ui";
import { cn } from "@/lib/utils";

type LeadIntakeRow = NonNullable<
  NonNullable<WorkspacePayload["leadIntake"]>["thisWeek"]
>[number];

type Props = {
  ws: WorkspacePayload | null;
  error: string | null;
  isTabLoading: boolean;
  leadFollowUpView: "today" | "yesterday" | "thisWeek";
  setLeadFollowUpView: (v: "today" | "yesterday" | "thisWeek") => void;
  selectedLeadFollowUpStats: LeadFollowUpStats | null;
  leadIntakeView: "today" | "yesterday" | "thisWeek";
  setLeadIntakeView: (v: "today" | "yesterday" | "thisWeek") => void;
  leadIntakeStatusView: string;
  setLeadIntakeStatusView: (v: string) => void;
  leadIntakeRows: LeadIntakeRow[];
  leadIntakeStatusTabs: Array<{ name: string; count: number }>;
  filteredLeadIntakeRows: LeadIntakeRow[];
};

/** Weekly follow-up status + lead intake (Dreams-style stacked sections, 2Bigha components). */
export default function LeadStatusPanel({
  ws,
  error,
  isTabLoading,
  leadFollowUpView,
  setLeadFollowUpView,
  selectedLeadFollowUpStats,
  leadIntakeView,
  setLeadIntakeView,
  leadIntakeStatusView,
  setLeadIntakeStatusView,
  leadIntakeRows,
  leadIntakeStatusTabs,
  filteredLeadIntakeRows,
}: Props) {
  if (isTabLoading) {
    return <TabSectionSkeleton className="min-h-[220px]" />;
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

  const periodBtn = (active: boolean) =>
    cn(
      "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
      active
        ? "border-[var(--hs-link)] bg-[var(--accent)] text-[var(--hs-link)] dark:bg-[color-mix(in_srgb,var(--hs-link)_15%,var(--card-bg))]"
        : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
    );

  return (
    <div className="space-y-4">
      <SummarySectionLabel
        title="Lead status"
        subtitle="This week: how many new leads were added, follow-up scheduling, and who still needs action."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["thisWeek", "This week"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setLeadFollowUpView(key)}
            className={periodBtn(leadFollowUpView === key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
              <WorkspaceLeadLinkList
                leads={selectedLeadFollowUpStats.notScheduledLeads}
              />
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
              <WorkspaceLeadLinkList
                leads={selectedLeadFollowUpStats.scheduledNotDoneLeads}
              />
            ),
          },
        ]}
      />

      <SummarySectionLabel
        title="Lead intake"
        subtitle="Filter newly created leads by Today, Yesterday, or This Week."
      />
      <HsSection
        title="New leads"
        action={{ href: "/crm/leads", label: "Leads app" }}
        icon={<Users className="h-4 w-4 text-[var(--text-main)]" />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["thisWeek", "This week"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLeadIntakeView(key)}
              className={periodBtn(leadIntakeView === key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLeadIntakeStatusView("all")}
            className={periodBtn(leadIntakeStatusView === "all")}
          >
            All ({leadIntakeRows.length})
          </button>
          {leadIntakeStatusTabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setLeadIntakeStatusView(tab.name)}
              className={periodBtn(leadIntakeStatusView === tab.name)}
            >
              {tab.name} ({tab.count})
            </button>
          ))}
        </div>
        {!leadIntakeRows.length ? (
          <EmptyHs message="No leads in this filter." />
        ) : !filteredLeadIntakeRows.length ? (
          <EmptyHs message="No leads in this status." />
        ) : (
          <ul className="divide-y divide-[var(--surface-dim)]">
            {filteredLeadIntakeRows.map((l) => (
              <li key={`lead-${l.id}`}>
                <NextLink
                  href={recordHref("lead", l.id) || `/crm/leads/${l.id}`}
                  className="flex items-start justify-between gap-3 rounded-md py-3 -mx-2 px-2 hover:bg-[var(--background)]"
                >
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", HS_TEXT)}>
                      {l.name}
                    </p>
                    <p className={cn("mt-0.5 truncate text-sm", HS_MUTED)}>
                      {l.organization || l.email || "—"}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                        {String(l.status || "New").trim() || "New"}
                      </span>
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200">
                        Lead
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {new Date(l.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border-color)]" />
                </NextLink>
              </li>
            ))}
          </ul>
        )}
      </HsSection>
    </div>
  );
}
