'use client';

import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';
import { formatMoney } from './format-money';
import type { PortalPayment } from './types';

type PortalPaymentMilestonesSectionProps = {
  payments: PortalPayment[] | undefined;
  currency: string;
};

export function PortalPaymentMilestonesSection({
  payments,
  currency,
}: PortalPaymentMilestonesSectionProps) {
  const list = payments ?? [];

  return (
    <div id="portal-milestones" className={cn(HS_PANEL, 'scroll-mt-32 p-8 md:scroll-mt-28')}>
      <h3 className="mb-8 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
        <ShieldCheck size={14} className="text-[#16a34a]" />
        Payment milestones
      </h3>
      <div className="space-y-3">
        {list.map((payment, idx) => (
          <div
            key={payment._id}
            className="group flex flex-col justify-between rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/35 p-4 px-5 transition-all duration-200 hover:border-[var(--hs-link)]/30 hover:bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:flex-row md:items-center"
          >
            <div className="flex items-center gap-5">
              <div className="w-4 text-xs font-black italic text-[var(--border-color)]">0{idx + 1}</div>
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md border text-xs shadow-sm',
                  payment.status === 'Paid'
                    ? 'border-[#bbf7d0] bg-[#dcfce7] text-[#16a34a]'
                    : 'border-[var(--border-color)] bg-white text-[var(--text-muted)]',
                )}
              >
                {payment.status === 'Paid' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
              </div>
              <div>
                <h4 className="text-sm font-bold tracking-tight text-[var(--text-main)] transition-colors group-hover:text-[var(--hs-link)]">
                  {payment.title}
                </h4>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]/80">
                  Due:{' '}
                  {new Date(payment.dueDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-row items-center justify-between gap-1.5 border-t border-[var(--border-color)] pt-4 text-left md:mt-0 md:flex-col md:items-end md:border-t-0 md:pt-0 md:text-right">
              <p className="font-mono text-[17px] font-bold leading-none tracking-tight text-[var(--text-main)]">
                {formatMoney(payment.amount || 0, currency)}
              </p>
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest',
                  payment.status === 'Paid'
                    ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]'
                    : 'border-[var(--border-color)] bg-[var(--background)] text-[var(--text-muted)]',
                )}
              >
                {payment.status}
              </span>
            </div>
          </div>
        ))}
        {list.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-[var(--border-color)] bg-[var(--surface-dim)]/50 p-12 text-center text-[var(--text-muted)]">
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">
              No milestones set yet.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
