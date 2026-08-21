"use client";

import LeadsDashboardView from "../_components/dashboards/LeadsDashboardView";
import LeadStatusPanel from "../_components/LeadStatusPanel";
import WorkspaceShell from "../_components/WorkspaceShell";
import {
  EmptyHs,
  HS_PANEL,
  LeadsAddedByDayPanel,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function LeadsDashboardPage() {
  return (
    <WorkspaceShell section="prospecting">
      {({
        ws,
        error,
        isTabLoading,
        owner,
        windowFilter,
        compare,
        setWindowFilter,
        intakeKind,
        setIntakeKind,
        isSummaryLeadsLoading,
        hasAccess,
        selectedOwnerLabel,
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
      }) => (
        <div className="mt-0 space-y-6 outline-none">
          {!hasAccess("dashboard:read") &&
          !hasAccess("workspace-prospecting:read") &&
          !hasAccess("leads:read") ? (
            <div className={cn(HS_PANEL, "p-6")}>
              <EmptyHs message="You don’t have permission to view leads." />
            </div>
          ) : (
            <>
              <LeadsDashboardView
                ownerId={owner}
                ownerLabel={selectedOwnerLabel || "All"}
                windowFilter={windowFilter}
                compare={compare}
                neverContactedCount={ws?.attention?.neverContactedLeads?.length ?? 0}
                staleCount={ws?.attention?.staleLeads?.length ?? 0}
              />
              {hasAccess("leads:read") ? (
                isSummaryLeadsLoading ? (
                  <div
                    className={cn(
                      HS_PANEL,
                      "flex h-40 items-center justify-center",
                    )}
                  >
                    <span className="animate-pulse text-sm text-muted-foreground">
                      Loading daily lead counts…
                    </span>
                  </div>
                ) : (
                  <LeadsAddedByDayPanel
                    kind={intakeKind}
                    onKindChange={setIntakeKind}
                    showDealsTab={hasAccess("deals:read")}
                    ownerLabel={selectedOwnerLabel}
                    ownerId={owner === "All" ? null : owner}
                    onUseLast30Days={() => setWindowFilter("last_30_days")}
                    windowFilter={windowFilter}
                    days={
                      intakeKind === "deals"
                        ? ws?.dealsAddedByDay || []
                        : ws?.leadsAddedByDay || []
                    }
                    onDateClick={(date) => setWindowFilter(`${date},${date}`)}
                  />
                )
              ) : null}
              <LeadStatusPanel
                ws={ws}
                error={error}
                isTabLoading={isTabLoading}
                leadFollowUpView={leadFollowUpView}
                setLeadFollowUpView={setLeadFollowUpView}
                selectedLeadFollowUpStats={selectedLeadFollowUpStats}
                leadIntakeView={leadIntakeView}
                setLeadIntakeView={setLeadIntakeView}
                leadIntakeStatusView={leadIntakeStatusView}
                setLeadIntakeStatusView={setLeadIntakeStatusView}
                leadIntakeRows={leadIntakeRows}
                leadIntakeStatusTabs={leadIntakeStatusTabs}
                filteredLeadIntakeRows={filteredLeadIntakeRows}
              />
            </>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
