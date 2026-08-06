import type { PlatformTourStep } from './types';

/** Shell chrome shared across HRMS, CRM, PM, Social, Vault, and Client Portals */
export const COMMON_SHELL_STEPS: PlatformTourStep[] = [
  {
    title: 'Welcome to Mathionix',
    description:
      'This quick tour walks you through the layout so you can find your way around. Use Next to continue or Skip to exit anytime.',
  },
  {
    element: '[data-tour="workspace-switcher"]',
    title: 'Switch products',
    description:
      'Mathionix is one suite with multiple products. Open this menu to jump between HRMS, CRM, Projects, Social desk, Vault, and Client Portals.',
    side: 'right',
  },
  {
    element: '[data-tour="sidebar-nav"]',
    title: 'Module navigation',
    description:
      'Each product has its own sidebar. Sections are grouped by workflow—open any item to go directly to that area.',
    side: 'right',
  },
  {
    element: '[data-tour="global-search"]',
    title: 'Global search',
    description:
      'Search across records, people, and pages from anywhere. Keyboard shortcuts may vary by module—look for hints in the search box.',
    side: 'bottom',
  },
  {
    element: '[data-tour="notifications"]',
    title: 'Notifications',
    description:
      'Hover here to see recent alerts—mentions, approvals, assignments, and system updates stay in one place.',
    side: 'bottom',
  },
  {
    element: '[data-tour="platform-tour"]',
    title: 'Replay this tour',
    description:
      'New to a module or need a refresher? Click this help button anytime to restart the tour for the product you are in.',
    side: 'bottom',
  },
  {
    element: '[data-tour="profile-menu"]',
    title: 'Your profile',
    description: 'See who you are signed in as and sign out when you are done.',
    side: 'bottom',
  },
];
