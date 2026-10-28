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
import {
  TwoBighaDashboardSourceService,
  TwoBighaListingIndex,
  TwoBighaSubscriberRow,
} from './twobigha-dashboard-source.service';
import { crmPortalAccessUserFilter } from '../shared/crm-admin-access.util';
import { Client, ClientDocument } from '../schemas/client.schema';

/**
 * Role-based dashboards (Admin / Team Lead / Agent) — "CRM Role Dashboard Wireframe".
 *
 * Every number is live. Each data source is aggregated ONCE per window and every
 * record is attributed to exactly one person, so Org = Σ everyone (+ unattributed),
 * Team = Σ members, Agent = the person — the three dashboards always reconcile.
 *
 * Attribution (records are stamped in different id spaces):
 *   Lead         → leadOwner (name / email / id string); unowned → createdBy
 *   CallLog      → initiatedByUserId; Kommuno webhook rows → agentNumber ↔ CRMUser.agentMobile,
 *                  then agentName
 *   WhatsApp     → sentBy (platform User id; CRMUser id on older rows)
 *   Task         → assignee; unassigned → author
 *   Listing      → CRM copy's createdBy; else 2bigha createdByAdminId ↔ CRMUser.twobighaAdminId
 *   Subscription → 2bigha soldByAdminId ↔ twobighaAdminId, or soldByAdminEmail
 * Platform User ↔ CRMUser are joined by email; both ids resolve to the same person.
 */

export type DashboardTier = 'admin' | 'team' | 'agent';

const NONE = '__none__';
const SNAPSHOT_TTL_MS = 30_000;

const NEW_STATUS_RE = /^(new|open|lead|uncontacted|fresh|not contacted)$/i;
const LOST_RE = /lost|disqualified|junk|rejected|dead|unqualified|not interested|spam|invalid/i;
const CONVERTED_RE = /convert|won|customer|client|closed|deal done|subscribed|sold/i;
const QUALIFIED_RE = /qualified|proposal|negotiation|hot|warm|interested|demo|meeting|site visit|visit/i;

type LeadBucket = 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost';

interface Person {
  id: string; // platform User id when present, else CRMUser id
  crmId?: string;
  crmAccess: boolean;
  name: string;
  email?: string;
  mobile10?: string;
  twobighaAdminId?: string;
  reportsTo?: string | null;
  /** Every display name the person is known by (platform User + CRMUser) — leadOwner may hold either. */
  aliases: string[];
  availability?: { status?: string; attendance?: string; date?: string };
}

interface Directory {
  people: Person[];
  byId: Map<string, Person>;
  byEmail: Map<string, Person>;
  byName: Map<string, Person>;
  byMobile: Map<string, Person>;
  byTb: Map<string, Person>;
}

/** Lead → owning person key, by lead id / phone (last 10) / email / client id. */
interface LeadIndex {
  byId: Map<string, string>;
  byPhone: Map<string, string>;
  byEmail: Map<string, string>;
  byClient: Map<string, string>;
}

interface Win {
  start: Date;
  end: Date;
}

interface Windows {
  key: string;
  period: Win;
  prev: Win;
  today: Win;
  week: Win;
  month: Win;
  now: Date;
  /** Trend buckets for the selected window (days, weeks or months — see `granularity`). */
  months: Array<Win & { label: string }>;
  granularity: 'day' | 'week' | 'month';
}

interface Acc {
  leads: {
    total: number;
    period: number;
    prev: number;
    today: number;
    week: number;
    month: number;
    assignedByOthers: number;
    owned: number;
    buckets: Record<LeadBucket, number>;
    followTotal: number;
    followToday: number;
    followUpcoming: number;
    followOverdue: number;
  };
  calls: {
    total: number;
    period: number;
    prev: number;
    today: number;
    week: number;
    month: number;
    connected: number;
    missed: number;
    todayConnected: number;
    incoming: number;
    outgoing: number;
    talkSecs: number;
  };
  wa: {
    total: number;
    period: number;
    today: number;
    week: number;
    month: number;
    failed: number;
    delivered: number;
    contacts: number;
    newMessages: number;
    respSumMins: number;
    respN: number;
  };
  props: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    farms: number;
    properties: number;
    period: number;
    periodApproved: number;
    periodRejected: number;
    today: number;
    todayApproved: number;
    todayRejected: number;
    week: number;
    month: number;
  };
  subs: {
    total: number;
    active: number;
    paid: number;
    period: number;
    periodPaid: number;
    today: number;
    week: number;
    month: number;
    pmTotal: number;
    pmPeriod: number;
    pmToday: number;
    pmMonth: number;
    pmRevenuePeriod: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    completed: number;
    overdue: number;
    periodCompleted: number;
  };
  monthly: { leads: number[]; calls: number[]; listings: number[] };
}

interface Snapshot {
  windows: Windows;
  dir: Directory;
  acc: Map<string, Acc>;
  /** waId → person key that owns the conversation (latest outbound sender). */
  convOwner: Map<string, string>;
  orgUniqueContacts: number;
  sources: { twobighaListings: boolean; twobighaSubscriptions: boolean };
  planCounts: Array<{ plan: string; count: number }>;
  computedAt: string;
}

@Injectable()
export class RoleDashboardService {
  private readonly logger = new Logger(RoleDashboardService.name);
  private snapshots = new Map<string, { at: number; ttl: number; promise: Promise<Snapshot> }>();
  private directoryCache?: { at: number; promise: Promise<Directory> };

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
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private crmUserModel: Model<CRMUserDocument>,
    @InjectModel(User.name)
    private hrmsUserModel: Model<UserDocument>,
    private readonly reportingService: ReportingService,
    private readonly twoBigha: TwoBighaDashboardSourceService,
  ) {}

  // ---------------------------------------------------------------------------
  // Tier resolution (permission-key based)
  // ---------------------------------------------------------------------------

  /**
   * Which dashboard the caller lands on. Specific tier keys win over the master
   * `dashboard:read` so Agents are never treated as Admin. With no key, infer from
   * hierarchy: team if the user has direct reports, else agent.
   */
  async resolveTier(
    dbUser: any,
    jwtUser: any,
    isAdmin: boolean,
  ): Promise<{ tier: DashboardTier; teamLeadId: string | null; canSeeAll: boolean }> {
    const perms = this.mergePermissions(dbUser, jwtUser);
    const has = (k: string) => perms.includes(k);

    if (isAdmin || has('workspace-admin:read')) {
      return { tier: 'admin', teamLeadId: null, canSeeAll: true };
    }
    if (has('workspace-team:read')) {
      return { tier: 'team', teamLeadId: this.selfId(jwtUser, dbUser), canSeeAll: false };
    }
    if (has('workspace-agent:read')) {
      return { tier: 'agent', teamLeadId: null, canSeeAll: false };
    }
    if (has('dashboard:read')) {
      return { tier: 'admin', teamLeadId: null, canSeeAll: true };
    }
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
      typeof role === 'object' && Array.isArray(role?.permissions)
        ? role.permissions.map((p: any) => (typeof p === 'string' ? p : p?.name || p?.key))
        : [];
    return [
      ...new Set<string>(
        [
          ...rolePerms,
          ...(Array.isArray(dbUser?.permissions) ? dbUser.permissions : []),
          ...(Array.isArray(jwtUser?.permissions) ? jwtUser.permissions : []),
          ...(Array.isArray(jwtUser?.crmPermissions) ? jwtUser.crmPermissions : []),
        ].filter(Boolean),
      ),
    ];
  }

  private async hasDirectReports(userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) return false;
    const n = await this.hrmsUserModel
      .countDocuments({ reportsTo: new Types.ObjectId(userId) })
      .exec();
    return n > 0;
  }

  /** True when `memberId` reports to `leadId` (gates a Team Lead's member drill-down). */
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
  // Pickers
  // ---------------------------------------------------------------------------

  /** Team leads (anyone with direct reports) for the Admin's team picker. */
  async listTeams(): Promise<Array<{ id: string; name: string; members: number }>> {
    const dir = await this.loadDirectory();
    const counts = new Map<string, number>();
    for (const p of dir.people) {
      if (p.reportsTo) counts.set(p.reportsTo, (counts.get(p.reportsTo) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ id, name: dir.byId.get(id)?.name || 'Unknown', members: n + 1 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** People a caller may open on the Agent dashboard: CRM users (admin) or own team. */
  async listPeople(
    teamLeadId: string | null,
  ): Promise<Array<{ id: string; name: string; email?: string; team?: string }>> {
    const dir = await this.loadDirectory();
    const list = teamLeadId
      ? this.teamMembers(dir, teamLeadId)
      : dir.people.filter((p) => p.crmAccess || p.crmId);
    return list
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        team: p.reportsTo ? dir.byId.get(p.reportsTo)?.name : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------------------
  // ADMIN
  // ---------------------------------------------------------------------------

  async getAdminDashboard(window: string, teamFilter?: string): Promise<any> {
    const snap = await this.getSnapshot(window);
    const { dir } = snap;
    let keys: string[] | null = null;
    if (teamFilter && teamFilter !== 'all' && dir.byId.has(teamFilter)) {
      keys = this.teamMembers(dir, teamFilter).map((p) => p.id);
    }
    const acc = this.sumAcc(snap, keys);
    const teams = this.teamRows(snap);
    const leaderboard = this.personRows(snap, dir.people, true).slice(0, 50);
    const [targets, recent] = await Promise.all([
      this.targets(snap, keys),
      this.recentWhatsApp(snap, keys),
    ]);
    const allTargets = keys === null ? targets : await this.targets(snap, null);
    this.applyTargetPct(snap, leaderboard, allTargets.perPerson);
    for (const t of teams) {
      const pcts = this.teamMembers(dir, t.teamId)
        .map((m) => allTargets.perPerson.get(m.id))
        .filter((x): x is number => x !== undefined);
      t.targetPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    }
    const teamScores = teams.map((t) => t.targetPct).filter((x): x is number => x !== null);
    const groups = this.groups(snap, acc, keys);

    return {
      tier: 'admin',
      window: snap.windows.key,
      range: this.rangeMeta(snap.windows),
      computedAt: snap.computedAt,
      sources: snap.sources,
      glance: {
        newLeads: acc.leads.period,
        newLeadsDeltaPct: pctDelta(acc.leads.period, acc.leads.prev),
        totalLeads: acc.leads.total,
        callsPeriod: acc.calls.period,
        callsDeltaPct: pctDelta(acc.calls.period, acc.calls.prev),
        callsToday: acc.calls.today,
        whatsappReachout: acc.wa.period,
        whatsappReachoutToday: acc.wa.today,
        listingsPeriod: acc.props.period,
        listingsTotal: acc.props.total,
        subscriptionsPeriod: acc.subs.period + acc.subs.pmPeriod,
        subscriptionsTotal: acc.subs.total + acc.subs.pmTotal,
        orgScore: teamScores.length
          ? Math.round(teamScores.reduce((a, b) => a + b, 0) / teamScores.length)
          : null,
        teamCount: teams.length,
        activeMembers: dir.people.filter((p) => p.crmAccess || p.crmId).length,
      },
      ...groups,
      whatsapp: { ...groups.whatsapp, recent },
      subscriptions: { ...groups.subscriptions, byPlan: snap.planCounts },
      teamPerformance: teams,
      leaderboard,
      targets: { monthly: targets.monthly, weekly: targets.weekly, subscriptions: targets.subscriptions },
    };
  }

  // ---------------------------------------------------------------------------
  // TEAM
  // ---------------------------------------------------------------------------

  async getTeamDashboard(window: string, teamLeadId: string): Promise<any> {
    const snap = await this.getSnapshot(window);
    const { dir } = snap;
    const members = this.teamMembers(dir, teamLeadId);
    const keys = members.map((p) => p.id);
    const acc = this.sumAcc(snap, keys);
    const memberRows = this.personRows(snap, members, false);
    const [targets, recent] = await Promise.all([
      this.targets(snap, keys),
      this.recentWhatsApp(snap, keys),
    ]);
    this.applyTargetPct(snap, memberRows, targets.perPerson);
    const scored = memberRows.map((m) => m.targetPct).filter((x): x is number => x !== null);
    const taskTotal = acc.tasks.open + acc.tasks.inProgress + acc.tasks.completed;
    const groups = this.groups(snap, acc, keys);

    return {
      tier: 'team',
      window: snap.windows.key,
      range: this.rangeMeta(snap.windows),
      computedAt: snap.computedAt,
      sources: snap.sources,
      teamLeadId,
      teamLead: dir.byId.get(teamLeadId)?.name || null,
      teamSize: members.length,
      glance: {
        newLeads: acc.leads.period,
        newLeadsDeltaPct: pctDelta(acc.leads.period, acc.leads.prev),
        todayLeads: acc.leads.today,
        totalLeads: acc.leads.total,
        callsPeriod: acc.calls.period,
        callsToday: acc.calls.today,
        connectedToday: acc.calls.todayConnected,
        todayConnectRate: pct(acc.calls.todayConnected, acc.calls.today),
        notConnectedToday: Math.max(0, acc.calls.today - acc.calls.todayConnected),
        listingsPeriod: acc.props.period,
        approvedPeriod: acc.props.periodApproved,
        listingsTotal: acc.props.total,
        approvedTotal: acc.props.approved,
        approvedPct: pct(acc.props.approved, acc.props.total),
        whatsappReachout: acc.wa.period,
        subscriptionsPeriod: acc.subs.period + acc.subs.pmPeriod,
        taskCompletion: pct(acc.tasks.completed, taskTotal),
        teamScore: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
      },
      ...groups,
      whatsapp: { ...groups.whatsapp, recent },
      // The team lead's own work (as an individual contributor), next to the team totals.
      self: this.personSummary(snap, dir.byId.get(teamLeadId) || null),
      memberPerformance: memberRows,
      availability: this.availability(snap, members),
      targets: { monthly: targets.monthly, weekly: targets.weekly, subscriptions: targets.subscriptions },
    };
  }

  // ---------------------------------------------------------------------------
  // AGENT
  // ---------------------------------------------------------------------------

  async getAgentDashboard(window: string, agentId: string): Promise<any> {
    const snap = await this.getSnapshot(window);
    const { dir } = snap;
    const person = dir.byId.get(agentId);
    const keys = person ? [person.id] : [];
    const acc = this.sumAcc(snap, keys);
    const [activityLog, myLeads, targets, recent] = await Promise.all([
      person ? this.activityLog(person) : Promise.resolve([]),
      person ? this.myLeads(person, snap.windows) : Promise.resolve([]),
      this.targets(snap, keys),
      this.recentWhatsApp(snap, keys),
    ]);
    const taskTotal = acc.tasks.open + acc.tasks.inProgress + acc.tasks.completed;
    const notConnected = Math.max(0, acc.calls.period - acc.calls.connected - acc.calls.missed);
    const groups = this.groups(snap, acc, keys);

    return {
      tier: 'agent',
      window: snap.windows.key,
      range: this.rangeMeta(snap.windows),
      computedAt: snap.computedAt,
      sources: snap.sources,
      agentId: person?.id || agentId,
      agent: person
        ? {
            id: person.id,
            name: person.name,
            email: person.email,
            team: person.reportsTo ? dir.byId.get(person.reportsTo)?.name || null : null,
            linkedTo2bigha: !!person.twobighaAdminId,
            ivrNumber: person.mobile10 || null,
          }
        : null,
      glance: {
        newLeads: acc.leads.period,
        todayLeads: acc.leads.today,
        totalLeads: acc.leads.total,
        assignedLeads: acc.leads.assignedByOthers,
        listingsPeriod: acc.props.period,
        listingsTotal: acc.props.total,
        approvedTotal: acc.props.approved,
        callsPeriod: acc.calls.period,
        callsToday: acc.calls.today,
        connectedCalls: acc.calls.connected,
        connectRate: pct(acc.calls.connected, acc.calls.period),
        notConnected,
        notConnectedPct: pct(notConnected, acc.calls.period),
        whatsappReachout: acc.wa.period,
        subscriptionsPeriod: acc.subs.period + acc.subs.pmPeriod,
        taskCompletion: pct(acc.tasks.completed, taskTotal),
      },
      ...groups,
      whatsapp: { ...groups.whatsapp, recent },
      activityLog,
      myLeads,
      availability: person ? this.availability(snap, [person])[0] : null,
      targets: { monthly: targets.monthly, weekly: targets.weekly, subscriptions: targets.subscriptions },
    };
  }

  // ---------------------------------------------------------------------------
  // Output shaping
  // ---------------------------------------------------------------------------

  private groups(snap: Snapshot, acc: Acc, keys: string[] | null) {
    const l = acc.leads;
    const c = acc.calls;
    const w = acc.wa;
    const p = acc.props;
    const s = acc.subs;
    const t = acc.tasks;
    const notConnected = Math.max(0, c.period - c.connected - c.missed);
    const contacted = l.total - l.buckets.New;
    const taskTotal = t.open + t.inProgress + t.completed;
    return {
      leads: {
        total: l.total,
        period: l.period,
        prev: l.prev,
        deltaPct: pctDelta(l.period, l.prev),
        today: l.today,
        // Org: leads that have an owner. Person/team: leads handed to them by someone else.
        assigned: keys === null ? l.owned : l.assignedByOthers,
        unassigned: keys === null ? Math.max(0, l.total - l.owned) : 0,
        contacted,
        notContacted: l.buckets.New,
        contactedPct: pct(contacted, l.total),
        notContactedPct: pct(l.buckets.New, l.total),
        converted: l.buckets.Converted,
        conversionPct: pct(l.buckets.Converted, l.total),
        statusBreakdown: (['New', 'Contacted', 'Qualified', 'Converted', 'Lost'] as LeadBucket[]).map(
          (b) => ({ status: b, count: l.buckets[b] }),
        ),
        followUps: {
          total: l.followTotal,
          today: l.followToday,
          upcoming: l.followUpcoming,
          overdue: l.followOverdue,
        },
      },
      calls: {
        total: c.total,
        period: c.period,
        prev: c.prev,
        deltaPct: pctDelta(c.period, c.prev),
        today: c.today,
        connected: c.connected,
        missed: c.missed,
        notConnected,
        connectRate: pct(c.connected, c.period),
        todayConnected: c.todayConnected,
        todayNotConnected: Math.max(0, c.today - c.todayConnected),
        todayConnectRate: pct(c.todayConnected, c.today),
        incoming: c.incoming,
        outgoing: c.outgoing,
        avgTalkSecs: c.connected > 0 ? Math.round(c.talkSecs / c.connected) : 0,
        outcomeBreakdown: [
          { name: 'Connected', count: c.connected },
          { name: 'Not Connected', count: notConnected },
          { name: 'Missed', count: c.missed },
        ],
      },
      whatsapp: {
        total: w.total,
        period: w.period,
        today: w.today,
        contactsReached: keys === null ? snap.orgUniqueContacts : w.contacts,
        newMessages: w.newMessages,
        failed: w.failed,
        deliveredPct: pct(w.delivered, w.period),
        avgResponseMins: w.respN > 0 ? Math.round(w.respSumMins / w.respN) : null,
        recent: [] as any[],
      },
      properties: {
        source: snap.sources.twobighaListings ? '2bigha' : 'crm',
        total: p.total,
        approved: p.approved,
        pending: p.pending,
        rejected: p.rejected,
        farms: p.farms,
        properties: p.properties,
        period: p.period,
        periodApproved: p.periodApproved,
        periodRejected: p.periodRejected,
        today: p.today,
        todayApproved: p.todayApproved,
        todayRejected: p.todayRejected,
        breakdown: [
          { status: 'Approved', count: p.approved },
          { status: 'Pending', count: p.pending },
          { status: 'Rejected', count: p.rejected },
        ],
      },
      subscriptions: {
        available: snap.sources.twobighaSubscriptions,
        total: s.total,
        active: s.active,
        paid: s.paid,
        period: s.period,
        periodPaid: s.periodPaid,
        // PM (property-management) plans sold through the CRM checkout.
        pmSold: s.pmTotal,
        pmPeriod: s.pmPeriod,
        pmToday: s.pmToday,
        pmRevenuePeriod: Math.round(s.pmRevenuePeriod),
        today: s.today,
        byPlan: [] as Array<{ plan: string; count: number }>,
      },
      tasks: {
        open: t.open,
        inProgress: t.inProgress,
        completed: t.completed,
        overdue: t.overdue,
        total: taskTotal,
        completionPct: pct(t.completed, taskTotal),
      },
      trendGranularity: snap.windows.granularity,
      monthly: snap.windows.months.map((m, i) => ({
        month: m.label,
        leads: acc.monthly.leads[i] || 0,
        calls: acc.monthly.calls[i] || 0,
        listings: acc.monthly.listings[i] || 0,
      })),
    };
  }

  /** One person's headline numbers (used for the team lead's own block). */
  private personSummary(snap: Snapshot, p: Person | null) {
    if (!p) return null;
    const a = snap.acc.get(p.id) || emptyAcc(snap.windows.months.length);
    const taskTotal = a.tasks.open + a.tasks.inProgress + a.tasks.completed;
    return {
      id: p.id,
      name: p.name,
      newLeads: a.leads.period,
      todayLeads: a.leads.today,
      totalLeads: a.leads.total,
      contacted: a.leads.total - a.leads.buckets.New,
      converted: a.leads.buckets.Converted,
      followUpsToday: a.leads.followToday,
      followUpsOverdue: a.leads.followOverdue,
      calls: a.calls.period,
      callsToday: a.calls.today,
      connected: a.calls.connected,
      connectRate: pct(a.calls.connected, a.calls.period),
      whatsapp: a.wa.period,
      whatsappUnread: a.wa.newMessages,
      listings: a.props.period,
      listingsTotal: a.props.total,
      subscriptions: a.subs.period + a.subs.pmPeriod,
      tasksOpen: a.tasks.open + a.tasks.inProgress,
      tasksOverdue: a.tasks.overdue,
      taskCompletion: pct(a.tasks.completed, taskTotal),
      score: scoreOf(a),
    };
  }

  private rangeMeta(w: Windows) {
    return { start: w.period.start, end: w.period.end, prevStart: w.prev.start, prevEnd: w.prev.end };
  }

  /** Team = the lead + everyone whose `reportsTo` is the lead. */
  private teamMembers(dir: Directory, teamLeadId: string): Person[] {
    const lead = dir.byId.get(teamLeadId);
    const leadKey = lead?.id || teamLeadId;
    const reports = dir.people.filter((p) => p.reportsTo === leadKey && p.id !== leadKey);
    return lead ? [lead, ...reports] : reports;
  }

  private personRows(snap: Snapshot, people: Person[], activeOnly: boolean) {
    const { dir } = snap;
    const rows = people.map((p) => {
      const a = snap.acc.get(p.id) || emptyAcc(snap.windows.months.length);
      const taskTotal = a.tasks.open + a.tasks.inProgress + a.tasks.completed;
      const active =
        p.crmAccess ||
        !!p.crmId ||
        a.leads.total + a.calls.total + a.wa.total + a.props.total + a.subs.total + taskTotal > 0;
      return {
        active,
        row: {
          id: p.id,
          name: p.name,
          email: p.email,
          team: p.reportsTo ? dir.byId.get(p.reportsTo)?.name || '—' : '—',
          leads: a.leads.period,
          totalLeads: a.leads.total,
          assigned: a.leads.assignedByOthers,
          calls: a.calls.period,
          connected: a.calls.connected,
          connectRate: pct(a.calls.connected, a.calls.period),
          whatsapp: a.wa.period,
          properties: a.props.period,
          propertiesTotal: a.props.total,
          approved: a.props.approved,
          subscriptions: a.subs.period + a.subs.pmPeriod,
          tasksOpen: a.tasks.open + a.tasks.inProgress,
          tasksOverdue: a.tasks.overdue,
          taskCompletion: pct(a.tasks.completed, taskTotal),
          score: scoreOf(a),
          targetPct: null as number | null,
        },
      };
    });
    return rows
      .filter((r) => !activeOnly || r.active)
      .map((r) => r.row)
      .sort((a, b) => b.score - a.score || b.leads - a.leads || a.name.localeCompare(b.name));
  }

  private teamRows(snap: Snapshot) {
    const { dir } = snap;
    const leadIds = [...new Set(dir.people.map((p) => p.reportsTo).filter((x): x is string => !!x))];
    return leadIds
      .map((leadId) => {
        const members = this.teamMembers(dir, leadId);
        const a = this.sumAcc(snap, members.map((m) => m.id));
        const taskTotal = a.tasks.open + a.tasks.inProgress + a.tasks.completed;
        const leadName = dir.byId.get(leadId)?.name || 'Unknown';
        return {
          teamId: leadId,
          team: `${leadName}'s team`,
          teamLead: leadName,
          members: members.length,
          leads: a.leads.period,
          calls: a.calls.period,
          connected: pct(a.calls.connected, a.calls.period),
          whatsapp: a.wa.period,
          properties: a.props.period,
          subscriptions: a.subs.period + a.subs.pmPeriod,
          taskCompletion: pct(a.tasks.completed, taskTotal),
          score: scoreOf(a),
          targetPct: null as number | null,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private applyTargetPct(
    snap: Snapshot,
    rows: Array<{ id: string; targetPct: number | null }>,
    perPerson: Map<string, number>,
  ) {
    for (const r of rows) {
      const p = snap.dir.byId.get(r.id);
      if (p && perPerson.has(p.id)) r.targetPct = perPerson.get(p.id)!;
    }
  }

  private availability(snap: Snapshot, people: Person[]) {
    const todayYmd = this.ymd(snap.windows.now);
    return people.map((p) => {
      const av = p.availability;
      const marked = av?.date === todayYmd;
      let status = 'Not marked';
      if (!p.crmId) status = 'No CRM account';
      else if (marked) {
        status =
          av?.attendance ||
          (av?.status === 'unavailable_today' ? 'Unavailable' : av?.status === 'available' ? 'Present' : 'Not marked');
      }
      return { id: p.id, name: p.name, status, source: marked ? 'HRMS' : null };
    });
  }

  /**
   * Targets are per agent and per window (monthly / weekly). Actuals are always the
   * matching calendar window (this month / this week) — never the dashboard filter.
   */
  private async targets(snap: Snapshot, keys: string[] | null) {
    const filter: any = {};
    if (keys !== null) {
      const ids = new Set<string>();
      for (const k of keys) {
        const p = snap.dir.byId.get(k);
        for (const id of [k, p?.crmId]) if (id && Types.ObjectId.isValid(id)) ids.add(id);
      }
      filter.agentId = { $in: [...ids].map((id) => new Types.ObjectId(id)) };
    }
    const rows = await this.agentTargetModel.find(filter).lean().exec();
    type Bucket = {
      label: string;
      agents: number;
      leads: { actual: number; target: number | null };
      calls: { actual: number; target: number | null };
      listings: { actual: number; target: number | null };
    };
    const out: { monthly?: Bucket; weekly?: Bucket } = {};
    const perPerson = new Map<string, number>();
    for (const t of rows as any[]) {
      const win: 'monthly' | 'weekly' = t.window === 'weekly' ? 'weekly' : 'monthly';
      const person = snap.dir.byId.get(String(t.agentId));
      const a = person ? snap.acc.get(person.id) : undefined;
      const b = (out[win] ||= {
        label: win === 'weekly' ? 'This week' : 'This month',
        agents: 0,
        leads: { actual: 0, target: 0 },
        calls: { actual: 0, target: 0 },
        listings: { actual: 0, target: 0 },
      });
      const actual = {
        leads: a ? (win === 'weekly' ? a.leads.week : a.leads.month) : 0,
        calls: a ? (win === 'weekly' ? a.calls.week : a.calls.month) : 0,
        listings: a ? (win === 'weekly' ? a.props.week : a.props.month) : 0,
      };
      const target = {
        leads: Number(t.leadsTarget) || 0,
        calls: Number(t.callsTarget) || 0,
        listings: Number(t.propertiesTarget) || 0,
      };
      b.agents += 1;
      for (const k of ['leads', 'calls', 'listings'] as const) {
        b[k].actual += actual[k];
        b[k].target = (b[k].target || 0) + target[k];
      }
      // Person achievement = average of each set target, capped at 100%.
      const parts = (['leads', 'calls', 'listings'] as const)
        .filter((k) => target[k] > 0)
        .map((k) => Math.min(100, (actual[k] / target[k]) * 100));
      if (person && parts.length) {
        perPerson.set(person.id, Math.round(parts.reduce((x, y) => x + y, 0) / parts.length));
      }
    }
    // No targets set → still show this month's actuals (target "—").
    if (!out.monthly && !out.weekly) {
      const a = this.sumAcc(snap, keys);
      out.monthly = {
        label: 'This month',
        agents: 0,
        leads: { actual: a.leads.month, target: null },
        calls: { actual: a.calls.month, target: null },
        listings: { actual: a.props.month, target: null },
      };
    }
    const sub = this.sumAcc(snap, keys).subs;
    return {
      ...out,
      subscriptions: { actual: sub.month + sub.pmMonth, target: null, available: true },
      perPerson,
    };
  }

  // ---------------------------------------------------------------------------
  // Lists (scoped queries, not part of the snapshot)
  // ---------------------------------------------------------------------------

  private personIds(p: Person): Types.ObjectId[] {
    return [p.id, p.crmId]
      .filter((x): x is string => !!x && Types.ObjectId.isValid(x))
      .map((x) => new Types.ObjectId(x));
  }

  /** Same ownership rule as the snapshot: leadOwner = me, or unowned and created by me. */
  private leadOwnerFilter(p: Person): Record<string, unknown> {
    const ids = this.personIds(p);
    const or: any[] = [];
    for (const alias of new Set([p.name, ...p.aliases].map(normName).filter(Boolean))) {
      const name = escapeRe(alias).replace(/ /g, '\\s+');
      or.push({ leadOwner: new RegExp(`^\\s*${name}\\s*$`, 'i') });
    }
    if (p.email) or.push({ leadOwner: new RegExp(`^\\s*${escapeRe(p.email)}\\s*$`, 'i') });
    if (ids.length) {
      or.push({ leadOwner: { $in: ids.map(String) } });
      or.push({
        createdBy: { $in: ids },
        $or: [{ leadOwner: { $exists: false } }, { leadOwner: null }, { leadOwner: '' }],
      });
    }
    return { isDeleted: { $ne: true }, $or: or.length ? or : [{ _id: null }] };
  }

  private async myLeads(p: Person, w: Windows) {
    const filter = this.leadOwnerFilter(p);
    const select = 'firstName lastName status stage nextFollowUpAt updatedAt lastCallAt callStatus mobileNo';
    const [upcoming, overdue, recent] = await Promise.all([
      this.leadModel
        .find({ ...filter, nextFollowUpAt: { $gte: w.today.start } })
        .sort({ nextFollowUpAt: 1 })
        .limit(10)
        .select(select)
        .lean()
        .exec(),
      this.leadModel
        .find({ ...filter, nextFollowUpAt: { $lt: w.today.start } })
        .sort({ nextFollowUpAt: -1 })
        .limit(5)
        .select(select)
        .lean()
        .exec(),
      this.leadModel.find(filter).sort({ updatedAt: -1 }).limit(10).select(select).lean().exec(),
    ]);
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const l of [...overdue, ...upcoming, ...recent] as any[]) {
      const id = String(l._id);
      if (seen.has(id) || rows.length >= 12) continue;
      seen.add(id);
      rows.push({
        id,
        name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.mobileNo || 'Lead',
        status: (l.stage && String(l.stage).trim()) || l.status || 'New',
        callStatus: l.callStatus || null,
        lastContact: l.lastCallAt || null,
        updatedAt: l.updatedAt || null,
        nextFollowUp: l.nextFollowUpAt || null,
        overdue: !!(l.nextFollowUpAt && new Date(l.nextFollowUpAt) < w.today.start),
      });
    }
    return rows;
  }

  private async activityLog(p: Person) {
    const ids = this.personIds(p);
    if (!ids.length) return [];
    const rows = await this.activityModel
      .find({
        isDeleted: { $ne: true },
        type: { $nin: ['System'] },
        $or: [{ author: { $in: ids } }, { assignee: { $in: ids } }],
      })
      .sort({ createdAt: -1 })
      .limit(12)
      .select('type status content title createdAt relatedTo relatedType')
      .lean()
      .exec();
    return rows.map((a: any) => ({
      type: a.type,
      text: plain(a.title || a.content) || `${a.type}${a.status ? ` — ${a.status}` : ''}`,
      detail: a.title && a.content ? plain(a.content).slice(0, 140) : '',
      status: a.status || null,
      relatedTo: a.relatedTo ? String(a.relatedTo) : null,
      relatedType: a.relatedType || null,
      at: a.createdAt,
    }));
  }

  private async recentWhatsApp(snap: Snapshot, keys: string[] | null) {
    const match: Record<string, unknown> = {};
    if (keys !== null) {
      const set = new Set(keys);
      const waIds = [...snap.convOwner.entries()].filter(([, k]) => set.has(k)).map(([wa]) => wa);
      if (!waIds.length) return [];
      match.waId = { $in: waIds.slice(0, 5000) };
    }
    const rows = await this.whatsappModel
      .find(match)
      .sort({ createdAt: -1 })
      .limit(6)
      .select('waId customerName body direction status isRead createdAt')
      .lean()
      .exec();
    return rows.map((m: any) => ({
      contact: m.customerName || (m.waId ? `+${m.waId}` : 'Unknown'),
      preview:
        plain(m.body || '').slice(0, 80) ||
        (m.direction === 'inbound' ? 'Received a message' : 'Sent a message'),
      direction: m.direction,
      status: m.direction === 'inbound' ? (m.isRead ? 'Read' : 'New') : capitalize(m.status || 'Sent'),
      at: m.createdAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Snapshot (all per-person metrics for one window)
  // ---------------------------------------------------------------------------

  private getSnapshot(window: string): Promise<Snapshot> {
    const key = normalizeWindow(window);
    const hit = this.snapshots.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.promise;
    const promise = this.computeSnapshot(key).catch((e) => {
      this.snapshots.delete(key);
      throw e;
    });
    const entry = { at: Date.now(), ttl: SNAPSHOT_TTL_MS, promise };
    this.snapshots.set(key, entry);
    // Built before 2bigha finished warming → expire sooner so live data shows up quickly.
    void promise
      .then((s) => {
        const enabled = this.twoBigha.isEnabled();
        if (enabled && (!s.sources.twobighaListings || !s.sources.twobighaSubscriptions)) entry.ttl = 15_000;
      })
      .catch(() => undefined);
    if (this.snapshots.size > 20) {
      const oldest = [...this.snapshots.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.snapshots.delete(oldest[0]);
    }
    return promise;
  }

  private async computeSnapshot(windowKey: string): Promise<Snapshot> {
    const started = Date.now();
    const windows = this.windows(windowKey);
    const [dir, listings, subscribers] = await Promise.all([
      this.loadDirectory(),
      this.twoBigha.getListings().catch(() => null),
      this.twoBigha.getSubscribers().catch(() => null),
    ]);
    const acc = new Map<string, Acc>();
    const get = (k: string) => {
      let a = acc.get(k);
      if (!a) {
        a = emptyAcc(windows.months.length);
        acc.set(k, a);
      }
      return a;
    };

    const leadIndex = await this.loadLeadIndex(dir);
    const [convOwner, orgUniqueContacts, planCounts] = await Promise.all([
      this.collectWhatsApp(dir, windows, get, leadIndex),
      this.countUniqueContacts(windows),
      this.collectSubscriptions(dir, windows, get, leadIndex, subscribers),
      this.collectLeads(dir, windows, get),
      this.collectCalls(dir, windows, get),
      this.collectTasks(dir, windows, get),
      this.collectListings(dir, windows, get, listings),
      this.collectPmSales(dir, windows, get),
    ]);

    this.logger.log(`Role dashboard snapshot "${windowKey}" computed in ${Date.now() - started}ms`);
    return {
      windows,
      dir,
      acc,
      convOwner,
      orgUniqueContacts,
      sources: { twobighaListings: !!listings, twobighaSubscriptions: !!subscribers },
      planCounts: [...planCounts.entries()]
        .map(([plan, count]) => ({ plan, count }))
        .sort((a, b) => b.count - a.count),
      computedAt: new Date().toISOString(),
    };
  }

  private sumAcc(snap: Snapshot, keys: string[] | null): Acc {
    const out = emptyAcc(snap.windows.months.length);
    const list = keys === null ? [...snap.acc.values()] : keys.map((k) => snap.acc.get(k));
    for (const a of list) if (a) addAcc(out, a);
    return out;
  }

  // --- Directory --------------------------------------------------------------

  private loadDirectory(): Promise<Directory> {
    if (this.directoryCache && Date.now() - this.directoryCache.at < SNAPSHOT_TTL_MS) {
      return this.directoryCache.promise;
    }
    const promise = this.buildDirectory().catch((e) => {
      this.directoryCache = undefined;
      throw e;
    });
    this.directoryCache = { at: Date.now(), promise };
    return promise;
  }

  private async buildDirectory(): Promise<Directory> {
    const [platformUsers, crmAccessIds, crmUsers] = await Promise.all([
      this.hrmsUserModel
        .find({ is_archived: { $ne: true } } as any)
        .select('_id firstName lastName email reportsTo')
        .limit(5000)
        .lean()
        .exec(),
      this.hrmsUserModel.find(crmPortalAccessUserFilter() as any).select('_id').limit(5000).lean().exec(),
      this.crmUserModel
        .find({})
        .select(
          '_id email firstName lastName isActive twobighaAdminId agentMobile availabilityStatus availabilityAttendanceStatus availabilityDate',
        )
        .limit(5000)
        .lean()
        .exec(),
    ]);
    const crmAccess = new Set((crmAccessIds as any[]).map((u) => String(u._id)));
    const crmByEmail = new Map<string, any>();
    for (const c of crmUsers as any[]) {
      const e = lc(c.email);
      if (e) crmByEmail.set(e, c);
    }
    const people: Person[] = [];
    const usedCrm = new Set<string>();
    const attachCrm = (p: Person, c: any) => {
      p.crmId = String(c._id);
      p.twobighaAdminId = c.twobighaAdminId ? String(c.twobighaAdminId).trim() : undefined;
      p.mobile10 = last10(c.agentMobile) || undefined;
      p.availability = {
        status: c.availabilityStatus,
        attendance: c.availabilityAttendanceStatus,
        date: c.availabilityDate,
      };
      if (c.isActive === false) p.crmAccess = false;
      const crmName = fullName(c);
      if (crmName && !p.aliases.includes(crmName)) p.aliases.push(crmName);
      usedCrm.add(p.crmId);
    };
    for (const u of platformUsers as any[]) {
      const email = String(u.email || '').trim();
      const p: Person = {
        id: String(u._id),
        crmAccess: crmAccess.has(String(u._id)),
        name: fullName(u) || email || 'Unknown',
        email: email || undefined,
        reportsTo: u.reportsTo ? String(u.reportsTo) : null,
        aliases: fullName(u) ? [fullName(u)] : [],
      };
      const c = crmByEmail.get(lc(email));
      if (c) attachCrm(p, c);
      people.push(p);
    }
    // CRM-only users (no platform account) still own records.
    for (const c of crmUsers as any[]) {
      if (usedCrm.has(String(c._id))) continue;
      const email = String(c.email || '').trim();
      const p: Person = {
        id: String(c._id),
        crmAccess: c.isActive !== false,
        name: fullName(c) || email || 'Unknown',
        email: email || undefined,
        reportsTo: null,
        aliases: [],
      };
      attachCrm(p, c);
      people.push(p);
    }

    const byId = new Map<string, Person>();
    const byEmail = new Map<string, Person>();
    const byMobile = new Map<string, Person>();
    const byTb = new Map<string, Person>();
    const nameCount = new Map<string, number>();
    for (const p of people) {
      byId.set(p.id, p);
      if (p.crmId) byId.set(p.crmId, p);
      if (p.email) byEmail.set(lc(p.email), p);
      if (p.mobile10) byMobile.set(p.mobile10, p);
      if (p.twobighaAdminId) byTb.set(p.twobighaAdminId, p);
      for (const n of new Set(p.aliases.map(normName).filter(Boolean))) {
        nameCount.set(n, (nameCount.get(n) || 0) + 1);
      }
    }
    const byName = new Map<string, Person>();
    for (const p of people) {
      // Ambiguous display names are never used for attribution.
      for (const n of new Set(p.aliases.map(normName).filter(Boolean))) {
        if (nameCount.get(n) === 1) byName.set(n, p);
      }
    }
    return { people, byId, byEmail, byName, byMobile, byTb };
  }

  // --- Collectors -------------------------------------------------------------

  private async collectLeads(dir: Directory, w: Windows, get: (k: string) => Acc) {
    const tz = this.tz();
    const t = '$createdAt';
    const owner = { $toLower: { $trim: { input: { $toString: { $ifNull: ['$leadOwner', ''] } } } } };
    const [rows, monthRows] = await Promise.all([
      this.leadModel
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          {
            $group: {
              _id: {
                o: owner,
                c: '$createdBy',
                // Pipeline stage wins over the legacy status when set.
                s: {
                  $cond: [
                    { $gt: [{ $strLenCP: { $trim: { input: { $toString: { $ifNull: ['$stage', ''] } } } } }, 0] },
                    '$stage',
                    '$status',
                  ],
                },
                cv: { $eq: ['$converted', true] },
                called: {
                  $or: [
                    { $not: [{ $in: [{ $ifNull: ['$callStatus', 'Not Called'] }, ['Not Called', '']] }] },
                    { $gt: ['$lastCallAt', null] },
                  ],
                },
              },
              total: { $sum: 1 },
              period: cnt(between(t, w.period)),
              prev: cnt(between(t, w.prev)),
              today: cnt(between(t, w.today)),
              week: cnt(between(t, w.week)),
              month: cnt(between(t, w.month)),
              fTotal: cnt({ $gt: ['$nextFollowUpAt', null] }),
              fToday: cnt(between('$nextFollowUpAt', w.today)),
              fUpcoming: cnt({ $gt: ['$nextFollowUpAt', w.today.end] }),
              fOverdue: cnt({
                $and: [{ $gt: ['$nextFollowUpAt', null] }, { $lt: ['$nextFollowUpAt', w.today.start] }],
              }),
            },
          },
        ])
        .allowDiskUse(true)
        .exec(),
      this.leadModel
        .aggregate([
          { $match: { isDeleted: { $ne: true }, createdAt: { $gte: w.months[0].start } } },
          {
            $group: {
              _id: {
                o: owner,
                c: '$createdBy',
                y: { $year: { date: '$createdAt', timezone: tz } },
                m: { $month: { date: '$createdAt', timezone: tz } },
                d: { $dayOfMonth: { date: '$createdAt', timezone: tz } },
              },
              n: { $sum: 1 },
            },
          },
        ])
        .allowDiskUse(true)
        .exec(),
    ]);

    const resolve = (o: string, c: unknown) => {
      const creator = c ? dir.byId.get(String(c)) : undefined;
      if (o) {
        const p = dir.byEmail.get(o) || dir.byName.get(normName(o)) || dir.byId.get(o);
        return { key: p ? p.id : NONE, viaOwner: true, createdBySelf: !!p && creator?.id === p.id };
      }
      return { key: creator ? creator.id : NONE, viaOwner: false, createdBySelf: true };
    };

    for (const r of rows as any[]) {
      const { key, viaOwner, createdBySelf } = resolve(r._id.o, r._id.c);
      const a = get(key).leads;
      a.total += r.total;
      a.period += r.period;
      a.prev += r.prev;
      a.today += r.today;
      a.week += r.week;
      a.month += r.month;
      if (viaOwner) a.owned += r.total;
      if (viaOwner && !createdBySelf) a.assignedByOthers += r.total;
      a.buckets[classifyLead(r._id.s, r._id.cv, r._id.called)] += r.total;
      a.followTotal += r.fTotal;
      a.followToday += r.fToday;
      a.followUpcoming += r.fUpcoming;
      a.followOverdue += r.fOverdue;
    }
    const monthIdx = this.monthIndexer(w);
    for (const r of monthRows as any[]) {
      const i = monthIdx(r._id.y, r._id.m, r._id.d);
      if (i >= 0) get(resolve(r._id.o, r._id.c).key).monthly.leads[i] += r.n;
    }
  }

  private async collectCalls(dir: Directory, w: Windows, get: (k: string) => Acc) {
    const tz = this.tz();
    const t = '$_t';
    const connected = {
      $or: [
        { $eq: ['$status', 'Connected'] },
        { $gt: [{ $ifNull: ['$connectedDuration', 0] }, 0] },
        // Manually logged / imported "Completed" calls. Kommuno rows carry a rawStatus,
        // and a Kommuno "Completed" (pre-fix rows) means the call was NOT patched through.
        { $and: [{ $eq: ['$status', 'Completed'] }, { $eq: [{ $ifNull: ['$rawStatus', ''] }, ''] }] },
      ],
    };
    const missed = {
      $and: [
        { $not: [connected] },
        { $or: [{ $eq: ['$status', 'Missed'] }, { $eq: ['$direction', 'Incoming'] }] },
      ],
    };
    const talk = {
      $cond: [
        { $gt: [{ $ifNull: ['$connectedDuration', 0] }, 0] },
        '$connectedDuration',
        { $ifNull: ['$duration', 0] },
      ],
    };
    const callTime = { $addFields: { _t: { $ifNull: ['$callDate', '$createdAt'] } } };
    const who = {
      u: '$initiatedByUserId',
      n: '$agentNumber',
      a: { $toLower: { $ifNull: ['$agentName', ''] } },
    };
    const [rows, monthRows] = await Promise.all([
      this.callLogModel
        .aggregate([
          callTime,
          {
            $group: {
              _id: who,
              total: { $sum: 1 },
              period: cnt(between(t, w.period)),
              prev: cnt(between(t, w.prev)),
              today: cnt(between(t, w.today)),
              week: cnt(between(t, w.week)),
              month: cnt(between(t, w.month)),
              connected: cnt({ $and: [between(t, w.period), connected] }),
              missed: cnt({ $and: [between(t, w.period), missed] }),
              todayConnected: cnt({ $and: [between(t, w.today), connected] }),
              incoming: cnt({ $and: [between(t, w.period), { $eq: ['$direction', 'Incoming'] }] }),
              outgoing: cnt({ $and: [between(t, w.period), { $ne: ['$direction', 'Incoming'] }] }),
              talkSecs: { $sum: { $cond: [{ $and: [between(t, w.period), connected] }, talk, 0] } },
            },
          },
        ])
        .allowDiskUse(true)
        .exec(),
      this.callLogModel
        .aggregate([
          callTime,
          { $match: { _t: { $gte: w.months[0].start } } },
          {
            $group: {
              _id: {
                ...who,
                y: { $year: { date: '$_t', timezone: tz } },
                m: { $month: { date: '$_t', timezone: tz } },
                d: { $dayOfMonth: { date: '$_t', timezone: tz } },
              },
              n: { $sum: 1 },
            },
          },
        ])
        .allowDiskUse(true)
        .exec(),
    ]);
    const resolve = (id: any): string => {
      const p =
        (id.u && dir.byId.get(String(id.u))) ||
        (id.n && dir.byMobile.get(last10(id.n))) ||
        (id.a && dir.byName.get(normName(id.a))) ||
        null;
      return p ? p.id : NONE;
    };
    for (const r of rows as any[]) {
      const a = get(resolve(r._id)).calls;
      a.total += r.total;
      a.period += r.period;
      a.prev += r.prev;
      a.today += r.today;
      a.week += r.week;
      a.month += r.month;
      a.connected += r.connected;
      a.missed += r.missed;
      a.todayConnected += r.todayConnected;
      a.incoming += r.incoming;
      a.outgoing += r.outgoing;
      a.talkSecs += r.talkSecs;
    }
    const monthIdx = this.monthIndexer(w);
    for (const r of monthRows as any[]) {
      const i = monthIdx(r._id.y, r._id.m, r._id.d);
      if (i >= 0) get(resolve(r._id)).monthly.calls[i] += r.n;
    }
  }

  /**
   * Lead → owner lookups (same ownership rule as the lead metrics). WhatsApp and
   * 2bigha subscriptions use these to land on the agent who owns the customer.
   */
  private async loadLeadIndex(dir: Directory): Promise<LeadIndex> {
    const rows = await this.leadModel
      .find({ isDeleted: { $ne: true } })
      .select('_id leadOwner createdBy mobileNo phone whatsappNumber email clientId updatedAt')
      .sort({ updatedAt: 1 }) // later (more recent) leads win on shared phone numbers
      .limit(500_000)
      .lean()
      .exec();
    const index: LeadIndex = { byId: new Map(), byPhone: new Map(), byEmail: new Map(), byClient: new Map() };
    for (const l of rows as any[]) {
      const key = leadOwnerKey(dir, lc(l.leadOwner), l.createdBy);
      if (key === NONE) continue;
      index.byId.set(String(l._id), key);
      for (const ph of [l.mobileNo, l.phone, l.whatsappNumber]) {
        const d = last10(ph);
        if (d) index.byPhone.set(d, key);
      }
      if (l.email) index.byEmail.set(lc(l.email), key);
      if (l.clientId) index.byClient.set(String(l.clientId), key);
    }
    return index;
  }

  /**
   * WhatsApp attribution, mirroring the CRM inbox: a conversation (waId) belongs to the
   * owner of its lead (linked `entityId`, else the lead with that phone number). A message
   * is credited to its CRM sender (`sentBy`) when known; messages without one — AiSensy
   * webhook echoes, replies sent from the phone, inbound messages — go to the conversation
   * owner. Returns waId → owning person key.
   */
  private async collectWhatsApp(
    dir: Directory,
    w: Windows,
    get: (k: string) => Acc,
    leads: LeadIndex,
  ): Promise<Map<string, string>> {
    const t = '$createdAt';
    const out = { $eq: ['$direction', 'outbound'] };
    const sent = { $and: [out, { $ne: ['$status', 'failed'] }] };
    const [groups, periodMsgs] = await Promise.all([
      this.whatsappModel
        .aggregate([
          {
            $group: {
              _id: { w: '$waId', d: '$direction', s: '$sentBy', e: '$entityId' },
              total: cnt(sent),
              period: cnt({ $and: [between(t, w.period), sent] }),
              today: cnt({ $and: [between(t, w.today), sent] }),
              week: cnt({ $and: [between(t, w.week), sent] }),
              month: cnt({ $and: [between(t, w.month), sent] }),
              failed: cnt({ $and: [between(t, w.period), out, { $eq: ['$status', 'failed'] }] }),
              delivered: cnt({ $and: [between(t, w.period), out, { $in: ['$status', ['delivered', 'read']] }] }),
              unread: cnt({ $and: [{ $eq: ['$direction', 'inbound'] }, { $ne: ['$isRead', true] }] }),
              lastAt: { $max: t },
            },
          },
        ])
        .allowDiskUse(true)
        .exec(),
      this.whatsappModel
        .find({ createdAt: { $gte: w.period.start, $lte: w.period.end } })
        .sort({ waId: 1, createdAt: 1 })
        .limit(50_000)
        .select('waId direction sentBy createdAt')
        .lean()
        .exec(),
    ]);

    const senderKey = (sentBy: unknown): string | null => {
      const p = sentBy ? dir.byId.get(String(sentBy)) : undefined;
      return p ? p.id : null;
    };

    // 1. Conversation owner: linked lead → lead with that phone → latest CRM sender.
    const convOwner = new Map<string, string>();
    const latestSender = new Map<string, { key: string; at: number }>();
    for (const g of groups as any[]) {
      const wa = String(g._id.w || '');
      if (!wa) continue;
      const viaLead = g._id.e ? leads.byId.get(String(g._id.e)) : undefined;
      if (viaLead && !convOwner.has(wa)) convOwner.set(wa, viaLead);
      const sk = g._id.d === 'outbound' ? senderKey(g._id.s) : null;
      const at = g.lastAt ? new Date(g.lastAt).getTime() : 0;
      if (sk && (latestSender.get(wa)?.at ?? -1) < at) latestSender.set(wa, { key: sk, at });
    }
    const allWa = new Set((groups as any[]).map((g) => String(g._id.w || '')).filter(Boolean));
    for (const wa of allWa) {
      if (convOwner.has(wa)) continue;
      const owner = leads.byPhone.get(last10(wa)) || latestSender.get(wa)?.key;
      if (owner) convOwner.set(wa, owner);
    }
    const ownerOf = (wa: unknown) => convOwner.get(String(wa || '')) || NONE;

    // 2. Message counts → sender, else conversation owner.
    const contacts = new Map<string, Set<string>>();
    for (const g of groups as any[]) {
      if (g._id.d === 'outbound') {
        const key = senderKey(g._id.s) || ownerOf(g._id.w);
        const a = get(key).wa;
        a.total += g.total;
        a.period += g.period;
        a.today += g.today;
        a.week += g.week;
        a.month += g.month;
        a.failed += g.failed;
        a.delivered += g.delivered;
        if (g.period > 0 && g._id.w) {
          let set = contacts.get(key);
          if (!set) contacts.set(key, (set = new Set()));
          set.add(String(g._id.w));
        }
      } else if (g.unread > 0) {
        get(ownerOf(g._id.w)).wa.newMessages += g.unread;
      }
    }
    for (const [key, set] of contacts) get(key).wa.contacts += set.size;

    // 3. Response time: first inbound since our last reply → our next outbound.
    let curWa = '';
    let pendingSince: number | null = null;
    for (const m of periodMsgs as any[]) {
      if (m.waId !== curWa) {
        curWa = m.waId;
        pendingSince = null;
      }
      const at = new Date(m.createdAt).getTime();
      if (m.direction === 'inbound') {
        if (pendingSince === null) pendingSince = at;
      } else if (pendingSince !== null) {
        const a = get(senderKey(m.sentBy) || ownerOf(m.waId)).wa;
        a.respSumMins += (at - pendingSince) / 60000;
        a.respN += 1;
        pendingSince = null;
      }
    }
    return convOwner;
  }

  /**
   * 2bigha subscriptions → CRM agent: the admin who sold it (soldByAdminId / email), else
   * the owner of the customer's lead (2bigha user → CRM Client.twobighaUserId → lead, or a
   * lead with the subscriber's email / phone).
   */
  private async collectSubscriptions(
    dir: Directory,
    w: Windows,
    get: (k: string) => Acc,
    leads: LeadIndex,
    subscribers: TwoBighaSubscriberRow[] | null,
  ): Promise<Map<string, number>> {
    const planCounts = new Map<string, number>();
    if (!subscribers?.length) return planCounts;
    const userIds = [...new Set(subscribers.map((s) => s.userId).filter((x): x is string => !!x))];
    const clients = userIds.length
      ? await this.clientModel
          .find({ twobighaUserId: { $in: userIds }, isDeleted: { $ne: true } } as any)
          .select('_id twobighaUserId sourceLead associatedLeads')
          .lean()
          .exec()
      : [];
    const ownerByTbUser = new Map<string, string>();
    for (const c of clients as any[]) {
      const key =
        leads.byClient.get(String(c._id)) ||
        (c.sourceLead && leads.byId.get(String(c.sourceLead))) ||
        (c.associatedLeads || []).map((id: any) => leads.byId.get(String(id))).find(Boolean);
      if (key) ownerByTbUser.set(String(c.twobighaUserId), key);
    }
    for (const s of subscribers) {
      const seller =
        (s.soldByAdminId && dir.byTb.get(s.soldByAdminId)) ||
        (s.soldByAdminEmail && dir.byEmail.get(s.soldByAdminEmail)) ||
        null;
      const key =
        seller?.id ||
        (s.userId && ownerByTbUser.get(s.userId)) ||
        (s.userEmail && leads.byEmail.get(s.userEmail)) ||
        (s.userPhone && leads.byPhone.get(last10(s.userPhone))) ||
        NONE;
      const a = get(key).subs;
      const active = s.status === 'active';
      a.total += 1;
      if (active) a.active += 1;
      if (!s.isBase) a.paid += 1;
      if (inWin(s.startsAt, w.period)) {
        a.period += 1;
        if (!s.isBase) a.periodPaid += 1;
      }
      if (inWin(s.startsAt, w.today)) a.today += 1;
      if (inWin(s.startsAt, w.week)) a.week += 1;
      if (inWin(s.startsAt, w.month)) a.month += 1;
      if (active) planCounts.set(s.planName, (planCounts.get(s.planName) || 0) + 1);
    }
    return planCounts;
  }

  /**
   * PM plans sold inside the CRM: the checkout flow logs `pm_payment_order_created` /
   * `pm_upgrade_order_created` (amount in paise) and `pm_payment_verified` (author = agent).
   */
  private async collectPmSales(dir: Directory, w: Windows, get: (k: string) => Acc) {
    const rows = await this.activityModel
      .find({
        type: 'System',
        isDeleted: { $ne: true },
        'metadata.eventType': { $in: ['pm_payment_verified', 'pm_payment_order_created', 'pm_upgrade_order_created'] },
      } as any)
      .select('author metadata createdAt relatedTo')
      .limit(200_000)
      .lean()
      .exec();
    const amountByOrder = new Map<string, number>();
    for (const r of rows as any[]) {
      if (r.metadata?.eventType === 'pm_payment_verified') continue;
      const order = String(r.metadata?.razorpayOrderId || r.metadata?.orderId || '');
      const amt = Number(r.metadata?.amount);
      if (order && Number.isFinite(amt)) amountByOrder.set(order, amt / 100);
    }
    for (const r of rows as any[]) {
      if (r.metadata?.eventType !== 'pm_payment_verified' || r.metadata?.success === false) continue;
      const p = r.author ? dir.byId.get(String(r.author)) : undefined;
      const a = get(p ? p.id : NONE).subs;
      const at = r.createdAt ? new Date(r.createdAt).getTime() : null;
      const amount = amountByOrder.get(String(r.metadata?.razorpayOrderId || '')) || 0;
      a.pmTotal += 1;
      if (inWin(at, w.period)) {
        a.pmPeriod += 1;
        a.pmRevenuePeriod += amount;
      }
      if (inWin(at, w.today)) a.pmToday += 1;
      if (inWin(at, w.month)) a.pmMonth += 1;
    }
  }

  private async countUniqueContacts(w: Windows): Promise<number> {
    const rows = await this.whatsappModel
      .aggregate([
        {
          $match: {
            direction: 'outbound',
            status: { $ne: 'failed' },
            createdAt: { $gte: w.period.start, $lte: w.period.end },
          },
        },
        { $group: { _id: '$waId' } },
        { $count: 'n' },
      ])
      .exec();
    return rows[0]?.n || 0;
  }

  private async collectTasks(dir: Directory, w: Windows, get: (k: string) => Acc) {
    const rows = await this.activityModel
      .find({ type: 'Task', isDeleted: { $ne: true } })
      .select('assignee author status metadata.dueDate updatedAt')
      .limit(100_000)
      .lean()
      .exec();
    const now = w.now.getTime();
    for (const r of rows as any[]) {
      const s = String(r.status || '').toLowerCase();
      if (/cancel|deleted/.test(s)) continue;
      const p =
        (r.assignee && dir.byId.get(String(r.assignee))) ||
        (r.author && dir.byId.get(String(r.author))) ||
        null;
      const a = get(p ? p.id : NONE).tasks;
      const due = r.metadata?.dueDate ? new Date(r.metadata.dueDate).getTime() : NaN;
      if (/complete|done|closed|resolved/.test(s)) {
        a.completed += 1;
        if (inWin(r.updatedAt ? new Date(r.updatedAt).getTime() : null, w.period)) a.periodCompleted += 1;
      } else {
        if (/progress|doing|started/.test(s)) a.inProgress += 1;
        else a.open += 1;
        if (Number.isFinite(due) && due < now) a.overdue += 1;
      }
    }
  }

  private async collectListings(
    dir: Directory,
    w: Windows,
    get: (k: string) => Acc,
    index: TwoBighaListingIndex | null,
  ) {
    const local = await this.propertyModel
      .find({ isDeleted: { $ne: true }, listingBucket: { $ne: 'pm' } } as any)
      .select('createdBy approvalStatus propertyType listingBucket twobighaPropertyId createdAt updatedAt')
      .limit(100_000)
      .lean()
      .exec();
    const localByTb = new Map<string, any>();
    for (const l of local as any[]) if (l.twobighaPropertyId) localByTb.set(String(l.twobighaPropertyId), l);

    type Row = {
      key: string;
      farm: boolean;
      status: 'Approved' | 'Pending' | 'Rejected';
      createdAt: number | null;
      approvedAt: number | null;
      rejectedAt: number | null;
    };
    const rows: Row[] = [];
    const keyOfLocal = (l: any) => {
      const p = l?.createdBy ? dir.byId.get(String(l.createdBy)) : undefined;
      return p ? p.id : null;
    };

    const remote = index?.rows ?? null;
    if (remote) {
      for (const r of remote) {
        const tbPerson = r.createdByAdminId ? dir.byTb.get(r.createdByAdminId) : undefined;
        rows.push({
          key: keyOfLocal(localByTb.get(r.id)) || tbPerson?.id || NONE,
          farm: r.kind === 'farm',
          status: r.status,
          createdAt: r.createdAt,
          approvedAt: r.approvedAt,
          rejectedAt: r.rejectedAt,
        });
      }
    }
    for (const l of local as any[]) {
      // Synced to 2bigha → counted from the live row (or deleted there; 2bigha is truth).
      if (remote && l.twobighaPropertyId) continue;
      const status = normalizeLocalApproval(l.approvalStatus);
      const created = l.createdAt ? new Date(l.createdAt).getTime() : null;
      const updated = l.updatedAt ? new Date(l.updatedAt).getTime() : created;
      rows.push({
        key: keyOfLocal(l) || NONE,
        farm: l.listingBucket === 'farm' || l.propertyType === 'Farm',
        status,
        createdAt: created,
        approvedAt: status === 'Approved' ? updated : null,
        rejectedAt: status === 'Rejected' ? updated : null,
      });
    }

    // Rows 2bigha's paging skipped: status known (queue), owner/dates unknown.
    for (const gap of index?.shortfall || []) {
      for (let i = 0; i < gap.missing; i++) {
        rows.push({ key: NONE, farm: gap.kind === 'farm', status: gap.status, createdAt: null, approvedAt: null, rejectedAt: null });
      }
    }

    const monthStarts = w.months.map((m) => m.start.getTime());
    const monthEnds = w.months.map((m) => m.end.getTime());
    for (const r of rows) {
      const a = get(r.key);
      const p = a.props;
      p.total += 1;
      if (r.farm) p.farms += 1;
      else p.properties += 1;
      if (r.status === 'Approved') p.approved += 1;
      else if (r.status === 'Rejected') p.rejected += 1;
      else p.pending += 1;
      if (inWin(r.createdAt, w.period)) p.period += 1;
      if (inWin(r.approvedAt, w.period)) p.periodApproved += 1;
      if (inWin(r.rejectedAt, w.period)) p.periodRejected += 1;
      if (inWin(r.createdAt, w.today)) p.today += 1;
      if (inWin(r.approvedAt, w.today)) p.todayApproved += 1;
      if (inWin(r.rejectedAt, w.today)) p.todayRejected += 1;
      if (inWin(r.createdAt, w.week)) p.week += 1;
      if (inWin(r.createdAt, w.month)) p.month += 1;
      if (r.createdAt !== null) {
        for (let i = 0; i < monthStarts.length; i++) {
          if (r.createdAt >= monthStarts[i] && r.createdAt <= monthEnds[i]) {
            a.monthly.listings[i] += 1;
            break;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Windows (reporting calendar timezone, default Asia/Kolkata)
  // ---------------------------------------------------------------------------

  private tz(): string {
    return process.env.CRM_REPORTING_TIMEZONE?.trim() || 'Asia/Kolkata';
  }

  private ymd(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.tz(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  private range(spec: string): { cur: Win; prev: Win } {
    const r = this.reportingService.parseDateRange(spec, 'previous');
    return {
      cur: { start: r.currentStart, end: r.currentEnd },
      prev: { start: r.previousStart, end: r.previousEnd },
    };
  }

  private windows(key: string): Windows {
    const now = new Date();
    const todayYmd = this.ymd(now);
    const [y, m] = todayYmd.split('-').map(Number);
    let spec = key;
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    if (key === 'this_quarter') {
      spec = `${y}-${pad(qStart)}-01,${todayYmd}`;
    } else if (key === 'last_quarter') {
      const prev = qStart - 3;
      const sy = prev < 1 ? y - 1 : y;
      const sm = prev < 1 ? prev + 12 : prev;
      const lastDay = new Date(Date.UTC(sy, sm + 2, 0)).getUTCDate();
      spec = `${sy}-${pad(sm)}-01,${sy}-${pad(sm + 2)}-${pad(lastDay)}`;
    } else if (key === 'last_month') {
      const sy = m === 1 ? y - 1 : y;
      const sm = m === 1 ? 12 : m - 1;
      const lastDay = new Date(Date.UTC(sy, sm, 0)).getUTCDate();
      spec = `${sy}-${pad(sm)}-01,${sy}-${pad(sm)}-${pad(lastDay)}`;
    } else if (key === 'this_year') {
      spec = `${y}-01-01,${todayYmd}`;
    } else if (key === 'all_time') {
      spec = `2000-01-01,${todayYmd}`;
    }
    const period = this.range(spec);
    const { granularity, buckets } = this.trendBuckets(period.cur);
    return {
      key,
      period: period.cur,
      prev: key === 'all_time' ? { start: new Date(0), end: new Date(0) } : period.prev,
      today: this.range('today').cur,
      week: this.range('this_week').cur,
      month: this.range('this_month').cur,
      now,
      months: buckets,
      granularity,
    };
  }

  /**
   * Chart buckets that follow the selected window: daily up to ~5 weeks, weekly up to ~4 months,
   * calendar months beyond (latest 24). Windows shorter than a week show the 7 days ending at
   * the window's last day.
   */
  private trendBuckets(cur: Win): { granularity: Windows['granularity']; buckets: Windows['months'] } {
    const addDays = (ymd: string, n: number) => {
      const [yy, mm, dd] = ymd.split('-').map(Number);
      return new Date(Date.UTC(yy, mm - 1, dd + n)).toISOString().slice(0, 10);
    };
    const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    const label = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
      new Date(`${ymd}T12:00:00Z`).toLocaleString('en-US', { ...opts, timeZone: 'UTC' });
    const mk = (a: string, b: string, text: string) => ({ ...this.range(`${a},${b}`).cur, label: text });

    const endYmd = this.ymd(cur.end);
    let startYmd = this.ymd(cur.start);
    const span = diffDays(startYmd, endYmd) + 1;
    const buckets: Windows['months'] = [];

    if (span <= 35) {
      if (span < 7) startYmd = addDays(endYmd, -6);
      for (let d = startYmd; d <= endYmd; d = addDays(d, 1)) {
        buckets.push(mk(d, d, label(d, { day: 'numeric', month: 'short' })));
      }
      return { granularity: 'day', buckets };
    }
    if (span <= 125) {
      // Monday-based weeks, clipped to the window.
      const dow = (new Date(`${startYmd}T12:00:00Z`).getUTCDay() + 6) % 7;
      for (let ws = addDays(startYmd, -dow); ws <= endYmd; ws = addDays(ws, 7)) {
        const a = ws < startYmd ? startYmd : ws;
        const we = addDays(ws, 6);
        const b = we > endYmd ? endYmd : we;
        buckets.push(mk(a, b, label(a, { day: 'numeric', month: 'short' })));
      }
      return { granularity: 'week', buckets };
    }
    const [ey, em] = endYmd.split('-').map(Number);
    const [sy, sm] = startYmd.split('-').map(Number);
    const first = Math.max((sy - ey) * 12 + (sm - em), -23); // months relative to the end month
    for (let i = first; i <= 0; i++) {
      const dt = new Date(Date.UTC(ey, em - 1 + i, 1));
      const yy = dt.getUTCFullYear();
      const mm = dt.getUTCMonth() + 1;
      const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      const from = `${yy}-${pad(mm)}-01`;
      buckets.push(
        mk(from, `${yy}-${pad(mm)}-${pad(lastDay)}`, label(from, first < -11 ? { month: 'short', year: '2-digit' } : { month: 'short' })),
      );
    }
    return { granularity: 'month', buckets };
  }

  private monthIndexer(w: Windows) {
    // Map a calendar day (y, m, d in the reporting tz) to its trend bucket, or -1.
    return (y: number, m: number, d: number) => {
      const t = Date.UTC(y, m - 1, d, 12);
      return w.months.findIndex((b) => t >= b.start.getTime() && t <= b.end.getTime());
    };
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Lead owner (name / email / id string) → person; unowned leads → creator. */
function leadOwnerKey(dir: Directory, owner: string, createdBy: unknown): string {
  if (owner) {
    const p = dir.byEmail.get(owner) || dir.byName.get(normName(owner)) || dir.byId.get(owner);
    return p ? p.id : NONE;
  }
  const c = createdBy ? dir.byId.get(String(createdBy)) : undefined;
  return c ? c.id : NONE;
}

function emptyAcc(months: number): Acc {
  return {
    leads: {
      total: 0,
      period: 0,
      prev: 0,
      today: 0,
      week: 0,
      month: 0,
      assignedByOthers: 0,
      owned: 0,
      buckets: { New: 0, Contacted: 0, Qualified: 0, Converted: 0, Lost: 0 },
      followTotal: 0,
      followToday: 0,
      followUpcoming: 0,
      followOverdue: 0,
    },
    calls: {
      total: 0,
      period: 0,
      prev: 0,
      today: 0,
      week: 0,
      month: 0,
      connected: 0,
      missed: 0,
      todayConnected: 0,
      incoming: 0,
      outgoing: 0,
      talkSecs: 0,
    },
    wa: {
      total: 0,
      period: 0,
      today: 0,
      week: 0,
      month: 0,
      failed: 0,
      delivered: 0,
      contacts: 0,
      newMessages: 0,
      respSumMins: 0,
      respN: 0,
    },
    props: {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      farms: 0,
      properties: 0,
      period: 0,
      periodApproved: 0,
      periodRejected: 0,
      today: 0,
      todayApproved: 0,
      todayRejected: 0,
      week: 0,
      month: 0,
    },
    subs: {
      total: 0,
      active: 0,
      paid: 0,
      period: 0,
      periodPaid: 0,
      today: 0,
      week: 0,
      month: 0,
      pmTotal: 0,
      pmPeriod: 0,
      pmToday: 0,
      pmMonth: 0,
      pmRevenuePeriod: 0,
    },
    tasks: { open: 0, inProgress: 0, completed: 0, overdue: 0, periodCompleted: 0 },
    monthly: {
      leads: new Array(months).fill(0),
      calls: new Array(months).fill(0),
      listings: new Array(months).fill(0),
    },
  };
}

/** Recursively add numeric fields of `src` into `dst` (same shape). */
function addAcc(dst: any, src: any) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (typeof v === 'number') dst[k] = (dst[k] || 0) + v;
    else if (Array.isArray(v)) v.forEach((n: number, i: number) => (dst[k][i] = (dst[k][i] || 0) + n));
    else if (v && typeof v === 'object') addAcc(dst[k], v);
  }
}

/**
 * Ranking points for the period:
 *   new leads ×10 · connected calls ×5 · listings ×20 · subscriptions ×25 ·
 *   completed tasks ×5 · WhatsApp contacts reached ×2
 */
function scoreOf(a: Acc): number {
  return (
    a.leads.period * 10 +
    a.calls.connected * 5 +
    a.props.period * 20 +
    (a.subs.period + a.subs.pmPeriod) * 25 +
    a.tasks.periodCompleted * 5 +
    a.wa.contacts * 2
  );
}

function classifyLead(status: unknown, converted: boolean, called: boolean): LeadBucket {
  if (converted) return 'Converted';
  const s = String(status ?? '').trim();
  if (s && LOST_RE.test(s)) return 'Lost';
  if (s && CONVERTED_RE.test(s)) return 'Converted';
  if (s && QUALIFIED_RE.test(s)) return 'Qualified';
  if (!s || NEW_STATUS_RE.test(s)) return called ? 'Contacted' : 'New';
  return 'Contacted';
}

/** Status-only lead bucket (shared with the Reports & Analytics service). */
export function classifyStatus(status?: string): LeadBucket {
  return classifyLead(status || 'New', false, false);
}

function normalizeLocalApproval(v: unknown): 'Approved' | 'Pending' | 'Rejected' {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('approv')) return 'Approved';
  if (s.startsWith('reject')) return 'Rejected';
  return 'Pending';
}

function between(field: string, w: Win) {
  return { $and: [{ $gte: [field, w.start] }, { $lte: [field, w.end] }] };
}

function cnt(cond: any) {
  return { $sum: { $cond: [cond, 1, 0] } };
}

function inWin(ms: number | null | undefined, w: Win): boolean {
  return ms !== null && ms !== undefined && ms >= w.start.getTime() && ms <= w.end.getTime();
}

function normalizeWindow(window: string): string {
  const w = String(window || 'this_month').trim().toLowerCase();
  if (
    [
      'today',
      'yesterday',
      'this_week',
      'this_month',
      'last_30_days',
      'last_month',
      'this_quarter',
      'last_quarter',
      'this_year',
      'all_time',
    ].includes(w)
  ) {
    return w;
  }
  if (/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  return 'this_month';
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

/** null = no baseline (previous period was 0 but current isn't) — UI shows "new". */
function pctDelta(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function escapeRe(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lc(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function normName(s: unknown): string {
  return lc(s).replace(/\s+/g, ' ');
}

function last10(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

function fullName(u: any): string {
  return `${u?.firstName || ''} ${u?.lastName || ''}`.replace(/\s+/g, ' ').trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Strip markdown links / html so activity text reads cleanly. */
function plain(s: unknown): string {
  return String(s ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
