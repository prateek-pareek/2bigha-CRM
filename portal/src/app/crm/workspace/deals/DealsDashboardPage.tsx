"use client";

import DealsDashboardView from "../_components/dashboards/DealsDashboardView";
import RevenueSummaryDashboardView from "../_components/dashboards/RevenueSummaryDashboardView";
import WorkspaceShell from "../_components/WorkspaceShell";
import { EmptyHs, HS_PANEL, SummarySectionLabel } from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function DealsDashboardPage() {
  return (
    <WorkspaceShell section="deals">
      {({
        ws,
        loading,
        error,
        metrics,
        owner,
        windowFilter,
        compare,
        hasAccess,
        canViewRevenueForecast,
        selectedOwnerLabel,
      }) => (
        <div className="mt-0 space-y-6 outline-none">
          {!hasAccess("dashboard:read") &&
          !hasAccess("workspace-deals:read") &&
          !hasAccess("deals:read") ? (
            <div className={cn(HS_PANEL, "p-6")}>
              <EmptyHs message="You don’t have permission to view deals." />
            </div>
          ) : !ws && !loading ? (
            <div className={cn(HS_PANEL, "p-6")}>
              <EmptyHs
                message={
                  error || "Workspace data is not available. Try refreshing the page."
                }
              />
            </div>
          ) : (
            <>
              <DealsDashboardView
                ownerId={owner}
                ownerLabel={selectedOwnerLabel || "All"}
                windowFilter={windowFilter}
                compare={compare}
                canViewRevenue={canViewRevenueForecast}
                pipelineByStage={ws?.pipelineByStage || []}
                atRiskCount={ws?.atRiskDeals?.length ?? 0}
                closingSoonCount={ws?.dealsClosingSoon?.length ?? 0}
                openDeals={metrics.openDeals}
                pipelineValue={metrics.pipelineValue}
                dealsAddedByDay={ws?.dealsAddedByDay || []}
              />
              {canViewRevenueForecast ? (
                <div className="space-y-4">
                  <SummarySectionLabel
                    title="Revenue summary"
                    subtitle="Pipeline value and revenue snapshot for the selected owner and window."
                  />
                  {loading && !ws ? (
                    <div className="grid animate-pulse grid-cols-2 gap-3 md:grid-cols-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={cn("h-20", HS_PANEL, "bg-[var(--surface-dim)]")}
                        />
                      ))}
                    </div>
                  ) : ws ? (
                    <RevenueSummaryDashboardView
                      ownerId={owner}
                      ownerLabel={selectedOwnerLabel || "All"}
                      windowFilter={windowFilter}
                      compare={compare}
                      canViewRevenue={canViewRevenueForecast}
                      pipelineValue={metrics.pipelineValue}
                      openDeals={metrics.openDeals}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
