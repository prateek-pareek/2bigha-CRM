"use client";

import { Flag, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { HS_PANEL } from "./panel-styles";
import { cn } from "@/lib/utils";
import type { PortalPayload } from "./types";
import { motion } from "framer-motion";

export function PortalMilestonesSection({ deal }: { deal: PortalPayload["deal"] }) {
  const milestones = deal?.portalMilestones || [];

  return (
    <section id="portal-milestones" className={cn(HS_PANEL, "scroll-mt-28 p-5 md:p-6 md:scroll-mt-24")}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-dim)] pb-3">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          <Flag className="h-5 w-5 text-[var(--hs-link)]" />
          Project Milestones
        </h2>
      </div>

      <div className="mt-5">
        {milestones.length === 0 ? (
          <div className="text-center py-6 bg-[#fafbfc] rounded-xl border border-dashed border-[var(--border-color)]">
            <Flag className="h-8 w-8 text-[var(--border-color)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No milestones defined yet.</p>
          </div>
        ) : (
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15 }
              }
            }}
            className="space-y-6"
          >
            {milestones.map((m, idx) => {
              const isCompleted = m.status === 'completed';
              const isInProgress = m.status === 'in-progress';
              const progress = Math.max(0, Math.min(100, m.percentage || 0));

              return (
                <motion.div 
                  key={idx}
                  variants={{
                    hidden: { opacity: 0, x: -10 },
                    visible: { opacity: 1, x: 0 }
                  }}
                  className="group relative"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-300",
                        isCompleted ? "bg-emerald-100 text-emerald-600" : isInProgress ? "bg-[#e6f4f7] text-[var(--hs-link)]" : "bg-[var(--background)] text-[var(--border-color)]"
                      )}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-4.5 w-4.5" />
                        ) : isInProgress ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin" />
                        ) : (
                          <CircleDashed className="h-4.5 w-4.5" />
                        )}
                      </div>
                      <div>
                        <p className={cn(
                          "text-sm font-bold tracking-tight transition-colors",
                          isCompleted ? "text-emerald-700" : isInProgress ? "text-[var(--text-main)]" : "text-[var(--primary-muted)]"
                        )}>
                          {m.label}
                        </p>
                        <p className="text-xs text-[var(--primary-muted)] font-medium uppercase tracking-wider">
                          {isCompleted ? "Goal Reached" : isInProgress ? "Active Stage" : "Upcoming"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "text-xs font-bold tabular-nums",
                        isCompleted ? "text-emerald-500" : isInProgress ? "text-[var(--hs-link)]" : "text-[var(--border-color)]"
                      )}>
                        {isCompleted ? "100%" : isInProgress ? `${progress}%` : "0%"}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2.5 w-full bg-[#f0f4f7] rounded-full overflow-hidden shadow-inner">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${isCompleted ? 100 : progress}%` }}
                      transition={{ duration: 1.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        "h-full rounded-full transition-all duration-500 relative",
                        isCompleted ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : isInProgress ? "bg-gradient-to-r from-[var(--hs-link)] to-[#00b4d8]" : "bg-transparent"
                      )}
                    >
                      {isInProgress && (
                        <motion.div 
                          animate={{ x: ["0%", "100%"] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 bg-white/20 w-20 skew-x-12 blur-md"
                        />
                      )}
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </section>
  );
}
