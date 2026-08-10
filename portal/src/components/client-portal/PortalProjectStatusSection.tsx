'use client';

import { Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import type { PortalDeal } from './types';

type PortalProjectStatusSectionProps = {
  deal: PortalDeal;
  startDateLabel: string;
  deadlineLabel: string;
};

/**
 * Project status for clients: timeline (start / deadline) and optional next step.
 */
export function PortalProjectStatusSection({
  deal,
  startDateLabel,
  deadlineLabel,
}: PortalProjectStatusSectionProps) {
  return (
    <div id="portal-timeline" className={cn(HS_PANEL, 'relative scroll-mt-32 overflow-hidden p-8 md:scroll-mt-28')}>
      <h3 className="mb-12 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
        <Clock size={14} className="text-[var(--hs-link)]" />
        Project status &amp; timeline
      </h3>

      <div className="relative px-6 pb-4">
        <div className="absolute left-0 right-0 top-[21px] z-0 hidden h-[3px] rounded-full bg-[var(--surface-dim)] md:block" />

        <div className="relative z-10 grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-0">
          <div className="relative">
            <div className="absolute -left-1 top-[21px] z-20 hidden h-4 w-4 -translate-y-1/2 rounded-full border-4 border-white bg-[var(--text-main)] shadow-sm md:block" />
            <div className="pt-10 md:pt-12">
              <p className="mb-1.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-main)] md:hidden" />
                Start date
              </p>
              <p className="text-sm font-bold leading-none tracking-tight text-[var(--text-main)]">
                {startDateLabel}
              </p>
            </div>
          </div>

          <div className="relative md:text-right">
            <div className="absolute -right-1 top-[21px] z-20 hidden h-4 w-4 -translate-y-1/2 rounded-full border-4 border-white bg-[var(--hs-link)] shadow-md shadow-[var(--hs-link)]/25 md:block" />
            <div className="pt-10 md:pt-12">
              <p className="mb-1.5 flex items-center justify-end gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Target date
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)] md:hidden" />
              </p>
              <p className="text-sm font-bold leading-none tracking-tight text-[var(--hs-link)]">
                {deadlineLabel}
              </p>
            </div>
          </div>
        </div>
      </div>

      {deal.nextStep ? (
        <div className="mt-12 flex items-start gap-4 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/60 p-4 px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--hs-link)] shadow-sm">
            <ArrowRight size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 pt-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--hs-link)]">
              Next step
            </p>
            <p className="truncate text-sm font-semibold leading-relaxed text-[var(--text-main)]">
              {deal.nextStep}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
