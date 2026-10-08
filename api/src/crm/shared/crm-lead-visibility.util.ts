import { Types } from 'mongoose';
import {
  hasCrmAdminFromDbUser,
  hasCrmFullDataAccess,
  jwtCrmPermissionSet,
  permissionNamesFromDbUser,
} from './crm-admin-access.util';
import { leadModuleFilter } from './crm-workspace-module.util';

/**
 * Who sees which leads — one rule for the Leads / PM Leads lists, WhatsApp and IVR:
 *   'all'       — Super Admin (or an explicit `leads:read:all` grant): every lead.
 *   'workspace' — Team Lead / Manager (`leads:read:team` / `pm-leads:read:team`): every lead
 *                 of their own workspace (2Bigha → 2Bigha leads, PM → PM leads).
 *   'own'       — agents / members: only leads ASSIGNED to them (leadOwner) or explicitly
 *                 shared with them. Own-tier users who hand leads out (Social Media —
 *                 `leads:assign`) also keep the leads they created, to track progress.
 */
export type LeadVisibilityTier = 'all' | 'workspace' | 'own';

/**
 * `user` is either `req.user` after RbacGuard (merged `crmPermissions` + `crmDbUser`) or a
 * CRMUser doc with `roleId` (and its `permissions`) populated.
 */
function effectivePermissions(user: any): Set<string> {
  const dbUser = user?.crmDbUser ?? user;
  return new Set([...jwtCrmPermissionSet(user), ...permissionNamesFromDbUser(dbUser)]);
}

export function leadVisibilityTier(user: any): LeadVisibilityTier {
  if (!user) return 'own';
  if (hasCrmFullDataAccess(user) || hasCrmAdminFromDbUser(user?.crmDbUser ?? user)) return 'all';
  const perms = effectivePermissions(user);
  if (perms.has('leads:read:all') || perms.has('pm-leads:read:all')) return 'all';
  if (perms.has('leads:read:team') || perms.has('pm-leads:read:team')) return 'workspace';
  return 'own';
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ids a person may be recorded under (HRMS user id + CRM user id). */
export function leadViewerIds(user: any): Types.ObjectId[] {
  const raw = [user?.userId, user?._id, user?.crmDbUser?._id]
    .map((v) => String(v ?? ''))
    .filter((v) => Types.ObjectId.isValid(v));
  return [...new Set(raw)].map((v) => new Types.ObjectId(v));
}

/** "Assigned to me" — `leadOwner` is my name / email / (legacy) id, or `sharedWith` me. */
export function assignedLeadFilter(user: any): Record<string, unknown> {
  const dbUser = user?.crmDbUser ?? user;
  const name = [user?.firstName ?? dbUser?.firstName, user?.lastName ?? dbUser?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const email = String(user?.email ?? dbUser?.email ?? '').trim();
  const ids = leadViewerIds(user);
  const or: Record<string, unknown>[] = [];
  if (name) or.push({ leadOwner: new RegExp(`^\\s*${esc(name)}\\s*$`, 'i') });
  if (email) or.push({ leadOwner: new RegExp(`^\\s*${esc(email)}\\s*$`, 'i') });
  if (ids.length) {
    or.push({ leadOwner: { $in: ids.map(String) } });
    or.push({ sharedWith: { $in: ids } });
    const perms = effectivePermissions(user);
    if (perms.has('leads:assign') || perms.has('pm-leads:assign')) {
      or.push({ createdBy: { $in: ids } });
    }
  }
  return or.length ? { $or: or } : { _id: null };
}

/**
 * Mongo filter for the leads this user may see, or `null` when unrestricted.
 * Always includes the workspace boundary for workspace-scoped roles.
 */
export function leadVisibilityFilter(user: any): Record<string, unknown> | null {
  const tier = leadVisibilityTier(user);
  if (tier === 'all') return null;
  const workspace = leadModuleFilter(user?.crmDbUser ?? user);
  const parts: Record<string, unknown>[] = [];
  if (Object.keys(workspace).length) parts.push(workspace);
  if (tier === 'own') parts.push(assignedLeadFilter(user));
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { $and: parts };
}
