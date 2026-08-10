import type { PageTourEntry } from './types';

export const VAULT_PAGE_TOURS: PageTourEntry[] = [
  {
    prefix: '/vault',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Team Vault',
        description:
          'Shared passwords and secrets for the organisation. Search entries, copy credentials securely, and share access with teammates who have permission—never via chat or email.',
        side: 'top',
      },
    ],
  },
];
