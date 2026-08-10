import type { PlatformTourStep, SuiteModuleId } from '../types';
import { getPageSteps } from '../pages';

const MODULE_NAMES: Record<SuiteModuleId, string> = {
  hrms: 'HRMS',
  crm: 'CRM',
  pm: 'Projects',
  social: 'Social desk',
  vault: 'Vault',
  'client-portals': 'Client Portals',
};

const MODULE_STEPS: Record<SuiteModuleId, PlatformTourStep[]> = {
  hrms: [
    {
      element: '[data-tour="main-content"]',
      title: 'HRMS at a glance',
      description:
        'HRMS covers people, time off, payroll, expenses, recruitment, and workplace policies. Start from the Dashboard for a summary of what needs your attention.',
      side: 'top',
    },
    {
      element: '[data-tour="sidebar-nav"]',
      title: 'Key HRMS areas',
      description:
        'People — employees, leaves, and timesheets. Payroll & expenses — pay runs and reimbursements. Talent — hiring and the career portal. Workplace — announcements, policies, and SOPs.',
      side: 'right',
    },
  ],
  crm: [
    {
      element: '[data-tour="main-content"]',
      title: 'CRM sales workspace',
      description:
        'CRM helps you manage inbound leads, outbound outreach, deals, and client relationships. The Sales workspace is your home base for pipeline activity.',
      side: 'top',
    },
    {
      element: '[data-tour="sidebar-nav"]',
      title: 'CRM workflow',
      description:
        'Inbound — leads, website chats, and deals. Outbound — outreach, playbooks, and proposals. Data — companies and contacts. Activities — notes, tasks, and call logs.',
      side: 'right',
    },
  ],
  pm: [
    {
      element: '[data-tour="main-content"]',
      title: 'Project delivery',
      description:
        'Plan and ship work with boards, sprints, and tasks. Dashboard and Reports give portfolio visibility; My Tasks shows everything assigned to you.',
      side: 'top',
    },
    {
      element: '[data-tour="sidebar-nav"]',
      title: 'Projects navigation',
      description:
        'Boards — kanban for each project. Wiki — team documentation. For you and My Tasks — personal work queues. Administration — workload and GitHub integrations.',
      side: 'right',
    },
  ],
  social: [
    {
      element: '[data-tour="main-content"]',
      title: 'Social desk',
      description:
        'Plan, create, and publish marketing content. Compose posts, manage the calendar, track SEO, and maintain your blog and portfolio from one place.',
      side: 'top',
    },
    {
      element: '[data-tour="sidebar-nav"]',
      title: 'Marketing tools',
      description:
        'Compose and AI content for drafting. Calendar for scheduling. SEO & rankings for performance tracking. Blog and Portfolio for published assets.',
      side: 'right',
    },
  ],
  vault: [
    {
      element: '[data-tour="main-content"]',
      title: 'Team Vault',
      description:
        'Store and share team passwords securely. Access is permission-based—only credentials you are allowed to see appear here.',
      side: 'top',
    },
  ],
  'client-portals': [
    {
      element: '[data-tour="main-content"]',
      title: 'Client Portals',
      description:
        'Create and manage branded portals for clients—share project updates, files, invoices, and messages without giving full suite access.',
      side: 'top',
    },
  ],
};

export function getModuleName(moduleId: SuiteModuleId): string {
  return MODULE_NAMES[moduleId];
}

export function getModuleSteps(moduleId: SuiteModuleId): PlatformTourStep[] {
  return MODULE_STEPS[moduleId] ?? [];
}

export { getPageSteps };
