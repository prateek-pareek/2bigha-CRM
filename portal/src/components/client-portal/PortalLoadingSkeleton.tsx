'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';

export function PortalLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-64 shrink-0 bg-[#425b76] lg:block" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-16 shrink-0 border-b border-[var(--border-color)] bg-white px-6">
            <div className="flex h-full items-center gap-4">
              <div className="h-9 w-9 animate-pulse rounded-md bg-[var(--surface-dim)]" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-24 animate-pulse rounded bg-[var(--surface-dim)]" />
                <div className="h-4 w-48 max-w-[60%] animate-pulse rounded bg-[var(--surface-dim)]" />
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-6 p-6 md:p-8">
            <div className="space-y-3 border-b border-[var(--border-color)] pb-6">
              <div className="h-5 w-40 animate-pulse rounded bg-[var(--surface-dim)]" />
              <div className="h-3 w-full max-w-lg animate-pulse rounded bg-[var(--surface-dim)]/80" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={cn(HS_PANEL, 'h-28 animate-pulse bg-[var(--surface-dim)]/60')} />
              ))}
            </div>
            <div className={cn(HS_PANEL, 'h-48 animate-pulse bg-[var(--surface-dim)]/40')} />
          </div>
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-color)] bg-white px-4 py-2 shadow-md">
        <Loader2 className="animate-spin text-[var(--hs-link)]" size={18} />
        <span className="text-xs font-semibold text-[var(--text-main)]">Loading your portal…</span>
      </div>
    </div>
  );
}
