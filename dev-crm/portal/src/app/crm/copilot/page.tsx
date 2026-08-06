'use client';

import Link from 'next/link';
import { Bot, Settings2 } from 'lucide-react';
import { SalesCopilotChat } from '@/components/crm/sales/SalesCopilotChat';

export default function SalesCopilotPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col px-4 py-6 md:py-8">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Bot className="h-4 w-4" />
          <span>Unified AI for CRM + PM</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/crm/agents/inbox"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)]"
          >
            Approvals inbox
          </Link>
          <Link
            href="/crm/settings/agents"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-main)] hover:bg-[var(--background)]"
          >
            <Settings2 size={14} />
            Agent settings
          </Link>
        </div>
      </div>

      <SalesCopilotChat className="flex-1 min-h-0" />

      <p className="mt-3 shrink-0 text-center text-[11px] text-[var(--text-muted)]">
        Sends, deal creation, and lead conversion require your approval. Lead creation and follow-up scheduling run immediately.
      </p>
    </div>
  );
}
