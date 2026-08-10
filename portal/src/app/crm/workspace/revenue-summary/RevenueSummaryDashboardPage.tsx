"use client";

import RevenueSummaryDashboardView from "../_components/dashboards/RevenueSummaryDashboardView";
import WorkspaceShell from "../_components/WorkspaceShell";
import { EmptyHs, HS_PANEL } from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function RevenueSummaryDashboardPage() {
  return (
    <WorkspaceShell section="revenue_summary">
      {({
        ws,
        loading,
        error,
        metrics,
        owner,
        windowFilter,
        compare,
        canViewRevenueForecast,
        selectedOwnerLabel,
      }) => (
        <div className="mt-0 outline-none space-y-4">
          {!canViewRevenueForecast ? (
            <div className={cn(HS_PANEL, "p-6")}>
              <EmptyHs message="You don’t have permission to view revenue summary." />
            </div>
          ) : loading && !ws ? (
            <div className="grid grid-cols-2 gap-3 animate-pulse md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={cn("h-20", HS_PANEL, "bg-[var(--surface-dim)]")} />
              ))}
            </div>
          ) : !ws ? (
            <div className={cn(HS_PANEL, "p-6")}>
              <EmptyHs
                message={
                  error || "Workspace data is not available. Try refreshing the page."
                }
              />
            </div>
          ) : (
            <RevenueSummaryDashboardView
              ownerId={owner}
              ownerLabel={selectedOwnerLabel || "All"}
              windowFilter={windowFilter}
              compare={compare}
              canViewRevenue={canViewRevenueForecast}
              pipelineValue={metrics.pipelineValue}
              openDeals={metrics.openDeals}
            />
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
