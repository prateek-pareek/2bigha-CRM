"use client";

import { Calendar, Clock, CheckCircle2 } from "lucide-react";
import { HS_PANEL } from "./panel-styles";
import { cn } from "@/lib/utils";
import type { PortalPayload } from "./types";

export function PortalDeadlinesSection({ deal }: { deal: PortalPayload["deal"] }) {
  const deadlines = deal?.portalDeadlines || [];

  return (
    <section id="portal-deadlines" className={cn(HS_PANEL, "scroll-mt-28 p-5 md:p-6 md:scroll-mt-24")}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-dim)] pb-3">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[var(--hs-link)]" />
          Key Deadlines
        </h2>
      </div>

      <div className="mt-5">
        {deadlines.length === 0 ? (
          <div className="text-center py-6 bg-[#fafbfc] rounded-xl border border-dashed border-[var(--border-color)]">
            <Calendar className="h-8 w-8 text-[var(--border-color)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No upcoming deadlines.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {deadlines.map((d, idx) => {
              const deadlineDate = new Date(d.date);
              const now = new Date();
              const isPast = deadlineDate < now;
              const daysAway = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
              const isClose = !isPast && daysAway <= 3;

              return (
                <div key={idx} className={cn(
                  "p-4 rounded-xl border shadow-sm flex flex-col gap-2",
                  isPast ? "bg-emerald-50/50 border-emerald-100" : isClose ? "bg-amber-50/50 border-amber-200" : "bg-white border-[var(--surface-dim)]"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--text-main)]">{d.label}</span>
                    {isPast ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Clock className={cn("h-4 w-4", isClose ? "text-amber-500" : "text-[var(--primary-muted)]")} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-black/5">
                    <span className={cn(
                      "text-xs font-bold",
                      isPast ? "text-emerald-700" : isClose ? "text-amber-700" : "text-[var(--text-muted)]"
                    )}>
                      {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {!isPast && (
                      <span className={cn(
                        "text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                        isClose ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                      )}>
                        {daysAway === 0 ? 'Today' : `${daysAway} days left`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
