'use client';

import { Eye, Mail, MailPlus, Reply, MailX } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  hasOutboundEmailSent,
  type CrmEmailEngagementStats,
} from '@/lib/crm/crmEmailEngagementStats';

export default function CrmEmailEngagementIcons({
  stats,
  className,
}: {
  stats: CrmEmailEngagementStats | undefined;
  className?: string;
}) {
  const eg = stats?.engagement;
  if (!hasOutboundEmailSent(stats) || !eg) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800',
          className,
        )}
        title="No outbound email sent yet — ready for outreach"
      >
        <MailPlus className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
        Outreach
      </span>
    );
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-0.5', className)}>
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-md border',
          eg.opened
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-[#dfe1e6] bg-[#f4f5f7] text-slate-600',
        )}
        title={
          eg.opened
            ? 'Recipient opened a tracked or CRM send'
            : 'Outbound sent; not opened yet'
        }
      >
        {eg.opened ? (
          <Eye className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        ) : (
          <Mail className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        )}
      </span>
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-md border',
          stats?.hasInboundThreadReply
            ? 'border-sky-200 bg-sky-50 text-sky-800'
            : 'border-[#dfe1e6] bg-[#f4f5f7] text-slate-500',
        )}
        title={
          stats?.hasInboundThreadReply
            ? 'Replied in thread to your email (inbox sync)'
            : 'No thread reply logged yet'
        }
      >
        {stats?.hasInboundThreadReply ? (
          <Reply className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        ) : (
          <MailX className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        )}
      </span>
    </div>
  );
}
