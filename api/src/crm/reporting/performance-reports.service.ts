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
import { classifyStatus } from './role-dashboard.service';
import { TwoBighaPropertyService } from '../property-listings/twobigha-property.service';
import { AppCacheService } from '../../redis/app-cache.service';
import {
  crmPortalAccessUserFilter,
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
} from '../shared/crm-admin-access.util';
import { leadVisibilityTier } from '../shared/crm-lead-visibility.util';

/**
 * Reports & Analytics (FRD §14) — Agent Performance + Team & Organization reports.
 *
 * Every number is computed live from CRM collections in one pass, then sliced by the
 * endpoints. Scope follows the CRM data tiers:
 *   - org   → everyone (admins / `leads:read:all` / `workspace-admin:read`)
 *   - team  → the caller + their direct reports (`leads:read:team` / `workspace-team:read`)
 *   - agent → the caller only
 *
 * Identity spaces differ per collection, so each person carries BOTH ids (platform User +
 * CRMUser, joined by email) and every query matches either. Inbound IVR calls carry no
 * user id — they are attributed through the agent's phone number (CRMUser.agentMobile).
 */

export type ReportTier = 'org' | 'team' | 'agent';

export interface ReportScope {
  tier: ReportTier;
  selfId: string | null;
}

export interface ReportFilters {
  agents?: string[];
  teams?: string[];
}

interface Person {
  id: string;
  crmId?: string;
  name: string;
  email?: string;
  reportsTo?: string;
  phones: string[];
}

const CONNECTED = new Set(['Connected', 'Completed']);
const MISSED = new Set(['Missed']);
const CONTACT_ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Event', 'DM'];
const UNASSIGNED = '__unassigned';
const MATCH_NOTHING = { _id: { $exists: false } };

function emptyRow() {
  return {
    leadsCreated: 0,
    leadsConverted: 0,
    leadsQualified: 0,
    leadsLost: 0,
    leadsContacted: 0,
    subscribedLeads: 0,
    calls: 0,
    outgoingCalls: 0,
    incomingCalls: 0,
    connectedCalls: 0,
    missedCalls: 0,
    notConnectedCalls: 0,
    talkTimeSec: 0,
    activities: 0,
    activityBreakdown: {} as Record<string, number>,
    tasksCreated: 0,
    tasksCompleted: 0,
    followUpsDue: 0,
    followUpsDone: 0,
    followUpsOverdue: 0,
    respondedLeads: 0,
    pendingResponseLeads: 0,
    responseMinsTotal: 0,
    whatsappSent: 0,
    whatsappDelivered: 0,
    whatsappRead: 0,
    whatsappFailed: 0,
    whatsappReplyMinsTotal: 0,
    whatsappReplies: 0,
    properties: 0,
    farms: 0,
    pmListings: 0,
    listingsApproved: 0,
    listingsPending: 0,
    listingsRejected: 0,
    subscriptionSales: 0,
    revenue: 0,
  };
}
type Row = ReturnType<typeof emptyRow>;

const SUM_KEYS = Object.keys(emptyRow()).filter(
  (k) => typeof (emptyRow() as any)[k] === 'number',
) as Array<keyof Row>;

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function last10(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function escapeRe(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oid(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

function addRows(into: Row, from: Row) {
  for (const k of SUM_KEYS) (into as any)[k] += (from as any)[k];
  for (const [t, n] of Object.entries(from.activityBreakdown)) {
    into.activityBreakdown[t] = (into.activityBreakdown[t] || 0) + n;
  }
}

/** Derived rates shown in tables/charts — all computed from real counts. */
function withRates(r: Row) {
  return {
    ...r,
    talkTimeSec: Math.round(r.talkTimeSec),
    revenue: Math.round(r.revenue),
    conversionRate: pct(r.leadsConverted, r.leadsCreated),
    contactRate: pct(r.leadsContacted, r.leadsCreated),
    connectRate: pct(r.connectedCalls, r.calls),
    missedRate: pct(r.missedCalls, r.incomingCalls || r.calls),
    avgCallDurationSec: r.connectedCalls > 0 ? Math.round(r.talkTimeSec / r.connectedCalls) : 0,
    taskCompletionRate: pct(r.tasksCompleted, r.tasksCreated),
    followUpAdherence: r.followUpsDue > 0 ? pct(r.followUpsDone, r.followUpsDue) : null,
    avgResponseMins:
      r.respondedLeads > 0 ? Math.round(r.responseMinsTotal / r.respondedLeads) : null,
    whatsappReadRate: pct(r.whatsappRead, r.whatsappSent),
    whatsappDeliveryRate: pct(r.whatsappDelivered, r.whatsappSent),
    whatsappAvgReplyMins:
      r.whatsappReplies > 0 ? Math.round(r.whatsappReplyMinsTotal / r.whatsappReplies) : null,
    listingsTotal: r.properties + r.farms + r.pmListings,
  };
}

@Injectable()
export class PerformanceReportsService {
  private readonly logger = new Logger(PerformanceReportsService.name);
  private readonly dayFormatters = new Map<string, Intl.DateTimeFormat>();

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
    private readonly twoBighaPropertyService: TwoBighaPropertyService,
    private readonly appCache: AppCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Scope
  // ---------------------------------------------------------------------------

  /** Admin → org, Team Lead → own team, everyone else → self (same tiers as the Leads list). */
  resolveScope(req: any): ReportScope {
    const user = req?.user || {};
    const selfId = String(user.userId || user._id || user.id || '') || null;
    const perms = new Set<string>(
      [
        ...(Array.isArray(user.permissions) ? user.permissions : []),
        ...(Array.isArray(user.crmPermissions) ? user.crmPermissions : []),
        ...permissionNames(req?.crmDbUser),
      ].map(String),
    );
    const isAdmin = hasCrmAdminJwtBypass(user) || hasCrmAdminFromDbUser(req?.crmDbUser);
    const tier = leadVisibilityTier(user);
    if (isAdmin || tier === 'all' || perms.has('workspace-admin:read')) {
      return { tier: 'org', selfId };
    }
    if (tier === 'workspace' || perms.has('workspace-team:read')) {
      return { tier: 'team', selfId };
    }
    return { tier: 'agent', selfId };
  }

  /** Scope persisted on a report schedule, re-used when the cron sends it. */
  scopeFromSchedule(filters: any, userId: string): ReportScope {
    const tier = filters?._scopeTier;
    return {
      tier: tier === 'org' || tier === 'team' ? tier : 'agent',
      selfId: String(filters?._scopeSelfId || userId || '') || null,
    };
  }

  parseIdList(raw?: string): string[] {
    return String(raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s))
      .slice(0, 300);
  }

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  async getPerformance(window: string, scope: ReportScope, filters: ReportFilters = {}, fresh = false) {
    const key = [
      'crm:reporting:perf:v1',
      window || 'this_month',
      scope.tier,
      scope.selfId || '-',
      (filters.agents || []).slice().sort().join('.') || '-',
      (filters.teams || []).slice().sort().join('.') || '-',
    ].join(':');
    // Short TTL: the page fires a few requests at once; data stays near real-time.
    // `fresh` (manual refresh / after a target edit) bypasses the cache.
    if (fresh) return this.compute(window || 'this_month', scope, filters);
    return this.appCache.getOrSet(key, 30, () => this.compute(window || 'this_month', scope, filters));
  }

  /** Live 2bigha marketplace inventory (org scope only; not attributable to CRM agents). */
  async getTwoBighaInventory() {
    const withTimeout = <T>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
    const [properties, farms] = await Promise.all([
      withTimeout(this.twoBighaPropertyService.getPropertiesStats().catch(() => null), 15000),
      withTimeout(this.twoBighaPropertyService.getFarmsStats().catch(() => null), 15000),
    ]);
    return {
      connected: !!(properties || farms),
      properties: properties || null,
      farms: farms || null,
    };
  }

  // ---------------------------------------------------------------------------
  // People
  // ---------------------------------------------------------------------------

  private async loadPeople(scope: ReportScope, filters: ReportFilters) {
    const self = scope.selfId ? oid(scope.selfId) : null;
    let userFilter: Record<string, unknown>;
    if (scope.tier === 'org') {
      userFilter = crmPortalAccessUserFilter();
    } else if (scope.tier === 'team') {
      userFilter = self ? { $or: [{ _id: self }, { reportsTo: self }] } : MATCH_NOTHING;
    } else {
      userFilter = self ? { _id: self } : MATCH_NOTHING;
    }
    const users = await this.hrmsUserModel
      .find(userFilter)
      .select('_id firstName lastName email reportsTo')
      .limit(3000)
      .lean()
      .exec();
    let people = await this.enrich(users as any[]);

    // Agent / team filters narrow the people set (only within the caller's scope).
    if (filters.teams?.length) {
      const teams = new Set(filters.teams);
      const teamOf = await this.teamAssigner(scope, people);
      people = people.filter((p) => teams.has(teamOf(p).id));
    }
    if (filters.agents?.length) {
      const wanted = new Set(filters.agents);
      people = people.filter((p) => wanted.has(p.id) || (p.crmId && wanted.has(p.crmId)));
    }
    return people;
  }

  private async enrich(users: any[]): Promise<Person[]> {
    const emails = users.map((u) => String(u.email || '').trim().toLowerCase()).filter(Boolean);
    const crmUsers = emails.length
      ? await this.crmUserModel
          .find({ email: { $in: emails.map((e) => new RegExp(`^${escapeRe(e)}$`, 'i')) } })
          .select('_id email agentMobile')
          .lean()
          .exec()
      : [];
    const crmByEmail = new Map<string, any>();
    for (const c of crmUsers as any[]) crmByEmail.set(String(c.email || '').trim().toLowerCase(), c);
    return users.map((u) => {
      const email = String(u.email || '').trim();
      const crm = crmByEmail.get(email.toLowerCase());
      const phone = last10(crm?.agentMobile);
      return {
        id: String(u._id),
        crmId: crm ? String(crm._id) : undefined,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || email || 'Unknown',
        email: email || undefined,
        reportsTo: u.reportsTo ? String(u.reportsTo) : undefined,
        phones: phone ? [phone] : [],
      };
    });
  }

  /**
   * Team = the person's manager (reportsTo). A manager who reports to nobody leads their
   * own team; in Team Lead scope everyone rolls up to the caller's team.
   */
  private async teamAssigner(scope: ReportScope, people: Person[]) {
    const managerIds = new Set(people.map((p) => p.reportsTo).filter(Boolean) as string[]);
    if (scope.tier === 'team' && scope.selfId) managerIds.add(scope.selfId);
    const known = new Map(people.map((p) => [p.id, p.name]));
    const missing = [...managerIds].filter((id) => !known.has(id)).map(oid).filter(Boolean);
    if (missing.length) {
      const rows = await this.hrmsUserModel
        .find({ _id: { $in: missing } })
        .select('_id firstName lastName email')
        .lean()
        .exec();
      for (const u of rows as any[]) {
        known.set(String(u._id), `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Team');
      }
    }
    const leadsTeam = new Set(managerIds);
    return (p: Person): { id: string; lead: string } => {
      let id: string;
      if (scope.tier === 'team' && scope.selfId) id = scope.selfId;
      else if (p.reportsTo) id = p.reportsTo;
      else if (leadsTeam.has(p.id)) id = p.id;
      else id = UNASSIGNED;
      return { id, lead: id === UNASSIGNED ? 'Unassigned' : known.get(id) || 'Team' };
    };
  }

  // ---------------------------------------------------------------------------
  // Core computation
  // ---------------------------------------------------------------------------

  private dayKey(d: Date | string | undefined, tz: string): string {
    if (!d) return '';
    let f = this.dayFormatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      this.dayFormatters.set(tz, f);
    }
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? '' : f.format(date);
  }

  private async compute(window: string, scope: ReportScope, filters: ReportFilters) {
    const range = this.reportingService.parseDateRange(window, 'previous');
    const tz = this.reportingService.reportingTimezone();
    const start = range.currentStart;
    const end = range.currentEnd;
    const now = new Date();
    const dueUntil = end < now ? end : now;
    const win = { $gte: start, $lte: end };

    const people = await this.loadPeople(scope, filters);
    const personById = new Map(people.map((p) => [p.id, p]));
    const teamOf = await this.teamAssigner(scope, people);
    // Org scope without a people filter counts EVERY record (unattributed ones too).
    const restricted = !(scope.tier === 'org' && !filters.agents?.length && !filters.teams?.length);

    // ---- id maps --------------------------------------------------------
    const byAnyId = new Map<string, string>();
    const byOwnerKey = new Map<string, string>();
    const byPhone = new Map<string, string>();
    for (const p of people) {
      byAnyId.set(p.id, p.id);
      if (p.crmId) byAnyId.set(p.crmId, p.id);
      byOwnerKey.set(p.name.toLowerCase(), p.id);
      if (p.email) byOwnerKey.set(p.email.toLowerCase(), p.id);
      byOwnerKey.set(p.id, p.id);
      if (p.crmId) byOwnerKey.set(p.crmId, p.id);
      for (const ph of p.phones) byPhone.set(ph, p.id);
    }
    const allOids = [...byAnyId.keys()].map(oid).filter(Boolean) as Types.ObjectId[];
    const idOrString = [...allOids, ...allOids.map(String)];
    const phoneVariants = [...byPhone.keys()].flatMap((d) => [d, `0${d}`, `91${d}`, `+91${d}`]);
    const ownerRegexes = [...new Set(people.flatMap((p) => [p.name, p.email].filter(Boolean) as string[]))].map(
      (s) => new RegExp(`^\\s*${escapeRe(s)}\\s*$`, 'i'),
    );

    const actor = (field: string) =>
      restricted ? (allOids.length ? { [field]: { $in: idOrString } } : MATCH_NOTHING) : {};
    const leadScope = (): Record<string, unknown> => {
      if (!restricted) return {};
      const or: any[] = [];
      if (allOids.length) or.push({ createdBy: { $in: allOids } });
      if (ownerRegexes.length) or.push({ leadOwner: { $in: [...ownerRegexes, ...allOids.map(String)] } });
      return or.length ? { $or: or } : MATCH_NOTHING;
    };
    const callScope = (): Record<string, unknown> => {
      if (!restricted) return {};
      const or: any[] = [];
      if (allOids.length) or.push({ initiatedByUserId: { $in: allOids } });
      if (phoneVariants.length) or.push({ initiatedByUserId: null, agentNumber: { $in: phoneVariants } });
      return or.length ? { $or: or } : MATCH_NOTHING;
    };

    const resolveId = (v: unknown) => (v == null ? undefined : byAnyId.get(String(v)));
    const resolveOwner = (owner?: string) =>
      owner ? byOwnerKey.get(String(owner).trim().toLowerCase()) : undefined;
    // Every CRM user's name / email / id: a lead whose leadOwner is someone OUTSIDE this
    // scope belongs to them (it was reassigned), so it must not fall back to its creator.
    const knownOwners = await this.knownOwnerKeys();
    const leadOwnerFor = (l: any): { owner?: string; skip: boolean } => {
      const raw = String(l.leadOwner || '').trim();
      const owner = resolveOwner(raw);
      if (owner) return { owner, skip: false };
      if (raw && knownOwners.has(raw.toLowerCase())) return { owner: undefined, skip: restricted };
      return { owner: resolveId(l.createdBy), skip: false };
    };

    // ---- queries (parallel) --------------------------------------------
    const notDeleted = { isDeleted: { $ne: true } };
    const [
      leads,
      followUpLeads,
      calls,
      activityAgg,
      tasks,
      waOutbound,
      waInboundCount,
      propertyAgg,
      paymentRows,
      targets,
      prev,
    ] = await Promise.all([
      this.leadModel
        .find({ ...notDeleted, createdAt: win, ...leadScope() })
        .select('_id createdBy leadOwner converted status stage source leadIntents currentSubscriptionPlan callStatus createdAt')
        .limit(50000)
        .lean()
        .exec(),
      this.leadModel
        .find({ ...notDeleted, nextFollowUpAt: { $gte: start, $lte: dueUntil }, ...leadScope() })
        .select('_id createdBy leadOwner nextFollowUpAt lastCallAt')
        .limit(20000)
        .lean()
        .exec(),
      this.callLogModel
        .find({ createdAt: win, ...callScope() })
        .select('initiatedByUserId agentNumber direction status duration connectedDuration createdAt')
        .limit(100000)
        .lean()
        .exec(),
      this.activityModel.aggregate([
        { $match: { ...notDeleted, createdAt: win, type: { $nin: ['System'] }, ...actor('author') } },
        {
          $group: {
            _id: {
              author: '$author',
              type: '$type',
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      this.activityModel
        .find({
          ...notDeleted,
          type: 'Task',
          $and: [
            {
              $or: [
                { createdAt: win },
                { 'metadata.dueDate': { $gte: start.toISOString(), $lte: dueUntil.toISOString() } },
                { 'metadata.dueDate': { $gte: start, $lte: dueUntil } },
              ],
            },
            restricted
              ? allOids.length
                ? { $or: [{ assignee: { $in: idOrString } }, { author: { $in: idOrString } }] }
                : MATCH_NOTHING
              : {},
          ],
        })
        .select('author assignee status metadata.dueDate createdAt')
        .limit(30000)
        .lean()
        .exec(),
      this.whatsappModel
        .find({ direction: 'outbound', createdAt: win, ...actor('sentBy') })
        .select('sentBy status waId createdAt')
        .limit(100000)
        .lean()
        .exec(),
      restricted ? Promise.resolve(null) : this.whatsappModel.countDocuments({ direction: 'inbound', createdAt: win }),
      this.propertyModel.aggregate([
        { $match: { ...notDeleted, createdAt: win, ...actor('createdBy') } },
        {
          $group: {
            _id: {
              createdBy: '$createdBy',
              bucket: {
                $ifNull: [
                  '$listingBucket',
                  { $cond: [{ $eq: ['$propertyType', 'Farm'] }, 'farm', 'properties'] },
                ],
              },
              approval: '$approvalStatus',
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      this.activityModel
        .find({
          'metadata.pmEvent': true,
          'metadata.eventType': 'pm_payment_verified',
          'metadata.success': { $ne: false },
          createdAt: win,
          ...actor('author'),
        })
        .select('author metadata.razorpayOrderId metadata.orderId createdAt')
        .limit(10000)
        .lean()
        .exec(),
      this.agentTargetModel
        .find(restricted ? { agentId: { $in: allOids } } : {})
        .lean()
        .exec(),
      this.previousTotals(range.previousStart, range.previousEnd, {
        lead: leadScope(),
        call: callScope(),
        activity: actor('author'),
        whatsapp: actor('sentBy'),
        property: actor('createdBy'),
      }),
    ]);

    // ---- per-person rows ------------------------------------------------
    const rows = new Map<string, Row>();
    const rowFor = (id: string | undefined) => {
      const key = id || UNASSIGNED;
      let r = rows.get(key);
      if (!r) {
        r = emptyRow();
        rows.set(key, r);
      }
      return r;
    };
    for (const p of people) rowFor(p.id);

    // Daily series (whole scope).
    const days = enumerateDays(range.currentFromYmd, range.currentToYmd);
    const daily = new Map(
      days.map((d) => [
        d,
        {
          date: d,
          leadsCreated: 0,
          leadsConverted: 0,
          calls: 0,
          connectedCalls: 0,
          incomingCalls: 0,
          outgoingCalls: 0,
          missedCalls: 0,
          activities: 0,
          whatsappSent: 0,
          whatsappRead: 0,
          listings: 0,
        },
      ]),
    );
    const teamDaily = new Map<string, Map<string, number>>(); // day → team → leads
    const bump = (day: string, key: string, n = 1) => {
      const d = daily.get(day);
      if (d) (d as any)[key] += n;
    };

    // Leads + sources + intents + status funnel
    const sourceMap = new Map<string, { total: number; converted: number }>();
    const intentMap = new Map<string, { total: number; converted: number }>();
    const statusFunnel = { New: 0, Contacted: 0, Qualified: 0, Converted: 0, Lost: 0 };
    const leadOwnerOf = new Map<string, string | undefined>();
    const scopedLeads: any[] = [];
    for (const l of leads as any[]) {
      const { owner, skip } = leadOwnerFor(l);
      if (skip) continue;
      scopedLeads.push(l);
      leadOwnerOf.set(String(l._id), owner);
      const r = rowFor(owner);
      const bucket = classifyStatus(l.stage || l.status);
      const converted = l.converted === true || bucket === 'Converted';
      r.leadsCreated += 1;
      if (converted) r.leadsConverted += 1;
      if (bucket === 'Qualified') r.leadsQualified += 1;
      if (bucket === 'Lost') r.leadsLost += 1;
      if (bucket !== 'New' || (l.callStatus && l.callStatus !== 'Not Called')) r.leadsContacted += 1;
      if (String(l.currentSubscriptionPlan || '').trim()) r.subscribedLeads += 1;
      statusFunnel[converted ? 'Converted' : bucket] += 1;

      const day = this.dayKey(l.createdAt, tz);
      bump(day, 'leadsCreated');
      if (converted) bump(day, 'leadsConverted');
      if (owner) {
        const person = personById.get(owner);
        const team = person ? teamOf(person).lead : 'Unassigned';
        const m = teamDaily.get(day) || new Map<string, number>();
        m.set(team, (m.get(team) || 0) + 1);
        teamDaily.set(day, m);
      }

      const src = String(l.source || '').trim() || 'Unknown';
      const s = sourceMap.get(src) || { total: 0, converted: 0 };
      s.total += 1;
      if (converted) s.converted += 1;
      sourceMap.set(src, s);
      for (const raw of Array.isArray(l.leadIntents) ? l.leadIntents : []) {
        const label = String(raw || '').trim();
        if (!label) continue;
        const it = intentMap.get(label) || { total: 0, converted: 0 };
        it.total += 1;
        if (converted) it.converted += 1;
        intentMap.set(label, it);
      }
    }

    // Follow-ups due in the window: done when the lead was called on/after the due day.
    for (const l of followUpLeads as any[]) {
      const { owner, skip } = leadOwnerFor(l);
      if (skip) continue;
      const r = rowFor(owner);
      r.followUpsDue += 1;
      const due = new Date(l.nextFollowUpAt);
      const dueDayStart = new Date(due.getTime() - 24 * 3600 * 1000);
      if (l.lastCallAt && new Date(l.lastCallAt) >= dueDayStart) r.followUpsDone += 1;
      else if (due < now) r.followUpsOverdue += 1;
    }

    // Calls (IVR + manual logs)
    for (const c of calls as any[]) {
      const owner = resolveId(c.initiatedByUserId) || byPhone.get(last10(c.agentNumber));
      const r = rowFor(owner);
      const day = this.dayKey(c.createdAt, tz);
      r.calls += 1;
      bump(day, 'calls');
      if (c.direction === 'Incoming') {
        r.incomingCalls += 1;
        bump(day, 'incomingCalls');
      } else {
        r.outgoingCalls += 1;
        bump(day, 'outgoingCalls');
      }
      if (CONNECTED.has(c.status)) {
        r.connectedCalls += 1;
        r.talkTimeSec += Number(c.connectedDuration) || Number(c.duration) || 0;
        bump(day, 'connectedCalls');
      } else if (MISSED.has(c.status)) {
        r.missedCalls += 1;
        bump(day, 'missedCalls');
      } else {
        r.notConnectedCalls += 1;
      }
    }

    // Activities (non-system)
    for (const a of activityAgg as any[]) {
      const r = rowFor(resolveId(a._id.author));
      const type = String(a._id.type || 'Other');
      r.activities += a.count;
      r.activityBreakdown[type] = (r.activityBreakdown[type] || 0) + a.count;
      bump(a._id.day, 'activities', a.count);
    }

    // Tasks: completion (created in window) + due-date adherence
    for (const t of tasks as any[]) {
      const r = rowFor(resolveId(t.assignee) || resolveId(t.author));
      const done = /complete|done/i.test(String(t.status || ''));
      const created = t.createdAt ? new Date(t.createdAt) : null;
      if (created && created >= start && created <= end) {
        r.tasksCreated += 1;
        if (done) r.tasksCompleted += 1;
      }
      const dueRaw = t.metadata?.dueDate;
      const due = dueRaw ? new Date(dueRaw) : null;
      if (due && !Number.isNaN(due.getTime()) && due >= start && due <= dueUntil) {
        r.followUpsDue += 1;
        if (done) r.followUpsDone += 1;
        else if (due < now) r.followUpsOverdue += 1;
      }
    }

    // WhatsApp outbound
    const waIds = new Set<string>();
    for (const m of waOutbound as any[]) {
      const r = rowFor(resolveId(m.sentBy));
      const status = String(m.status || '').toLowerCase();
      r.whatsappSent += 1;
      if (status === 'delivered' || status === 'read') r.whatsappDelivered += 1;
      if (status === 'read') r.whatsappRead += 1;
      if (status === 'failed') r.whatsappFailed += 1;
      const day = this.dayKey(m.createdAt, tz);
      bump(day, 'whatsappSent');
      if (status === 'read') bump(day, 'whatsappRead');
      if (m.waId) waIds.add(m.waId);
    }
    const wa = await this.whatsappReplyStats(waOutbound as any[], start, end, resolveId, rowFor, restricted, waIds);

    // Properties / farms / PM listings
    for (const p of propertyAgg as any[]) {
      const r = rowFor(resolveId(p._id.createdBy));
      const bucket = String(p._id.bucket || 'properties');
      if (bucket === 'farm') r.farms += p.count;
      else if (bucket === 'pm') r.pmListings += p.count;
      else r.properties += p.count;
      if (p._id.approval === 'Approved') r.listingsApproved += p.count;
      else if (p._id.approval === 'Rejected') r.listingsRejected += p.count;
      else r.listingsPending += p.count;
      bump(p._id.day, 'listings', p.count);
    }

    // Lead first-response time (lead created → first call / contact activity / WhatsApp)
    await this.applyResponseTimes(scopedLeads, leadOwnerOf, rowFor);

    // Revenue: verified 2bigha PM payments made through the CRM checkout
    await this.applyRevenue(paymentRows as any[], resolveId, rowFor);

    // ---- assemble -------------------------------------------------------
    const targetById = new Map((targets as any[]).map((t) => [String(t.agentId), t]));
    const agents = people.map((p) => {
      const r = rows.get(p.id) || emptyRow();
      const t = targetById.get(p.id);
      const team = teamOf(p);
      return {
        agentId: p.id,
        crmUserId: p.crmId || null,
        name: p.name,
        email: p.email || null,
        teamId: team.id,
        teamName: team.lead,
        ...withRates(r),
        target: t
          ? {
              leadsTarget: t.leadsTarget || 0,
              callsTarget: t.callsTarget || 0,
              propertiesTarget: t.propertiesTarget || 0,
            }
          : null,
      };
    });
    agents.sort(
      (a, b) =>
        b.leadsConverted - a.leadsConverted ||
        b.leadsCreated - a.leadsCreated ||
        b.calls - a.calls ||
        a.name.localeCompare(b.name),
    );

    // Teams
    const teamRows = new Map<string, { teamId: string; teamName: string; members: string[]; row: Row; targets: { leads: number; calls: number; listings: number } }>();
    for (const p of people) {
      const team = teamOf(p);
      let tr = teamRows.get(team.id);
      if (!tr) {
        tr = { teamId: team.id, teamName: team.lead, members: [], row: emptyRow(), targets: { leads: 0, calls: 0, listings: 0 } };
        teamRows.set(team.id, tr);
      }
      tr.members.push(p.id);
      addRows(tr.row, rows.get(p.id) || emptyRow());
      const t = targetById.get(p.id);
      if (t) {
        tr.targets.leads += t.leadsTarget || 0;
        tr.targets.calls += t.callsTarget || 0;
        tr.targets.listings += t.propertiesTarget || 0;
      }
    }
    const teams = [...teamRows.values()]
      .map((t) => {
        const r = withRates(t.row);
        return {
          teamId: t.teamId,
          teamName: t.teamName,
          teamLead: t.teamId === UNASSIGNED ? '—' : t.teamName,
          teamSize: t.members.length,
          memberIds: t.members,
          ...r,
          // Legacy field names used by the Team & Organizations UI
          totalCalls: r.calls,
          totalLeads: r.leadsCreated,
          totalActivities: r.activities,
          totalProperties: r.listingsTotal,
          messagesOutbound: r.whatsappSent,
          messagesDelivered: r.whatsappDelivered,
          messagesRead: r.whatsappRead,
          messagesFailed: r.whatsappFailed,
          completedCalls: r.connectedCalls,
          avgCallDuration: r.avgCallDurationSec,
          connectedRate: r.connectRate,
          targets: t.targets,
        };
      })
      .sort((a, b) => b.leadsCreated + b.calls - (a.leadsCreated + a.calls) || a.teamName.localeCompare(b.teamName));

    // Totals = every row (incl. unattributed records in full-org scope)
    const totalRow = emptyRow();
    for (const [id, r] of rows) {
      if (!restricted || id !== UNASSIGNED) addRows(totalRow, r);
    }
    const totals = withRates(totalRow);
    const unattributed = !restricted && rows.has(UNASSIGNED) ? withRates(rows.get(UNASSIGNED)!) : null;
    const targetTotals = {
      leads: { actual: totals.leadsCreated, target: sumTarget(targets as any[], 'leadsTarget') },
      calls: { actual: totals.calls, target: sumTarget(targets as any[], 'callsTarget') },
      listings: { actual: totals.listingsTotal, target: sumTarget(targets as any[], 'propertiesTarget') },
    };

    const teamNames = [...new Set(teams.map((t) => t.teamName))];
    const teamTrend = days.map((d) => {
      const entry: Record<string, string | number> = { date: d };
      const m = teamDaily.get(d);
      for (const name of teamNames) entry[name] = m?.get(name) || 0;
      return entry;
    });

    return {
      window,
      windowLabel: this.windowLabel(window, range.currentFromYmd, range.currentToYmd),
      range: { from: range.currentFromYmd, to: range.currentToYmd, compareLabel: range.compareLabel },
      generatedAt: now.toISOString(),
      scope: { tier: scope.tier, selfId: scope.selfId, filtered: !!(filters.agents?.length || filters.teams?.length) },
      totals,
      previousTotals: prev,
      unattributed,
      targets: targetTotals,
      agents,
      teams,
      trend: [...daily.values()],
      teamTrend: { teams: teamNames, data: teamTrend },
      statusFunnel: Object.entries(statusFunnel).map(([status, count]) => ({ status, count })),
      sources: [...sourceMap.entries()]
        .map(([source, v]) => ({ source, totalLeads: v.total, converted: v.converted, conversionRate: pct(v.converted, v.total) }))
        .sort((a, b) => b.totalLeads - a.totalLeads),
      intents: [...intentMap.entries()]
        .map(([intentLabel, v]) => ({ intentLabel, totalWithIntent: v.total, converted: v.converted, conversionRate: pct(v.converted, v.total) }))
        .sort((a, b) => b.totalWithIntent - a.totalWithIntent),
      engagement: {
        whatsapp: {
          sent: totals.whatsappSent,
          delivered: totals.whatsappDelivered,
          read: totals.whatsappRead,
          failed: totals.whatsappFailed,
          pending: Math.max(0, totals.whatsappSent - totals.whatsappDelivered - totals.whatsappFailed),
          inbound: waInboundCount ?? wa.inbound,
          uniqueContacts: waIds.size,
          readRate: totals.whatsappReadRate,
          deliveryRate: totals.whatsappDeliveryRate,
          avgReplyMins: totals.whatsappAvgReplyMins,
        },
        ivr: {
          total: totals.calls,
          incoming: totals.incomingCalls,
          outgoing: totals.outgoingCalls,
          connected: totals.connectedCalls,
          missed: totals.missedCalls,
          notConnected: totals.notConnectedCalls,
          connectRate: totals.connectRate,
          missedRate: totals.missedRate,
          talkTimeSec: totals.talkTimeSec,
          avgCallDurationSec: totals.avgCallDurationSec,
        },
      },
    };
  }

  /** Lower-cased names, emails and ids of every platform + CRM user (lead-owner matching). */
  private async knownOwnerKeys(): Promise<Set<string>> {
    // Cached as an array: the cache may be Redis (JSON), which cannot hold a Set.
    const list = await this.appCache.getOrSet<string[]>('crm:reporting:perf:owner-keys:v1', 120, async () => {
      const [users, crmUsers] = await Promise.all([
        this.hrmsUserModel.find({}).select('_id firstName lastName email').limit(10000).lean().exec(),
        this.crmUserModel.find({}).select('_id firstName lastName email').limit(10000).lean().exec(),
      ]);
      const keys = new Set<string>();
      for (const u of [...users, ...crmUsers] as any[]) {
        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
        if (name) keys.add(name);
        if (u.email) keys.add(String(u.email).trim().toLowerCase());
        keys.add(String(u._id));
      }
      return [...keys];
    });
    return new Set(Array.isArray(list) ? list : []);
  }

  private windowLabel(window: string, from: string, to: string): string {
    const labels: Record<string, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      this_week: 'This week',
      this_month: 'This month',
      last_30_days: 'Last 30 days',
    };
    return labels[window] || (from === to ? from : `${from} → ${to}`);
  }

  private async previousTotals(
    start: Date,
    end: Date,
    m: { lead: any; call: any; activity: any; whatsapp: any; property: any },
  ) {
    const win = { $gte: start, $lte: end };
    const nd = { isDeleted: { $ne: true } };
    const [leadsCreated, leadsConverted, calls, connectedCalls, activities, whatsappSent, listings] =
      await Promise.all([
        this.leadModel.countDocuments({ ...nd, createdAt: win, ...m.lead }),
        this.leadModel.countDocuments({ ...nd, createdAt: win, converted: true, ...m.lead }),
        this.callLogModel.countDocuments({ createdAt: win, ...m.call }),
        this.callLogModel.countDocuments({ createdAt: win, status: { $in: [...CONNECTED] }, ...m.call }),
        this.activityModel.countDocuments({ ...nd, createdAt: win, type: { $nin: ['System'] }, ...m.activity }),
        this.whatsappModel.countDocuments({ direction: 'outbound', createdAt: win, ...m.whatsapp }),
        this.propertyModel.countDocuments({ ...nd, createdAt: win, ...m.property }),
      ]);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      leadsCreated,
      leadsConverted,
      calls,
      connectedCalls,
      activities,
      whatsappSent,
      listings,
    };
  }

  /** Pair each outbound message with the latest earlier inbound on the same chat (reply time). */
  private async whatsappReplyStats(
    outbound: any[],
    start: Date,
    end: Date,
    resolveId: (v: unknown) => string | undefined,
    rowFor: (id: string | undefined) => Row,
    restricted: boolean,
    waIds: Set<string>,
  ) {
    if (!waIds.size) return { inbound: 0 };
    const lookback = new Date(start.getTime() - 7 * 24 * 3600 * 1000);
    const ids = [...waIds].slice(0, 5000);
    const inbound = await this.whatsappModel
      .find({ direction: 'inbound', waId: { $in: ids }, createdAt: { $gte: lookback, $lte: end } })
      .select('waId createdAt')
      .sort({ createdAt: 1 })
      .limit(50000)
      .lean()
      .exec();
    const times = new Map<string, number[]>();
    let inboundInWindow = 0;
    for (const m of inbound as any[]) {
      const t = new Date(m.createdAt).getTime();
      const arr = times.get(m.waId) || [];
      arr.push(t);
      times.set(m.waId, arr);
      if (t >= start.getTime()) inboundInWindow += 1;
    }
    // Only the first outbound after an inbound counts as the reply.
    const answered = new Set<string>();
    const sorted = [...outbound].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (const o of sorted) {
      const arr = times.get(o.waId);
      if (!arr?.length) continue;
      const outT = new Date(o.createdAt).getTime();
      let prev = -1;
      for (const t of arr) {
        if (t < outT) prev = t;
        else break;
      }
      if (prev < 0) continue;
      const k = `${o.waId}:${prev}`;
      if (answered.has(k)) continue;
      answered.add(k);
      const r = rowFor(resolveId(o.sentBy));
      r.whatsappReplies += 1;
      r.whatsappReplyMinsTotal += (outT - prev) / 60000;
    }
    return { inbound: inboundInWindow };
  }

  private async applyResponseTimes(
    leads: any[],
    ownerOf: Map<string, string | undefined>,
    rowFor: (id: string | undefined) => Row,
  ) {
    if (!leads.length) return;
    const capped = leads.slice(0, 15000);
    const ids = capped.map((l) => l._id);
    const [callFirst, actFirst, waFirst] = await Promise.all([
      this.callLogModel.aggregate([
        { $match: { relatedTo: { $in: ids } } },
        { $group: { _id: '$relatedTo', first: { $min: '$createdAt' } } },
      ]),
      this.activityModel.aggregate([
        {
          $match: {
            relatedTo: { $in: ids },
            type: { $in: CONTACT_ACTIVITY_TYPES },
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: '$relatedTo', first: { $min: '$createdAt' } } },
      ]),
      this.whatsappModel.aggregate([
        { $match: { entityId: { $in: ids }, direction: 'outbound' } },
        { $group: { _id: '$entityId', first: { $min: '$createdAt' } } },
      ]),
    ]);
    const first = new Map<string, number>();
    for (const rowsList of [callFirst, actFirst, waFirst]) {
      for (const r of rowsList as any[]) {
        const k = String(r._id);
        const t = new Date(r.first).getTime();
        if (!first.has(k) || t < first.get(k)!) first.set(k, t);
      }
    }
    for (const l of capped) {
      const k = String(l._id);
      const r = rowFor(ownerOf.get(k));
      const touched = first.get(k);
      if (touched == null) {
        r.pendingResponseLeads += 1;
        continue;
      }
      const mins = Math.max(0, (touched - new Date(l.createdAt).getTime()) / 60000);
      r.respondedLeads += 1;
      r.responseMinsTotal += mins;
    }
  }

  private async applyRevenue(
    payments: any[],
    resolveId: (v: unknown) => string | undefined,
    rowFor: (id: string | undefined) => Row,
  ) {
    if (!payments.length) return;
    const orderIds = [
      ...new Set(
        payments
          .flatMap((p) => [p.metadata?.razorpayOrderId, p.metadata?.orderId])
          .filter(Boolean)
          .map(String),
      ),
    ];
    const orders = orderIds.length
      ? await this.activityModel
          .find({
            'metadata.pmEvent': true,
            'metadata.eventType': { $in: ['pm_payment_order_created', 'pm_upgrade_order_created'] },
            $or: [
              { 'metadata.razorpayOrderId': { $in: orderIds } },
              { 'metadata.orderId': { $in: orderIds } },
            ],
          })
          .select('metadata.razorpayOrderId metadata.orderId metadata.amount')
          .lean()
          .exec()
      : [];
    const amountByOrder = new Map<string, number>();
    for (const o of orders as any[]) {
      const amt = Number(o.metadata?.amount) || 0;
      for (const k of [o.metadata?.razorpayOrderId, o.metadata?.orderId]) {
        if (k) amountByOrder.set(String(k), amt);
      }
    }
    const seen = new Set<string>();
    for (const p of payments) {
      const orderKey = String(p.metadata?.razorpayOrderId || p.metadata?.orderId || p._id);
      if (seen.has(orderKey)) continue;
      seen.add(orderKey);
      const r = rowFor(resolveId(p.author));
      r.subscriptionSales += 1;
      // Razorpay amounts are in paise.
      r.revenue += (amountByOrder.get(orderKey) || 0) / 100;
    }
  }
}

function permissionNames(dbUser: any): string[] {
  const role = dbUser?.roleId;
  const rolePerms =
    role && typeof role === 'object' && Array.isArray(role.permissions)
      ? role.permissions.map((p: any) => (typeof p === 'string' ? p : p?.name || p?.key))
      : [];
  const direct = Array.isArray(dbUser?.permissions) ? dbUser.permissions : [];
  return [...rolePerms, ...direct].filter(Boolean);
}

function sumTarget(rows: any[], key: string): number {
  return rows.reduce((a, t) => a + (Number(t?.[key]) || 0), 0);
}

function enumerateDays(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = toYmd.split('-').map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const stop = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= stop && out.length < 400) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
