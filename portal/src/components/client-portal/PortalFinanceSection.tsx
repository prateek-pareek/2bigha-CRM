'use client';

import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import { formatMoney } from './format-money';

type PortalFinanceSectionProps = {
  totalValue: number;
  paidAmount: number;
  remainingBalance: number;
  paidPercent: number;
  currency: string;
};

export function PortalFinanceSection({
  totalValue,
  paidAmount,
  remainingBalance,
  paidPercent,
  currency,
}: PortalFinanceSectionProps) {
  return (
    <div id="portal-financials" className="scroll-mt-32 space-y-4 md:scroll-mt-28">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          className={cn(HS_PANEL, 'group p-6 transition-colors hover:border-[var(--hs-link)]/35')}
        >
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Total value
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            {formatMoney(totalValue, currency)}
          </h3>
        </div>
        <div className={cn(HS_PANEL, 'p-6 transition-colors hover:border-[#16a34a]/35')}>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[#16a34a]">
            Amount paid
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-[#16a34a]">
            {formatMoney(paidAmount, currency)}
          </h3>
        </div>
        <div className={cn(HS_PANEL, 'p-6 opacity-95')}>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Balance due
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-[var(--text-main)]/80">
            {formatMoney(remainingBalance, currency)}
          </h3>
        </div>
      </div>
      {totalValue > 0 ? (
        <div className={cn(HS_PANEL, 'p-5')}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            <span>Collected vs total</span>
            <span className="tabular-nums text-[var(--text-main)]">{paidPercent}%</span>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface-dim)]"
            role="progressbar"
            aria-valuenow={paidPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Share of deal value collected"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#22c55e] transition-[width] duration-500 ease-out"
              style={{ width: `${paidPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">
            {formatMoney(paidAmount, currency)} of {formatMoney(totalValue, currency)} recorded as paid.
          </p>
        </div>
      ) : null}
    </div>
  );
}
