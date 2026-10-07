import { CrmRoleModule } from './crm-workspace-module.util';

/**
 * Functional CRM roles — "Roles Overview" + "RBAC & Data Isolation" + "Team Management
 * with RBAC" sections of the 2bigha requirement doc. Single source of truth for the seed
 * in `CRMUsersService.seedFunctionalRoles` (crm-side) and `scripts/seed-workspace-roles.ts`.
 *
 * Follows this codebase's RBAC conventions (see src/seed-crm-roles.ts):
 * - Permissions are stored as `Permission` refs on the Role (what RbacGuard + Settings →
 *   Roles read). `module:write` implies read/create/edit/approve; delete/export/import/
 *   assign are explicit (crm-users/permission-actions.util.ts).
 * - Only `Super Admin` carries `admin:manage` / `dashboard:read` (dashboard:read routes to
 *   the org-wide Admin dashboard). Team Leads land on `workspace-team`, agents on
 *   `workspace-agent`, Legal on Legal Cases, the Approval Team on the Approval Queue.
 * - Every non-admin role is pinned to ONE workspace (`workspaceModule`): it never sees
 *   another workspace's leads/cases. Data tier: no key = own records, `:read:team` = self +
 *   direct reports (`users.reportsTo`); `:read:all` is granted to nobody.
 * - Reassign/transfer = `leads:assign` / `pm-leads:assign` / `legal:assign` only.
 * - Export, delete of leads/contacts, settings and user admin stay with Super Admin.
 *
 * Bump `CRM_ROLE_SEED_VERSION` when a permission set below changes: seeded roles whose
 * stored `seedVersion` is lower are rewritten on API boot.
 */
export const CRM_ROLE_SEED_VERSION = 2;

export type CrmRoleSeed = {
  /** Stable key — survives an admin renaming the role. */
  key: string;
  name: string;
  description: string;
  workspaceModule: CrmRoleModule;
  crmPermissions: string[];
};

/** New permission keys introduced with the functional roles (upserted as Permission docs). */
export const CRM_FUNCTIONAL_PERMISSIONS: { name: string; description: string }[] = [
  { name: 'leads:assign', description: 'Assign, reassign or transfer leads to another user' },
  { name: 'pm-leads:assign', description: 'Assign, reassign or transfer PM leads' },
  { name: 'legal:assign', description: 'Assign, reassign or transfer legal cases' },
  { name: 'legal:read:team', description: "View legal cases owned by your team" },
  { name: 'legal:status', description: 'Read-only legal status of cases linked to your leads' },
  { name: 'ivr:call', description: 'Place IVR calls and log call activity' },
  { name: 'team:read', description: 'Team hierarchy view — drill into direct reports' },
];

/** `read` + `write` (write implies create/edit/approve) + explicit `edit` for the matrix. */
const rw = (...modules: string[]) => modules.flatMap((m) => [`${m}:read`, `${m}:write`, `${m}:edit`]);
const r = (...modules: string[]) => modules.map((m) => `${m}:read`);

/** Home screens + day-to-day tools every working role has. */
const BASE = [...r('workspace', 'workspace-calendar'), ...rw('activities', 'tasks')];

/** Owns assigned leads, calls/WhatsApps clients, tracks follow-ups. */
const CALLING_AGENT = [
  ...BASE,
  ...r('workspace-agent', 'workspace-work', 'workspace-prospecting', 'workspace-calls'),
  ...rw('leads', 'contacts'),
  'leads:move_pipeline',
  'clients:read',
  ...rw('inbox'),
  'inbox:send',
  'ivr-service:read',
  'ivr:call',
  'legal:status',
];

/** Team Lead / Manager — agent toolset + team scope, reassignment, broadcasts, team reports. */
const TEAM_LEAD = [
  ...CALLING_AGENT.filter((p) => p !== 'workspace-agent:read'),
  ...r('workspace-team', 'workspace-summary'),
  'leads:read:team',
  'contacts:read:team',
  'clients:read:team',
  'leads:assign',
  'leads:import',
  'team:read',
  ...rw('outreach'),
  ...r('reports', 'reports-overview', 'reports-leads'),
];

/** PM leads live under the `pm-leads` module (/crm/pm/leads). */
const PM_AGENT_EXTRA = [...rw('pm-leads'), 'pm-leads:move_pipeline', 'property-listings:read'];
const PM_TEAM_EXTRA = [...PM_AGENT_EXTRA, 'pm-leads:read:team', 'pm-leads:assign', 'pm-leads:import'];

const LEGAL_EXECUTIVE = [
  ...BASE,
  'workspace-calls:read',
  ...rw('legal'),
  'legal:move_pipeline',
  'contacts:read',
  'ivr-service:read',
  'ivr:call',
];

const uniq = (perms: string[]) => [...new Set(perms)];

export const CRM_ROLE_SEEDS: CrmRoleSeed[] = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Org-wide configuration, exports and cross-module administration (2Bigha, PM, Legal).',
    workspaceModule: 'ALL',
    crmPermissions: ['admin:manage', 'dashboard:read', 'workspace-admin:read', 'settings:admin'],
  },
  {
    key: '2bigha_team_lead',
    name: 'Team Lead / Manager (2Bigha)',
    description: "Oversees Calling Agents and Social Media executives; sees and reassigns only their own team's leads.",
    workspaceModule: '2Bigha',
    crmPermissions: uniq([...TEAM_LEAD, ...rw('property-listings')]),
  },
  {
    key: '2bigha_calling_agent',
    name: 'Calling Agent (2Bigha)',
    description: 'Owns assigned leads, calls/WhatsApps clients, creates properties, tracks follow-ups.',
    workspaceModule: '2Bigha',
    crmPermissions: uniq([...CALLING_AGENT, ...rw('property-listings')]),
  },
  {
    key: '2bigha_social_media',
    name: 'Social Media Executive',
    description: 'Captures leads from Meta platforms, assigns them to agents and tracks their progress; fulfils social-media-video requests.',
    workspaceModule: '2Bigha',
    crmPermissions: uniq([
      ...BASE,
      'workspace-agent:read',
      ...rw('leads', 'contacts', 'inbox'),
      'leads:import',
      'leads:assign',
      'outreach:read',
      'property-listings:read',
    ]),
  },
  {
    key: '2bigha_property_approval',
    name: 'Property Approval Team',
    description: 'Reviews and approves / rejects properties before listing.',
    workspaceModule: '2Bigha',
    crmPermissions: uniq([...BASE, ...rw('approval-queue'), 'property-listings:read']),
  },
  {
    key: 'pm_team_lead',
    name: 'Team Lead / Manager (PM)',
    description: "Oversees PM Calling Agents; sees and reassigns only their own team's PM leads.",
    workspaceModule: 'PROPERTY_MGMT',
    crmPermissions: uniq([...TEAM_LEAD, ...PM_TEAM_EXTRA]),
  },
  {
    key: 'pm_calling_agent',
    name: 'Calling Agent (PM)',
    description: 'Owns assigned PM leads, calls/WhatsApps clients, views subscription & legal status.',
    workspaceModule: 'PROPERTY_MGMT',
    crmPermissions: uniq([...CALLING_AGENT, ...PM_AGENT_EXTRA]),
  },
  {
    key: 'legal_executive',
    name: 'Legal Executive',
    description: 'Works assigned legal cases, calls leads if needed, produces & shares reports.',
    workspaceModule: 'LEGAL',
    crmPermissions: uniq(LEGAL_EXECUTIVE),
  },
  {
    key: 'legal_team_lead',
    name: 'Legal Team Lead',
    description: 'Oversees Legal Executives and the case load coming from both 2Bigha and PM.',
    workspaceModule: 'LEGAL',
    crmPermissions: uniq([...LEGAL_EXECUTIVE, 'legal:read:team', 'legal:assign', 'legal:delete', 'team:read']),
  },
];
