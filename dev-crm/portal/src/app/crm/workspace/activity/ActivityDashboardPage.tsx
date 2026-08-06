"use client";

import { TrendingUp } from "lucide-react";
import WorkspaceShell from "../_components/WorkspaceShell";
import {
  EmptyHs, HsSection, ActivityList, HS_PANEL, WORKSPACE_ITEMS_INCREMENT,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function ActivityDashboardPage() {
  return (
    <WorkspaceShell section="activity">
      {({ ws, loading, error, owner, setOwner, viewAll, canSeeOwnerPicker, visibleOwners, activityTypeFilter, setActivityTypeFilter, filteredActivities, renderedActivities, setVisibleActivityCount }) => (

                  <div className="mt-0 outline-none">
              {!loading && !ws && (
                <div className={cn(HS_PANEL, "p-6")}>
                  <EmptyHs
                    message={
                      error ||
                      "Workspace data is not available. Try refreshing the page."
                    }
                  />
                </div>
              )}
              {!loading && ws && (
                <HsSection title="Activity stream" icon={<TrendingUp className="h-4 w-4 text-[var(--text-main)]" />}>
                    <div className="flex flex-wrap gap-2 md:items-center">
                      {canSeeOwnerPicker && (
                         <select
                           value={owner}
                           onChange={(e) => setOwner(e.target.value)}
                           className="rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm font-medium text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--hs-link)]/25 focus:border-[var(--hs-link)] min-w-[200px]"
                           aria-label="Filter activity by employee"
                         >
                           {viewAll && <option value="All">All employees</option>}
                           {visibleOwners.map((o) => (
                             <option key={o._id} value={o._id}>
                               {[o.firstName, o.lastName].filter(Boolean).join(" ") || o.email}
                             </option>
                           ))}
                         </select>
                      )}
                      <select
                        value={activityTypeFilter}
                        onChange={(e) => setActivityTypeFilter(e.target.value)}
                        className="rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--hs-link)]/25 focus:border-[var(--hs-link)]"
                        aria-label="Activity type filter"
                      >
                        <option value="all">All activity types</option>
                        {Array.from(new Set(ws.recentActivities.map((a) => a.type).filter(Boolean))).map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <p className="text-sm text-[var(--text-muted)] ml-auto">
                        Showing {filteredActivities.length} actions in this period
                      </p>
                    </div>
                  <ActivityList items={renderedActivities} dense={false} />
                  {renderedActivities.length < filteredActivities.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleActivityCount((p) => p + WORKSPACE_ITEMS_INCREMENT)}
                      className="mt-3 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--hs-link)] hover:bg-[var(--background)]"
                    >
                      Show more activity
                    </button>
                  )}
                </HsSection>
              )}
            </div>
      )}
    </WorkspaceShell>
  );
}
