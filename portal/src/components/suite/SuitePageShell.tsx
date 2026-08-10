'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/pm/utils';
import { jiraClasses, jiraLayout } from '@/lib/pm/jira-ui';

type SuitePageShellProps = {
    title: string;
    lead?: string;
    eyebrow?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    wide?: boolean;
    className?: string;
};

/** Standard Jira-style internal page header + content area */
export function SuitePageShell({
    title,
    lead,
    eyebrow,
    actions,
    children,
    wide = false,
    className,
}: SuitePageShellProps) {
    return (
        <div className={cn(wide ? jiraLayout.pageWide : jiraLayout.page, className)}>
            <div className={cn(jiraLayout.pageHeader, jiraClasses.panel, 'p-4 sm:p-5')}>
                <div className="min-w-0 flex-1">
                    {eyebrow ? <div className={jiraLayout.eyebrow}>{eyebrow}</div> : null}
                    <h1 className={jiraLayout.title}>{title}</h1>
                    {lead ? <p className={jiraLayout.lead}>{lead}</p> : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            {children}
        </div>
    );
}
