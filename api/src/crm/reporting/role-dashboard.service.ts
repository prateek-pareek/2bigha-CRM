import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { CallLog, CallLogDocument } from '../ivr/schemas/call-log.schema';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
} from '../integrations/schemas/whatsapp-message.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import {
  PropertyListing,
  PropertyListingDocument,
} from '../property-listings/schemas/property-listing.schema';
import { AgentTarget, AgentTargetDocument } from './schemas/agent-target.schema';
import { ReportingService } from './reporting.service';
import { TwoBighaSubscriptionsService } from '../subscriptions/twobigha-subscriptions.service';
import { AppCacheService } from '../../redis/app-cache.service';

/**
 * Role-based dashboards (Admin / Team Lead / Agent) — the screens defined by the
 * "CRM Role Dashboard Wireframe". Every number is a live query; scoping is:
 *   - org   → all users (Admin only)
 *   - team  → the caller's direct reports (reportsTo === caller)
 *   - agent → the caller only
 *
 * Identity spaces differ per collection, so a scope carries ids in BOTH spaces:
 *   - platform User ids → Lead.createdBy, Activity.author, CallLog.initiatedByUserId
 *   - CRMUser ids       → WhatsAppMessage.sentBy, PropertyListing.createdBy
 * They are joined by email (platform User ↔ CRMUser).
 */

export type DashboardTier = 'admin' | 'team' | 'agent';
type ScopeKind = 'org' | 'team' | 'agent';

interface Member {
  platformId: string;
  crmId?: string;
  name: string;
  email?: string;
}

interface DashboardScope {
  kind: ScopeKind;
  /** null = unrestricted (all users). Empty array = match nothing. */
  platformUserIds: Types.ObjectId[] | null;
  crmUserIds: Types.ObjectId[] | null;
  ownerNames: string[] | null;
  members: Member[];
}

const NEW_STATUS_RE = /^(new|open|lead|uncontacted)$/i;
const LOST_RE = /lost|disqualified|junk|rejected|dead|unqualified|closed\s*lost/i;
const CONVERTED_RE = /convert|won|closed\s*won|customer|client/i;
const QUALIFIED_RE = /qualified|proposal|negotiation|hot|warm|interested|demo|meeting/i;
const CONTACTED_RE = /contact|follow|attempt|reached|called/i;

const CONNECTED_STATUSES = ['Connected', 'Completed'];
const MISSED_STATUSES = ['Missed'];

@Injectable()
export class RoleDashboardService {
  private readonly logger = new Logger(RoleDashboardService.name);

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(CallLog.name, 'crmConnection')
    private callLogModel: Model<CallLogDocument>,
    @InjectModel(WhatsAppMessage.name, 'crmConnection')
    private whatsappModel: Model<WhatsAppMessageDocument>,
    @InjectModel(PropertyListing.name, 'crmConnection')
    private propertyModel: Model<PropertyListingDocument>,
    @InjectModel(AgentTarget.name, 'crmConnection')
    private agentTargetModel: Model<AgentTargetDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private crmUserModel: Model<CRMUserDocument>,
    @InjectModel(User.name)
    private hrmsUserModel: Model<UserDocument>,
    private readonly reportingService: ReportingService,
    private readonly subscriptionsService: TwoBighaSubscriptionsService,
    private readonly appCache: AppCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Tier resolution (permission-key based, per product decision)
  // ---------------------------------------------------------------------------

  /**
   * Which dashboard the caller lands on / may open. Permission keys drive it:
   *   workspace-admin:read (or dashboard:read master / true admin) → admin
   *   workspace-team:read  → team
   *   workspace-agent:read → agent
   * Fallback when no explicit key: team if the user has direct reports, else agent.
   */
  async resolveTier(
    dbUser: any,
    jwtUser: any,
    isAdmin: boolean,
  ): Promise<{ tier: DashboardTier; teamLeadId: string | null; canSeeAll: boolean }> {
    const perms = this.mergePermissions(dbUser, jwtUser);
    const has = (k: string) => perms.includes(k);

    if (isAdmin || has('workspace-admin:read') || has('dashboard:read')) {
      return { tier: 'admin', teamLeadId: null, canSeeAll: true };
    }
    if (has('workspace-team:read')) {
      return { tier: 'team', teamLeadId: this.selfId(jwtUser, dbUser), canSeeAll: false };
    }
    if (has('workspace-agent:read')) {
      return { tier: 'agent', teamLeadId: null, canSeeAll: false };
    }
    // No explicit dashboard key — infer from hierarchy.
    const selfId = this.selfId(jwtUser, dbUser);
    if (selfId && (await this.hasDirectReports(selfId))) {
      return { tier: 'team', teamLeadId: selfId, canSeeAll: false };
    }
    return { tier: 'agent', teamLeadId: null, canSeeAll: false };
  }

  private selfId(jwtUser: any, dbUser?: any): string | null {
    const id = jwtUser?.userId || jwtUser?._id || jwtUser?.id || dbUser?._id;
    return id ? String(id) : null;
  }

  private mergePermissions(dbUser: any, jwtUser: any): string[] {
    const role = dbUser?.roleId;
    const rolePerms =
      (typeof role === 'object' && Array.isArray(role?.permissions)
        ? role.permissions.map((p: any) =>
            typeof p === 'string' ? p : p?.name || p?.key,
          )
        : []) || [];
    const out = new Set<string>(
      [
        ...rolePerms,
        ...(Array.isArray(dbUser?.permissions) ? dbUser.permissions : []),
        ...(Array.isArray(jwtUser?.permissions) ? jwtUser.permissions : []),
        ...(Array.isArray(jwtUser?.crmPermissions) ? jwtUser.crmPermissions : []),
      ].filter(Boolean),
    );
    return [...out];
  }

  private async hasDirectReports(userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) return false;
    const n = await this.hrmsUserModel
      .countDocuments({ reportsTo: new Types.ObjectId(userId) })
      .exec();
    return n > 0;
  }

  /** True when `memberId` reports to `leadId` (used to gate a Team Lead's member drill-down). */
  async isDirectReport(leadId: string, memberId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(leadId) || !Types.ObjectId.isValid(memberId)) return false;
    const n = await this.hrmsUserModel
      .countDocuments({
        _id: new Types.ObjectId(memberId),
        reportsTo: new Types.ObjectId(leadId),
      })
      .exec();
    return n > 0;
  }

  // ---------------------------------------------------------------------------
  // Scope resolution
  // ---------------------------------------------------------------------------

  private async resolvePeople(platformUsers: any[]): Promise<Member[]> {
    const emails = platformUsers
      .map((u) => String(u.email || '').trim().toLowerCase())
      .filter(Boolean);
    const crmUsers = emails.length
      ? await this.crmUserModel
          .find({ email: { $in: emails.map((e) => new RegExp(`^${escapeRe(e)}$`, 'i')) } })
          .select('_id email')
          .lean()
          .exec()
      : [];
    const crmByEmail = new Map<string, string>();
    for (const c of crmUsers) {
      const e = String((c as any).email || '').trim().toLowerCase();
      if (e) crmByEmail.set(e, String((c as any)._id));
    }
    return platformUsers.map((u) => {
      const email = String(u.email || '').trim();
      const name =
        `${u.firstName || ''} ${u.lastName || ''}`.trim() || email || 'Unknown';
      return {
        platformId: String(u._id),
        crmId: crmByEmail.get(email.toLowerCase()),
        name,
        email,
      };
    });
  }

  private membersToScope(kind: ScopeKind, members: Member[]): DashboardScope {
    const platformUserIds = members
      .map((m) => (Types.ObjectId.isValid(m.platformId) ? new Types.ObjectId(m.platformId) : null))
      .filter((x): x is Types.ObjectId => !!x);
    const crmUserIds = members
      .map((m) => (m.crmId && Types.ObjectId.isValid(m.crmId) ? new Types.ObjectId(m.crmId) : null))
      .filter((x): x is Types.ObjectId => !!x);
    const ownerNames = new Set<string>();
    for (const m of members) {
      if (m.name) ownerNames.add(m.name);
      if (m.email) ownerNames.add(m.email);
    }
    return {
      kind,
      platformUserIds,
      crmUserIds,
      ownerNames: [...ownerNames],
      members,
    };
  }

  private orgScope(): DashboardScope {
    return {
      kind: 'org',
      platformUserIds: null,
      crmUserIds: null,
      ownerNames: null,
      members: [],
    };
  }

  private async teamScope(teamLeadId: string): Promise<DashboardScope> {
    if (!Types.ObjectId.isValid(teamLeadId)) return this.membersToScope('team', []);
    const reports = await this.hrmsUserModel
      .find({ reportsTo: new Types.ObjectId(teamLeadId) })
      .select('_id firstName lastName email')
      .limit(500)
      .lean()
      .exec();
    const members = await this.resolvePeople(reports);
    return this.membersToScope('team', members);
  }

  private async agentScope(agentId: string): Promise<DashboardScope> {
    if (!Types.ObjectId.isValid(agentId)) return this.membersToScope('agent', []);
    const u = await this.hrmsUserModel
      .findById(agentId)
      .select('_id firstName lastName email')
      .lean()
      .exec();
    if (!u) return this.membersToScope('agent', []);
    const members = await this.resolvePeople([u]);
    return this.membersToScope('agent', members);
  }

  // ---------------------------------------------------------------------------
  // Per-collection scope filters
  // ---------------------------------------------------------------------------

  /** Lead match: scoped by createdBy (platform id) OR leadOwner (display string). */
  private leadScopeMatch(scope: DashboardScope): any {
    if (scope.platformUserIds === null) return {};
    const or: any[] = [];
    if (scope.platformUserIds.length) or.push({ createdBy: { $in: scope.platformUserIds } });
    if (scope.ownerNames && scope.ownerNames.length)
      or.push({ leadOwner: { $in: scope.ownerNames } });
    if (!or.length) return MATCH_NOTHING;
    return { $or: or };
  }

  /** Activity author stores platform/HRMS ids; match both ObjectId + string forms. */
  private activityScopeMatch(scope: DashboardScope): any {
    if (scope.platformUserIds === null) return {};
    if (!scope.platformUserIds.length) return MATCH_NOTHING;
    const idList: any[] = [];
    for (const id of scope.platformUserIds) {
      idList.push(id);
      idList.push(String(id));
    }
    return { author: { $in: idList } };
  }

  private callScopeMatch(scope: DashboardScope): any {
    if (scope.platformUserIds === null) return {};
    if (!scope.platformUserIds.length) return MATCH_NOTHING;
    return { initiatedByUserId: { $in: scope.platformUserIds } };
  }

  private propertyScopeMatch(scope: DashboardScope): any {
    if (scope.crmUserIds === null) return {};
    if (!scope.crmUserIds.length) return MATCH_NOTHING;
    return { createdBy: { $in: scope.crmUserIds } };
  }

  private whatsappOutboundScopeMatch(scope: DashboardScope): any {
    if (scope.crmUserIds === null) return { direction: 'outbound' };
    if (!scope.crmUserIds.length) return MATCH_NOTHING;
    return { direction: 'outbound', sentBy: { $in: scope.crmUserIds } };
  }

  // ---------------------------------------------------------------------------
  // Windows
  // ---------------------------------------------------------------------------

  private ranges(window: string) {
    const { currentStart, currentEnd, previousStart, previousEnd } =
      this.reportingService.parseDateRange(window || 'this_week', 'previous');
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return {
      start: currentStart,
      end: currentEnd,
      prevStart: previousStart,
      prevEnd: previousEnd,
      todayStart,
      now,
    };
  }

  // ---------------------------------------------------------------------------
  // Metric groups (shared by all three dashboards)
  // ---------------------------------------------------------------------------

  private async leadGroup(scope: DashboardScope, r: any) {
    const base = this.leadScopeMatch(scope);
    const inWin = { ...base, createdAt: { $gte: r.start, $lte: r.end } };
    const inToday = { ...base, createdAt: { $gte: r.todayStart, $lte: r.now } };

    const [total, today, assigned, statusRows] = await Promise.all([
      this.leadModel.countDocuments(inWin),
      this.leadModel.countDocuments(inToday),
      this.leadModel.countDocuments({
        ...inWin,
        $and: [{ $or: [{ leadOwner: { $nin: ['', null] } }, { createdBy: { $ne: null } }] }],
      }),
      this.leadModel.aggregate([
        { $match: inWin },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const buckets = { New: 0, Contacted: 0, Qualified: 0, Converted: 0, Lost: 0 };
    for (const row of statusRows) {
      const bucket = classifyStatus(row._id);
      buckets[bucket] += row.count;
    }
    const notContacted = buckets.New;
    const contacted = Math.max(0, total - notContacted);

    return {
      total,
      today,
      assigned,
      contacted,
      notContacted,
      contactedPct: total > 0 ? Math.round((contacted / total) * 100) : 0,
      notContactedPct: total > 0 ? Math.round((notContacted / total) * 100) : 0,
      statusBreakdown: [
        { status: 'New', count: buckets.New },
        { status: 'Contacted', count: buckets.Contacted },
        { status: 'Qualified', count: buckets.Qualified },
        { status: 'Converted', count: buckets.Converted },
        { status: 'Lost', count: buckets.Lost },
      ],
    };
  }

  private async propertyGroup(scope: DashboardScope, r: any) {
    const base = {
      ...this.propertyScopeMatch(scope),
      listingBucket: { $in: ['properties', 'farm'] },
    };
    const inWin = { ...base, createdAt: { $gte: r.start, $lte: r.end } };
    const inToday = { ...base, createdAt: { $gte: r.todayStart, $lte: r.now } };

    const [total, approved, pending, rejected, todayListed, todayApproved, todayRejected] =
      await Promise.all([
        this.propertyModel.countDocuments(inWin),
        this.propertyModel.countDocuments({ ...inWin, approvalStatus: 'Approved' }),
        this.propertyModel.countDocuments({ ...inWin, approvalStatus: 'Pending' }),
        this.propertyModel.countDocuments({ ...inWin, approvalStatus: 'Rejected' }),
        this.propertyModel.countDocuments(inToday),
        this.propertyModel.countDocuments({ ...inToday, approvalStatus: 'Approved' }),
        this.propertyModel.countDocuments({ ...inToday, approvalStatus: 'Rejected' }),
      ]);

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return {
      total,
      approved,
      pending,
      rejected,
      todayListed,
      todayApproved,
      todayRejected,
      breakdown: [
        { status: 'Approved', count: approved, pct: pct(approved) },
        { status: 'Pending', count: pending, pct: pct(pending) },
        { status: 'Rejected', count: rejected, pct: pct(rejected) },
      ],
    };
  }

  private async callGroup(scope: DashboardScope, r: any) {
    const base = this.callScopeMatch(scope);
    const inWin = { ...base, createdAt: { $gte: r.start, $lte: r.end } };
    const inToday = { ...base, createdAt: { $gte: r.todayStart, $lte: r.now } };
    const leadBase = this.leadScopeMatch(scope);

    const [total, today, connected, missed, todayConnected, followTotal, followUpcoming, followToday] =
      await Promise.all([
        this.callLogModel.countDocuments(inWin),
        this.callLogModel.countDocuments(inToday),
        this.callLogModel.countDocuments({ ...inWin, status: { $in: CONNECTED_STATUSES } }),
        this.callLogModel.countDocuments({ ...inWin, status: { $in: MISSED_STATUSES } }),
        this.callLogModel.countDocuments({ ...inToday, status: { $in: CONNECTED_STATUSES } }),
        this.leadModel.countDocuments({ ...leadBase, nextFollowUpAt: { $ne: null } }),
        this.leadModel.countDocuments({ ...leadBase, nextFollowUpAt: { $gte: r.now } }),
        this.leadModel.countDocuments({
          ...leadBase,
          nextFollowUpAt: { $gte: r.todayStart, $lte: endOfToday(r.todayStart) },
        }),
      ]);

    const notConnected = Math.max(0, total - connected - missed);
    const todayNotAnswered = Math.max(0, today - todayConnected);
    return {
      total,
      today,
      connected,
      missed,
      notConnected,
      todayConnected,
      todayNotAnswered,
      connectRate: total > 0 ? Math.round((connected / total) * 100) : 0,
      todayConnectRate: today > 0 ? Math.round((todayConnected / today) * 100) : 0,
      followUpsTotal: followTotal,
      followUpsUpcoming: followUpcoming,
      followUpsToday: followToday,
      outcomeBreakdown: [
        { name: 'Connected', count: connected },
        { name: 'Not Connected', count: notConnected },
        { name: 'Missed', count: missed },
      ],
    };
  }

  private async whatsappGroup(scope: DashboardScope, r: any) {
    const outBase = this.whatsappOutboundScopeMatch(scope);
    const inWin = { ...outBase, createdAt: { $gte: r.start, $lte: r.end } };
    const inToday = { ...outBase, createdAt: { $gte: r.todayStart, $lte: r.now } };

    const [totalReachout, todayReachout] = await Promise.all([
      this.whatsappModel.countDocuments(inWin),
      this.whatsappModel.countDocuments(inToday),
    ]);

    // waIds this scope is conversing with (bounds the inbound/new-message counts).
    let waIds: string[] | null = null;
    if (scope.crmUserIds !== null) {
      const rows = await this.whatsappModel
        .find(outBase)
        .select('waId')
        .limit(2000)
        .lean()
        .exec();
      waIds = [...new Set(rows.map((m: any) => m.waId).filter(Boolean))];
    }

    const inboundMatch: Record<string, any> = { direction: 'inbound', isRead: false };
    if (waIds !== null) inboundMatch.waId = waIds.length ? { $in: waIds } : '__none__';
    const newMessages = await this.whatsappModel.countDocuments(inboundMatch);

    // Avg response time: pair each recent outbound with the latest prior inbound on the same waId.
    const avgResponseMins = await this.computeAvgResponseMins(outBase, r);

    // Recent activity (latest 6 messages for this scope).
    const recentMatch: Record<string, any> = {};
    if (scope.crmUserIds === null) {
      // org: latest across all
    } else if (waIds && waIds.length) {
      recentMatch.waId = { $in: waIds };
    } else {
      recentMatch._id = { $exists: false };
    }
    const recentRows = await this.whatsappModel
      .find(recentMatch)
      .sort({ createdAt: -1 })
      .limit(6)
      .select('waId customerName body direction status isRead createdAt sentBy')
      .lean()
      .exec();
    const recent = recentRows.map((m: any) => ({
      contact: m.customerName || m.waId || 'Unknown',
      preview: (m.body || '').slice(0, 80),
      direction: m.direction,
      status:
        m.direction === 'inbound'
          ? m.isRead
            ? 'Replied'
            : 'New'
          : capitalize(m.status || 'Sent'),
      at: m.createdAt,
    }));

    return {
      totalReachout,
      todayReachout,
      newMessages,
      avgResponseMins,
      recent,
    };
  }

  private async computeAvgResponseMins(outBase: Record<string, any>, r: any): Promise<number> {
    const outbound = await this.whatsappModel
      .find({ ...outBase, createdAt: { $gte: r.start, $lte: r.end } })
      .sort({ createdAt: -1 })
      .limit(300)
      .select('waId createdAt')
      .lean()
      .exec();
    if (!outbound.length) return 0;
    const waIds = [...new Set(outbound.map((m: any) => m.waId).filter(Boolean))];
    if (!waIds.length) return 0;
    const inbound = await this.whatsappModel
      .find({ direction: 'inbound', waId: { $in: waIds } })
      .select('waId createdAt')
      .sort({ createdAt: 1 })
      .limit(3000)
      .lean()
      .exec();
    const inboundByWa = new Map<string, number[]>();
    for (const m of inbound as any[]) {
      const arr = inboundByWa.get(m.waId) || [];
      arr.push(new Date(m.createdAt).getTime());
      inboundByWa.set(m.waId, arr);
    }
    let sum = 0;
    let n = 0;
    for (const o of outbound as any[]) {
      const times = inboundByWa.get(o.waId);
      if (!times || !times.length) continue;
      const outT = new Date(o.createdAt).getTime();
      // latest inbound strictly before this outbound
      let prev = -1;
      for (const t of times) {
        if (t < outT && t > prev) prev = t;
      }
      if (prev > 0) {
        sum += (outT - prev) / 60000;
        n += 1;
      }
    }
    return n > 0 ? Math.round(sum / n) : 0;
  }

  private async monthlyProgress(scope: DashboardScope) {
    const months: { key: string; label: string; start: Date; end: Date }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: start.toLocaleString('en-US', { month: 'short' }),
        start,
        end,
      });
    }
    const overallStart = months[0].start;
    const overallEnd = months[months.length - 1].end;
    const leadBase = this.leadScopeMatch(scope);
    const callBase = this.callScopeMatch(scope);

    const [leadRows, callRows] = await Promise.all([
      this.leadModel.aggregate([
        { $match: { ...leadBase, createdAt: { $gte: overallStart, $lt: overallEnd } } },
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
      ]),
      this.callLogModel.aggregate([
        { $match: { ...callBase, createdAt: { $gte: overallStart, $lt: overallEnd } } },
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    const leadMap = new Map<string, number>();
    for (const row of leadRows) leadMap.set(`${row._id.y}-${row._id.m - 1}`, row.count);
    const callMap = new Map<string, number>();
    for (const row of callRows) callMap.set(`${row._id.y}-${row._id.m - 1}`, row.count);

    return months.map((mo) => ({
      month: mo.label,
      leads: leadMap.get(mo.key) || 0,
      calls: callMap.get(mo.key) || 0,
    }));
  }

  private async coreGroups(scope: DashboardScope, r: any) {
    const [leads, properties, calls, whatsapp, monthly] = await Promise.all([
      this.leadGroup(scope, r),
      this.propertyGroup(scope, r),
      this.callGroup(scope, r),
      this.whatsappGroup(scope, r),
      this.monthlyProgress(scope),
    ]);
    return { leads, properties, calls, whatsapp, monthly };
  }

  // ---------------------------------------------------------------------------
  // Targets
  // ---------------------------------------------------------------------------

  private async targetsForScope(scope: DashboardScope, r: any, actuals: {
    leads: number;
    calls: number;
    listings: number;
  }) {
    const ids =
      scope.platformUserIds === null
        ? null
        : scope.platformUserIds;
    const targetFilter: any = {};
    if (ids !== null) targetFilter.agentId = { $in: ids };
    const rows = await this.agentTargetModel.find(targetFilter).lean().exec();
    const sum = (k: string) => rows.reduce((a, t: any) => a + (Number(t[k]) || 0), 0);
    return {
      leads: { actual: actuals.leads, target: sum('leadsTarget') },
      calls: { actual: actuals.calls, target: sum('callsTarget') },
      listings: { actual: actuals.listings, target: sum('propertiesTarget') },
    };
  }

  // ---------------------------------------------------------------------------
  // ADMIN dashboard
  // ---------------------------------------------------------------------------

  async getAdminDashboard(window: string, teamFilter?: string): Promise<any> {
    return this.appCache.getOrSet(
      `crm:roledash:admin:v1:${window}:${teamFilter || 'all'}`,
      this.appCache.crmReportingTtl(),
      () => this.computeAdminDashboard(window, teamFilter),
    );
  }

  private async computeAdminDashboard(window: string, teamFilter?: string): Promise<any> {
    const r = this.ranges(window);
    const scope = this.orgScope();

    const [groups, prevLeads, teamMetrics, leaderboard, subscriptions] = await Promise.all([
      this.coreGroups(scope, r),
      this.leadModel.countDocuments({ createdAt: { $gte: r.prevStart, $lte: r.prevEnd } }),
      this.getTeamPerformance(window, teamFilter),
      this.getLeaderboard(window, null),
      this.getOrgSubscriptions().catch(() => ({ actual: null, target: null })),
    ]);

    const orgScore =
      teamMetrics.length > 0
        ? Math.round(teamMetrics.reduce((a, t: any) => a + (t.score || 0), 0) / teamMetrics.length)
        : 0;

    const targets = await this.targetsForScope(scope, r, {
      leads: groups.leads.total,
      calls: groups.calls.total,
      listings: groups.properties.total,
    });

    return {
      tier: 'admin',
      window,
      glance: {
        totalLeads: groups.leads.total,
        totalLeadsDeltaPct: pctDelta(groups.leads.total, prevLeads),
        totalCalls: groups.calls.total,
        totalCallsToday: groups.calls.today,
        whatsappReachout: groups.whatsapp.totalReachout,
        whatsappReachoutToday: groups.whatsapp.todayReachout,
        orgScore,
        teamCount: teamMetrics.length,
      },
      ...groups,
      teamPerformance: teamMetrics,
      leaderboard,
      targets: { ...targets, subscriptions },
    };
  }

  // ---------------------------------------------------------------------------
  // TEAM dashboard
  // ---------------------------------------------------------------------------

  async getTeamDashboard(window: string, teamLeadId: string): Promise<any> {
    return this.appCache.getOrSet(
      `crm:roledash:team:v1:${window}:${teamLeadId || 'none'}`,
      this.appCache.crmReportingTtl(),
      () => this.computeTeamDashboard(window, teamLeadId),
    );
  }

  private async computeTeamDashboard(window: string, teamLeadId: string): Promise<any> {
    const r = this.ranges(window);
    const scope = await this.teamScope(teamLeadId);

    const [groups, memberPerf, availability] = await Promise.all([
      this.coreGroups(scope, r),
      this.getMemberPerformance(window, scope),
      this.getTeamAvailability(scope),
    ]);

    const teamScore =
      memberPerf.length > 0
        ? Math.round(memberPerf.reduce((a, m: any) => a + (m.score || 0), 0) / memberPerf.length)
        : 0;

    const targets = await this.targetsForScope(scope, r, {
      leads: groups.leads.total,
      calls: groups.calls.total,
      listings: groups.properties.total,
    });

    return {
      tier: 'team',
      window,
      teamLeadId,
      teamSize: scope.members.length,
      glance: {
        teamTotalLeads: groups.leads.total,
        teamTodayLeads: groups.leads.today,
        teamCallsToday: groups.calls.today,
        teamCallsWindow: groups.calls.total,
        connectedToday: groups.calls.todayConnected,
        connectRate: groups.calls.todayConnectRate,
        notAnsweredToday: groups.calls.todayNotAnswered,
        propertiesListed: groups.properties.total,
        approvedProperties: groups.properties.approved,
        approvedPct:
          groups.properties.total > 0
            ? Math.round((groups.properties.approved / groups.properties.total) * 100)
            : 0,
        taskCompletion: avgMemberTaskCompletion(memberPerf),
        teamScore,
      },
      ...groups,
      memberPerformance: memberPerf,
      availability,
      targets,
    };
  }

  // ---------------------------------------------------------------------------
  // AGENT dashboard
  // ---------------------------------------------------------------------------

  async getAgentDashboard(window: string, agentId: string): Promise<any> {
    return this.appCache.getOrSet(
      `crm:roledash:agent:v1:${window}:${agentId || 'none'}`,
      this.appCache.crmReportingTtl(),
      () => this.computeAgentDashboard(window, agentId),
    );
  }

  private async computeAgentDashboard(window: string, agentId: string): Promise<any> {
    const r = this.ranges(window);
    const scope = await this.agentScope(agentId);

    const [groups, activityLog, myLeads, taskStatus] = await Promise.all([
      this.coreGroups(scope, r),
      this.getActivityLog(scope),
      this.getMyLeads(scope),
      this.getTaskStatus(scope, r),
    ]);

    const targets = await this.targetsForScope(scope, r, {
      leads: groups.leads.total,
      calls: groups.calls.total,
      listings: groups.properties.total,
    });

    return {
      tier: 'agent',
      window,
      agentId,
      agent: scope.members[0] || null,
      glance: {
        totalLeads: groups.leads.total,
        todayLeads: groups.leads.today,
        assignedLeads: groups.leads.assigned,
        propertyListed: groups.properties.total,
        approvedProperties: groups.properties.approved,
        totalCalls: groups.calls.total,
        todayCalls: groups.calls.today,
        connectedCalls: groups.calls.connected,
        connectRate: groups.calls.connectRate,
        notAnswered: groups.calls.notConnected,
        notAnsweredPct:
          groups.calls.total > 0
            ? Math.round((groups.calls.notConnected / groups.calls.total) * 100)
            : 0,
      },
      ...groups,
      activityLog,
      myLeads,
      taskStatus,
      targets: {
        callsToday: { actual: groups.calls.today, target: targets.calls.target },
        leadsToday: { actual: groups.leads.today, target: targets.leads.target },
        listingsMonth: { actual: groups.properties.total, target: targets.listings.target },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Tables / lists
  // ---------------------------------------------------------------------------

  /** Team comparison table — one row per team lead (their direct reports). */
  private async getTeamPerformance(window: string, teamFilter?: string) {
    const r = this.ranges(window);
    const leadFilter: any = { reportsTo: { $ne: null } };
    if (teamFilter && teamFilter !== 'all' && Types.ObjectId.isValid(teamFilter)) {
      leadFilter._id = new Types.ObjectId(teamFilter);
    }
    // Distinct team leads = users who are referenced by someone's reportsTo.
    const leadIds = await this.hrmsUserModel.distinct('reportsTo');
    const validLeadIds = leadIds
      .filter((id: any) => id && Types.ObjectId.isValid(String(id)))
      .map((id: any) => new Types.ObjectId(String(id)))
      .filter((id) => !leadFilter._id || String(id) === String(leadFilter._id));
    if (!validLeadIds.length) return [];
    const leads = await this.hrmsUserModel
      .find({ _id: { $in: validLeadIds } })
      .select('_id firstName lastName email')
      .lean()
      .exec();

    const rows = await Promise.all(
      leads.map(async (tl: any) => {
        const scope = await this.teamScope(String(tl._id));
        const [leadG, propG, callG, memberPerf] = await Promise.all([
          this.leadGroup(scope, r),
          this.propertyGroup(scope, r),
          this.callGroup(scope, r),
          this.getMemberPerformance(window, scope),
        ]);
        const taskCompletion = avgMemberTaskCompletion(memberPerf);
        const score = teamScoreFormula(leadG.total, propG.total, callG.connected, taskCompletion);
        return {
          teamId: String(tl._id),
          team: `${tl.firstName || ''} ${tl.lastName || ''}`.trim() || tl.email || 'Team',
          teamLead: `${tl.firstName || ''} ${tl.lastName || ''}`.trim() || tl.email || '—',
          members: scope.members.length,
          leads: leadG.total,
          calls: callG.total,
          connected: callG.total > 0 ? Math.round((callG.connected / callG.total) * 100) : 0,
          properties: propG.total,
          taskCompletion,
          score,
        };
      }),
    );
    return rows.sort((a, b) => b.score - a.score);
  }

  /** Org / team leaderboard — one row per agent. */
  private async getLeaderboard(window: string, teamLeadId: string | null) {
    const r = this.ranges(window);
    const userFilter: any = { is_archived: { $ne: true } };
    if (teamLeadId && Types.ObjectId.isValid(teamLeadId)) {
      userFilter.reportsTo = new Types.ObjectId(teamLeadId);
    }
    const agents = await this.hrmsUserModel
      .find(userFilter)
      .select('_id firstName lastName email reportsTo')
      .limit(500)
      .lean()
      .exec();
    if (!agents.length) return [];
    const managerIds = [...new Set(agents.map((a: any) => a.reportsTo?.toString()).filter(Boolean))];
    const managers = managerIds.length
      ? await this.hrmsUserModel
          .find({ _id: { $in: managerIds } })
          .select('_id firstName lastName email')
          .lean()
          .exec()
      : [];
    const managerMap = new Map(
      managers.map((m: any) => [
        String(m._id),
        `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email || 'Team',
      ]),
    );

    const rows = await Promise.all(
      agents.map(async (a: any) => {
        const scope = await this.agentScope(String(a._id));
        const [leadG, propG, callG, task] = await Promise.all([
          this.leadGroup(scope, r),
          this.propertyGroup(scope, r),
          this.callGroup(scope, r),
          this.getTaskStatus(scope, r),
        ]);
        const taskCompletion = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
        const score = agentScoreFormula(leadG.total, propG.total, callG.connected, taskCompletion);
        return {
          id: String(a._id),
          name: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || 'Agent',
          team: managerMap.get(String(a.reportsTo)) || '—',
          leads: leadG.total,
          calls: callG.total,
          connected: callG.connected,
          properties: propG.total,
          taskCompletion,
          score,
        };
      }),
    );
    return rows.sort((a, b) => b.score - a.score);
  }

  /** Per-member rows for the Team Lead's member-performance table. */
  private async getMemberPerformance(window: string, teamScope: DashboardScope) {
    const r = this.ranges(window);
    const rows = await Promise.all(
      teamScope.members.map(async (m) => {
        const scope = this.membersToScope('agent', [m]);
        const [leadG, propG, callG, task] = await Promise.all([
          this.leadGroup(scope, r),
          this.propertyGroup(scope, r),
          this.callGroup(scope, r),
          this.getTaskStatus(scope, r),
        ]);
        const taskCompletion = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
        const score = agentScoreFormula(leadG.total, propG.total, callG.connected, taskCompletion);
        return {
          id: m.platformId,
          name: m.name,
          leads: leadG.total,
          assigned: leadG.assigned,
          calls: callG.total,
          connected: callG.total > 0 ? Math.round((callG.connected / callG.total) * 100) : 0,
          properties: propG.total,
          taskStatus: task.open > 0 ? `${task.open} open` : task.overdue > 0 ? `${task.overdue} overdue` : 'All done',
          taskCompletion,
          score,
        };
      }),
    );
    return rows.sort((a, b) => b.score - a.score);
  }

  /** Today's availability (HRMS attendance) for a team's members. */
  private async getTeamAvailability(scope: DashboardScope) {
    const emails = scope.members.map((m) => m.email).filter(Boolean) as string[];
    if (!emails.length) return [];
    const ymd = toYmd(new Date());
    const crmUsers = await this.crmUserModel
      .find({ email: { $in: emails.map((e) => new RegExp(`^${escapeRe(e)}$`, 'i')) } })
      .select('email firstName lastName availabilityStatus availabilityAttendanceStatus availabilityDate')
      .lean()
      .exec();
    const byEmail = new Map(crmUsers.map((c: any) => [String(c.email || '').toLowerCase(), c]));
    return scope.members.map((m) => {
      const c: any = byEmail.get(String(m.email || '').toLowerCase());
      let status = 'Present';
      if (c && c.availabilityDate === ymd) {
        status = c.availabilityAttendanceStatus || (c.availabilityStatus === 'unavailable_today' ? 'On Leave' : 'Present');
      } else if (c && c.availabilityStatus === 'unavailable_today') {
        status = c.availabilityAttendanceStatus || 'Unavailable';
      }
      return { id: m.platformId, name: m.name, status };
    });
  }

  /** Recent activity timeline for the agent view. */
  private async getActivityLog(scope: DashboardScope) {
    const match = this.activityScopeMatch(scope);
    if (match === MATCH_NOTHING) return [];
    const rows = await this.activityModel
      .find({ ...match, type: { $nin: ['System'] } })
      .sort({ createdAt: -1 })
      .limit(12)
      .select('type status content title createdAt relatedTo relatedType')
      .lean()
      .exec();
    return rows.map((a: any) => ({
      type: a.type,
      text: a.content || a.title || `${a.type}${a.status ? ` — ${a.status}` : ''}`,
      at: a.createdAt,
    }));
  }

  /** My Leads & Follow-ups list for the agent view. */
  private async getMyLeads(scope: DashboardScope) {
    const base = this.leadScopeMatch(scope);
    if (base === MATCH_NOTHING) return [];
    const rows = await this.leadModel
      .find(base)
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('firstName lastName status stage nextFollowUpAt updatedAt callStatus')
      .lean()
      .exec();
    return rows.map((l: any) => ({
      name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Lead',
      status: l.stage || l.status || 'New',
      lastContact: l.updatedAt,
      nextFollowUp: l.nextFollowUpAt || null,
    }));
  }

  /** Task-status buckets (Activity type='Task') for the agent view. */
  private async getTaskStatus(scope: DashboardScope, r: any) {
    const match = this.activityScopeMatch(scope);
    if (match === MATCH_NOTHING) {
      return { open: 0, inProgress: 0, completed: 0, overdue: 0, total: 0 };
    }
    const rows = await this.activityModel
      .find({ ...match, type: 'Task' })
      .select('status dueDate metadata createdAt')
      .limit(2000)
      .lean()
      .exec();
    let open = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;
    const now = new Date();
    for (const t of rows as any[]) {
      const s = String(t.status || '').toLowerCase();
      const due = t.dueDate || t.metadata?.dueDate;
      if (s.includes('complete') || s.includes('done')) {
        completed += 1;
      } else if (s.includes('progress')) {
        inProgress += 1;
        if (due && new Date(due) < now) overdue += 1;
      } else {
        open += 1;
        if (due && new Date(due) < now) overdue += 1;
      }
    }
    return { open, inProgress, completed, overdue, total: rows.length };
  }

  // ---------------------------------------------------------------------------
  // Subscriptions (live from 2bigha) — best effort, safe fallback.
  // ---------------------------------------------------------------------------

  private async getOrgSubscriptions(): Promise<{ actual: number | null; target: number | null }> {
    try {
      const plans: any = await this.subscriptionsService.getSubscriptionPlans();
      // No org-wide "subscriptions sold" aggregate is exposed by 2bigha today; we
      // surface the count of active plan catalogue entries so the tile is live, not
      // fabricated. Target has no backing field → null (UI renders "—").
      const active = Array.isArray(plans)
        ? plans.filter((p: any) => p?.isActive !== false).length
        : null;
      return { actual: active, target: null };
    } catch (e) {
      this.logger.warn(`Subscriptions fetch failed: ${e instanceof Error ? e.message : e}`);
      return { actual: null, target: null };
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const MATCH_NOTHING = { _id: { $exists: false } } as const;

function escapeRe(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyStatus(status?: string): 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost' {
  const s = String(status || 'New').trim();
  if (!s || NEW_STATUS_RE.test(s)) return 'New';
  if (LOST_RE.test(s)) return 'Lost';
  if (CONVERTED_RE.test(s)) return 'Converted';
  if (QUALIFIED_RE.test(s)) return 'Qualified';
  if (CONTACTED_RE.test(s)) return 'Contacted';
  return 'Contacted';
}

function pctDelta(current: number, previous: number): number {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function endOfToday(todayStart: Date): Date {
  const d = new Date(todayStart);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function agentScoreFormula(leads: number, properties: number, connected: number, taskCompletion: number): number {
  return leads * 10 + properties * 20 + connected * 5 + taskCompletion * 2;
}

function teamScoreFormula(leads: number, properties: number, connected: number, taskCompletion: number): number {
  // Normalised 0-100 so the team table reads as a percentage-style score.
  const raw = agentScoreFormula(leads, properties, connected, taskCompletion);
  return Math.min(100, Math.round(raw / 100));
}

function avgMemberTaskCompletion(members: Array<{ taskCompletion?: number }>): number {
  if (!members.length) return 0;
  return Math.round(members.reduce((a, m) => a + (m.taskCompletion || 0), 0) / members.length);
}
