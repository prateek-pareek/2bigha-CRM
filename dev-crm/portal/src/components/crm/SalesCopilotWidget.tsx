'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Maximize2, X } from 'lucide-react';
import { SalesCopilotChat } from '@/components/crm/SalesCopilotChat';

export function SalesCopilotWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-700 transition-colors"
        title={open ? 'Close Sales Copilot' : 'Open Sales Copilot'}
        aria-label={open ? 'Close Sales Copilot' : 'Open Sales Copilot'}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-5 z-[60] flex h-[min(72vh,640px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[3px] border border-[var(--border-color)] bg-[var(--background)] shadow-lg">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-semibold text-[var(--text-main)]">Sales Copilot</span>
            </div>
            <Link
              href="/crm/copilot"
              className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700"
              onClick={() => setOpen(false)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Expand
            </Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <SalesCopilotChat showHeader={false} compact className="h-full" />
          </div>
        </div>
      ) : null}
    </>
  );
}
