'use client';

import { LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import type { PortalDeliveryBoard } from './types';

export function PortalDeliveryBoardSection({ board }: { board: PortalDeliveryBoard }) {
  return (
    <div id="portal-delivery" className={cn(HS_PANEL, 'scroll-mt-32 p-8 md:scroll-mt-28')}>
      <h3 className="mb-2 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
        <LayoutDashboard size={14} className="text-[var(--hs-link)]" />
        Delivery board
      </h3>
      <p className="mb-6 text-xs font-medium text-[var(--text-muted)]">
        Live task counts on <span className="font-bold text-[var(--text-main)]">{board.name}</span>{' '}
        <span className="font-mono text-xs opacity-70">({board.key})</span>
        <span> — {board.totalIssues} items total</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {board.columns.map((col) => (
          <div
            key={col.name}
            className="min-w-[100px] rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/50 px-3 py-2 text-center"
          >
            <p className="mb-1 truncate text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {col.name}
            </p>
            <p className="text-lg font-bold tabular-nums text-[var(--text-main)]">{col.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
