'use client';

import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import type { PortalDeal } from './types';

type PortalOverviewHeaderProps = {
  deal: PortalDeal;
  refreshing: boolean;
  onRefresh: () => void;
};

export function PortalOverviewHeader({ deal, refreshing, onRefresh }: PortalOverviewHeaderProps) {
  const statusText = deal.stage || deal.status || 'In progress';

  return (
    <div className="flex flex-col gap-4 border-b border-[var(--border-color)] pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-main)]">Project overview</h2>
        <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--text-muted)]">
          Progress, timeline, and payment milestones for{' '}
          <span className="font-semibold text-[var(--text-main)]">
            {deal.organization?.name || 'your organization'}
          </span>
          .
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--text-main)] shadow-sm transition hover:border-[var(--hs-link)]/35 hover:bg-[var(--background)] disabled:opacity-50"
          aria-label="Refresh portal data"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <div className="flex sm:hidden">
          <div className={cn(HS_PANEL, 'px-4 py-2')}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Status</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--hs-link)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--hs-link)]" />
              {statusText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
