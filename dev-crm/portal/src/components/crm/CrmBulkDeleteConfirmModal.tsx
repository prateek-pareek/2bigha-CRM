'use client';

import type { ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';

type CrmBulkDeleteConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  disabled?: boolean;
};

export function CrmBulkDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Move to Trash',
  loading = false,
  disabled = false,
}: CrmBulkDeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className={cn(crmModalChrome.overlay, 'z-[1000] flex items-center justify-center p-4')}>
      <div
        className={crmModalChrome.backdrop}
        onClick={() => !loading && !disabled && onClose()}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn(crmModalChrome.centerShell, 'max-w-md crm-jira-modal')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center space-y-5 px-5 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[3px] bg-[#ffebe6] text-[#de350b]">
            <Trash2 size={22} strokeWidth={1.75} />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium text-[#172b4d]">{title}</h3>
            <div className="text-sm text-[#5e6c84]">{description}</div>
          </div>
          <div className="flex w-full gap-2 pt-1">
            <button
              type="button"
              disabled={loading || disabled}
              onClick={onClose}
              className="inline-flex h-8 flex-1 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm font-medium text-[#42526e] hover:bg-[#f4f5f7] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || disabled}
              onClick={onConfirm}
              className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-[3px] bg-[#de350b] px-3 text-sm font-medium text-white hover:bg-[#bf2600] disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Moving…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
