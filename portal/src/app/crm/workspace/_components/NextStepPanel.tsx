"use client";

import NextLink from "next/link";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import {
  HS_TEXT,
  HS_MUTED,
  fmtMoneyIfAllowed,
  type WorkspacePayload,
} from "./workspace-ui";
import { EmptyDash, ViewAllLink } from "./dashboards/dashboardShared";
import { DashCardHeader } from "./dashboards/SalesOverviewCharts";

type Props = {
  ws: WorkspacePayload;
  canViewRevenueForecast: boolean;
};

export default function NextStepPanel({ ws, canViewRevenueForecast }: Props) {
  return (
    <section className={cn(CRM_PANEL, "overflow-hidden")}>
      <DashCardHeader
        title="Next step"
        subtitle="Open deals that still need a clear next action."
        actions={<ViewAllLink href="/crm/deals" label="Fix deals" />}
      />
      <div className="p-4 sm:p-5">
        {!ws.nextStepRequired?.length ? (
          <EmptyDash message="All open deals already have a next step." />
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {ws.nextStepRequired.map((d) => (
              <li
                key={String(
                  (d as { id?: string; _id?: string }).id ||
                    (d as { _id?: string })._id,
                )}
              >
                <NextLink
                  href={`/crm/deals/${d.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 hover:bg-[var(--background)]"
                >
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", HS_TEXT)}>
                      {d.title}
                    </p>
                    <p className={cn("mt-0.5 text-sm", HS_MUTED)}>
                      {d.stage} ·{" "}
                      {fmtMoneyIfAllowed(
                        d.dealValueINR ?? d.dealValue,
                        canViewRevenueForecast,
                      )}
                      {d.expectedClosureDate
                        ? ` · closes ${new Date(d.expectedClosureDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                    Missing next step
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
