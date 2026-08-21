/**
 * Central RBAC module registry — single source of truth for permission matrices.
 *
 * When adding a new module:
 * 1. Append an entry to PERMISSION_MODULES (id, label, suite, routes, apiSegment).
 * 2. It automatically appears in Staff Management + Role Manager.
 * 3. Sidebar / pages should use `moduleId:read` (or bare `moduleId` for HRMS legacy).
 * 4. Access is deny-by-default via `checkRegistryPermissionAccess` in access.ts.
 */

export const HRMS_MODULE_ACTIONS = [
  'read',
  'create',
  'edit',
  'delete',
  'export',
  'import',
  'approve',
  'write',
] as const;

export const CRM_PM_MODULE_ACTIONS = ['read', 'write', 'edit', 'delete'] as const;

export const SOCIAL_PERMISSION_KEYS = [
  'social:read',
  'social:write',
  'social:manage',
] as const;

export type PermissionSuite = 'hrms' | 'crm' | 'pm' | 'social';

export type PermissionModuleDef = {
  id: string;
  label: string;
  suite: PermissionSuite;
  /** Portal route prefixes gated by this module (longest prefix wins). */
  routes?: readonly string[];
  /** First URL segment after /api/ for HRMS RolesGuard fallback. */
  apiSegment?: string;
};

/** Extra flat keys (not module:action) assignable per CRM module in Role Manager / Staff Access. */
export const CRM_MODULE_EXTRA_PERMS: Record<
  string,
  ReadonlyArray<{ perm: string; label: string }>
> = {
  leads: [
    {
      perm: 'leads:move_pipeline',
      label: 'Move between pipelines (board + bulk)',
    },
    { perm: 'leads:import', label: 'Import leads (upload)' },
    { perm: 'leads:export', label: 'Export / download leads CSV' },
  ],
  deals: [
    {
      perm: 'deals:move_pipeline',
      label: 'Move between pipelines / board stage',
    },
    { perm: 'deals:import', label: 'Import deals (upload)' },
    { perm: 'deals:export', label: 'Export / download deals CSV' },
  ],
  'platform-opportunities': [
    {
      perm: 'platform-opportunities:import',
      label: 'Import platform opportunities',
    },
    {
      perm: 'platform-opportunities:export',
      label: 'Export / download opportunities CSV',
    },
  ],
  clients: [
    { perm: 'clients:import', label: 'Import clients (upload)' },
    { perm: 'clients:export', label: 'Export / download clients CSV' },
  ],
  inbox: [{ perm: 'inbox:connect', label: 'Connect email accounts' }],
  legal: [
    {
      perm: 'legal:move_pipeline',
      label: 'Move between pipelines / board stage',
    },
  ],
};

export const GLOBAL_PERMISSION_KEYS = new Set([
  'all',
  'hrms:read',
  'hrms:admin',
  'tech-services:read',
  'admin:manage',
  'leads:move_pipeline',
  'leads:import',
  'leads:export',
  'deals:move_pipeline',
  'deals:import',
  'deals:export',
  'platform-opportunities:import',
  'platform-opportunities:export',
  'clients:import',
  'clients:export',
  'inbox:connect',
  'legal:move_pipeline',
  ...SOCIAL_PERMISSION_KEYS,
]);

const HRMS_MODULE_ROWS: Omit<PermissionModuleDef, 'suite'>[] = [
  { id: 'dashboard', label: 'Dashboard', routes: ['/hrms/dashboard'] },
  { id: 'employees', label: 'Employees', routes: ['/hrms/employees'], apiSegment: 'employees' },
  { id: 'leaves', label: 'Leaves', routes: ['/hrms/leaves'], apiSegment: 'leaves' },
  { id: 'holidays', label: 'Company holidays', routes: ['/hrms/holidays'], apiSegment: 'holidays' },
  {
    id: 'recruitment',
    label: 'Recruitment / Career portal',
    routes: ['/hrms/recruitment', '/career-portal'],
    apiSegment: 'recruitment',
  },
  {
    id: 'onboarding',
    label: 'Candidate Onboarding',
    routes: ['/hrms/onboarding'],
    apiSegment: 'onboarding',
  },
  { id: 'announcements', label: 'Announcements', routes: ['/hrms/announcements'], apiSegment: 'announcements' },
  { id: 'sops', label: 'SOPs (standard procedures)', routes: ['/hrms/sops'], apiSegment: 'sops' },
  { id: 'policies', label: 'Company policies', routes: ['/hrms/policies'], apiSegment: 'policies' },
  { id: 'timesheets', label: 'Timesheets', routes: ['/hrms/timesheets'], apiSegment: 'timesheets' },
  // Salary visibility on employee profiles (separate from running payroll).
  { id: 'employees-salary', label: 'Employees · Salary & compensation' },
  // Payroll — master + per-area modules (longest route prefix wins).
  { id: 'payroll', label: 'Payroll (run & admin)', routes: ['/hrms/payroll'], apiSegment: 'payroll' },
  { id: 'payroll-slips', label: 'Payroll · Payslips (company)', routes: ['/hrms/payroll/slips'] },
  {
    id: 'payroll-structures',
    label: 'Payroll · Structures & components',
    routes: ['/hrms/payroll/structures', '/hrms/payroll/components'],
  },
  { id: 'payroll-advances', label: 'Payroll · Advances', routes: ['/hrms/payroll/advances'] },
  {
    id: 'payroll-settlements',
    label: 'Payroll · FnF & gratuity',
    routes: ['/hrms/payroll/fnf', '/hrms/payroll/gratuity'],
  },
  /** Self-service: own slips/advances only — safe default for all employees. */
  { id: 'payroll-self', label: 'Payroll · My payslips (self)' },
  { id: 'attendance', label: 'Attendance', routes: ['/hrms/attendance'], apiSegment: 'attendance' },
  { id: 'expenses', label: 'HRMS Expenses (claims)', routes: ['/hrms/expenses'], apiSegment: 'expenses' },
  { id: 'assets', label: 'Asset Management', routes: ['/hrms/assets'], apiSegment: 'assets' },
  { id: 'helpdesk', label: 'IT Helpdesk', routes: ['/hrms/helpdesk'], apiSegment: 'helpdesk' },
  { id: 'benefits', label: 'Benefits', routes: ['/hrms/benefits'], apiSegment: 'benefits' },
  { id: 'analytics', label: 'Analytics', routes: ['/hrms/analytics'] },
  { id: 'reports', label: 'Reports', routes: ['/hrms/reports'], apiSegment: 'reports' },
  { id: 'notifications', label: 'Notifications', routes: ['/hrms/notifications'], apiSegment: 'notifications' },
  { id: 'vault', label: 'Vault (team passwords)', routes: ['/hrms/my-vault', '/vault'], apiSegment: 'vault' },
  {
    id: 'hr-settings',
    label: 'HR Settings / HR Admin',
    routes: ['/hrms/hr-settings', '/hrms/roles', '/hrms/audit-logs'],
    apiSegment: 'hr-settings',
  },
  { id: 'lms', label: 'Learning Management System (LMS)', routes: ['/hrms/lms'], apiSegment: 'lms' },
];

const CRM_MODULE_ROWS: Omit<PermissionModuleDef, 'suite'>[] = [
  {
    id: 'dashboard',
    label: 'Dashboard (all workspaces & reports)',
    routes: [
      '/crm/copilot',
      '/crm/intelligence',
      '/crm/notifications',
      '/crm/virtual-office',
      '/crm/agents',
    ],
  },
  // Workspace dashboards — one module per page (longest route prefix wins).
  { id: 'workspace-work', label: 'Dashboard · Work', routes: ['/crm/workspace/work'] },
  { id: 'workspace-summary', label: 'Dashboard · Sales Overview', routes: ['/crm/workspace/summary'] },
  { id: 'workspace-deals', label: 'Dashboard · Deals', routes: ['/crm/workspace/deals'] },
  { id: 'workspace-prospecting', label: 'Dashboard · Leads', routes: ['/crm/workspace/prospecting'] },
  { id: 'workspace-growth', label: 'Dashboard · Growth', routes: ['/crm/workspace/growth'] },
  { id: 'workspace-calls', label: 'Dashboard · Call Workspace', routes: ['/crm/workspace/calls'] },
  { id: 'workspace-calendar', label: 'Dashboard · Calendar', routes: ['/crm/workspace/calendar'] },
  // Index redirect targets — fall through when no specific child matches.
  { id: 'workspace', label: 'Dashboard · Workspace home', routes: ['/crm/workspace'] },
  // Reports — one module per page.
  { id: 'reports-overview', label: 'Reports · Overview', routes: ['/crm/reports/overview'] },
  { id: 'reports-leads', label: 'Reports · Lead Reports', routes: ['/crm/reports/leads'] },
  { id: 'reports-leads-funnel', label: 'Reports · Lead Funnel', routes: ['/crm/reports/leads/funnel'] },
  { id: 'reports-leads-aging', label: 'Reports · Lead Aging', routes: ['/crm/reports/leads/aging'] },
  {
    id: 'reports-leads-conversion',
    label: 'Reports · Lead Conversion Time',
    routes: ['/crm/reports/leads/conversion-time'],
  },
  { id: 'reports-forecast', label: 'Reports · Deal Reports', routes: ['/crm/reports/forecast'] },
  { id: 'reports-health', label: 'Reports · Sales Health', routes: ['/crm/reports/forecast/health'] },
  { id: 'reports-revenue', label: 'Reports · Forecast', routes: ['/crm/reports/forecast/revenue'] },
  { id: 'reports', label: 'Reports · home', routes: ['/crm/reports'] },
  { id: 'leads', label: 'Leads', routes: ['/crm/leads', '/crm/segments'] },
  { id: 'platform-opportunities', label: 'Platform opportunities', routes: ['/crm/platform-opportunities'] },
  { id: 'deals', label: 'Deals', routes: ['/crm/deals'] },
  { id: 'legal', label: 'Legal', routes: ['/crm/legal'] },
  { id: 'clients', label: 'Clients', routes: ['/crm/clients', '/client-portals'] },
  { id: 'contacts', label: 'Contacts', routes: ['/crm/contacts'] },
  { id: 'organizations', label: 'Organizations', routes: ['/crm/organizations'] },
  { id: 'activities', label: 'Notes, tasks & calls', routes: ['/crm/notes', '/crm/tasks', '/crm/calls'] },
  { id: 'inbox', label: 'Inbox', routes: ['/crm/inbox'] },
  { id: 'outreach', label: 'Outreach', routes: ['/crm/outreach', '/crm/campaigns'] },
  { id: 'workflows', label: 'Workflows & automation', routes: ['/crm/workflows'] },
  { id: 'settings', label: 'Settings & templates', routes: ['/crm/settings'] },
  { id: 'proposals', label: 'Proposals & CVs', routes: ['/crm/proposals'] },
  { id: 'services', label: 'Services catalog', routes: ['/crm/services'] },
  { id: 'settings-email-deliverability', label: 'Settings · Email Deliverability', routes: ['/crm/settings/email-deliverability'] },
  { id: 'settings-deliverability-health', label: 'Settings · Deliverability Health', routes: ['/crm/settings/email-deliverability/health'] },
  { id: 'settings-email-templates', label: 'Settings · Email Templates', routes: ['/crm/settings/email-templates'] },
  { id: 'settings-ai-outreach', label: 'Settings · AI Outreach', routes: ['/crm/settings/ai-outreach'] },
  { id: 'settings-snippets', label: 'Settings · Snippets', routes: ['/crm/settings/snippets'] },
  { id: 'settings-pipelines', label: 'Settings · Pipelines', routes: ['/crm/settings/pipelines'] },
  { id: 'settings-workflows', label: 'Settings · Workflows', routes: ['/crm/settings/workflows'] },
  { id: 'settings-custom-fields', label: 'Settings · Custom Fields', routes: ['/crm/settings/custom-fields'] },
  { id: 'settings-custom-objects', label: 'Settings · Custom objects', routes: ['/crm/settings/custom-objects', '/crm/objects'] },
  { id: 'settings-associations', label: 'Settings · Associations', routes: ['/crm/settings/associations'] },
  { id: 'settings-columns', label: 'Settings · Columns', routes: ['/crm/settings/columns'] },
  { id: 'settings-card-customization', label: 'Settings · Card Customizations', routes: ['/crm/settings/card-customization'] },
  { id: 'settings-currency', label: 'Settings · Currency', routes: ['/crm/settings/currency'] },
  { id: 'settings-integrations', label: 'Settings · Integrations', routes: ['/crm/settings/integrations'] },
  { id: 'settings-audit-logs', label: 'Settings · Audit', routes: ['/crm/settings/audit-logs'] },
  { id: 'settings-wiki', label: 'Settings · Wiki', routes: ['/crm/settings/wiki'] },
  { id: 'settings-duplicates', label: 'Settings · Duplicate Management', routes: ['/crm/settings/duplicates'] },
];

const PM_MODULE_ROWS: Omit<PermissionModuleDef, 'suite'>[] = [
  { id: 'boards', label: 'Boards & delivery', routes: ['/pm/boards'] },
  { id: 'pm', label: 'For you & My tasks', routes: ['/pm/for-you', '/pm/my-tasks', '/pm/plans', '/pm/virtual-office'] },
  { id: 'wiki', label: 'Wiki', routes: ['/pm/wiki'] },
  { id: 'workload', label: 'Workload (admin)', routes: ['/pm/dashboard', '/pm/reports', '/pm/admin/workload', '/pm/strategy'] },
];

function withSuite(
  rows: Omit<PermissionModuleDef, 'suite'>[],
  suite: PermissionSuite,
): PermissionModuleDef[] {
  return rows.map((row) => ({ ...row, suite }));
}

export const PERMISSION_MODULES: readonly PermissionModuleDef[] = [
  ...withSuite(HRMS_MODULE_ROWS, 'hrms'),
  ...withSuite(CRM_MODULE_ROWS, 'crm'),
  ...withSuite(PM_MODULE_ROWS, 'pm'),
];

export const HRMS_PERMISSION_MODULES = PERMISSION_MODULES.filter((m) => m.suite === 'hrms');
export const CRM_PERMISSION_MODULES = PERMISSION_MODULES.filter((m) => m.suite === 'crm');
export const PM_PERMISSION_MODULES = PERMISSION_MODULES.filter((m) => m.suite === 'pm');

/** @deprecated Import HRMS_PERMISSION_MODULES — kept for auth.ts compatibility. */
export const HRMS_MODULE_IDS = HRMS_PERMISSION_MODULES.map((m) => m.id) as readonly string[];

const MODULE_BY_ID = new Map<string, PermissionModuleDef[]>();
for (const mod of PERMISSION_MODULES) {
  const list = MODULE_BY_ID.get(mod.id) ?? [];
  list.push(mod);
  MODULE_BY_ID.set(mod.id, list);
}

const ROUTE_MODULE_INDEX: Array<{ prefix: string; module: PermissionModuleDef }> = [];
for (const mod of PERMISSION_MODULES) {
  for (const route of mod.routes ?? []) {
    ROUTE_MODULE_INDEX.push({ prefix: route, module: mod });
  }
}
ROUTE_MODULE_INDEX.sort((a, b) => b.prefix.length - a.prefix.length);

const API_SEGMENT_TO_MODULE = new Map<string, PermissionModuleDef>();
for (const mod of PERMISSION_MODULES) {
  if (mod.apiSegment) {
    API_SEGMENT_TO_MODULE.set(mod.apiSegment, mod);
  }
}

export function parseModulePermissionKey(
  key: string,
): { moduleId: string; action: string } | null {
  const trimmed = String(key || '').trim();
  if (!trimmed || GLOBAL_PERMISSION_KEYS.has(trimmed)) return null;
  const colon = trimmed.lastIndexOf(':');
  if (colon <= 0) {
    if (MODULE_BY_ID.has(trimmed)) return { moduleId: trimmed, action: 'read' };
    return null;
  }
  const moduleId = trimmed.slice(0, colon);
  const action = trimmed.slice(colon + 1);
  if (!moduleId || !action) return null;
  if (!MODULE_BY_ID.has(moduleId) && !GLOBAL_PERMISSION_KEYS.has(trimmed)) return null;
  return { moduleId, action };
}

export function isKnownModuleId(moduleId: string): boolean {
  return MODULE_BY_ID.has(moduleId);
}

export function moduleSuiteForId(moduleId: string): PermissionSuite | null {
  const defs = MODULE_BY_ID.get(moduleId);
  return defs?.[0]?.suite ?? null;
}

export function permissionSuite(permission: string): PermissionSuite | null {
  if (permission.startsWith('social:')) return 'social';
  if (permission === 'hrms:read' || permission === 'hrms:admin') return 'hrms';
  if (permission === 'tech-services:read') return 'hrms';
  const parsed = parseModulePermissionKey(permission);
  if (parsed) return moduleSuiteForId(parsed.moduleId);
  if (isKnownModuleId(permission)) return moduleSuiteForId(permission);
  return null;
}

/** True when access must be explicitly granted (deny-by-default). */
export function isRegistryGatedPermission(permission: string): boolean {
  const key = String(permission || '').trim();
  if (!key) return false;
  if (GLOBAL_PERMISSION_KEYS.has(key)) return true;
  if (key.startsWith('social:')) return true;
  const parsed = parseModulePermissionKey(key);
  if (parsed) return isKnownModuleId(parsed.moduleId);
  return isKnownModuleId(key);
}

export function hrmsModuleForPathname(pathname: string): PermissionModuleDef | null {
  const path = String(pathname || '').split('?')[0];
  for (const { prefix, module } of ROUTE_MODULE_INDEX) {
    if (module.suite !== 'hrms') continue;
    if (path === prefix || path.startsWith(`${prefix}/`)) return module;
  }
  return null;
}

export function crmModuleForPathname(pathname: string): PermissionModuleDef | null {
  const path = String(pathname || '').split('?')[0];
  for (const { prefix, module } of ROUTE_MODULE_INDEX) {
    if (module.suite !== 'crm') continue;
    if (path === prefix || path.startsWith(`${prefix}/`)) return module;
  }
  return null;
}

export function pmModuleForPathname(pathname: string): PermissionModuleDef | null {
  const path = String(pathname || '').split('?')[0];
  for (const { prefix, module } of ROUTE_MODULE_INDEX) {
    if (module.suite !== 'pm') continue;
    if (path === prefix || path.startsWith(`${prefix}/`)) return module;
  }
  return null;
}

export function hrmsApiSegmentToModuleId(segment: string): string | null {
  return API_SEGMENT_TO_MODULE.get(segment)?.id ?? null;
}

export function defaultReadPermission(moduleId: string): string {
  return `${moduleId}:read`;
}
