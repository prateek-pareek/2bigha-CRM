'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';

export type CrmPropertyColumnDraft = {
  key: string;
  label: string;
  visible: boolean;
};

type CrmPropertyManagerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  saveLabel?: string;
  /** Rendered above cancel/save row (e.g. add custom field on contacts). */
  footerExtra?: ReactNode;
};

/** Shared column/property manager dialog shell (Jira style). */
export function CrmPropertyManagerModal({
  isOpen,
  onClose,
  onSave,
  title = 'Property manager',
  subtitle = 'Show or hide properties · drag to reorder',
  children,
  saveLabel = 'Save changes',
  footerExtra,
}: CrmPropertyManagerModalProps) {
  if (!isOpen) return null;

  return (
    <div className={cn(crmModalChrome.overlay, 'z-[999] flex items-center justify-center p-4 text-left')}>
      <div className={crmModalChrome.backdrop} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(crmModalChrome.centerShell, 'max-w-lg max-h-[min(90vh,40rem)] crm-jira-modal flex flex-col')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={crmModalChrome.centerHeader}>
          <div className="min-w-0 flex-1">
            <h2 className={crmModalChrome.centerTitle}>{title}</h2>
            <p className={crmModalChrome.centerLead}>{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className={cn(crmModalChrome.centerBody, 'max-h-[60vh]')}>{children}</div>

        <div className={cn(crmModalChrome.centerFooter, 'flex-col items-stretch gap-3')}>
          {footerExtra}
          <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm font-medium text-[#42526e] hover:bg-[#f4f5f7]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-[3px] bg-[#0c66e4] px-3 text-sm font-medium text-white hover:bg-[#0055cc]"
          >
            {saveLabel}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
