"use client";

import SalesOverviewDashboardView from "../_components/dashboards/SalesOverviewDashboardView";
import WorkspaceShell from "../_components/WorkspaceShell";
import { EmptyHs, HS_PANEL } from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function OverviewDashboardPage() {
  return (
    <WorkspaceShell section="summary">
      {({
        ws,
        loading,
        error,
        owner,
        windowFilter,
        compare,
        compareMode,
        canViewRevenueForecast,
        selectedOwnerLabel,
      }) => (
        <div className="mt-0 outline-none space-y-4">
          {loading && !ws ? (
            <div className="grid grid-cols-2 gap-3 animate-pulse md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
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
            <SalesOverviewDashboardView
              ownerId={owner}
              ownerLabel={selectedOwnerLabel || "All"}
              windowFilter={windowFilter}
              compare={compare}
              compareMode={compareMode}
              canViewRevenue={canViewRevenueForecast}
            />
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
