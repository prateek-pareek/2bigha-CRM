import type { PageTourEntry } from './types';

export const CRM_PAGE_TOURS: PageTourEntry[] = [
  {
    prefix: '/crm/workspace',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Sales workspace',
        description:
          'Your daily CRM home—pipeline health, tasks due today, and shortcuts into leads and deals. Start here each morning to prioritise work.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/reports',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'CRM reports',
        description:
          'Analyse pipeline velocity, conversion rates, and team activity. Filter by date range and export snapshots for reviews.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/inbox',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Unified inbox',
        description:
          'Read and reply to email threads linked to leads, deals, and contacts. Assign conversations and log activity without leaving CRM.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/notifications',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'CRM notifications',
        description:
          'Mentions, deal stage changes, task reminders, and assignment alerts for sales activity—all in one feed.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/virtual-office',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Virtual office',
        description:
          'See who is online, start quick huddles, and collaborate with the team in real time.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/leads/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Lead record',
        description:
          'View contact details, activity timeline, notes, and tasks for this lead. Update stage, owner, or source as qualification progresses.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/leads',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Leads',
        description:
          'Inbound prospects land here. Filter by stage, owner, or source; bulk-assign; and convert qualified leads into deals or clients.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/website-leads',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Website leads',
        description:
          'Form submissions and enquiries from your marketing site appear here. Review, assign owners, and push into the main leads pipeline.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/website-chats',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Website chats',
        description:
          'Live chat conversations from your site. Follow up on visitor questions and convert chats into leads or contacts.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/platform-opportunities',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Platform opportunities',
        description:
          'Track freelance and marketplace opportunities (e.g. Upwork-style bids). Manage pipeline stages from discovery through won/lost.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/clients/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Client record',
        description:
          'Active customer profile—projects, contacts, deals history, and client portal access. Use this as the single source for account management.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/clients',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Clients',
        description:
          'Manage active customer accounts. Open a client to see related deals, contacts, and portal settings.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/deals/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Deal record',
        description:
          'Full deal context—amount, stage, associated company and contacts, activity feed, and proposal links. Move stages as the opportunity progresses.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/deals',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Deals pipeline',
        description:
          'Kanban or list view of open opportunities. Drag deals across stages, filter by pipeline, and forecast revenue from expected close dates.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/outreach',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Outreach',
        description:
          'Plan and send outbound sequences to prospects. Track opens, replies, and tie outreach back to leads and contacts.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/email-finder',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Email finder',
        description:
          'Look up professional email addresses for prospects by name and company. Save results directly to contacts or leads.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/playbooks',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Playbooks',
        description:
          'Run guided sales playbooks with step-by-step scripts and recommendations. Great for onboarding new reps on consistent talk tracks.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/proposals',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Proposals & CVs',
        description:
          'Generate and manage client proposals and team CVs. Link documents to deals and reuse templates.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/services',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Services catalogue',
        description:
          'Define what your company sells—service lines, packages, and pricing used when building proposals and deals.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/organizations/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Company record',
        description:
          'Account-level view—linked contacts, deals, and activity. Edit firmographics and customise the record layout.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/organizations',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Companies',
        description:
          'Organisation directory for B2B accounts. Import in bulk, customise columns, and drill into any company record.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/contacts/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Contact record',
        description:
          'Individual person profile—email, phone, company association, and full activity history across CRM.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/contacts',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Contacts',
        description:
          'People directory. Toggle between all contacts and yours; search, filter, and create new contacts linked to companies.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/notes',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Notes',
        description:
          'Free-form notes attached to CRM records. Capture meeting summaries and internal context searchable across the team.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/tasks',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Tasks',
        description:
          'CRM task board—Backlog, To Do, In Progress, and Done. Create follow-ups tied to leads, deals, or contacts.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/calls',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Call logs',
        description:
          'Log inbound and outbound calls with outcomes and notes. Builds a call history on related records.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/crm/settings',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'CRM settings',
        description:
          'Configure pipelines, custom fields, email integrations, workflows, playbooks, and team permissions. Admins manage structure here; reps rarely need daily access.',
        side: 'top',
      },
    ],
  },
];
