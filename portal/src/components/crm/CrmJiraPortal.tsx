'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';

type CrmJiraPortalProps = {
    children: ReactNode;
    className?: string;
};

/** Portals CRM overlays to document.body inside Jira theme scope (escapes AppShell). */
export function CrmJiraPortal({ children, className }: CrmJiraPortalProps) {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div data-pm-jira className={cn(crmModalChrome.portalRoot, className)}>
            {children}
        </div>,
        document.body,
    );
}
