import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import {
  crmPortalAccessUserFilter,
  hasCrmFullDataAccess,
  jwtCrmPermissionSet,
} from './crm-admin-access.util';
import {
  CRM_ROLE_MODULE_ALL,
  type CrmWorkspaceModule,
  resolveRoleModule,
} from './crm-workspace-module.util';
import {
  crmLeadAccessFor,
  type CrmLeadAccess,
  workspaceSeesLeads,
} from './crm-effective-access.util';

export type CrmAssignModuleKey = 'leads' | 'legal';

/**
 * How far a user may hand records to someone else (requirement doc §7 / §8 / §13.3):
 * - `all`  — Super Admin (or an explicit `:read:all` grant): anyone, any record.
 * - `team` — Team Lead / Manager: only records in their team scope, only to their team.
 * - `own`  — e.g. Social Media Executive: only records they own/created, only to users of
 *            their own workspace (hand captured leads to the 2Bigha agents).
 * - `null` — no `<module>:assign` grant: cannot reassign or transfer at all.
 */
export type CrmAssignTier = 'all' | 'team' | 'own' | null;

export type ResolvedAssignee = {
  hrmsId: Types.ObjectId | null;
  label: string;
  email?: string;
};

export type AssignableUser = {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  label: string;
  /** CRM role name — only filled for the Super Admin ('all') picker. */
  roleName?: string;
};

export type AssignableUsersPage = {
  items: AssignableUser[];
  total: number;
  page: number;
  limit: number;
  tier: CrmAssignTier;
};

/** Workspace names for assignment error messages. */
const WORKSPACE_LABEL: Record<string, string> = {
  '2Bigha': '2Bigha',
  PROPERTY_MGMT: 'Property Management',
  LEGAL: 'Legal',
};

/** HRMS fields the lead-access check needs (mirrors what JwtStrategy reads). */
const HRMS_ACCESS_FIELDS =
  '_id firstName lastName email role roleId useRoleOverrides permissions permittedTools crmPermissions isActive';

export type AssertAssigneeOptions = {
  /**
   * Leads only: the assignee must be able to open the Leads module (same check as
   * RbacGuard for `leads:read` / `pm-leads:read`) ...
   */
  requireLeadAccess?: boolean;
  /** ... and their role's workspace must see leads of every one of these workspaces. */
  leadWorkspaces?: CrmWorkspaceModule[];
};

/** Page-size ceiling of the Super Admin assignee picker. */
const ALL_TIER_PICKER_MAX = 200;

const escapeRegex =(s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class CrmAssignmentPolicyService {
  constructor(
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private readonly crmUserModel: Model<CRMUserDocument>,
  ) {}

  /** `user` is `req.user` after RbacGuard (its `crmPermissions` include the CRM role grants). */
  assignTier(moduleKey: CrmAssignModuleKey, user?: any): CrmAssignTier {
    if (!user) return null;
    if (hasCrmFullDataAccess(user)) return 'all';
    const perms = jwtCrmPermissionSet(user);
    if (!perms.has(`${moduleKey}:assign`)) return null;
    if (perms.has(`${moduleKey}:read:all`)) return 'all';
    if (perms.has(`${moduleKey}:read:team`)) return 'team';
    return 'own';
  }

  requireTier(moduleKey: CrmAssignModuleKey, user?: any): Exclude<CrmAssignTier, null> {
    const tier = this.assignTier(moduleKey, user);
    if (!tier) {
      throw new ForbiddenException(
        'Your role cannot assign or transfer records — ask your Team Lead / Manager.',
      );
    }
    return tier;
  }

  private label(u: any): string {
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
    return name || u?.email || '';
  }

  /** Self + direct reports (`users.reportsTo`), as HRMS ids and owner labels. */
  async teamOf(user?: any): Promise<{ ids: string[]; labels: string[] }> {
    const raw = user?.userId ?? user?._id;
    if (!raw || !Types.ObjectId.isValid(String(raw))) return { ids: [], labels: [] };
    const selfId = new Types.ObjectId(String(raw));
    const reports = await this.hrmsUserModel
      .find({ reportsTo: selfId })
      .select('_id firstName lastName email')
      .lean()
      .exec();
    const ids = [String(selfId), ...reports.map((r: any) => String(r._id))];
    const labels = [this.label(user), ...reports.map((r: any) => this.label(r))].filter(Boolean);
    return { ids, labels };
  }

  /**
   * Resolves the assignee the UI sent — an HRMS/CRM user id, an email, or the owner
   * display name (leads/cases store the owner as a name label).
   */
  async resolveAssignee(ref: string): Promise<ResolvedAssignee | null> {
    const value = String(ref || '').trim();
    if (!value) return null;
    let doc: any = null;
    if (Types.ObjectId.isValid(value)) {
      doc = await this.hrmsUserModel.findById(value).select('_id firstName lastName email').lean().exec();
      if (!doc) {
        const crm: any = await this.crmUserModel.findById(value).select('email').lean().exec();
        if (crm?.email) {
          doc = await this.hrmsUserModel
            .findOne({ email: crm.email })
            .select('_id firstName lastName email')
            .lean()
            .exec();
        }
      }
    }
    if (!doc && value.includes('@')) {
      doc = await this.hrmsUserModel
        .findOne({ email: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
        .select('_id firstName lastName email')
        .lean()
        .exec();
    }
    if (!doc) {
      const parts = value.split(/\s+/);
      const first = parts.shift() || '';
      const last = parts.join(' ');
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const q: Record<string, unknown> = { firstName: new RegExp(`^${esc(first)}$`, 'i') };
      if (last) q.lastName = new RegExp(`^${esc(last)}$`, 'i');
      const matches = await this.hrmsUserModel.find(q).select('_id firstName lastName email').limit(2).lean().exec();
      if (matches.length === 1) doc = matches[0];
    }
    if (!doc) return null;
    return { hrmsId: doc._id as Types.ObjectId, label: this.label(doc), email: doc.email };
  }

  /**
   * The people `actor` may hand records to — the same set `assertAssignee` accepts — as a
   * searchable page for the Reassign picker. A Team Lead sees only themself + direct reports.
   */
  async assignableUsers(
    moduleKey: CrmAssignModuleKey,
    actor: any,
    opts: {
      search?: string;
      page?: unknown;
      limit?: unknown;
      /** Only people who can open Leads (lead pickers) — optionally of one lead workspace. */
      requireLeadAccess?: boolean;
      leadWorkspace?: CrmWorkspaceModule;
    } = {},
  ): Promise<AssignableUsersPage> {
    const tier = this.assignTier(moduleKey, actor);
    const page = Math.max(1, Math.floor(Number(opts.page)) || 1);
    // Super Admin picks from the whole company (imports spread over many people), so their
    // page may be larger; Team Lead / own-tier pickers keep the original 50 cap.
    const maxLimit = tier === 'all' ? ALL_TIER_PICKER_MAX : 50;
    const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(opts.limit)) || 10));
    const empty: AssignableUsersPage = { items: [], total: 0, page, limit, tier };
    if (!tier) return empty;

    const and: Record<string, unknown>[] = [];
    if (tier === 'team') {
      const { ids } = await this.teamOf(actor);
      if (!ids.length) return empty;
      and.push({ isActive: { $ne: false }, _id: { $in: ids.map((id) => new Types.ObjectId(id)) } });
    } else {
      and.push(crmPortalAccessUserFilter());
      const actorWorkspace = tier === 'own' ? resolveRoleModule(actor?.crmDbUser) : CRM_ROLE_MODULE_ALL;
      if (actorWorkspace !== CRM_ROLE_MODULE_ALL) {
        const emails = await this.workspaceEmails(actorWorkspace);
        if (!emails.length) return empty;
        and.push({ email: { $in: emails.map((e) => new RegExp(`^${escapeRegex(e)}$`, 'i')) } });
      }
    }
    for (const token of String(opts.search || '').trim().split(/\s+/).filter(Boolean).slice(0, 5)) {
      const rx = new RegExp(escapeRegex(token), 'i');
      and.push({ $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] });
    }

    const filter = and.length === 1 ? and[0] : { $and: and };
    if (opts.requireLeadAccess) {
      // Lead access lives in CRM roles (another DB), so it can't be a Mongo filter on
      // `users`: load the candidates, keep those who can open Leads, then page in memory.
      const candidates = (await this.hrmsUserModel
        .find(filter)
        .select(HRMS_ACCESS_FIELDS)
        .populate('roleId')
        .sort({ firstName: 1, lastName: 1, _id: 1 })
        .lean()
        .exec()) as any[];
      const access = await this.leadAccessByHrmsDocs(candidates);
      const allowed = candidates.filter((u) => {
        const a = access.get(String(u._id));
        if (!a?.canAccess) return false;
        return (
          !opts.leadWorkspace ||
          workspaceSeesLeads(a.workspace, opts.leadWorkspace)
        );
      });
      const pageRows = allowed.slice((page - 1) * limit, page * limit);
      const roles =
        tier === 'all' ? await this.roleNamesByEmail(pageRows) : null;
      return {
        items: pageRows.map((u: any) => this.toAssignable(u, roles)),
        total: allowed.length,
        page,
        limit,
        tier,
      };
    }
    const [total, rows] = await Promise.all([
      this.hrmsUserModel.countDocuments(filter).exec(),
      this.hrmsUserModel
        .find(filter)
        .select('_id firstName lastName email')
        .sort({ firstName: 1, lastName: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    const roleByEmail = tier === 'all' ? await this.roleNamesByEmail(rows as any[]) : null;
    return {
      items: rows.map((u: any) => this.toAssignable(u, roleByEmail)),
      total,
      page,
      limit,
      tier,
    };
  }

  private toAssignable(
    u: any,
    roleByEmail: Map<string, string> | null,
  ): AssignableUser {
    return {
      _id: String(u._id),
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email,
      label: this.label(u),
      ...(roleByEmail
        ? {
            roleName:
              roleByEmail.get(String(u.email || '').toLowerCase()) || undefined,
          }
        : {}),
    };
  }

  /**
   * Lead access per HRMS user id for a batch of HRMS docs (roleId populated):
   * one CRM-users query for the whole batch.
   */
  private async leadAccessByHrmsDocs(
    hrmsDocs: any[],
  ): Promise<Map<string, CrmLeadAccess>> {
    const out = new Map<string, CrmLeadAccess>();
    if (!hrmsDocs.length) return out;
    const emails = [
      ...new Set(
        hrmsDocs
          .map((u) =>
            String(u?.email || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
    const crmUsers = emails.length
      ? ((await this.crmUserModel
          .find({
            email: {
              $in: emails.map((e) => new RegExp(`^${escapeRegex(e)}$`, 'i')),
            },
          })
          .populate({ path: 'roleId', populate: { path: 'permissions' } })
          .lean()
          .exec()) as any[])
      : [];
    const crmByEmail = new Map<string, any>();
    for (const c of crmUsers) {
      const key = String(c?.email || '').toLowerCase();
      // Prefer an active record when an email has duplicates.
      if (
        !crmByEmail.has(key) ||
        (c?.isActive && !crmByEmail.get(key)?.isActive)
      ) {
        crmByEmail.set(key, c);
      }
    }
    for (const u of hrmsDocs) {
      out.set(
        String(u._id),
        crmLeadAccessFor(
          u,
          crmByEmail.get(String(u?.email || '').toLowerCase()) || null,
        ),
      );
    }
    return out;
  }

  /** Can this HRMS user open Leads (and which workspace do they work in)? */
  async leadAccessOf(hrmsId: Types.ObjectId | string): Promise<CrmLeadAccess> {
    const doc = Types.ObjectId.isValid(String(hrmsId))
      ? await this.hrmsUserModel
          .findById(String(hrmsId))
          .select(HRMS_ACCESS_FIELDS)
          .populate('roleId')
          .lean()
          .exec()
      : null;
    if (!doc) {
      return {
        canAccess: false,
        workspace: CRM_ROLE_MODULE_ALL,
        reason: 'is not an active employee',
      };
    }
    const access = await this.leadAccessByHrmsDocs([doc]);
    return access.get(String((doc as any)._id))!;
  }

  /** Throws a clear 403 unless `assignee` may work the leads being handed to them. */
  async assertLeadAccess(
    assignee: ResolvedAssignee,
    leadWorkspaces: CrmWorkspaceModule[] = [],
  ): Promise<void> {
    if (!assignee.hrmsId) return;
    const who = assignee.label || assignee.email || 'This user';
    const access = await this.leadAccessOf(assignee.hrmsId);
    if (!access.canAccess) {
      throw new ForbiddenException(
        `${who} ${access.reason || 'does not have access to Leads'} — leads can't be assigned to them. Ask a CRM Admin to grant a role with Leads access.`,
      );
    }
    const blocked = [...new Set(leadWorkspaces)].filter(
      (ws) => !workspaceSeesLeads(access.workspace, ws),
    );
    if (blocked.length) {
      const names = blocked.map((ws) => WORKSPACE_LABEL[ws] || ws).join(' / ');
      const own = WORKSPACE_LABEL[access.workspace] || access.workspace;
      throw new ForbiddenException(
        `${who} works in the ${own} workspace and can't see ${names} leads — pick someone from that workspace.`,
      );
    }
  }

  /** CRM role display name per (lower-cased) email, so the admin picker can show Team Lead / Agent badges. */
  private async roleNamesByEmail(rows: { email?: string }[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const emails = rows.map((r) => String(r.email || '').trim()).filter(Boolean);
    if (!emails.length) return out;
    try {
      const users = await this.crmUserModel
        .find({ email: { $in: emails.map((e) => new RegExp(`^${escapeRegex(e)}$`, 'i')) } })
        .select('email roleId')
        .populate('roleId', 'name')
        .lean()
        .exec();
      for (const u of users as any[]) {
        const name = u?.roleId?.name;
        if (u?.email && name) out.set(String(u.email).toLowerCase(), String(name));
      }
    } catch {
      // Role badges are cosmetic — never fail the picker over them.
    }
    return out;
  }

  /** Emails of CRM users whose role is scoped to exactly `workspace` (what `assertAssignee` 'own' accepts). */
  private async workspaceEmails(workspace: string): Promise<string[]> {
    const users = await this.crmUserModel.find({}).select('email roleId').populate('roleId').lean().exec();
    return users
      .filter((u: any) => u?.email && resolveRoleModule(u) === workspace)
      .map((u: any) => String(u.email));
  }

  /** Workspace of a user's CRM role ('ALL' when unrestricted or no CRM role). */
  private async workspaceOf(email?: string): Promise<string> {
    if (!email) return CRM_ROLE_MODULE_ALL;
    const crm = await this.crmUserModel
      .findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .populate('roleId')
      .lean()
      .exec();
    return resolveRoleModule(crm);
  }

  /**
   * Throws unless `actor` may hand records to `assigneeRef` under `tier`.
   * Returns the resolved assignee (its label is what gets stored as the owner).
   */
  async assertAssignee(
    tier: Exclude<CrmAssignTier, null>,
    actor: any,
    assigneeRef: string,
    opts: AssertAssigneeOptions = {},
  ): Promise<ResolvedAssignee> {
    const assignee = await this.checkAssigneeTier(tier, actor, assigneeRef);
    if (opts.requireLeadAccess) {
      await this.assertLeadAccess(assignee, opts.leadWorkspaces);
    }
    return assignee;
  }

  private async checkAssigneeTier(
    tier: Exclude<CrmAssignTier, null>,
    actor: any,
    assigneeRef: string,
  ): Promise<ResolvedAssignee> {
    const assignee = await this.resolveAssignee(assigneeRef);
    if (tier === 'all') {
      // Super Admin may also assign to a free-text owner label (legacy imports) — no
      // user behind it, so there is no access to check.
      return assignee || { hrmsId: null, label: String(assigneeRef || '').trim() };
    }
    if (!assignee?.hrmsId) {
      throw new ForbiddenException('Pick an assignee from the user list.');
    }
    if (tier === 'team') {
      const team = await this.teamOf(actor);
      if (!team.ids.includes(String(assignee.hrmsId))) {
        throw new ForbiddenException('You can only assign records within your own team.');
      }
      return assignee;
    }
    // 'own' tier — any user of the actor's own workspace.
    const actorWorkspace = resolveRoleModule(actor?.crmDbUser);
    const targetWorkspace = await this.workspaceOf(assignee.email);
    if (actorWorkspace !== CRM_ROLE_MODULE_ALL && targetWorkspace !== actorWorkspace) {
      throw new ForbiddenException('You can only assign records to users of your own workspace.');
    }
    return assignee;
  }
}
