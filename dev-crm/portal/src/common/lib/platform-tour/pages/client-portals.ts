import type { PageTourEntry } from './types';

export const CLIENT_PORTALS_PAGE_TOURS: PageTourEntry[] = [
  {
    prefix: '/client-portals',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Client portal console',
        description:
          'Create branded portals for clients. Each portal gets a secure link where clients see project updates, files, invoices, and messages—without full Mathionix access.',
        side: 'top',
      },
    ],
  },
];
