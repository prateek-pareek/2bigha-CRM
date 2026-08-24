"use client";

import WorkspaceShell from "../_components/WorkspaceShell";
import WorkDashboardView from "../_components/dashboards/WorkDashboardView";
import { EmptyHs, HS_PANEL } from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function WorkDashboardPage() {
  return (
    <WorkspaceShell section="work">
      {({
        ws,
        loading,
        error,
        isTabLoading,
        hasAccess,
        windowFilter,
      }) => (
        <div className="mt-0 space-y-4 outline-none">
          {!hasAccess("dashboard:read") &&
          !hasAccess("workspace-work:read") &&
          !hasAccess("leads:read") ? (
            <div className={cn(HS_PANEL, "p-6")}>
              <EmptyHs message="You don’t have permission to view the work dashboard." />
            </div>
          ) : loading && !ws ? (
            <div className="grid grid-cols-2 gap-3 animate-pulse md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn("h-20", HS_PANEL, "bg-[var(--surface-dim)]")}
                />
              ))}
            </div>
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
            <WorkDashboardView
              ws={ws}
              error={error}
              isTabLoading={isTabLoading}
              windowFilter={windowFilter}
            />
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
