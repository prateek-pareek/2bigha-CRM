/**
 * Keep HRMS apiSegment map in sync with portal/src/lib/permissions/registry.ts
 */
export const HRMS_API_SEGMENT_TO_MODULE: Record<string, string> = {
  employees: 'employees',
  leaves: 'leaves',
  holidays: 'holidays',
  recruitment: 'recruitment',
  announcements: 'announcements',
  sops: 'sops',
  policies: 'policies',
  timesheets: 'timesheets',
  payroll: 'payroll',
  expenses: 'expenses',
  benefits: 'benefits',
  notifications: 'notifications',
  vault: 'vault',
  'hr-settings': 'hr-settings',
  lms: 'lms',
  staff: 'hr-settings',
  roles: 'hr-settings',
  audit: 'hr-settings',
  trash: 'hr-settings',
};

export function apiPathSegment(url: string): string {
  const path = String(url || '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api') return parts[1] || '';
  return parts[0] || '';
}

export function hrmsModuleIdForApiUrl(url: string): string | null {
  const segment = apiPathSegment(url);
  if (!segment) return null;
  return HRMS_API_SEGMENT_TO_MODULE[segment] ?? segment;
}
