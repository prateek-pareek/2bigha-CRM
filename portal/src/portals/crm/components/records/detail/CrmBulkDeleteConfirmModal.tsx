'use client';

import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { crmModalChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';
import { CrmButton } from '@/components/crm/ui';

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
        className={cn(crmModalChrome.centerShell, 'max-w-md crm-modal')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center space-y-5 px-5 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--error-light)] text-[var(--error)]">
            <Trash2 size={22} strokeWidth={1.75} />
          </div>
          <div className="space-y-2">
            <h3 className="text-[17px] font-semibold text-[var(--text-main)]">{title}</h3>
            <div className="text-sm text-[var(--text-muted)]">{description}</div>
          </div>
          <div className="flex w-full gap-2 pt-1">
            <CrmButton
              variant="secondary"
              className="flex-1"
              disabled={loading || disabled}
              onClick={onClose}
            >
              Cancel
            </CrmButton>
            <CrmButton
              variant="danger"
              className="flex-1"
              loading={loading}
              disabled={disabled}
              onClick={onConfirm}
            >
              {loading ? 'Moving…' : confirmLabel}
            </CrmButton>
          </div>
        </div>
      </div>
    </div>
  );
}
