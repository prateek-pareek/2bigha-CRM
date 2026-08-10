/**
 * Layout primitives for pages inside AppShell.
 * Main content already has horizontal padding — avoid extra `p-8` on the outer wrapper.
 */

import { jiraClasses, jiraLayout } from '@/lib/pm/jira-ui';

export const SUITE_PAGE_7XL = 'pm-page mx-auto w-full max-w-7xl flex flex-col gap-4 pb-8 md:pb-10';
export const SUITE_PAGE_6XL = 'pm-page mx-auto w-full max-w-6xl flex flex-col gap-4 pb-8 md:pb-10';
export const SUITE_PAGE_5XL = 'pm-page mx-auto w-full max-w-5xl flex flex-col gap-4 pb-8 md:pb-10';
export const SUITE_PAGE_4XL = 'pm-page mx-auto w-full max-w-4xl flex flex-col gap-4 pb-8 md:pb-10';
export const SUITE_PAGE_3XL = 'pm-page mx-auto w-full max-w-3xl flex flex-col gap-4 pb-8 md:pb-10';
/** Matches HRMS dashboard width */
export const SUITE_PAGE_DASHBOARD = 'pm-page mx-auto w-full max-w-[1180px] flex flex-col gap-4 pb-8 md:pb-10';

/** Jira Software panel — default for PM / executive / client-portal cards */
export const JIRA_PANEL =
    'rounded-[3px] border border-[#dfe1e6] bg-white shadow-[0_1px_0_rgba(9,30,66,0.13)]';

/**
 * CRM cream-theme panel — use inside `.theme-crm-hubspot`.
 * New CRM work should prefer `@/lib/crm/ui` `CRM_PANEL`.
 * New HRMS work should prefer `@/lib/hrms/ui` `HRMS_PANEL`.
 */
export const CRM_HS_PANEL =
    'rounded-[var(--crm-radius-ui,14px)] border border-[var(--border-color,#ddd8d0)] bg-[var(--card-bg,#fff)] shadow-[var(--crm-shadow-card,0_2px_8px_rgba(0,0,0,0.04))]';

/** @deprecated Prefer JIRA_PANEL (PM) or HRMS_PANEL / CRM_PANEL (HRMS / CRM) */
export const HS_PANEL = JIRA_PANEL;

/** Page title — Jira 20–24px sans */
export const SUITE_H1 = jiraLayout.title;
export const SUITE_LEAD = jiraLayout.lead;

/** Field / section labels */
export const SUITE_SECTION_LABEL = jiraClasses.label;
export const SUITE_FIELD_LABEL = 'text-xs font-semibold text-[#5e6c84]';

/** Compact toolbar row */
export const SUITE_TOOLBAR = jiraLayout.toolbar;
