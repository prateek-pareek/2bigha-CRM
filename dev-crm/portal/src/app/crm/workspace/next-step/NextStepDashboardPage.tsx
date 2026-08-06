"use client";

import NextLink from "next/link";
import { CheckCircle2 } from "lucide-react";
import WorkspaceShell from "../_components/WorkspaceShell";
import {
  EmptyHs, HsSection, HS_PANEL, HS_TEXT, HS_MUTED, fmtMoneyIfAllowed,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function NextStepDashboardPage() {
  return (
    <WorkspaceShell section="next_step">
      {({ ws, loading, error, canViewRevenueForecast }) => (

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
                    <HsSection
                      title="Deals missing next step"
                      action={{ href: "/crm/deals", label: "Fix deals" }}
                      icon={<CheckCircle2 className="h-4 w-4 text-[var(--text-main)]" />}
                    >
                      {!ws.nextStepRequired?.length ? (
                        <EmptyHs message="All open deals already have a next step." />
                      ) : (
                        <ul className="divide-y divide-[var(--surface-dim)]">
                          {ws.nextStepRequired.map((d, idx) => (
                            <li key={String((d as any).id || (d as any)._id) + "-" + Math.random()}>
                              <NextLink
                                href={`/crm/deals/${d.id}`}
                                className="flex items-center justify-between gap-3 py-3 hover:bg-[var(--background)] rounded-md -mx-2 px-2"
                              >
                                <div className="min-w-0">
                                  <p className={cn("text-sm font-medium truncate", HS_TEXT)}>{d.title}</p>
                                  <p className={cn("text-sm mt-0.5", HS_MUTED)}>
                                    {d.stage} · {fmtMoneyIfAllowed(d.dealValueINR ?? d.dealValue, canViewRevenueForecast)}
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
                    </HsSection>
                  )}
                </div>
      )}
    </WorkspaceShell>
  );
}
