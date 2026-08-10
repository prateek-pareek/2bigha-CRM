import type { PlatformTourStep } from '../types';
import { CLIENT_PORTALS_PAGE_TOURS } from './client-portals';
import { CRM_PAGE_TOURS } from './crm';
import { HRMS_PAGE_TOURS } from './hrms';
import { PM_PAGE_TOURS } from './pm';
import { SOCIAL_PAGE_TOURS } from './social';
import type { PageTourEntry } from './types';
import { VAULT_PAGE_TOURS } from './vault';

const ALL_PAGE_TOURS: PageTourEntry[] = [
  ...CRM_PAGE_TOURS,
  ...HRMS_PAGE_TOURS,
  ...PM_PAGE_TOURS,
  ...SOCIAL_PAGE_TOURS,
  ...VAULT_PAGE_TOURS,
  ...CLIENT_PORTALS_PAGE_TOURS,
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getPageSteps(pathname: string): PlatformTourStep[] {
  const matches = ALL_PAGE_TOURS.filter((entry) => matchesPrefix(pathname, entry.prefix));
  if (!matches.length) return [];
  matches.sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0].steps;
}

export { ALL_PAGE_TOURS };
