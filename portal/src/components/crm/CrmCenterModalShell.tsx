'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';
import { CrmJiraPortal } from '@/components/crm/CrmJiraPortal';

type CrmCenterModalShellProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    maxWidthClass?: string;
    /** Portal to body with Jira theme (use for modals that escape AppShell). */
    portal?: boolean;
    zIndexClass?: string;
};

export function CrmCenterModalShell({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    footer,
    maxWidthClass = 'max-w-2xl',
    portal = false,
    zIndexClass = 'z-[9999]',
}: CrmCenterModalShellProps) {
    if (!isOpen) return null;

    const inner = (
        <div
            className={cn(
                crmModalChrome.overlay,
                zIndexClass,
                'flex items-center justify-center p-4',
            )}
        >
            <div className={crmModalChrome.backdrop} onClick={onClose} aria-hidden />
            <div
                role="dialog"
                aria-modal="true"
                className={cn(crmModalChrome.centerShell, maxWidthClass, 'max-h-[min(90vh,56rem)]')}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={crmModalChrome.centerHeader}>
                    <div className="min-w-0 flex-1 pr-2">
                        <h2 className={crmModalChrome.centerTitle}>{title}</h2>
                        {subtitle ? <p className={crmModalChrome.centerLead}>{subtitle}</p> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={crmModalChrome.closeBtn}
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                </div>
                <div className={crmModalChrome.centerBody}>{children}</div>
                {footer ? <div className={crmModalChrome.centerFooter}>{footer}</div> : null}
            </div>
        </div>
    );

    if (portal) return <CrmJiraPortal>{inner}</CrmJiraPortal>;
    return inner;
}
