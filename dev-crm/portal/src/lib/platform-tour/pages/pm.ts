import type { PageTourEntry } from './types';

export const PM_PAGE_TOURS: PageTourEntry[] = [
  {
    prefix: '/pm/dashboard',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Projects dashboard',
        description:
          'Portfolio overview—active projects, delivery health, and workload signals across the organisation.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/reports',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Project reports',
        description:
          'Velocity, burndown, and completion trends. Filter by project or team for sprint reviews and stakeholder updates.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/virtual-office',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Virtual office',
        description:
          'See teammates online and jump into huddles while working in Projects.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/for-you',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'For you',
        description:
          'Personalised feed—recent updates, mentions, and items needing your attention across all projects.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/my-tasks',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'My tasks',
        description:
          'Everything assigned to you in one list. Filter by project, sprint, or due date to plan your day.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/projects/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Project board',
        description:
          'Kanban view for this project—drag cards across columns, create issues, assign sprint scope, and update status inline.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/boards',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Boards',
        description:
          'Pick a project to open its board. This is where day-to-day delivery happens—create tasks, assign owners, and track progress.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/wiki/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Wiki page',
        description:
          'Collaborative documentation—edit with rich text, link pages, and share knowledge that stays with the project.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/wiki',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Wiki',
        description:
          'Team knowledge base organised in spaces. Create pages for specs, runbooks, and meeting notes linked to delivery work.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/admin/workload',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Workload',
        description:
          'See capacity and allocation across people and projects. Spot overload before deadlines slip.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/pm/settings/github',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'GitHub integration',
        description:
          'Connect repositories to projects. Link commits and pull requests to issues for traceability.',
        side: 'top',
      },
    ],
  },
];
