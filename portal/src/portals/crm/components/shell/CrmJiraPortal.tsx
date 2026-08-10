'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { crmModalChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';

type CrmJiraPortalProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Portals CRM overlays to document.body with CRM theme scope.
 * Named historically; uses data-crm-app (not PM Jira) for extractability.
 */
export function CrmJiraPortal({ children, className }: CrmJiraPortalProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-crm-app
      data-crm-theme="crms"
      className={cn(crmModalChrome.portalRoot, className)}
    >
      {children}
    </div>,
    document.body,
  );
}
