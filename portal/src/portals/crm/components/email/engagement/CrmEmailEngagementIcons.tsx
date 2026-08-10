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
  // Same gate as leads `leadNeedsOutreach`: wait until stats are known.
  if (!stats) return null;

  const eg = stats.engagement;
  if (!hasOutboundEmailSent(stats)) {
    return (
      <span
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning,#ff9f43)_35%,white)] bg-[color-mix(in_srgb,var(--warning,#ff9f43)_10%,white)] px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--warning,#b45309)]',
          className,
        )}
        title="No outbound email sent yet — ready for outreach"
      >
        <MailPlus className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        Outreach
      </span>
    );
  }
  return (
    <div className={cn('inline-flex h-7 items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-0.5 shadow-[var(--crm-shadow-input)]', className)}>
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-[calc(var(--radius-md)-2px)]',
          eg.opened
            ? 'bg-emerald-50 text-emerald-700'
            : 'text-[var(--text-muted)]',
        )}
        title={
          eg.opened
            ? 'Recipient opened a tracked or CRM send'
            : 'Outbound sent; not opened yet'
        }
      >
        {eg.opened ? (
          <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        ) : (
          <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        )}
      </span>
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-[calc(var(--radius-md)-2px)]',
          stats?.hasInboundThreadReply
            ? 'bg-sky-50 text-sky-700'
            : 'text-[var(--text-muted)]',
        )}
        title={
          stats?.hasInboundThreadReply
            ? 'Replied in thread to your email (inbox sync)'
            : 'No thread reply logged yet'
        }
      >
        {stats?.hasInboundThreadReply ? (
          <Reply className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        ) : (
          <MailX className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        )}
      </span>
    </div>
  );
}
