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
import { CRM_ROLE_MODULE_ALL, resolveRoleModule } from './crm-workspace-module.util';

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
};

export type AssignableUsersPage = {
  items: AssignableUser[];
  total: number;
  page: number;
  limit: number;
  tier: CrmAssignTier;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    opts: { search?: string; page?: unknown; limit?: unknown } = {},
  ): Promise<AssignableUsersPage> {
    const tier = this.assignTier(moduleKey, actor);
    const page = Math.max(1, Math.floor(Number(opts.page)) || 1);
    const limit = Math.min(50, Math.max(1, Math.floor(Number(opts.limit)) || 10));
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
    return {
      items: rows.map((u: any) => ({
        _id: String(u._id),
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        email: u.email,
        label: this.label(u),
      })),
      total,
      page,
      limit,
      tier,
    };
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
  ): Promise<ResolvedAssignee> {
    const assignee = await this.resolveAssignee(assigneeRef);
    if (tier === 'all') {
      // Super Admin may also assign to a free-text owner label (legacy imports).
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
