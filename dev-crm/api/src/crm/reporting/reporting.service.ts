import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type PipelineStage } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import {
  EmailTemplate,
  EmailTemplateDocument,
} from '../schemas/email-template.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import {
  CrmGlobalSettings,
  CrmGlobalSettingsDocument,
} from '../schemas/crm-global-settings.schema';
import {
  PlatformOpportunity,
  PlatformOpportunityDocument,
} from '../schemas/platform-opportunity.schema';
import {
  WorkflowDelayedJob,
  WorkflowDelayedJobDocument,
} from '../schemas/workflow-delayed-job.schema';
import {
  InboxEmail,
  InboxEmailDocument,
} from '../schemas/inbox-email.schema';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { AppCacheService } from '../../redis/app-cache.service';
import {
  actionVerb,
  crmRecordPath,
  moduleToRelatedType,
  summarizeAuditChanges,
} from '../admin/audit-log.util';
import {
  buildPipelineStageProbabilityMaps,
  resolveDealProbabilityFromStages,
} from '../shared/deal-stage-probability.util';
import {
  dealContractMonths,
  dealContractValue,
  normalizeDealPricingType,
} from '../shared/deal-pricing.util';

const STALE_LEAD_DAYS = 7;

function fillMissingDays(
  data: Array<{ date?: string; _id?: string; count?: number; [key: string]: any }>,
  start: Date,
  end: Date,
  valueKey = 'count',
  timeZone = 'Asia/Kolkata',
) {
  const result: any[] = [];
  const map = new Map(data.map((d) => [d.date || d._id, d[valueKey] || 0]));
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const startYmd = fmt.format(start);
  const endYmd = fmt.format(end);
  let y = Number(startYmd.slice(0, 4));
  let mo = Number(startYmd.slice(5, 7));
  let d = Number(startYmd.slice(8, 10));
  const endY = Number(endYmd.slice(0, 4));
  const endMo = Number(endYmd.slice(5, 7));
  const endD = Number(endYmd.slice(8, 10));
  while (
    y < endY ||
    (y === endY && mo < endMo) ||
    (y === endY && mo === endMo && d <= endD)
  ) {
    const dStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    result.push({
      date: dStr,
      [valueKey]: map.get(dStr) || 0,
    });
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    y = next.getUTCFullYear();
    mo = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return result;
}

type WorkspaceWindow = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_30_days' | string;
const WORKSPACE_SECTIONS = new Set([
  'attention',
  'tasks',
  'deals',
  'activity',
  'leads',
  'lead_status',
  'upcoming_follow_ups',
]);

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  /**
   * Stale follow-up: last non-system activity before the workspace time window began.
   * Aligns the prospecting queue with the header filter (Today / This week / …).
   */
  /** Parse `yyyy-MM-dd` as a local calendar date (avoids UTC off-by-one). */
  private parseWorkspaceDateOnly(value: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return dt;
  }

  /**
   * Calendar used for "leads added by day" / board lead trend charts.
   * Defaults to Asia/Kolkata so admin intake matches India business days on CRM pipelines.
   */
  private reportingCalendarTz(): string {
    const raw = process.env.CRM_REPORTING_TIMEZONE?.trim();
    return raw || 'Asia/Kolkata';
  }

  private formatYmdInTz(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private validateYmd(value: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== mo - 1 ||
      probe.getUTCDate() !== d
    ) {
      return null;
    }
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** Offset of `tz` east of UTC (ms) at the given instant. */
  private tzOffsetMsAt(date: Date, tz: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes): number => {
      const p = parts.find((x) => x.type === type);
      return p ? Number(p.value) : 0;
    };
    let hour = get('hour');
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      hour,
      get('minute'),
      get('second'),
    );
    return asUtc - date.getTime();
  }

  /** Instant for `yyyy-MM-dd` 00:00:00.000 in the reporting calendar timezone. */
  private startOfYmdInTz(ymd: string, tz: string): Date {
    const valid = this.validateYmd(ymd);
    if (!valid) return new Date(NaN);
    const y = Number(valid.slice(0, 4));
    const mo = Number(valid.slice(5, 7));
    const d = Number(valid.slice(8, 10));
    const utcNoon = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    const offset = this.tzOffsetMsAt(utcNoon, tz);
    return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - offset);
  }

  private endOfYmdInTz(ymd: string, tz: string): Date {
    const valid = this.validateYmd(ymd);
    if (!valid) return new Date(NaN);
    const y = Number(valid.slice(0, 4));
    const mo = Number(valid.slice(5, 7));
    const d = Number(valid.slice(8, 10));
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    return new Date(this.startOfYmdInTz(nextYmd, tz).getTime() - 1);
  }

  private addDaysToYmd(ymd: string, deltaDays: number): string {
    const valid = this.validateYmd(ymd);
    if (!valid) return ymd;
    const y = Number(valid.slice(0, 4));
    const mo = Number(valid.slice(5, 7));
    const d = Number(valid.slice(8, 10));
    const next = new Date(Date.UTC(y, mo - 1, d + deltaDays));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  }

  /** Shift a calendar day by N years, clamping Feb 29 → Feb 28 when needed. */
  private shiftYmdByYears(ymd: string, years: number): string {
    const valid = this.validateYmd(ymd);
    if (!valid) return ymd;
    const y = Number(valid.slice(0, 4)) + years;
    const mo = Number(valid.slice(5, 7));
    const d = Number(valid.slice(8, 10));
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const day = Math.min(d, lastDay);
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private formatShortRangeLabel(fromYmd: string, toYmd: string): string {
    const fmt = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
    };
    if (fromYmd === toYmd) return fmt(fromYmd);
    return `${fmt(fromYmd)} – ${fmt(toYmd)}`;
  }

  private weekdayMon0InTz(date: Date, tz: string): number {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    }).format(date);
    const map: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    return map[wd] ?? 0;
  }

  /**
   * Workspace window bounds for lead-intake / leads-added charts.
   * Aligns day filter + `$dateToString` buckets to the same IANA calendar (default Asia/Kolkata).
   */
  private resolveReportingCalendarWindow(window?: string): {
    key: WorkspaceWindow;
    start: Date;
    end: Date;
  } {
    const tz = this.reportingCalendarTz();
    const now = new Date();
    const todayYmd = this.formatYmdInTz(now, tz);

    if (window && window.includes(',')) {
      const [startStr, endStr] = window.split(',', 2);
      const startYmd = this.validateYmd(startStr);
      const endYmd = this.validateYmd(endStr);
      if (startYmd && endYmd) {
        const a = startYmd <= endYmd ? startYmd : endYmd;
        const b = startYmd <= endYmd ? endYmd : startYmd;
        return {
          key: window as WorkspaceWindow,
          start: this.startOfYmdInTz(a, tz),
          end: this.endOfYmdInTz(b, tz),
        };
      }
    }

    const normalized = String(window || 'this_week')
      .trim()
      .toLowerCase() as WorkspaceWindow;
    const key: WorkspaceWindow = (
      ['today', 'yesterday', 'this_week', 'this_month', 'last_30_days'].includes(
        normalized,
      )
        ? normalized
        : 'this_week'
    ) as WorkspaceWindow;

    if (key === 'today') {
      return {
        key,
        start: this.startOfYmdInTz(todayYmd, tz),
        end: this.endOfYmdInTz(todayYmd, tz),
      };
    }
    if (key === 'yesterday') {
      const yYmd = this.addDaysToYmd(todayYmd, -1);
      return {
        key,
        start: this.startOfYmdInTz(yYmd, tz),
        end: this.endOfYmdInTz(yYmd, tz),
      };
    }
    if (key === 'this_month') {
      const monthStart = `${todayYmd.slice(0, 7)}-01`;
      return {
        key,
        start: this.startOfYmdInTz(monthStart, tz),
        end: this.endOfYmdInTz(todayYmd, tz),
      };
    }
    if (key === 'last_30_days') {
      const fromYmd = this.addDaysToYmd(todayYmd, -30);
      return {
        key,
        start: this.startOfYmdInTz(fromYmd, tz),
        end: this.endOfYmdInTz(todayYmd, tz),
      };
    }

    // this_week (Monday start in reporting calendar)
    const mon0 = this.weekdayMon0InTz(now, tz);
    const weekStartYmd = this.addDaysToYmd(todayYmd, -mon0);
    return {
      key,
      start: this.startOfYmdInTz(weekStartYmd, tz),
      end: this.endOfYmdInTz(todayYmd, tz),
    };
  }

  private buildStaleFollowUpMeta(
    windowRange: { key: WorkspaceWindow; start: Date; end: Date },
    now: Date,
  ): { thresholdDays: number; description: string } {
    const ms = Math.max(0, now.getTime() - windowRange.start.getTime());
    const thresholdDays = Math.max(1, Math.ceil(ms / 86400000));
    if (windowRange.key === 'today') {
      return {
        thresholdDays: 1,
        description:
          'Last logged touch was before today — re-engage to match your Today window.',
      };
    }
    return {
      thresholdDays,
      description: `Last touch over ${thresholdDays} day${thresholdDays === 1 ? '' : 's'} ago — no logged activity since before your selected time window began.`,
    };
  }

  /**
   * Workspace / report windows use the reporting calendar (default Asia/Kolkata),
   * not server-local midnight (which is UTC on typical hosts).
   */
  private resolveWorkspaceWindow(window?: string): {
    key: WorkspaceWindow;
    start: Date;
    end: Date;
  } {
    return this.resolveReportingCalendarWindow(window);
  }

  /**
   * Resolve current + compare windows for dashboard/report KPIs.
   * `compare`:
   * - omitted / `previous` — equal-length prior period (default)
   * - `previous_year` — same calendar dates one year earlier
   * - `YYYY-MM-DD,YYYY-MM-DD` — custom compare range
   */
  public parseDateRange(
    period: string | number,
    compare?: string | null,
  ): {
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
    safeDays: number;
    compareMode: 'previous' | 'previous_year' | 'custom';
    compareLabel: string;
    currentFromYmd: string;
    currentToYmd: string;
    compareFromYmd: string;
    compareToYmd: string;
  } {
    const tz = this.reportingCalendarTz();
    const now = new Date();
    const todayYmd = this.formatYmdInTz(now, tz);

    let currentStart: Date;
    let currentEnd: Date;
    let previousStart: Date;
    let previousEnd: Date;
    let safeDays: number;

    // Same calendar keys as GET /crm/workspace `window` (Today / This week / …)
    if (
      typeof period === 'string' &&
      ['today', 'yesterday', 'this_week', 'this_month', 'last_30_days'].includes(
        period.trim().toLowerCase(),
      )
    ) {
      const range = this.resolveReportingCalendarWindow(period.trim().toLowerCase());
      currentStart = range.start;
      currentEnd = range.end;
      const diffMs = Math.max(0, range.end.getTime() - range.start.getTime());
      safeDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) || 1);
      previousStart = new Date(range.start.getTime() - diffMs);
      previousEnd = new Date(range.end.getTime() - diffMs);
    } else if (typeof period === 'string' && period.includes(',')) {
      const [s, e] = period.split(',', 2);
      const startYmd =
        this.validateYmd(String(s || '').trim().slice(0, 10)) ||
        this.validateYmd(this.formatYmdInTz(new Date(s), tz));
      const endYmd =
        this.validateYmd(String(e || '').trim().slice(0, 10)) ||
        this.validateYmd(this.formatYmdInTz(new Date(e), tz));
      if (startYmd && endYmd) {
        const a = startYmd <= endYmd ? startYmd : endYmd;
        const b = startYmd <= endYmd ? endYmd : startYmd;
        currentStart = this.startOfYmdInTz(a, tz);
        currentEnd = this.endOfYmdInTz(b, tz);
        const diffMs = Math.max(0, currentEnd.getTime() - currentStart.getTime());
        safeDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        previousStart = new Date(currentStart.getTime() - diffMs);
        previousEnd = new Date(currentEnd.getTime() - diffMs);
      } else {
        safeDays = 30;
        const fromYmd = this.addDaysToYmd(todayYmd, -safeDays);
        currentStart = this.startOfYmdInTz(fromYmd, tz);
        currentEnd = now;
        const prevFromYmd = this.addDaysToYmd(fromYmd, -safeDays);
        previousStart = this.startOfYmdInTz(prevFromYmd, tz);
        previousEnd = new Date(currentStart.getTime() - 1);
      }
    } else {
      safeDays = Math.min(
        Math.max(
          typeof period === 'number' ? period || 30 : Number(period) || 30,
          1,
        ),
        365,
      );
      const fromYmd = this.addDaysToYmd(todayYmd, -safeDays);
      currentStart = this.startOfYmdInTz(fromYmd, tz);
      currentEnd = now;
      const prevFromYmd = this.addDaysToYmd(fromYmd, -safeDays);
      previousStart = this.startOfYmdInTz(prevFromYmd, tz);
      previousEnd = new Date(currentStart.getTime() - 1);
    }

    const currentFromYmd = this.formatYmdInTz(currentStart, tz);
    const currentToYmd = this.formatYmdInTz(currentEnd, tz);

    let compareMode: 'previous' | 'previous_year' | 'custom' = 'previous';
    let compareLabel = 'vs prior period';
    const compareRaw = String(compare || '')
      .trim()
      .toLowerCase();

    if (compareRaw === 'previous_year' || compareRaw === 'last_year') {
      compareMode = 'previous_year';
      compareLabel = 'vs same period last year';
      const fromYmd = this.shiftYmdByYears(currentFromYmd, -1);
      const toYmd = this.shiftYmdByYears(currentToYmd, -1);
      previousStart = this.startOfYmdInTz(fromYmd, tz);
      previousEnd = this.endOfYmdInTz(toYmd, tz);
    } else if (compareRaw.includes(',')) {
      const [s, e] = compareRaw.split(',', 2);
      const startYmd = this.validateYmd(String(s || '').trim().slice(0, 10));
      const endYmd = this.validateYmd(String(e || '').trim().slice(0, 10));
      if (startYmd && endYmd) {
        compareMode = 'custom';
        const a = startYmd <= endYmd ? startYmd : endYmd;
        const b = startYmd <= endYmd ? endYmd : startYmd;
        previousStart = this.startOfYmdInTz(a, tz);
        previousEnd = this.endOfYmdInTz(b, tz);
        compareLabel = `vs ${this.formatShortRangeLabel(a, b)}`;
      }
    }

    const compareFromYmd = this.formatYmdInTz(previousStart, tz);
    const compareToYmd = this.formatYmdInTz(previousEnd, tz);
    if (compareMode === 'previous') {
      compareLabel = `vs prior period (${this.formatShortRangeLabel(compareFromYmd, compareToYmd)})`;
    } else if (compareMode === 'previous_year') {
      compareLabel = `vs same period last year (${this.formatShortRangeLabel(compareFromYmd, compareToYmd)})`;
    }

    return {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      safeDays,
      compareMode,
      compareLabel,
      currentFromYmd,
      currentToYmd,
      compareFromYmd,
      compareToYmd,
    };
  }

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(EmailTracking.name, 'crmConnection')
    private emailTrackingModel: Model<EmailTrackingDocument>,
    @InjectModel(EmailTemplate.name, 'crmConnection')
    private emailTemplateModel: Model<EmailTemplateDocument>,
    @InjectModel(User.name) private hrmsUserModel: Model<UserDocument>,
    @InjectModel(AuditLog.name, 'crmConnection')
    private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(CrmGlobalSettings.name, 'crmConnection')
    private globalSettingsModel: Model<CrmGlobalSettingsDocument>,
    @InjectModel(PlatformOpportunity.name, 'crmConnection')
    private platformOpportunityModel: Model<PlatformOpportunityDocument>,
    @InjectModel(WorkflowDelayedJob.name, 'crmConnection')
    private delayedJobModel: Model<WorkflowDelayedJobDocument>,
    @InjectModel(InboxEmail.name, 'crmConnection')
    private inboxEmailModel: Model<InboxEmailDocument>,
    @InjectModel(Pipeline.name, 'crmConnection')
    private pipelineModel: Model<PipelineDocument>,
    private readonly appCache: AppCacheService,
  ) {}

  private async getExchangeRate(): Promise<number> {
    const doc = await this.globalSettingsModel.findOne({ key: 'default' }).lean().exec();
    return (doc as any)?.usdToInr ?? 83;
  }

  private toINR(dealValue: number, currency: string, exchangeRate: number): number {
    const cur = (currency || 'USD').toUpperCase();
    if (cur === 'INR') return Math.round(dealValue);
    return Math.round(dealValue * exchangeRate);
  }

  /** Activity.author stores HRMS User ids; owner filter from UI is often "First Last". */
  async resolveHrmsAuthorId(
    owner?: string,
  ): Promise<Types.ObjectId | null> {
    const ids = await this.resolveHrmsAuthorIds(owner);
    return ids[0] ?? null;
  }

  /**
   * All HRMS user ids for an owner label (ObjectId, email, or display name).
   * Includes duplicate accounts that share the same email or exact display name
   * so admin owner filters and employee totals stay aligned.
   */
  async resolveHrmsAuthorIds(
    owner?: string,
  ): Promise<Types.ObjectId[]> {
    if (!owner || owner === 'All') return [];
    const t = owner.trim();
    if (!t) return [];

    type HrmsSeed = {
      _id: Types.ObjectId;
      email?: string;
      firstName?: string;
      lastName?: string;
    };
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let seed: HrmsSeed | null = null;

    if (Types.ObjectId.isValid(t) && t.length === 24) {
      seed = (await this.hrmsUserModel
        .findById(t)
        .select('_id email firstName lastName')
        .lean()
        .exec()) as HrmsSeed | null;
      if (!seed) return [new Types.ObjectId(t)];
    } else if (t.includes('@')) {
      seed = (await this.hrmsUserModel
        .findOne({ email: new RegExp(`^${esc(t)}$`, 'i') })
        .select('_id email firstName lastName')
        .lean()
        .exec()) as HrmsSeed | null;
    } else {
      const parts = t.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        seed = (await this.hrmsUserModel
          .findOne({
            firstName: new RegExp(`^${esc(parts[0])}$`, 'i'),
            lastName: new RegExp(`^${esc(parts.slice(1).join(' '))}$`, 'i'),
          })
          .select('_id email firstName lastName')
          .lean()
          .exec()) as HrmsSeed | null;
      }
      if (!seed && parts.length > 0) {
        seed = (await this.hrmsUserModel
          .findOne({
            firstName: new RegExp(`^${esc(parts[0])}$`, 'i'),
          })
          .select('_id email firstName lastName')
          .lean()
          .exec()) as HrmsSeed | null;
      }
    }

    if (!seed?._id) return [];

    const email = (seed.email || '').trim();
    const name =
      `${(seed.firstName || '').trim()} ${(seed.lastName || '').trim()}`.trim();
    const or: Record<string, unknown>[] = [{ _id: seed._id }];
    if (email) {
      or.push({ email: new RegExp(`^${esc(email)}$`, 'i') });
    }
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        or.push({
          firstName: new RegExp(`^${esc(parts[0])}$`, 'i'),
          lastName: new RegExp(`^${esc(parts.slice(1).join(' '))}$`, 'i'),
        });
      }
    }

    const matches = await this.hrmsUserModel
      .find({ $or: or })
      .select('_id')
      .lean()
      .exec();
    const out: Types.ObjectId[] = [];
    const seen = new Set<string>();
    for (const m of matches) {
      const sid = String(m._id);
      if (seen.has(sid)) continue;
      seen.add(sid);
      out.push(new Types.ObjectId(sid));
    }
    if (out.length === 0) out.push(new Types.ObjectId(String(seed._id)));
    return out;
  }

  /** HRMS email for workspace owner matching (leadOwner/dealOwner often store email). */
  async getHrmsUserEmail(userId: Types.ObjectId): Promise<string | null> {
    const u = await this.hrmsUserModel
      .findById(userId)
      .select('email')
      .lean()
      .exec();
    const row = u as { email?: string } | null;
    const e = row?.email?.trim();
    return e || null;
  }

  /**
   * Open-pipeline deal match for sales workspace.
   * Visibility is enforced by `dealAccessFilter` from crm.service (same rules as GET /crm/deals).
   */
  private buildSalesWorkspaceDealMatch(
    dealOpenStages: { stage: { $nin: string[] } },
    dealAccessFilter?: Record<string, unknown> | null,
  ): Record<string, unknown> {
    if (!dealAccessFilter || Object.keys(dealAccessFilter).length === 0) {
      return { ...dealOpenStages };
    }
    return { $and: [dealOpenStages, dealAccessFilter] };
  }

  /** Merge display name + extras (e.g. email) for leadOwner / dealOwner DB matching. */
  private mergeOwnerMatchStrings(
    primary: string | undefined | null,
    extras?: string[],
  ): string[] {
    const all = [
      primary?.trim(),
      ...(extras || []).map((x) => String(x || '').trim()),
    ].filter((x): x is string => !!x && x !== 'All');
    return [...new Set(all)];
  }

  /** Owner string match for leadOwner / dealOwner fields on CRM records. */
  private stringOwnerFilter(
    field: string,
    owners?: string[] | null,
  ): Record<string, unknown> {
    if (!owners || owners.length === 0) return {};
    if (owners.length === 1) return { [field]: owners[0] };
    return { [field]: { $in: owners } };
  }

  /** "First Last" as stored on leadOwner / dealOwner for workspace filters. */
  async getHrmsDisplayOwnerLabel(
    userId: Types.ObjectId,
  ): Promise<string | null> {
    const u = await this.hrmsUserModel
      .findById(userId)
      .select('firstName lastName email')
      .lean()
      .exec();
    if (!u) return null;
    const row = u as { firstName?: string; lastName?: string; email?: string };
    const n = `${row.firstName || ''} ${row.lastName || ''}`.trim();
    return n || row.email?.trim() || null;
  }

  /**
   * Activity.author stores HRMS User ids (not CRMUser), so we must not populate via CRMUser ref.
   */
  private async hrmsAuthorNameByIds(
    rawIds: Array<unknown>,
  ): Promise<Map<string, string>> {
    const ids: Types.ObjectId[] = [];
    const seen = new Set<string>();
    for (const raw of rawIds) {
      if (raw == null) continue;
      let s: string;
      if (
        typeof raw === 'object' &&
        raw !== null &&
        '_id' in (raw as Record<string, unknown>)
      ) {
        s = String((raw as { _id: unknown })._id);
      } else {
        s = String(raw);
      }
      if (!Types.ObjectId.isValid(s) || s.length !== 24) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      ids.push(new Types.ObjectId(s));
      if (ids.length > 200) break;
    }
    if (!ids.length) return new Map();
    const users = await this.hrmsUserModel
      .find({ _id: { $in: ids } })
      .select('firstName lastName')
      .lean()
      .exec();
    const m = new Map<string, string>();
    for (const u of users as Array<{
      _id: Types.ObjectId;
      firstName?: string;
      lastName?: string;
    }>) {
      const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      m.set(String(u._id), n || 'User');
    }
    return m;
  }

  /**
   * Match author whether stored as ObjectId or hex string (legacy / mixed writes).
   * Without this, the same employee can appear twice in $group-by-author charts.
   */
  private authorIdQueryValue(
    authorId: Types.ObjectId | Types.ObjectId[] | null | undefined,
  ): { $in: Array<Types.ObjectId | string> } | null {
    if (!authorId) return null;
    const ids = Array.isArray(authorId) ? authorId : [authorId];
    const expanded: Array<Types.ObjectId | string> = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      const sid = String(id);
      if (!Types.ObjectId.isValid(sid) || sid.length !== 24) continue;
      if (seen.has(sid)) continue;
      seen.add(sid);
      expanded.push(new Types.ObjectId(sid), sid);
    }
    if (expanded.length === 0) return null;
    return { $in: expanded };
  }

  /** Group human touches by author hex string so ObjectId vs string storage collapses. */
  private engagementByAuthorPipeline(
    match: Record<string, unknown>,
    limit: number,
  ): PipelineStage[] {
    return [
      { $match: match },
      {
        $group: {
          _id: {
            $convert: {
              input: '$author',
              to: 'string',
              onError: '',
              onNull: '',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $nin: ['', null] } } },
      { $sort: { count: -1 as const } },
      { $limit: limit },
    ] as PipelineStage[];
  }

  /**
   * Resolve author agg rows to one row per employee (email, else display name).
   * Collapses duplicate HRMS accounts and residual id-format splits for admin charts.
   */
  private async collapseEngagementByAuthor(
    rows: Array<{ _id: string | Types.ObjectId | null; count: number }>,
  ): Promise<Array<{ authorId: string; name: string; count: number }>> {
    const byAuthorId = new Map<string, number>();
    for (const row of rows) {
      if (row._id == null || row._id === '') continue;
      const id = String(row._id);
      if (!Types.ObjectId.isValid(id) || id.length !== 24) continue;
      byAuthorId.set(id, (byAuthorId.get(id) || 0) + (Number(row.count) || 0));
    }
    if (byAuthorId.size === 0) return [];

    const oids = [...byAuthorId.keys()].map((id) => new Types.ObjectId(id));
    const users = await this.hrmsUserModel
      .find({ _id: { $in: oids } })
      .select('firstName lastName email')
      .lean()
      .exec();

    type Acc = {
      authorId: string;
      name: string;
      count: number;
      emailKey: string;
      nameKey: string;
    };
    const byCanonical = new Map<string, Acc>();

    for (const u of users as Array<{
      _id: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      email?: string;
    }>) {
      const authorId = String(u._id);
      const count = byAuthorId.get(authorId) || 0;
      if (count <= 0) continue;
      byAuthorId.delete(authorId);

      const name =
        `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim() ||
        (u.email || '').trim() ||
        'User';
      const emailKey = (u.email || '').trim().toLowerCase();
      const nameKey = name.toLowerCase().replace(/\s+/g, ' ');
      // Prefer email as identity; fall back to display name for duplicate accounts.
      const canonical = emailKey ? `email:${emailKey}` : `name:${nameKey}`;

      const existing = byCanonical.get(canonical);
      if (existing) {
        existing.count += count;
        if (count > existing.count - count) {
          existing.authorId = authorId;
          existing.name = name;
        }
      } else {
        byCanonical.set(canonical, {
          authorId,
          name,
          count,
          emailKey,
          nameKey,
        });
      }
    }

    // Authors with no HRMS user row still appear (Unknown), merged by id only.
    for (const [authorId, count] of byAuthorId) {
      byCanonical.set(`id:${authorId}`, {
        authorId,
        name: 'Unknown',
        count,
        emailKey: '',
        nameKey: 'unknown',
      });
    }

    // Second pass: merge rows that share the same display name but different emails
    // (duplicate employee accounts created with different mailboxes).
    const byName = new Map<string, Acc>();
    for (const row of byCanonical.values()) {
      if (row.nameKey === 'unknown' || !row.nameKey) {
        byName.set(`id:${row.authorId}`, row);
        continue;
      }
      const existing = byName.get(row.nameKey);
      if (existing) {
        existing.count += row.count;
        if (row.count > existing.count - row.count) {
          existing.authorId = row.authorId;
          existing.name = row.name;
          if (row.emailKey) existing.emailKey = row.emailKey;
        }
      } else {
        byName.set(row.nameKey, { ...row });
      }
    }

    return [...byName.values()]
      .map(({ authorId, name, count }) => ({ authorId, name, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * All leadOwner / dealOwner label strings for a report owner filter
   * (display name + emails across duplicate HRMS accounts).
   */
  private async resolveOwnerFieldLabels(owner?: string): Promise<string[]> {
    if (!owner || owner === 'All' || owner === 'All authorized') return [];
    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const extras: string[] = [];
    for (const id of authorIds.slice(0, 12)) {
      const [email, label] = await Promise.all([
        this.getHrmsUserEmail(id),
        this.getHrmsDisplayOwnerLabel(id),
      ]);
      if (email) extras.push(email);
      if (label) extras.push(label);
    }
    return this.mergeOwnerMatchStrings(owner, extras);
  }

  /** Match CRM ownership fields (leadOwner / dealOwner) to name + email aliases. */
  private async ownerFieldFilter(
    owner: string | undefined,
    field: 'leadOwner' | 'dealOwner',
  ): Promise<Record<string, unknown>> {
    if (!owner || owner === 'All' || owner === 'All authorized') return {};
    const labels = await this.resolveOwnerFieldLabels(owner);
    if (!labels.length) return { [field]: owner };
    return this.stringOwnerFilter(field, labels);
  }

  /**
   * Collapse "Jane Doe" + "jane@co.com" (and duplicate account labels) into one owner bar.
   */
  private async collapseOwnerCountRows(
    rows: Array<{ owner: string; count: number }>,
  ): Promise<Array<{ owner: string; count: number }>> {
    if (!rows.length) return [];
    const users = await this.hrmsUserModel
      .find({})
      .select('firstName lastName email')
      .limit(2000)
      .lean()
      .exec();
    const emailToName = new Map<string, string>();
    const nameKeyToName = new Map<string, string>();
    for (const u of users as Array<{
      firstName?: string;
      lastName?: string;
      email?: string;
    }>) {
      const display =
        `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim() ||
        (u.email || '').trim() ||
        'User';
      const nameKey = display.toLowerCase().replace(/\s+/g, ' ');
      nameKeyToName.set(nameKey, display);
      const email = (u.email || '').trim().toLowerCase();
      if (email) emailToName.set(email, display);
    }

    const merged = new Map<string, { owner: string; count: number }>();
    for (const row of rows) {
      const raw = String(row.owner || '').trim() || 'Unassigned';
      let display = raw;
      const lower = raw.toLowerCase();
      if (raw.includes('@') && emailToName.has(lower)) {
        display = emailToName.get(lower)!;
      } else if (nameKeyToName.has(lower.replace(/\s+/g, ' '))) {
        display = nameKeyToName.get(lower.replace(/\s+/g, ' '))!;
      }
      const key = display.toLowerCase().replace(/\s+/g, ' ');
      const cur = merged.get(key) || { owner: display, count: 0 };
      cur.count += Number(row.count) || 0;
      if (cur.owner.includes('@') && !display.includes('@')) {
        cur.owner = display;
      }
      merged.set(key, cur);
    }
    return [...merged.values()].sort((a, b) => b.count - a.count);
  }

  /** Merge email/name owner aliases inside day × platform × employee detail rows. */
  private async collapseDailyDetailRows(
    rows: Array<{ date: string; platform: string; owner: string; count: number }>,
  ): Promise<Array<{ date: string; platform: string; owner: string; count: number }>> {
    if (!rows.length) return [];
    const users = await this.hrmsUserModel
      .find({})
      .select('firstName lastName email')
      .limit(2000)
      .lean()
      .exec();
    const emailToName = new Map<string, string>();
    const nameKeyToName = new Map<string, string>();
    for (const u of users as Array<{
      firstName?: string;
      lastName?: string;
      email?: string;
    }>) {
      const display =
        `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim() ||
        (u.email || '').trim() ||
        'User';
      const nameKey = display.toLowerCase().replace(/\s+/g, ' ');
      nameKeyToName.set(nameKey, display);
      const email = (u.email || '').trim().toLowerCase();
      if (email) emailToName.set(email, display);
    }

    const merged = new Map<
      string,
      { date: string; platform: string; owner: string; count: number }
    >();
    for (const row of rows) {
      const raw = String(row.owner || '').trim() || 'Unassigned';
      let display = raw;
      const lower = raw.toLowerCase();
      if (raw.includes('@') && emailToName.has(lower)) {
        display = emailToName.get(lower)!;
      } else if (nameKeyToName.has(lower.replace(/\s+/g, ' '))) {
        display = nameKeyToName.get(lower.replace(/\s+/g, ' '))!;
      }
      const platform = String(row.platform || 'Unknown').trim() || 'Unknown';
      const date = String(row.date || '');
      const key = `${date}|${platform.toLowerCase()}|${display.toLowerCase().replace(/\s+/g, ' ')}`;
      const cur = merged.get(key) || {
        date,
        platform,
        owner: display,
        count: 0,
      };
      cur.count += Number(row.count) || 0;
      if (cur.owner.includes('@') && !display.includes('@')) {
        cur.owner = display;
      }
      merged.set(key, cur);
    }
    return [...merged.values()].sort((a, b) => {
      if (a.date === b.date) return b.count - a.count;
      return a.date < b.date ? 1 : -1;
    });
  }

  async getDashboardData(
    days: string | number = 30,
    owner?: string,
    customFilters: any[] = [],
    compare?: string,
  ): Promise<any> {
    const ownerKey = owner && owner !== 'All' ? String(owner) : 'all';
    // Stringify customFilters to use in cacheKey so that different filters don't collide
    const filtersKey = customFilters.length > 0 ? Buffer.from(JSON.stringify(customFilters)).toString('base64').substring(0, 32) : 'none';
    const compareKey = String(compare || 'previous').trim() || 'previous';
    const cacheKey = `crm:reporting:dashboard:v6:${days}:${compareKey}:${ownerKey}:${filtersKey}`;
    return this.appCache.getOrSet(
      cacheKey,
      this.appCache.crmReportingTtl(),
      () => this.computeDashboardData(days, owner, customFilters, compare),
    );
  }

  private async computeDashboardData(
    days: string | number,
    owner?: string,
    customFilters: any[] = [],
    compare?: string,
  ): Promise<any> {
    const {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      safeDays,
      compareMode,
      compareLabel,
      currentFromYmd,
      currentToYmd,
      compareFromYmd,
      compareToYmd,
    } = this.parseDateRange(days, compare);
    const now = new Date();
    const [leadOwnerFilter, dealOwnerFilter, authorIdsForDash] = await Promise.all([
      this.ownerFieldFilter(owner, 'leadOwner'),
      this.ownerFieldFilter(owner, 'dealOwner'),
      this.resolveHrmsAuthorIds(owner),
    ]);
    const authorMatchForDash = this.authorIdQueryValue(
      authorIdsForDash.length ? authorIdsForDash : null,
    );

    const currentFilter: any = { createdAt: { $gte: currentStart, $lt: currentEnd } };
    const previousFilter: any = {
      createdAt: { $gte: previousStart, $lt: previousEnd },
    };

    const buildFilter = (baseFilter: any, ownerField?: string) => {
      const f = { ...baseFilter };
      if (owner && owner !== 'All' && ownerField) {
        if (ownerField === 'author') {
          if (authorMatchForDash != null) f[ownerField] = authorMatchForDash;
        } else if (ownerField === 'leadOwner') {
          Object.assign(f, leadOwnerFilter);
        } else if (ownerField === 'dealOwner') {
          Object.assign(f, dealOwnerFilter);
        } else {
          f[ownerField] = owner;
        }
      }
      
      if (customFilters && customFilters.length > 0) {
        const ands = [];
        for (const crit of customFilters.slice(0, 20)) {
          if (!crit.property || !crit.operator) continue;
          const prop = String(crit.property);
          if (
            !prop ||
            prop.startsWith('$') ||
            prop.includes('\0') ||
            prop.length > 120
          ) {
            continue;
          }
          let cond: any = {};
          const val = crit.value;
          switch (crit.operator) {
            case 'equals': cond[prop] = val; break;
            case 'not_equals': cond[prop] = { $ne: val }; break;
            case 'contains': cond[prop] = { $regex: String(val).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; break;
            case 'does_not_contain': cond[prop] = { $not: { $regex: String(val).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }; break;
            case 'is_empty': cond[prop] = { $in: [null, ''] }; break;
            case 'is_not_empty': cond[prop] = { $nin: [null, ''] }; break;
            case 'greater_than': cond[prop] = { $gt: Number(val) }; break;
            case 'less_than': cond[prop] = { $lt: Number(val) }; break;
            case 'is_any_of': cond[prop] = { $in: Array.isArray(val) ? val.slice(0, 100) : String(val).split(',').map(s => s.trim()).slice(0, 100) }; break;
            case 'is_none_of': cond[prop] = { $nin: Array.isArray(val) ? val.slice(0, 100) : String(val).split(',').map(s => s.trim()).slice(0, 100) }; break;
            case 'is_checked': cond[prop] = true; break;
            case 'is_not_checked': cond[prop] = { $ne: true }; break;
          }
          if (Object.keys(cond).length > 0) ands.push(cond);
        }
        if (ands.length > 0) {
          f.$and = f.$and ? [...f.$and, ...ands] : ands;
        }
      }
      return f;
    };

    const dealSelect = 'dealValue probability stage createdAt closedDate';
    const [
      currentDeals,
      previousDeals,
      currentLeads,
      previousLeads,
      allClosedDeals,
      currentLeadStats,
      previousLeadStats,
    ] = await Promise.all([
      this.dealModel
        .find(buildFilter(currentFilter, 'dealOwner'))
        .select(dealSelect)
        .lean()
        .exec(),
      this.dealModel
        .find(buildFilter(previousFilter, 'dealOwner'))
        .select(dealSelect)
        .lean()
        .exec(),
      this.leadModel.countDocuments(buildFilter(currentFilter, 'leadOwner')),
      this.leadModel.countDocuments(buildFilter(previousFilter, 'leadOwner')),
      this.dealModel
        .find(
          buildFilter(
            {
              ...currentFilter,
              stage: { $regex: /won|lost|rejected|withdrawn/i },
            },
            'dealOwner',
          ),
        )
        .select(dealSelect)
        .lean()
        .exec(),
      this.getLeadConversion(owner, currentStart),
      this.getLeadConversion(owner, previousStart, currentStart),
    ]);

    // 1. Gross & Weighted Pipeline
    const currentGrossRevenue = currentDeals.reduce(
      (sum, d) => sum + (d.dealValue || 0),
      0,
    );
    const currentWeightedRevenue = currentDeals.reduce(
      (sum, d) => sum + (d.dealValue || 0) * ((d.probability || 0) / 100),
      0,
    );
    const previousGrossRevenue = previousDeals.reduce(
      (sum, d) => sum + (d.dealValue || 0),
      0,
    );

    // 2. Win Ratio (Professional CRM logic: Won / Total Closed)
    const wonDeals = allClosedDeals.filter((d) =>
      this.isClosedWonStage(d.stage),
    );
    const lostDeals = allClosedDeals.filter((d) =>
      this.isClosedLostStage(d.stage),
    );
    const winRatio =
      allClosedDeals.length > 0
        ? (wonDeals.length / allClosedDeals.length) * 100
        : 0;

    // Previous win ratio for delta (comparison period closed deals)
    const prevClosedDealsList = await this.dealModel
      .find(
        buildFilter(
          {
            ...previousFilter,
            stage: { $regex: /won|lost|rejected|withdrawn/i },
          },
          'dealOwner',
        ),
      )
      .select(dealSelect)
      .lean()
      .exec();
    const prevClosedDeals = prevClosedDealsList.length;
    const prevWonDealsList = prevClosedDealsList.filter((d) =>
      this.isClosedWonStage(d.stage),
    );
    const prevLostDealsList = prevClosedDealsList.filter((d) =>
      this.isClosedLostStage(d.stage),
    );
    const prevWonDeals = prevWonDealsList.length;
    const prevWinRatio =
      prevClosedDeals > 0 ? (prevWonDeals / prevClosedDeals) * 100 : 0;

    // MTD / YTD closed-won revenue (calendar periods, not the selected window)
    const tz = this.reportingCalendarTz();
    const todayYmd = this.formatYmdInTz(now, tz);
    const [yStr, mStr] = todayYmd.split('-');
    const mtdStart = this.startOfYmdInTz(`${yStr}-${mStr}-01`, tz);
    const ytdStart = this.startOfYmdInTz(`${yStr}-01-01`, tz);
    const prevMtdEnd = new Date(mtdStart.getTime() - 1);
    const prevMonthDate = new Date(Date.UTC(Number(yStr), Number(mStr) - 2, 1));
    const prevMtdStart = this.startOfYmdInTz(
      this.formatYmdInTz(prevMonthDate, tz),
      tz,
    );
    const prevYtdStart = this.startOfYmdInTz(`${Number(yStr) - 1}-01-01`, tz);
    const prevYtdEnd = this.endOfYmdInTz(`${Number(yStr) - 1}-12-31`, tz);

    const sumClosedWonValue = async (start: Date, end: Date) => {
      const rows = await this.dealModel
        .find(
          buildFilter(
            {
              $or: [
                { closedDate: { $gte: start, $lte: end } },
                {
                  closedDate: null,
                  updatedAt: { $gte: start, $lte: end },
                },
              ],
            },
            'dealOwner',
          ),
        )
        .select('dealValue stage closedDate updatedAt')
        .lean()
        .exec();
      return rows
        .filter((d) => this.isClosedWonStage(d.stage))
        .reduce((s, d) => s + (Number(d.dealValue) || 0), 0);
    };

    const [mtdRevenue, ytdRevenue, prevMtdRevenue, prevYtdRevenue] =
      await Promise.all([
        sumClosedWonValue(mtdStart, now),
        sumClosedWonValue(ytdStart, now),
        sumClosedWonValue(prevMtdStart, prevMtdEnd),
        sumClosedWonValue(prevYtdStart, prevYtdEnd),
      ]);

    // 3. Average Sales Cycle (Days from creation to Won)
    const salesCycleDays =
      wonDeals.length > 0
        ? wonDeals.reduce((sum, d) => {
            const created = new Date(d.createdAt);
            const closed = d.closedDate ? new Date(d.closedDate) : new Date();
            return (
              sum +
              (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
            );
          }, 0) / wonDeals.length
        : 0;

    const calculateMomentum = async (
      currentTotal: number,
      previousTotal: number,
      model: Model<any>,
      filter: any,
      ownerField: string,
    ) => {
      // Case 1: Standard delta if previous data exists
      if (previousTotal > 0) {
        return Math.round(
          ((currentTotal - previousTotal) / previousTotal) * 100,
        );
      }

      // Case 2: Momentum Tracking (Cold Start)
      // Split current period in half and compare H1 (recent) vs H2 (earlier)
      const halfDays = Math.floor(safeDays / 2);
      const midPoint = new Date();
      midPoint.setDate(now.getDate() - halfDays);

      const h1Filter = buildFilter(
        { createdAt: { $gte: midPoint } },
        ownerField,
      );
      const h2Filter = buildFilter(
        { createdAt: { $gte: currentStart, $lt: midPoint } },
        ownerField,
      );

      const [h1Count, h2Count] = await Promise.all([
        model.countDocuments(h1Filter),
        model.countDocuments(h2Filter),
      ]);

      if (h2Count === 0) return h1Count > 0 ? 100 : 0;
      return Math.round(((h1Count - h2Count) / h2Count) * 100);
    };

    // 4. Momentum & Leads
    const lvr = await calculateMomentum(
      currentLeads,
      previousLeads,
      this.leadModel,
      currentFilter,
      'leadOwner',
    );
    const revenueMomentum = await calculateMomentum(
      currentGrossRevenue,
      previousGrossRevenue,
      this.dealModel,
      currentFilter,
      'dealOwner',
    );

    // Funnel calculation from real data
    const funnelStages = [
      { label: 'Leads', val: currentLeads, w: 'full' },
      {
        label: 'Qualified',
        val: await this.leadModel.countDocuments(
          buildFilter({ ...currentFilter, stage: { $ne: 'New' } }, 'leadOwner'),
        ),
        w: 'w-4/5',
      },
      {
        label: 'Negotiations',
        val: currentDeals.filter((d) =>
          ['Negotiation', 'Proposal'].includes(d.stage),
        ).length,
        w: 'w-2/3',
      },
      { label: 'Won', val: wonDeals.length, w: 'w-1/2' },
    ];

    const efficiency =
      currentLeads > 0 ? (wonDeals.length / currentLeads) * 100 : 0;

    // Helper for basic percentage delta
    const calculateDelta = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      periodMeta: {
        currentFrom: currentFromYmd,
        currentTo: currentToYmd,
        compareFrom: compareFromYmd,
        compareTo: compareToYmd,
        compareMode,
        compareLabel,
        currentLabel: this.formatShortRangeLabel(currentFromYmd, currentToYmd),
        days: safeDays,
      },
      stats: [
        {
          name: 'total_leads',
          value: currentLeads,
          delta: lvr,
          deltaSuffix: '%',
          title: 'Lead Velocity',
        },
        {
          name: 'total_revenue',
          value: `$${currentWeightedRevenue.toLocaleString()}`,
          delta: revenueMomentum,
          deltaSuffix: '%',
          title: 'Gross Pipeline',
        },
        {
          name: 'win_ratio',
          value: `${winRatio.toFixed(1)}%`,
          delta: calculateDelta(winRatio, prevWinRatio),
          deltaSuffix: '%',
          title: 'Win Ratio',
        },
        {
          name: 'sales_cycle',
          value: `${Math.round(salesCycleDays)} Days`,
          delta: 0,
          deltaSuffix: '',
          title: 'Active Cycle',
        },
      ],
      funnel: funnelStages,
      summary: {
        efficiency: efficiency.toFixed(1) + '%',
      },
      outcomes: {
        won: wonDeals.length,
        lost: lostDeals.length,
        wonValue: wonDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0),
        lostValue: lostDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0),
        wonDelta: calculateDelta(wonDeals.length, prevWonDeals),
        lostDelta: calculateDelta(
          lostDeals.length,
          prevLostDealsList.length,
        ),
        vsLastMonth:
          prevWonDeals + prevLostDealsList.length > 0
            ? calculateDelta(
                wonDeals.length + lostDeals.length,
                prevWonDeals + prevLostDealsList.length,
              )
            : wonDeals.length > 0
              ? 100
              : 0,
      },
      revenuePeriods: {
        mtd: mtdRevenue,
        ytd: ytdRevenue,
        mtdDelta: calculateDelta(mtdRevenue, prevMtdRevenue),
        ytdDelta: calculateDelta(ytdRevenue, prevYtdRevenue),
        weightedPipeline: currentWeightedRevenue,
        grossPipeline: currentGrossRevenue,
        avgDealSize:
          currentDeals.length > 0
            ? currentGrossRevenue / currentDeals.length
            : 0,
        avgDealSizeDelta: calculateDelta(
          currentDeals.length > 0
            ? currentGrossRevenue / currentDeals.length
            : 0,
          previousDeals.length > 0
            ? previousGrossRevenue / previousDeals.length
            : 0,
        ),
      },
      charts: {
        salesTrend: await this.getSalesTrend(safeDays, owner),
        revenueForecast: await this.getRevenueForecast(owner),
        dealsByStage: await this.getDealsByStage(owner),
        activityTrends: await this.getActivityTrends(owner),
        leadsByStatus: await this.getLeadsByStatus(owner),
      },
    };
  }

  private async getLeadsByStatus(owner?: string) {
    const filter: any = {};
    if (owner && owner !== 'All') filter.leadOwner = owner;

    const data = await this.leadModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          value: { $sum: 1 },
        },
      },
    ]);
    return data.map((d) => ({ name: d._id || 'New', value: d.value }));
  }

  private async getSalesTrend(days: number, owner?: string) {
    const tz = this.reportingCalendarTz();
    const todayYmd = this.formatYmdInTz(new Date(), tz);
    const fromYmd = this.addDaysToYmd(todayYmd, -(days || 30));
    const start = this.startOfYmdInTz(fromYmd, tz);
    const ownerFilter = await this.ownerFieldFilter(owner, 'dealOwner');
    const filter: Record<string, unknown> = {
      createdAt: { $gte: start },
      ...ownerFilter,
    };

    const data = await this.dealModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: tz,
            },
          },
          revenue: { $sum: '$dealValue' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return data.map((d) => ({
      name: d._id,
      revenue: d.revenue,
      leads: d.count,
    }));
  }

  private async getRevenueForecast(owner?: string) {
    const filter: Record<string, unknown> = {
      stage: { $nin: ['Closed Won', 'Closed Lost'] },
    };
    if (owner && owner !== 'All') filter.dealOwner = owner;

    const deals = await this.dealModel
      .find(filter)
      .select('dealValue probability expectedClosureDate stage pipeline')
      .lean()
      .exec();

    const pipelineIds = [
      ...new Set(
        deals
          .map((d) =>
            (d as { pipeline?: Types.ObjectId }).pipeline
              ? String((d as { pipeline: Types.ObjectId }).pipeline)
              : '',
          )
          .filter(Boolean),
      ),
    ];
    const pipelines = pipelineIds.length
      ? await this.pipelineModel
          .find({ _id: { $in: pipelineIds.map((id) => new Types.ObjectId(id)) } })
          .select('stages')
          .lean()
          .exec()
      : await this.pipelineModel
          .find({ type: 'deals' })
          .select('stages')
          .lean()
          .exec();
    const stageMaps = buildPipelineStageProbabilityMaps(pipelines as any[]);

    const monthTotals = new Map<number, number>();
    for (const raw of deals) {
      const close = (raw as { expectedClosureDate?: Date }).expectedClosureDate;
      if (!close) continue;
      const month = new Date(close).getUTCMonth() + 1;
      const probability = resolveDealProbabilityFromStages(
        {
          pipeline: (raw as { pipeline?: Types.ObjectId }).pipeline,
          stage: (raw as { stage?: string }).stage,
          probability: (raw as { probability?: number }).probability,
        },
        stageMaps,
      );
      const weighted =
        (Number((raw as { dealValue?: number }).dealValue) || 0) *
        (probability / 100);
      monthTotals.set(month, (monthTotals.get(month) || 0) + weighted);
    }

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return [...monthTotals.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 6)
      .map(([month, value]) => ({
        name: months[month - 1] || 'Unknown',
        value: Math.round(value),
      }));
  }

  async getRevenueForecastReport(options: {
    owner?: string;
    pipelineId?: string;
    months?: number;
  }) {
    const monthCount = Math.min(Math.max(Number(options.months) || 6, 3), 12);
    const ownerKey =
      options.owner && options.owner !== 'All' ? String(options.owner) : 'all';
    const pipelineKey =
      options.pipelineId && options.pipelineId !== 'all'
        ? String(options.pipelineId)
        : 'all';
    const cacheKey = `crm:reporting:revenue-forecast:v6:${ownerKey}:${pipelineKey}:${monthCount}`;
    return this.appCache.getOrSet(
      cacheKey,
      this.appCache.crmReportingTtl(),
      () => this.computeRevenueForecastReport(options, monthCount),
    );
  }

  private businessMonthParts(date: Date = new Date()): {
    year: number;
    month: number;
  } {
    const s = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return { year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)) };
  }

  private monthKey(date: Date): string {
    const { year, month } = this.businessMonthParts(date);
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private monthLabel(key: string): string {
    const [y, m] = key.split('-').map(Number);
    if (!y || !m) return key;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private buildForecastMonthKeys(monthCount: number): string[] {
    const { year, month } = this.businessMonthParts();
    const keys: string[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(Date.UTC(year, month - 1 + i, 1));
      keys.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
    return keys;
  }

  /** Past months (including current) for Closed Won generated revenue. */
  private buildGeneratedMonthKeys(monthCount: number): string[] {
    const { year, month } = this.businessMonthParts();
    const keys: string[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(year, month - 1 - i, 1));
      keys.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
    return keys;
  }

  private isClosedWonStage(stage?: string): boolean {
    const s = String(stage || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    return (
      s === 'closed won' ||
      s === 'won' ||
      s === 'hired / won' ||
      s.includes('closed won')
    );
  }

  private isClosedLostStage(stage?: string): boolean {
    const s = String(stage || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    return (
      s === 'closed lost' ||
      s === 'lost' ||
      s === 'rejected' ||
      s === 'withdrawn' ||
      s.includes('closed lost')
    );
  }

  private dealCloseDate(raw: {
    closedDate?: Date;
    expectedClosureDate?: Date;
    updatedAt?: Date;
  }): Date | null {
    const d = raw.closedDate || raw.expectedClosureDate || raw.updatedAt;
    if (!d) return null;
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Workspace passes user ObjectIds; dealOwner stores "First Last" / email. */
  private async resolveDealOwnerFilter(
    owner?: string,
  ): Promise<Record<string, unknown>> {
    if (!owner || owner === 'All' || owner === 'All authorized') return {};
    const authorId = await this.resolveHrmsAuthorId(owner);
    const isOid = Types.ObjectId.isValid(owner) && owner.length === 24;
    const labels = this.mergeOwnerMatchStrings(
      isOid ? null : owner,
      [
        authorId
          ? ((await this.getHrmsDisplayOwnerLabel(authorId)) ?? undefined)
          : undefined,
        authorId
          ? ((await this.getHrmsUserEmail(authorId)) ?? undefined)
          : undefined,
      ].filter(Boolean) as string[],
    ).filter((l) => !(Types.ObjectId.isValid(l) && l.length === 24));
    if (!labels.length) {
      // Last resort: leave unfiltered rather than matching a raw ObjectId that never hits.
      return {};
    }
    return this.stringOwnerFilter('dealOwner', labels);
  }

  private async computeRevenueForecastReport(
    options: { owner?: string; pipelineId?: string },
    monthCount: number,
  ) {
    const exchangeRate = await this.getExchangeRate();
    const ownerFilter = await this.resolveDealOwnerFilter(options.owner);
    const baseFilter: Record<string, unknown> = { ...ownerFilter };
    if (
      options.pipelineId &&
      options.pipelineId !== 'all' &&
      Types.ObjectId.isValid(options.pipelineId)
    ) {
      baseFilter.pipeline = new Types.ObjectId(options.pipelineId);
    }

    // Load all non-lost deals, then classify open vs won in memory (stage names vary).
    const deals = await this.dealModel
      .find({
        ...baseFilter,
        stage: { $nin: ['Closed Lost', 'Lost'] },
      })
      .select(
        'title organization stage dealValue currency probability expectedClosureDate closedDate updatedAt dealOwner pipeline pricingType contractMonths',
      )
      .lean()
      .exec();

    const openDeals = deals.filter(
      (d) =>
        !this.isClosedWonStage((d as { stage?: string }).stage) &&
        !this.isClosedLostStage((d as { stage?: string }).stage),
    );
    const wonDeals = deals.filter((d) =>
      this.isClosedWonStage((d as { stage?: string }).stage),
    );

    // Always load deal pipelines so stage probabilities resolve even for sparse pipeline refs.
    const pipelines = await this.pipelineModel
      .find({ type: 'deals' })
      .select('stages')
      .lean()
      .exec();
    const stageMaps = buildPipelineStageProbabilityMaps(pipelines as any[]);

    const forecastKeys = this.buildForecastMonthKeys(monthCount);
    const generatedKeys = this.buildGeneratedMonthKeys(monthCount);
    const monthKeys = [...new Set([...generatedKeys, ...forecastKeys])].sort();
    const forecastSet = new Set(forecastKeys);
    const generatedSet = new Set(generatedKeys);
    const currentMonthKey = forecastKeys[0] || this.monthKey(new Date());

    type ForecastDeal = {
      _id: string;
      title: string;
      organization?: string;
      stage: string;
      dealValue: number;
      dealValueINR: number;
      contractValueINR: number;
      pricingType: 'fixed' | 'monthly';
      contractMonths: number;
      probability: number;
      weightedINR: number;
      expectedClosureDate: string | null;
      closedDate?: string | null;
      dealOwner: string;
      pipeline?: string;
    };

    const buckets = new Map<
      string,
      {
        gross: number;
        weighted: number;
        generated: number;
        deals: ForecastDeal[];
        generatedDeals: ForecastDeal[];
      }
    >();
    for (const key of monthKeys) {
      buckets.set(key, {
        gross: 0,
        weighted: 0,
        generated: 0,
        deals: [],
        generatedDeals: [],
      });
    }
    const unscheduled: ForecastDeal[] = [];

    let grossTotal = 0;
    let weightedTotal = 0;
    let generatedTotal = 0;
    let generatedDealCount = 0;
    let generatedThisMonth = 0;
    let monthlyMrrWeighted = 0;

    for (const raw of openDeals) {
      const pricingType = normalizeDealPricingType(
        (raw as { pricingType?: string }).pricingType,
      );
      const months = dealContractMonths({
        pricingType,
        contractMonths: (raw as { contractMonths?: number }).contractMonths,
      });
      const dealValue = Number((raw as { dealValue?: number }).dealValue) || 0;
      const probability = resolveDealProbabilityFromStages(
        {
          pipeline: (raw as { pipeline?: Types.ObjectId }).pipeline,
          stage: (raw as { stage?: string }).stage,
          probability: (raw as { probability?: number }).probability,
        },
        stageMaps,
      );
      const currency = String((raw as { currency?: string }).currency || 'USD');
      const monthlyINR = this.toINR(dealValue, currency, exchangeRate);
      const contractValueINR = this.toINR(
        dealContractValue({
          dealValue,
          pricingType,
          contractMonths: months,
        }),
        currency,
        exchangeRate,
      );
      const weightedINR = Math.round(contractValueINR * (probability / 100));
      grossTotal += contractValueINR;
      weightedTotal += weightedINR;
      if (pricingType === 'monthly') {
        monthlyMrrWeighted += Math.round(monthlyINR * (probability / 100));
      }

      const expectedClosureDate = (raw as { expectedClosureDate?: Date })
        .expectedClosureDate
        ? new Date(
            (raw as { expectedClosureDate: Date }).expectedClosureDate,
          ).toISOString()
        : null;

      const row: ForecastDeal = {
        _id: String((raw as { _id: Types.ObjectId })._id),
        title: String((raw as { title?: string }).title || 'Untitled'),
        organization: (raw as { organization?: string }).organization,
        stage: String((raw as { stage?: string }).stage || ''),
        dealValue,
        dealValueINR: monthlyINR,
        contractValueINR,
        pricingType,
        contractMonths: months,
        probability,
        weightedINR,
        expectedClosureDate,
        dealOwner: String((raw as { dealOwner?: string }).dealOwner || ''),
        pipeline: (raw as { pipeline?: Types.ObjectId }).pipeline
          ? String((raw as { pipeline: Types.ObjectId }).pipeline)
          : undefined,
      };

      const close = (raw as { expectedClosureDate?: Date }).expectedClosureDate;
      if (!close) {
        unscheduled.push(row);
        continue;
      }
      let startKey = this.monthKey(new Date(close));
      // Overdue open deals still count from the current month (CRM standard).
      if (!forecastSet.has(startKey)) {
        if (startKey < currentMonthKey && forecastSet.has(currentMonthKey)) {
          startKey = currentMonthKey;
        } else if (startKey > [...forecastSet].slice(-1)[0]) {
          unscheduled.push(row);
          continue;
        } else if (!forecastSet.has(startKey)) {
          unscheduled.push(row);
          continue;
        }
      }

      if (pricingType === 'monthly') {
        // Spread monthly amount across engagement months that fall in the forecast window.
        const [sy, sm] = startKey.split('-').map(Number);
        let placed = false;
        for (let i = 0; i < months; i++) {
          const d = new Date(Date.UTC(sy, sm - 1 + i, 1));
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (!forecastSet.has(key)) continue;
          const bucket = buckets.get(key)!;
          bucket.gross += monthlyINR;
          bucket.weighted += Math.round(monthlyINR * (probability / 100));
          if (!placed) {
            bucket.deals.push(row);
            placed = true;
          }
        }
        if (!placed) unscheduled.push(row);
      } else {
        const bucket = buckets.get(startKey)!;
        bucket.gross += contractValueINR;
        bucket.weighted += weightedINR;
        bucket.deals.push(row);
      }
    }

    for (const raw of wonDeals) {
      const pricingType = normalizeDealPricingType(
        (raw as { pricingType?: string }).pricingType,
      );
      const months = dealContractMonths({
        pricingType,
        contractMonths: (raw as { contractMonths?: number }).contractMonths,
      });
      const dealValue = Number((raw as { dealValue?: number }).dealValue) || 0;
      const currency = String((raw as { currency?: string }).currency || 'USD');
      const monthlyINR = this.toINR(dealValue, currency, exchangeRate);
      const contractValueINR = this.toINR(
        dealContractValue({
          dealValue,
          pricingType,
          contractMonths: months,
        }),
        currency,
        exchangeRate,
      );
      const close = this.dealCloseDate(
        raw as {
          closedDate?: Date;
          expectedClosureDate?: Date;
          updatedAt?: Date;
        },
      );
      const row: ForecastDeal = {
        _id: String((raw as { _id: Types.ObjectId })._id),
        title: String((raw as { title?: string }).title || 'Untitled'),
        organization: (raw as { organization?: string }).organization,
        stage: String((raw as { stage?: string }).stage || 'Closed Won'),
        dealValue,
        dealValueINR: monthlyINR,
        contractValueINR,
        pricingType,
        contractMonths: months,
        probability: 100,
        weightedINR: contractValueINR,
        expectedClosureDate: (raw as { expectedClosureDate?: Date })
          .expectedClosureDate
          ? new Date(
              (raw as { expectedClosureDate: Date }).expectedClosureDate,
            ).toISOString()
          : null,
        closedDate: close ? close.toISOString() : null,
        dealOwner: String((raw as { dealOwner?: string }).dealOwner || ''),
        pipeline: (raw as { pipeline?: Types.ObjectId }).pipeline
          ? String((raw as { pipeline: Types.ObjectId }).pipeline)
          : undefined,
      };

      if (!close) continue;
      const key = this.monthKey(close);
      if (!generatedSet.has(key)) continue;

      // Generated revenue uses contract value (monthly × months for retainers).
      generatedTotal += contractValueINR;
      generatedDealCount += 1;
      if (key === currentMonthKey) generatedThisMonth += contractValueINR;

      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.generated += contractValueINR;
      bucket.generatedDeals.push(row);
    }

    const monthsOut = monthKeys.map((key) => {
      const bucket = buckets.get(key)!;
      bucket.deals.sort((a, b) => b.weightedINR - a.weightedINR);
      bucket.generatedDeals.sort((a, b) => b.contractValueINR - a.contractValueINR);
      return {
        key,
        label: this.monthLabel(key),
        gross: Math.round(bucket.gross),
        weighted: Math.round(bucket.weighted),
        generated: Math.round(bucket.generated),
        dealCount: bucket.deals.length,
        generatedDealCount: bucket.generatedDeals.length,
        deals: bucket.deals,
        generatedDeals: bucket.generatedDeals,
        isPast: generatedSet.has(key) && !forecastSet.has(key),
        isCurrent: key === currentMonthKey,
        isForecast: forecastSet.has(key),
      };
    });

    unscheduled.sort((a, b) => b.weightedINR - a.weightedINR);
    const unscheduledGross = unscheduled.reduce((s, d) => s + d.contractValueINR, 0);
    const unscheduledWeighted = unscheduled.reduce((s, d) => s + d.weightedINR, 0);

    return {
      currency: 'INR',
      exchangeRate,
      summary: {
        grossTotal: Math.round(grossTotal),
        weightedTotal: Math.round(weightedTotal),
        dealCount: openDeals.length,
        unscheduledCount: unscheduled.length,
        unscheduledGross: Math.round(unscheduledGross),
        unscheduledWeighted: Math.round(unscheduledWeighted),
        generatedTotal: Math.round(generatedTotal),
        generatedDealCount,
        generatedThisMonth: Math.round(generatedThisMonth),
        generatedLookbackMonths: monthCount,
        monthlyMrrWeighted: Math.round(monthlyMrrWeighted),
      },
      months: monthsOut,
      unscheduled,
    };
  }

  public async getDealsByStage(owner?: string, pipeline?: string) {
    const filter: Record<string, unknown> = {
      ...(await this.ownerFieldFilter(owner, 'dealOwner')),
    };
    if (pipeline && pipeline !== 'all') filter.pipeline = new Types.ObjectId(pipeline);

    const data = await this.dealModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$stage',
          value: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$dealValue', 0] } },
        },
      },
    ]);
    return data.map((d) => ({
      name: d._id || 'Unknown',
      value: d.value,
      amount: d.amount || 0,
    }));
  }

  public async getLeadConversion(
    owner?: string,
    start?: Date,
    end?: Date,
    pipeline?: string,
  ): Promise<any> {
    const filter: Record<string, unknown> = {
      ...(await this.ownerFieldFilter(owner, 'leadOwner')),
    };
    if (start || end) {
      filter.createdAt = {};
      if (start) (filter.createdAt as Record<string, Date>).$gte = start;
      if (end) (filter.createdAt as Record<string, Date>).$lt = end;
    }
    if (pipeline && pipeline !== 'all') filter.pipeline = new Types.ObjectId(pipeline);

    const total = await this.leadModel.countDocuments({
      ...filter,
      converted: { $ne: true },
    });
    const converted = await this.leadModel.countDocuments({
      ...filter,
      converted: true,
    });
    return {
      total,
      converted,
      rate: total + converted > 0 ? (converted / (total + converted)) * 100 : 0,
    };
  }

  public async getActivityTrends(owner?: string): Promise<any> {
    const filter: Record<string, unknown> = {};
    if (owner && owner !== 'All') {
      const authorIds = await this.resolveHrmsAuthorIds(owner);
      const authorMatch = this.authorIdQueryValue(
        authorIds.length ? authorIds : null,
      );
      if (authorMatch != null) filter.author = authorMatch;
    }

    return this.activityModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ]);
  }

  async getDealStats(owner?: string, pipeline?: string): Promise<any> {
    return this.getDealsByStage(owner, pipeline);
  }
  async getActivityTrendsLegacy(): Promise<any> {
    return this.getActivityTrends();
  }

  /**
   * Leads board + email effectiveness: leads over time / by owner, conversion snapshot,
   * pipeline into deals & clients, and tracked-email opens by day / recipient / template / sending address.
   */
  private async getFollowUpHealth(
    openLeadFilter: Record<string, unknown>,
    touchCutoff: Date,
  ): Promise<{
    openLeads: number;
    leadsTouchedRecently: number;
    staleLeads: number;
    touchCoveragePercent: number;
    staleDays: number;
  }> {
    const openLeads = await this.leadModel
      .find(openLeadFilter)
      .select('_id')
      .lean()
      .exec();
    const openIds = openLeads.map((l) => l._id);
    if (openIds.length === 0) {
      return {
        openLeads: 0,
        leadsTouchedRecently: 0,
        staleLeads: 0,
        touchCoveragePercent: 0,
        staleDays: STALE_LEAD_DAYS,
      };
    }
    const touchedIds = await this.activityModel.distinct('relatedTo', {
      relatedType: 'Lead',
      relatedTo: { $in: openIds },
      createdAt: { $gte: touchCutoff },
      type: { $nin: ['System'] },
    });
    const touchedSet = new Set(touchedIds.map((id) => String(id)));
    const leadsTouchedRecently = openIds.filter((id) =>
      touchedSet.has(String(id)),
    ).length;
    const staleLeads = openIds.length - leadsTouchedRecently;
    const touchCoveragePercent =
      Math.round((leadsTouchedRecently / openIds.length) * 1000) / 10;
    return {
      openLeads: openIds.length,
      leadsTouchedRecently,
      staleLeads,
      touchCoveragePercent,
      staleDays: STALE_LEAD_DAYS,
    };
  }

  async getBoardReports(
    days: string | number = 30,
    owner?: string,
  ): Promise<{
    periodDays: number;
    leadsCreatedByDay: Array<{ date: string; count: number }>;
    leadsByOwner: Array<{ owner: string; count: number }>;
    dealsByOwner: Array<{ owner: string; count: number }>;
    leadConversion: {
      createdInPeriod: number;
      convertedInPeriod: number;
      conversionRate: number;
    };
    dealsCreatedInPeriod: number;
    clientsCreatedInPeriod: number;
    openLeadsByPipeline: Array<{
      pipelineId: string | null;
      pipelineName: string;
      total: number;
      stages: Array<{ stage: string; count: number }>;
    }>;
    openDealsByPipeline: Array<{
      pipelineId: string | null;
      pipelineName: string;
      total: number;
      stages: Array<{ stage: string; count: number }>;
    }>;
    emailEngagementSummary: {
      sends: number;
      opened: number;
      notOpened: number;
      clicked: number;
      notClicked: number;
      replies: number;
      noReply: number;
      openRatePercent: number;
      clickRatePercent: number;
      replyRatePercent: number;
      totalOpenEvents: number;
      totalClicks: number;
    };
    emailOpensByDay: Array<{ date: string; sendsOpened: number }>;
    emailSendsByDay: Array<{ date: string; sends: number }>;
    emailRepliesByDay: Array<{ date: string; repliesReceived: number }>;
    followUpReplyAnalytics: {
      repliesByAttempt: Array<{
        attempt: number;
        label: string;
        replies: number;
      }>;
      avgSendsAtReply: number;
      avgFollowUpsAtReply: number;
      repliedConversations: number;
      totalFollowUpSendsInPeriod: number;
      note: string;
    };
    channelPerformance: Array<{
      channel: string;
      leads: number;
      converted: number;
      conversionRate: number;
      replies: number;
      deals: number;
      replyRate: number;
    }>;
    emailEngagementNote: string;
    emailByRecipient: Array<{
      recipient: string;
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
    }>;
    emailByTemplate: Array<{
      templateId: string | null;
      templateName: string;
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
      totalClicks: number;
      uniqueClicked: number;
    }>;
    emailByFromAddress: Array<{
      fromEmail: string;
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
    }>;
    engagementByDay: Array<{ date: string; count: number }>;
    engagementByType: Array<{ type: string; count: number }>;
    engagementByRelatedType: Array<{ relatedType: string; count: number }>;
    engagementByAuthor: Array<{
      authorId: string;
      name: string;
      count: number;
    }>;
    totalHumanTouches: number;
    outreachTrackedSends: number;
    followUpHealth: {
      openLeads: number;
      leadsTouchedRecently: number;
      staleLeads: number;
      touchCoveragePercent: number;
      staleDays: number;
    };
    engagementNote: string;
    dealsCreatedByDay: Array<{ date: string; count: number }>;
    leadsDailyDetail: Array<{
      date: string;
      platform: string;
      owner: string;
      count: number;
    }>;
    dealsDailyDetail: Array<{
      date: string;
      platform: string;
      owner: string;
      count: number;
    }>;
  }> {
    const ownerKey = owner && owner !== 'All' ? String(owner) : 'all';
    // Key on raw days string so custom ranges don't collide with "last N days".
    const key = this.appCache.reportingBoardKey(String(days), ownerKey);
    return this.appCache.getOrSet(key, this.appCache.crmReportingTtl(), () =>
      this.computeBoardReports(days, owner),
    );
  }

  private async computeBoardReports(
    days: string | number,
    owner?: string,
  ): Promise<{
    periodDays: number;
    leadsCreatedByDay: Array<{ date: string; count: number }>;
    leadsByOwner: Array<{ owner: string; count: number }>;
    dealsByOwner: Array<{ owner: string; count: number }>;
    leadConversion: {
      createdInPeriod: number;
      convertedInPeriod: number;
      conversionRate: number;
    };
    dealsCreatedInPeriod: number;
    clientsCreatedInPeriod: number;
    openLeadsByPipeline: Array<{
      pipelineId: string | null;
      pipelineName: string;
      total: number;
      stages: Array<{ stage: string; count: number }>;
    }>;
    openDealsByPipeline: Array<{
      pipelineId: string | null;
      pipelineName: string;
      total: number;
      stages: Array<{ stage: string; count: number }>;
    }>;
    emailEngagementSummary: {
      sends: number;
      opened: number;
      notOpened: number;
      clicked: number;
      notClicked: number;
      replies: number;
      noReply: number;
      openRatePercent: number;
      clickRatePercent: number;
      replyRatePercent: number;
      totalOpenEvents: number;
      totalClicks: number;
    };
    emailOpensByDay: Array<{ date: string; sendsOpened: number }>;
    emailSendsByDay: Array<{ date: string; sends: number }>;
    emailRepliesByDay: Array<{ date: string; repliesReceived: number }>;
    followUpReplyAnalytics: {
      repliesByAttempt: Array<{
        attempt: number;
        label: string;
        replies: number;
      }>;
      avgSendsAtReply: number;
      avgFollowUpsAtReply: number;
      repliedConversations: number;
      totalFollowUpSendsInPeriod: number;
      note: string;
    };
    channelPerformance: Array<{
      channel: string;
      leads: number;
      converted: number;
      conversionRate: number;
      replies: number;
      deals: number;
      replyRate: number;
    }>;
    emailEngagementNote: string;
    emailByRecipient: Array<{
      recipient: string;
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
    }>;
    emailByTemplate: Array<{
      templateId: string | null;
      templateName: string;
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
      totalClicks: number;
      uniqueClicked: number;
    }>;
    emailByFromAddress: Array<{
      fromEmail: string;
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
    }>;
    engagementByDay: Array<{ date: string; count: number }>;
    engagementByType: Array<{ type: string; count: number }>;
    engagementByRelatedType: Array<{ relatedType: string; count: number }>;
    engagementByAuthor: Array<{
      authorId: string;
      name: string;
      count: number;
    }>;
    totalHumanTouches: number;
    outreachTrackedSends: number;
    followUpHealth: {
      openLeads: number;
      leadsTouchedRecently: number;
      staleLeads: number;
      touchCoveragePercent: number;
      staleDays: number;
    };
    engagementNote: string;
    /** Deals created per calendar day in the selected period. */
    dealsCreatedByDay: Array<{ date: string; count: number }>;
    /**
     * Lead intake detail: day × acquisition platform × employee.
     * Platforms use Lead Source / opportunitySourcePlatform (LinkedIn, Website, …).
     */
    leadsDailyDetail: Array<{
      date: string;
      platform: string;
      owner: string;
      count: number;
    }>;
    /**
     * Deal intake detail: day × originating lead platform × deal owner.
     */
    dealsDailyDetail: Array<{
      date: string;
      platform: string;
      owner: string;
      count: number;
    }>;
  }> {
    const { currentStart: start, currentEnd: end, safeDays } = this.parseDateRange(days);
    const now = new Date();

    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const ownerLabels = await this.resolveOwnerFieldLabels(owner);

    const leadMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
      ...this.stringOwnerFilter('leadOwner', ownerLabels.length ? ownerLabels : null),
    };

    const dealMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
      ...this.stringOwnerFilter('dealOwner', ownerLabels.length ? ownerLabels : null),
    };

    const activityHuman: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
      type: { $nin: ['System'] },
    };
    const authorMatch = this.authorIdQueryValue(
      authorIds.length ? authorIds : null,
    );
    if (authorMatch != null) activityHuman.author = authorMatch;

    const emailTrackMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
    };
    if (authorMatch != null) emailTrackMatch.userId = authorMatch;

    const touchCutoff = new Date(now);
    touchCutoff.setDate(touchCutoff.getDate() - STALE_LEAD_DAYS);

    const openLeadFilter: Record<string, unknown> = {
      converted: { $ne: true },
      ...this.stringOwnerFilter('leadOwner', ownerLabels.length ? ownerLabels : null),
    };

    const [
      leadsCreatedByDay,
      leadsByOwner,
      dealsByOwner,
      createdInPeriod,
      convertedInPeriod,
      dealsCreatedInPeriod,
      clientsCreatedInPeriod,
      emailOpensByDayAgg,
      emailSendsByDayAgg,
      emailRepliesByDayAgg,
      emailByRecipient,
      emailByTemplateAgg,
      emailByFromAddress,
      engagementByDay,
      engagementByTypeAgg,
      engagementByRelatedTypeAgg,
      engagementByAuthorAgg,
      totalHumanTouches,
      outreachTrackedSends,
      followUpHealth,
    ] = await Promise.all([
      this.leadModel.aggregate([
        { $match: leadMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
      this.leadModel.aggregate([
        { $match: leadMatch },
        {
          $group: {
            _id: { $ifNull: ['$leadOwner', 'Unassigned'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 200 },
        { $project: { _id: 0, owner: '$_id', count: 1 } },
      ]),
      this.dealModel.aggregate([
        { $match: dealMatch },
        {
          $group: {
            _id: { $ifNull: ['$dealOwner', 'Unassigned'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 200 },
        { $project: { _id: 0, owner: '$_id', count: 1 } },
      ]),
      this.leadModel.countDocuments(leadMatch),
      this.leadModel.countDocuments({ ...leadMatch, converted: true }),
      this.dealModel.countDocuments(dealMatch),
      this.clientModel.countDocuments({
        createdAt: { $gte: start, $lt: end },
      }),
      this.emailTrackingModel.aggregate([
        {
          $match: {
            lastOpenedAt: { $gte: start, $lte: now },
            openCount: { $gt: 0 },
            ...(authorMatch != null ? { userId: authorMatch } : {}),
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$lastOpenedAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            sendsOpened: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', sendsOpened: 1 } },
      ]),
      this.emailTrackingModel.aggregate([
        { $match: emailTrackMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            sends: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', sends: 1 } },
      ]),
      this.activityModel.aggregate([
        {
          $match: {
            type: 'Email',
            createdAt: { $gte: start, $lte: now },
            'metadata.direction': 'inbound',
            'metadata.matchReason': 'in_reply_to',
            ...(authorMatch != null ? { author: authorMatch } : {}),
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            repliesReceived: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', repliesReceived: 1 } },
      ]),
      this.emailTrackingModel.aggregate([
        { $match: emailTrackMatch },
        {
          $group: {
            _id: {
              $toLower: {
                $trim: { input: { $ifNull: ['$recipient', ''] } },
              },
            },
            sends: { $sum: 1 },
            totalOpens: { $sum: '$openCount' },
            uniqueOpened: {
              $sum: { $cond: [{ $gt: ['$openCount', 0] }, 1, 0] },
            },
          },
        },
        { $match: { _id: { $ne: '' } } },
        { $sort: { totalOpens: -1, sends: -1 } },
        { $limit: 40 },
        {
          $project: {
            _id: 0,
            recipient: '$_id',
            sends: 1,
            totalOpens: 1,
            uniqueOpened: 1,
          },
        },
      ]),
      this.emailTrackingModel.aggregate([
        { $match: emailTrackMatch },
        {
          $group: {
            _id: '$templateId',
            sends: { $sum: 1 },
            totalOpens: { $sum: '$openCount' },
            uniqueOpened: {
              $sum: { $cond: [{ $gt: ['$openCount', 0] }, 1, 0] },
            },
            totalClicks: {
              $sum: { $size: { $ifNull: ['$clicks', []] } },
            },
            uniqueClicked: {
              $sum: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ['$clicks', []] } }, 0] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { uniqueOpened: -1, sends: -1 } },
        { $limit: 30 },
      ]),
      this.emailTrackingModel.aggregate([
        { $match: emailTrackMatch },
        {
          $lookup: {
            from: 'useremailaccounts',
            localField: 'accountId',
            foreignField: '_id',
            as: '_acct',
          },
        },
        {
          $addFields: {
            _senderKey: {
              $let: {
                vars: {
                  fe: {
                    $toLower: {
                      $trim: { input: { $ifNull: ['$fromEmail', ''] } },
                    },
                  },
                  acctEmail: {
                    $toLower: {
                      $trim: {
                        input: {
                          $ifNull: [
                            { $arrayElemAt: ['$_acct.email', 0] },
                            '',
                          ],
                        },
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $ne: ['$$fe', ''] },
                    '$$fe',
                    {
                      $cond: [
                        { $ne: ['$$acctEmail', ''] },
                        '$$acctEmail',
                        'unknown / legacy',
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $group: {
            _id: '$_senderKey',
            sends: { $sum: 1 },
            totalOpens: { $sum: '$openCount' },
            uniqueOpened: {
              $sum: { $cond: [{ $gt: ['$openCount', 0] }, 1, 0] },
            },
          },
        },
        { $sort: { sends: -1, uniqueOpened: -1 } },
        {
          $project: {
            _id: 0,
            fromEmail: {
              $cond: [
                { $eq: ['$_id', 'unknown / legacy'] },
                'Unknown / legacy',
                '$_id',
              ],
            },
            sends: 1,
            totalOpens: 1,
            uniqueOpened: 1,
          },
        },
      ]),
      this.activityModel.aggregate([
        { $match: activityHuman },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
      this.activityModel.aggregate([
        { $match: activityHuman },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.activityModel.aggregate([
        { $match: activityHuman },
        {
          $group: {
            _id: { $ifNull: ['$relatedType', 'Unknown'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.activityModel.aggregate(
        this.engagementByAuthorPipeline(activityHuman, 40),
      ),
      this.activityModel.countDocuments(activityHuman),
      this.emailTrackingModel.countDocuments(emailTrackMatch),
      this.getFollowUpHealth(openLeadFilter, touchCutoff),
    ]);

    const templateIds = (
      emailByTemplateAgg as Array<{ _id: Types.ObjectId | null }>
    )
      .map((row) => row._id)
      .filter((id): id is Types.ObjectId => !!id);
    const tplDocs =
      templateIds.length > 0
        ? await this.emailTemplateModel
            .find({ _id: { $in: templateIds } })
            .select('name')
            .lean()
            .exec()
        : [];
    const nameById = new Map(tplDocs.map((t) => [String(t._id), t.name]));
    const emailByTemplate = (
      emailByTemplateAgg as Array<{
        _id: Types.ObjectId | null;
        sends: number;
        totalOpens: number;
        uniqueOpened: number;
        totalClicks?: number;
        uniqueClicked?: number;
      }>
    ).map((row) => ({
      templateId: row._id ? String(row._id) : null,
      templateName: row._id
        ? nameById.get(String(row._id)) || 'Deleted template'
        : 'Manual / one-off',
      sends: row.sends,
      totalOpens: row.totalOpens,
      uniqueOpened: row.uniqueOpened,
      totalClicks: row.totalClicks ?? 0,
      uniqueClicked: row.uniqueClicked ?? 0,
    }));

    const engagementByAuthor = (
      await this.collapseEngagementByAuthor(
        engagementByAuthorAgg as Array<{
          _id: string | Types.ObjectId | null;
          count: number;
        }>,
      )
    ).slice(0, 20);

    const engagementByType = (
      engagementByTypeAgg as Array<{ _id: string; count: number }>
    ).map((r) => ({
      type: r._id || 'Unknown',
      count: r.count,
    }));

    const engagementByRelatedType = (
      engagementByRelatedTypeAgg as Array<{ _id: string; count: number }>
    ).map((r) => ({
      relatedType: r._id || 'Unknown',
      count: r.count,
    }));

    const conversionRate =
      createdInPeriod > 0
        ? Math.round((convertedInPeriod / createdInPeriod) * 1000) / 10
        : 0;

    const openDealFilter: Record<string, unknown> = {
      stage: { $nin: ['Closed Won', 'Closed Lost'] },
      ...this.stringOwnerFilter('dealOwner', ownerLabels.length ? ownerLabels : null),
    };

    const [openLeadsByPipelineStageAgg, openDealsByPipelineStageAgg, emailSummaryAgg] =
      await Promise.all([
        this.aggregateRecordsByPipelineStage(this.leadModel, openLeadFilter),
        this.aggregateRecordsByPipelineStage(this.dealModel, openDealFilter),
        this.emailTrackingModel.aggregate([
          { $match: emailTrackMatch },
          {
            $group: {
              _id: null,
              sends: { $sum: 1 },
              opened: {
                $sum: { $cond: [{ $gt: ['$openCount', 0] }, 1, 0] },
              },
              clicked: {
                $sum: {
                  $cond: [
                    {
                      $gt: [{ $size: { $ifNull: ['$clicks', []] } }, 0],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalOpenEvents: { $sum: '$openCount' },
              totalClicks: {
                $sum: { $size: { $ifNull: ['$clicks', []] } },
              },
            },
          },
        ]),
      ]);

    const openLeadsByPipeline = this.reshapePipelineStageAgg(
      openLeadsByPipelineStageAgg,
    );
    const openDealsByPipeline = this.reshapePipelineStageAgg(
      openDealsByPipelineStageAgg,
    );

    const emailSummaryRow = (
      emailSummaryAgg as Array<{
        sends?: number;
        opened?: number;
        clicked?: number;
        totalOpenEvents?: number;
        totalClicks?: number;
      }>
    )[0];
    const emailSends = Number(emailSummaryRow?.sends) || 0;
    const emailOpened = Number(emailSummaryRow?.opened) || 0;
    const emailClicked = Number(emailSummaryRow?.clicked) || 0;
    const emailReplies = (emailRepliesByDayAgg as Array<{ repliesReceived: number }>).reduce(
      (sum, row) => sum + (row.repliesReceived || 0),
      0,
    );
    const emailEngagementSummary = {
      sends: emailSends,
      opened: emailOpened,
      notOpened: Math.max(0, emailSends - emailOpened),
      clicked: emailClicked,
      notClicked: Math.max(0, emailSends - emailClicked),
      replies: emailReplies,
      noReply: Math.max(0, emailSends - emailReplies),
      openRatePercent:
        emailSends > 0
          ? Math.round((emailOpened / emailSends) * 1000) / 10
          : 0,
      clickRatePercent:
        emailSends > 0
          ? Math.round((emailClicked / emailSends) * 1000) / 10
          : 0,
      replyRatePercent:
        emailSends > 0
          ? Math.round((emailReplies / emailSends) * 1000) / 10
          : 0,
      totalOpenEvents: Number(emailSummaryRow?.totalOpenEvents) || 0,
      totalClicks: Number(emailSummaryRow?.totalClicks) || 0,
    };

    // Owner scope for channel / follow-up analytics (must match board lead/deal filters).
    const ownerScope = {
      leadOwners: ownerLabels.length ? ownerLabels : null,
      dealOwners: ownerLabels.length ? ownerLabels : null,
      authorId: authorIds.length ? authorIds : null,
    };

    let followUpReplyAnalytics = {
      repliesByAttempt: [] as Array<{
        attempt: number;
        label: string;
        replies: number;
      }>,
      avgSendsAtReply: 0,
      avgFollowUpsAtReply: 0,
      repliedConversations: 0,
      totalFollowUpSendsInPeriod: 0,
      note: '',
    };
    let channelPerformance: Array<{
      channel: string;
      leads: number;
      converted: number;
      conversionRate: number;
      replies: number;
      deals: number;
      replyRate: number;
    }> = [];
    try {
      followUpReplyAnalytics = await this.computeFollowUpReplyAnalytics(
        start,
        end,
        ownerScope.authorId,
      );
    } catch (err) {
      this.logger.warn(
        `follow-up reply analytics failed: ${(err as Error)?.message || err}`,
      );
      followUpReplyAnalytics = {
        repliesByAttempt: [],
        avgSendsAtReply: 0,
        avgFollowUpsAtReply: 0,
        repliedConversations: 0,
        totalFollowUpSendsInPeriod: 0,
        note: 'Follow-up reply analytics unavailable for this period.',
      };
    }
    try {
      channelPerformance = await this.computeChannelPerformance(
        start,
        end,
        ownerScope,
      );
    } catch (err) {
      this.logger.warn(
        `channel performance failed: ${(err as Error)?.message || err}`,
      );
      channelPerformance = [];
    }

    const [collapsedLeadsByOwner, collapsedDealsByOwner] = await Promise.all([
      this.collapseOwnerCountRows(
        leadsByOwner as Array<{ owner: string; count: number }>,
      ),
      this.collapseOwnerCountRows(
        dealsByOwner as Array<{ owner: string; count: number }>,
      ),
    ]);

    const channelExpr = this.leadChannelExpression();
    const [
      leadsDailyDetailRaw,
      dealsCreatedByDayRaw,
      dealsDailyDetailRaw,
    ] = await Promise.all([
      this.leadModel.aggregate([
        { $match: leadMatch },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: this.reportingCalendarTz(),
                },
              },
              platform: channelExpr,
              owner: { $ifNull: ['$leadOwner', 'Unassigned'] },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': -1, count: -1 } },
        { $limit: 2500 },
        {
          $project: {
            _id: 0,
            date: '$_id.date',
            platform: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$_id.platform', null] },
                    { $eq: ['$_id.platform', ''] },
                  ],
                },
                'Unknown',
                '$_id.platform',
              ],
            },
            owner: '$_id.owner',
            count: 1,
          },
        },
      ]),
      this.dealModel.aggregate([
        { $match: dealMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
      this.dealModel.aggregate([
        { $match: dealMatch },
        {
          $lookup: {
            from: 'leads',
            localField: 'lead',
            foreignField: '_id',
            as: 'leadDoc',
          },
        },
        {
          $unwind: {
            path: '$leadDoc',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            opportunitySourcePlatform: '$leadDoc.opportunitySourcePlatform',
            source: '$leadDoc.source',
            sourceMetadata: '$leadDoc.sourceMetadata',
          },
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: this.reportingCalendarTz(),
                },
              },
              platform: channelExpr,
              owner: { $ifNull: ['$dealOwner', 'Unassigned'] },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': -1, count: -1 } },
        { $limit: 2500 },
        {
          $project: {
            _id: 0,
            date: '$_id.date',
            platform: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$_id.platform', null] },
                    { $eq: ['$_id.platform', ''] },
                  ],
                },
                'Unknown',
                '$_id.platform',
              ],
            },
            owner: '$_id.owner',
            count: 1,
          },
        },
      ]),
    ]);

    const [leadsDailyDetail, dealsDailyDetail] = await Promise.all([
      this.collapseDailyDetailRows(
        leadsDailyDetailRaw as Array<{
          date: string;
          platform: string;
          owner: string;
          count: number;
        }>,
      ),
      this.collapseDailyDetailRows(
        dealsDailyDetailRaw as Array<{
          date: string;
          platform: string;
          owner: string;
          count: number;
        }>,
      ),
    ]);

    return {
      periodDays: safeDays,
      leadsCreatedByDay: fillMissingDays(
        leadsCreatedByDay,
        start,
        end,
        'count',
        this.reportingCalendarTz(),
      ),
      leadsByOwner: collapsedLeadsByOwner,
      dealsByOwner: collapsedDealsByOwner,
      leadConversion: {
        createdInPeriod,
        convertedInPeriod,
        conversionRate,
      },
      dealsCreatedInPeriod,
      clientsCreatedInPeriod,
      openLeadsByPipeline,
      openDealsByPipeline,
      emailEngagementSummary,
      emailOpensByDay: emailOpensByDayAgg,
      emailSendsByDay: fillMissingDays(
        emailSendsByDayAgg,
        start,
        end,
        'sends',
        'UTC',
      ),
      emailRepliesByDay: emailRepliesByDayAgg,
      followUpReplyAnalytics,
      channelPerformance,
      emailEngagementNote:
        'Tracked sends only. “Sends by day” uses send time. “Opens by day” uses the last open timestamp per send (not every repeat open). “Replies by day” counts inbound thread replies (In-Reply-To matched to a CRM send). Follow-up reply chart uses outbound send # on the same CRM record when the reply matched a tracking token. Channel performance uses Lead Source / opportunity platform (deals via originating lead; replies via linked CRM record). Sending addresses include every mailbox that sent tracked mail in the period (from address or linked inbox account).',
      emailByRecipient,
      emailByTemplate,
      emailByFromAddress,
      engagementByDay,
      engagementByType,
      engagementByRelatedType,
      engagementByAuthor,
      totalHumanTouches,
      outreachTrackedSends,
      followUpHealth,
      engagementNote:
        'Human touches exclude System activities. Open leads: not converted. “Touched recently” = at least one non-system activity on that lead in the last 7 days. Email counts are tracked sends in the selected period (sender filter when a team member is selected).',
      dealsCreatedByDay: fillMissingDays(
        dealsCreatedByDayRaw,
        start,
        end,
        'count',
        this.reportingCalendarTz(),
      ),
      leadsDailyDetail,
      dealsDailyDetail,
    };
  }

  /**
   * Leads Dashboard analytics — KPIs and dimensional breakdowns from live CRM leads.
   * All values are aggregated from the Lead collection (no placeholders).
   */
  async getLeadsDashboardAnalytics(
    days: string | number = 30,
    owner?: string,
    compare?: string,
  ) {
    const ownerKey = owner && owner !== 'All' ? String(owner) : 'all';
    const compareKey = String(compare || 'previous').trim() || 'previous';
    const key = this.appCache.reportingLeadsDashboardKey(
      String(days),
      ownerKey,
      compareKey,
    );
    return this.appCache.getOrSet(key, this.appCache.crmReportingTtl(), () =>
      this.computeLeadsDashboardAnalytics(days, owner, compare),
    );
  }

  private async computeLeadsDashboardAnalytics(
    days: string | number,
    owner?: string,
    compare?: string,
  ) {
    const {
      currentStart: start,
      currentEnd: end,
      previousStart,
      previousEnd,
      safeDays,
      compareMode,
      compareLabel,
      currentFromYmd,
      currentToYmd,
      compareFromYmd,
      compareToYmd,
    } = this.parseDateRange(days, compare);
    const ownerLabels = await this.resolveOwnerFieldLabels(owner);
    const ownerFilter = this.stringOwnerFilter(
      'leadOwner',
      ownerLabels.length ? ownerLabels : null,
    );

    const periodMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
      ...ownerFilter,
    };
    const prevPeriodMatch: Record<string, unknown> = {
      createdAt: { $gte: previousStart, $lt: previousEnd },
      ...ownerFilter,
    };
    const openMatch: Record<string, unknown> = {
      converted: { $ne: true },
      ...ownerFilter,
    };
    const allOwnerMatch: Record<string, unknown> = { ...ownerFilter };

    const lostStageRe =
      /lost|disqualified|junk|rejected|dead|unqualified|closed\s*lost/i;
    const qualifiedStageRe =
      /qualified|proposal|negotiation|hot|warm|interested|demo|meeting/i;
    const newStageRe = /^new$|^open$|^lead$|^uncontacted$/i;

    const groupByField = (field: string, match: Record<string, unknown>) =>
      this.leadModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $let: {
                vars: {
                  raw: {
                    $trim: {
                      input: {
                        $toString: { $ifNull: [`$${field}`, ''] },
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $or: [{ $eq: ['$$raw', ''] }, { $eq: ['$$raw', 'null'] }] },
                    'Unspecified',
                    '$$raw',
                  ],
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 25 },
        { $project: { _id: 0, name: '$_id', count: 1 } },
      ]);

    const [
      totalLeads,
      openLeads,
      createdInPeriod,
      prevCreated,
      convertedInPeriod,
      prevConverted,
      convertedAllTime,
      byStatus,
      bySource,
      byOwner,
      byIndustry,
      byTerritory,
      byStage,
      byPriority,
      createdByDay,
      createdByMonth,
      assignedByDay,
      lostByStageAgg,
      convertedByStageAgg,
      conversionTiming,
      openLeadsByPipeline,
      recentLeads,
    ] = await Promise.all([
      this.leadModel.countDocuments(allOwnerMatch),
      this.leadModel.countDocuments(openMatch),
      this.leadModel.countDocuments(periodMatch),
      this.leadModel.countDocuments(prevPeriodMatch),
      this.leadModel.countDocuments({ ...periodMatch, converted: true }),
      this.leadModel.countDocuments({ ...prevPeriodMatch, converted: true }),
      this.leadModel.countDocuments({ ...allOwnerMatch, converted: true }),
      groupByField('status', periodMatch),
      groupByField('source', periodMatch),
      this.leadModel.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: { $ifNull: ['$leadOwner', 'Unassigned'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 25 },
        { $project: { _id: 0, owner: '$_id', count: 1 } },
      ]),
      groupByField('industry', periodMatch),
      groupByField('territory', periodMatch),
      groupByField('stage', openMatch),
      this.leadModel.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: {
              $let: {
                vars: {
                  raw: {
                    $trim: {
                      input: {
                        $toString: {
                          $ifNull: [
                            '$customFields.priority',
                            { $ifNull: ['$priority', ''] },
                          ],
                        },
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $or: [{ $eq: ['$$raw', ''] }, { $eq: ['$$raw', 'null'] }] },
                    'Unspecified',
                    '$$raw',
                  ],
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
        { $project: { _id: 0, name: '$_id', count: 1 } },
      ]),
      this.leadModel.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
      this.leadModel.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            created: { $sum: 1 },
            converted: {
              $sum: { $cond: [{ $eq: ['$converted', true] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            month: '$_id',
            created: 1,
            converted: 1,
          },
        },
      ]),
      this.leadModel.aggregate([
        { $match: periodMatch },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: this.reportingCalendarTz(),
                },
              },
              owner: { $ifNull: ['$leadOwner', 'Unassigned'] },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id.date',
            owner: '$_id.owner',
            count: 1,
          },
        },
        { $limit: 500 },
      ]),
      this.leadModel.aggregate([
        {
          $match: {
            ...allOwnerMatch,
            converted: { $ne: true },
            $or: [
              { status: { $regex: lostStageRe } },
              { stage: { $regex: lostStageRe } },
            ],
          },
        },
        {
          $group: {
            _id: {
              $ifNull: [
                {
                  $cond: [
                    { $and: [{ $ne: ['$stage', null] }, { $ne: ['$stage', ''] }] },
                    '$stage',
                    '$status',
                  ],
                },
                'Lost',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 12 },
        { $project: { _id: 0, stage: '$_id', count: 1 } },
      ]),
      this.leadModel.aggregate([
        {
          $match: {
            ...allOwnerMatch,
            converted: true,
          },
        },
        {
          $group: {
            _id: {
              $ifNull: [
                {
                  $cond: [
                    { $and: [{ $ne: ['$stage', null] }, { $ne: ['$stage', ''] }] },
                    '$stage',
                    { $ifNull: ['$status', 'Converted'] },
                  ],
                },
                'Converted',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 12 },
        { $project: { _id: 0, stage: '$_id', count: 1 } },
      ]),
      this.leadModel.aggregate([
        {
          $match: {
            ...allOwnerMatch,
            converted: true,
            createdAt: { $exists: true },
            updatedAt: { $exists: true },
          },
        },
        {
          $project: {
            hours: {
              $divide: [
                { $subtract: ['$updatedAt', '$createdAt'] },
                1000 * 60 * 60,
              ],
            },
          },
        },
        { $match: { hours: { $gte: 0, $lte: 24 * 365 } } },
        {
          $group: {
            _id: null,
            avgHours: { $avg: '$hours' },
            samples: { $sum: 1 },
          },
        },
      ]),
      this.aggregateOpenLeadsByPipeline(openMatch),
      this.leadModel
        .find(periodMatch)
        .sort({ createdAt: -1 })
        .limit(50)
        .select(
          'firstName lastName email organization phone mobileNo status stage leadOwner source industry territory createdAt converted',
        )
        .lean()
        .exec(),
    ]);

    const collapsedOwners = await this.collapseOwnerCountRows(
      byOwner as Array<{ owner: string; count: number }>,
    );

    const statusRows = (byStatus as Array<{ name: string; count: number }>).map(
      (r) => ({ name: r.name, value: r.count }),
    );

    let newLeads = 0;
    let qualifiedLeads = 0;
    let lostLeads = 0;
    for (const row of statusRows) {
      const n = row.name || '';
      if (newStageRe.test(n)) newLeads += row.value;
      if (qualifiedStageRe.test(n)) qualifiedLeads += row.value;
      if (lostStageRe.test(n)) lostLeads += row.value;
    }
    // Prefer stage-based lost count when status didn't classify well
    const lostFromStages = (lostByStageAgg as Array<{ count: number }>).reduce(
      (s, r) => s + (Number(r.count) || 0),
      0,
    );
    if (lostLeads === 0 && lostFromStages > 0) lostLeads = lostFromStages;

    // If "New" didn't match status labels, treat period created − converted as new volume proxy for KPI context
    if (newLeads === 0) {
      newLeads = Math.max(0, createdInPeriod - convertedInPeriod);
    }

    const conversionRate =
      createdInPeriod > 0
        ? Math.round((convertedInPeriod / createdInPeriod) * 1000) / 10
        : 0;
    const prevConversionRate =
      prevCreated > 0
        ? Math.round((prevConverted / prevCreated) * 1000) / 10
        : 0;

    const pctDelta = (curr: number, prev: number) => {
      if (!prev && !curr) return 0;
      if (!prev) return 100;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    const timing = (conversionTiming as Array<{
      avgHours?: number;
      samples?: number;
    }>)[0];
    const avgHoursToConvert =
      timing?.avgHours != null
        ? Math.round(Number(timing.avgHours) * 10) / 10
        : 0;

    // Quarterly rollup from monthly
    const quarterlyMap = new Map<
      string,
      { created: number; converted: number }
    >();
    for (const row of createdByMonth as Array<{
      month: string;
      created: number;
      converted: number;
    }>) {
      const [y, m] = String(row.month || '').split('-');
      const monthNum = Number(m) || 1;
      const q = Math.ceil(monthNum / 3);
      const key = `${y}-Q${q}`;
      const prev = quarterlyMap.get(key) || { created: 0, converted: 0 };
      prev.created += Number(row.created) || 0;
      prev.converted += Number(row.converted) || 0;
      quarterlyMap.set(key, prev);
    }

    const funnel = [
      { label: 'Created', val: createdInPeriod },
      { label: 'Open', val: openLeads },
      { label: 'Qualified', val: qualifiedLeads },
      { label: 'Converted', val: convertedInPeriod },
    ];

    const topSources = (
      bySource as Array<{ name: string; count: number }>
    )
      .filter((r) => r.name !== 'Unspecified')
      .slice(0, 8)
      .map((r) => ({ name: r.name, count: r.count }));

    return {
      periodDays: safeDays,
      periodMeta: {
        currentFrom: currentFromYmd,
        currentTo: currentToYmd,
        compareFrom: compareFromYmd,
        compareTo: compareToYmd,
        compareMode,
        compareLabel,
        currentLabel: this.formatShortRangeLabel(currentFromYmd, currentToYmd),
        days: safeDays,
      },
      kpis: {
        totalLeads,
        openLeads,
        newLeads,
        qualifiedLeads,
        convertedLeads: convertedInPeriod,
        convertedAllTime,
        lostLeads,
        conversionRate,
        avgHoursToConvert,
        avgDaysToConvert:
          avgHoursToConvert > 0
            ? Math.round((avgHoursToConvert / 24) * 10) / 10
            : 0,
        conversionSamples: Number(timing?.samples) || 0,
        deltas: {
          created: pctDelta(createdInPeriod, prevCreated),
          converted: pctDelta(convertedInPeriod, prevConverted),
          conversionRate: pctDelta(conversionRate, prevConversionRate),
        },
        createdInPeriod,
        prevCreated,
      },
      leadsByStatus: statusRows,
      leadsBySource: (bySource as Array<{ name: string; count: number }>).map(
        (r) => ({ name: r.name, value: r.count }),
      ),
      leadsByOwner: collapsedOwners,
      leadsByIndustry: (
        byIndustry as Array<{ name: string; count: number }>
      ).map((r) => ({ name: r.name, value: r.count })),
      leadsByRegion: (
        byTerritory as Array<{ name: string; count: number }>
      ).map((r) => ({ name: r.name, value: r.count })),
      leadsByPriority: (
        byPriority as Array<{ name: string; count: number }>
      ).map((r) => ({ name: r.name, value: r.count })),
      leadsByStage: (byStage as Array<{ name: string; count: number }>).map(
        (r) => ({ name: r.name, value: r.count }),
      ),
      leadsCreatedByDay: fillMissingDays(
        createdByDay as Array<{ date: string; count: number }>,
        start,
        end,
        'count',
        this.reportingCalendarTz(),
      ),
      monthlyPerformance: createdByMonth,
      quarterlyPerformance: [...quarterlyMap.entries()].map(
        ([quarter, v]) => ({
          quarter,
          created: v.created,
          converted: v.converted,
          conversionRate:
            v.created > 0
              ? Math.round((v.converted / v.created) * 1000) / 10
              : 0,
        }),
      ),
      assignmentTrends: assignedByDay,
      lostLeadsByStage: lostByStageAgg,
      convertedLeadsByStage: convertedByStageAgg,
      conversionFunnel: funnel,
      topLeadSources: topSources,
      openLeadsByPipeline,
      recentLeads: (recentLeads as unknown as Array<Record<string, unknown>>).map((l) => ({
        id: String(l._id || ''),
        _id: String(l._id || ''),
        name: [l.firstName, l.lastName].filter(Boolean).join(' ').trim() || 'Untitled lead',
        firstName: l.firstName,
        lastName: l.lastName,
        email: l.email || '',
        organization: l.organization || '',
        phone: (l.phone as string) || (l.mobileNo as string) || '',
        mobile: (l.mobileNo as string) || '',
        status: (l.status as string) || 'New',
        stage: (l.stage as string) || '',
        leadOwner: (l.leadOwner as string) || '',
        source: (l.source as string) || '',
        industry: (l.industry as string) || '',
        territory: (l.territory as string) || '',
        createdAt: l.createdAt,
        converted: !!l.converted,
      })),
    };
  }

  private async aggregateOpenLeadsByPipeline(
    openMatch: Record<string, unknown>,
  ): Promise<
    Array<{
      pipelineId: string | null;
      pipelineName: string;
      total: number;
      stages: Array<{ stage: string; count: number }>;
    }>
  > {
    try {
      const rows = await this.leadModel.aggregate([
        { $match: openMatch },
        {
          $group: {
            _id: {
              pipeline: '$pipeline',
              stage: { $ifNull: ['$stage', 'New'] },
            },
            count: { $sum: 1 },
          },
        },
      ]);
      const pipeIds = [
        ...new Set(
          rows
            .map((r) => r._id?.pipeline)
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      ];
      const pipeNameById = new Map<string, string>();
      if (pipeIds.length && this.pipelineModel) {
        const pipes = await this.pipelineModel
          .find({ _id: { $in: pipeIds.map((id) => new Types.ObjectId(id)) } })
          .select('name')
          .lean()
          .exec();
        for (const p of pipes as Array<{ _id: Types.ObjectId; name?: string }>) {
          pipeNameById.set(String(p._id), p.name || 'Pipeline');
        }
      }
      const byPipe = new Map<
        string,
        {
          pipelineId: string | null;
          pipelineName: string;
          total: number;
          stages: Array<{ stage: string; count: number }>;
        }
      >();
      for (const row of rows) {
        const pid = row._id?.pipeline ? String(row._id.pipeline) : null;
        const key = pid || 'none';
        const entry =
          byPipe.get(key) ||
          {
            pipelineId: pid,
            pipelineName: pid
              ? pipeNameById.get(pid) || 'Pipeline'
              : 'No pipeline',
            total: 0,
            stages: [],
          };
        const count = Number(row.count) || 0;
        entry.total += count;
        entry.stages.push({
          stage: String(row._id?.stage || 'New'),
          count,
        });
        byPipe.set(key, entry);
      }
      return [...byPipe.values()]
        .map((p) => ({
          ...p,
          stages: p.stages.sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.total - a.total);
    } catch (err) {
      this.logger.warn(
        `open leads by pipeline failed: ${(err as Error)?.message || err}`,
      );
      return [];
    }
  }

  private normalizeAcquisitionChannel(record: {
    source?: string | null;
    opportunitySourcePlatform?: string | null;
    sourceMetadata?: { type?: string | null } | null;
    leadType?: string | null;
  }): string {
    const platform = String(record?.opportunitySourcePlatform || '').trim();
    if (platform) return platform;

    const src = String(record?.source || '').trim();
    if (/^website/i.test(src)) return 'Website';

    const meta = String(record?.sourceMetadata?.type || '').toLowerCase();
    if (meta === 'linkedin') return 'LinkedIn';
    if (meta === 'threads') return 'Threads';
    if (meta === 'facebook') return 'Facebook';

    if (!src) return 'Unknown';
    if (/linkedin/i.test(src)) return 'LinkedIn';
    if (/threads\.net|threads\.com/i.test(src)) return 'Threads';
    if (/facebook\.com|fb\.watch/i.test(src)) return 'Facebook';
    if (/instagram/i.test(src)) return 'Instagram';
    if (/upwork/i.test(src)) return 'Upwork';
    if (/fiverr/i.test(src)) return 'Fiverr';
    if (src.length > 36) return `${src.slice(0, 34)}…`;
    return src;
  }

  private leadChannelExpression() {
    return {
      $let: {
        vars: {
          platform: {
            $trim: {
              input: {
                $convert: {
                  input: { $ifNull: ['$opportunitySourcePlatform', ''] },
                  to: 'string',
                  onError: '',
                  onNull: '',
                },
              },
            },
          },
          src: {
            $trim: {
              input: {
                $convert: {
                  input: { $ifNull: ['$source', ''] },
                  to: 'string',
                  onError: '',
                  onNull: '',
                },
              },
            },
          },
          metaType: {
            $toLower: {
              $convert: {
                input: { $ifNull: ['$sourceMetadata.type', ''] },
                to: 'string',
                onError: '',
                onNull: '',
              },
            },
          },
        },
        in: {
          $switch: {
            branches: [
              {
                case: { $gt: [{ $strLenCP: '$$platform' }, 0] },
                then: '$$platform',
              },
              {
                case: {
                  $regexMatch: { input: '$$src', regex: /^website/i },
                },
                then: 'Website',
              },
              {
                case: { $eq: ['$$metaType', 'linkedin'] },
                then: 'LinkedIn',
              },
              {
                case: { $eq: ['$$metaType', 'threads'] },
                then: 'Threads',
              },
              {
                case: { $eq: ['$$metaType', 'facebook'] },
                then: 'Facebook',
              },
              {
                case: {
                  $regexMatch: { input: '$$src', regex: /linkedin/i },
                },
                then: 'LinkedIn',
              },
              {
                case: {
                  $regexMatch: {
                    input: '$$src',
                    regex: /threads\.net|threads\.com/i,
                  },
                },
                then: 'Threads',
              },
              {
                case: {
                  $regexMatch: {
                    input: '$$src',
                    regex: /facebook\.com|fb\.watch/i,
                  },
                },
                then: 'Facebook',
              },
              {
                case: {
                  $regexMatch: { input: '$$src', regex: /instagram/i },
                },
                then: 'Instagram',
              },
              {
                case: { $regexMatch: { input: '$$src', regex: /upwork/i } },
                then: 'Upwork',
              },
              {
                case: { $regexMatch: { input: '$$src', regex: /fiverr/i } },
                then: 'Fiverr',
              },
              {
                case: { $gt: [{ $strLenCP: '$$src' }, 0] },
                then: {
                  $cond: [
                    { $gt: [{ $strLenCP: '$$src' }, 36] },
                    {
                      $concat: [{ $substrCP: ['$$src', 0, 34] }, '…'],
                    },
                    '$$src',
                  ],
                },
              },
            ],
            default: 'Unknown',
          },
        },
      },
    };
  }

  private async computeChannelPerformance(
    start: Date,
    end: Date,
    ownerScope: {
      leadOwners?: string[] | null;
      dealOwners?: string[] | null;
      authorId?: Types.ObjectId | Types.ObjectId[] | string | null;
    },
  ): Promise<
    Array<{
      channel: string;
      leads: number;
      converted: number;
      conversionRate: number;
      replies: number;
      deals: number;
      replyRate: number;
    }>
  > {
    const leadMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lte: end },
      ...this.stringOwnerFilter('leadOwner', ownerScope.leadOwners),
    };
    const dealMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lte: end },
      ...this.stringOwnerFilter('dealOwner', ownerScope.dealOwners),
    };
    const channelExpr = this.leadChannelExpression();
    const replyAuthorMatch = this.authorIdQueryValue(
      ownerScope.authorId as Types.ObjectId | Types.ObjectId[] | null | undefined,
    );

    const [leadsByChannel, dealsByChannel, replies] = await Promise.all([
      this.leadModel.aggregate([
        { $match: leadMatch },
        {
          $group: {
            _id: channelExpr,
            leads: { $sum: 1 },
            converted: {
              $sum: { $cond: [{ $eq: ['$converted', true] }, 1, 0] },
            },
          },
        },
        { $sort: { leads: -1 } },
      ]),
      this.dealModel.aggregate([
        { $match: dealMatch },
        {
          $lookup: {
            from: 'leads',
            localField: 'lead',
            foreignField: '_id',
            as: 'leadDoc',
          },
        },
        {
          $unwind: {
            path: '$leadDoc',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            opportunitySourcePlatform: '$leadDoc.opportunitySourcePlatform',
            source: '$leadDoc.source',
            sourceMetadata: '$leadDoc.sourceMetadata',
          },
        },
        {
          $group: {
            _id: channelExpr,
            deals: { $sum: 1 },
          },
        },
      ]),
      this.activityModel
        .find({
          type: 'Email',
          createdAt: { $gte: start, $lte: end },
          'metadata.direction': 'inbound',
          'metadata.matchReason': 'in_reply_to',
          ...(replyAuthorMatch != null ? { author: replyAuthorMatch } : {}),
        })
        .select('relatedTo relatedType')
        .lean()
        .exec(),
    ]);

    const byChannel = new Map<
      string,
      {
        channel: string;
        leads: number;
        converted: number;
        replies: number;
        deals: number;
      }
    >();

    const ensure = (channel: string) => {
      const key = channel || 'Unknown';
      let row = byChannel.get(key);
      if (!row) {
        row = { channel: key, leads: 0, converted: 0, replies: 0, deals: 0 };
        byChannel.set(key, row);
      }
      return row;
    };

    for (const row of leadsByChannel as any[]) {
      const ch = String(row._id || 'Unknown');
      const target = ensure(ch);
      target.leads = Number(row.leads) || 0;
      target.converted = Number(row.converted) || 0;
    }
    for (const row of dealsByChannel as any[]) {
      const ch = String(row._id || 'Unknown');
      ensure(ch).deals = Number(row.deals) || 0;
    }

    // Attribute replies to channel via linked Lead / Contact / Deal → Lead
    const leadIds: Types.ObjectId[] = [];
    const contactIds: Types.ObjectId[] = [];
    const dealIds: Types.ObjectId[] = [];
    for (const reply of replies as any[]) {
      if (!reply.relatedTo) continue;
      const id = new Types.ObjectId(String(reply.relatedTo));
      const t = String(reply.relatedType || '');
      if (t === 'Lead') leadIds.push(id);
      else if (t === 'Contact') contactIds.push(id);
      else if (t === 'Deal') dealIds.push(id);
    }

    const [leads, contacts, deals] = await Promise.all([
      leadIds.length
        ? this.leadModel
            .find({ _id: { $in: leadIds } })
            .select('source opportunitySourcePlatform sourceMetadata leadType')
            .lean()
            .exec()
        : Promise.resolve([]),
      contactIds.length
        ? this.contactModel
            .find({ _id: { $in: contactIds } })
            .select('source sourceMetadata sourceLead')
            .lean()
            .exec()
        : Promise.resolve([]),
      dealIds.length
        ? this.dealModel
            .find({ _id: { $in: dealIds } })
            .select('lead')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const leadById = new Map(
      (leads as any[]).map((l) => [String(l._id), l]),
    );
    const contactById = new Map(
      (contacts as any[]).map((c) => [String(c._id), c]),
    );

    const dealLeadIds = (deals as any[])
      .map((d) => (d.lead ? String(d.lead) : ''))
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));
    const contactSourceLeadIds = (contacts as any[])
      .map((c) => (c.sourceLead ? String(c.sourceLead) : ''))
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));
    const extraLeadIds = [...dealLeadIds, ...contactSourceLeadIds].filter(
      (id) => !leadById.has(String(id)),
    );
    if (extraLeadIds.length) {
      const extraLeads = await this.leadModel
        .find({ _id: { $in: extraLeadIds } })
        .select('source opportunitySourcePlatform sourceMetadata leadType')
        .lean()
        .exec();
      for (const l of extraLeads as any[]) {
        leadById.set(String(l._id), l);
      }
    }

    const dealById = new Map(
      (deals as any[]).map((d) => [String(d._id), d]),
    );

    for (const reply of replies as any[]) {
      if (!reply.relatedTo) {
        ensure('Unknown').replies += 1;
        continue;
      }
      const id = String(reply.relatedTo);
      const t = String(reply.relatedType || '');
      let channel = 'Unknown';
      if (t === 'Lead') {
        const lead = leadById.get(id);
        channel = lead ? this.normalizeAcquisitionChannel(lead) : 'Unknown';
      } else if (t === 'Contact') {
        const contact = contactById.get(id);
        if (contact?.sourceLead && leadById.get(String(contact.sourceLead))) {
          channel = this.normalizeAcquisitionChannel(
            leadById.get(String(contact.sourceLead))!,
          );
        } else if (contact) {
          channel = this.normalizeAcquisitionChannel(contact);
        }
      } else if (t === 'Deal') {
        const deal = dealById.get(id);
        const lead = deal?.lead ? leadById.get(String(deal.lead)) : null;
        channel = lead ? this.normalizeAcquisitionChannel(lead) : 'Unknown';
      }
      ensure(channel).replies += 1;
    }

    return [...byChannel.values()]
      .map((row) => ({
        channel: row.channel,
        leads: row.leads,
        converted: row.converted,
        conversionRate:
          row.leads > 0
            ? Math.round((row.converted / row.leads) * 1000) / 10
            : 0,
        replies: row.replies,
        deals: row.deals,
        replyRate:
          row.leads > 0
            ? Math.round((row.replies / row.leads) * 1000) / 10
            : 0,
      }))
      .sort(
        (a, b) =>
          b.replies + b.deals + b.leads - (a.replies + a.deals + a.leads),
      )
      .slice(0, 12);
  }

  /**
   * For thread-matched replies in the period, count which outbound send # (on the same
   * CRM entity) received the reply — e.g. reply on send 1 (initial) vs send 3 (2nd follow-up).
   */
  private async computeFollowUpReplyAnalytics(
    start: Date,
    end: Date,
    authorId?: Types.ObjectId | Types.ObjectId[] | string | null,
  ): Promise<{
    repliesByAttempt: Array<{
      attempt: number;
      label: string;
      replies: number;
    }>;
    avgSendsAtReply: number;
    avgFollowUpsAtReply: number;
    repliedConversations: number;
    totalFollowUpSendsInPeriod: number;
    note: string;
  }> {
    const authorMatch = this.authorIdQueryValue(
      Array.isArray(authorId)
        ? authorId
        : authorId
          ? [new Types.ObjectId(String(authorId))]
          : null,
    );
    const authorFilter = authorMatch != null ? { author: authorMatch } : {};
    const userFilter = authorMatch != null ? { userId: authorMatch } : {};

    const [replies, followUpSendsInPeriod] = await Promise.all([
      this.activityModel
        .find({
          type: 'Email',
          createdAt: { $gte: start, $lte: end },
          'metadata.direction': 'inbound',
          'metadata.matchReason': 'in_reply_to',
          'metadata.trackingToken': { $exists: true, $nin: [null, ''] },
          ...authorFilter,
        })
        .select('metadata.trackingToken createdAt relatedTo')
        .lean()
        .exec(),
      this.emailTrackingModel.countDocuments({
        createdAt: { $gte: start, $lte: end },
        ...userFilter,
      }),
    ]);

    const empty = {
      repliesByAttempt: [] as Array<{
        attempt: number;
        label: string;
        replies: number;
      }>,
      avgSendsAtReply: 0,
      avgFollowUpsAtReply: 0,
      repliedConversations: 0,
      totalFollowUpSendsInPeriod: Math.max(0, followUpSendsInPeriod),
      note: 'Attempt # is the outbound tracked send number on the same CRM record when a thread reply matched that send. Send #1 = initial outreach; send #2 = 1st follow-up, and so on. Averages use the first matched reply per conversation in the period.',
    };

    if (!replies.length) {
      return empty;
    }

    const tokens = [
      ...new Set(
        replies
          .map((r: any) => String(r?.metadata?.trackingToken || '').trim())
          .filter(Boolean),
      ),
    ];
    if (!tokens.length) return empty;

    const tracks = await this.emailTrackingModel
      .find({ trackingToken: { $in: tokens } })
      .select('trackingToken entityId createdAt recipient')
      .lean()
      .exec();
    const trackByToken = new Map(
      tracks.map((t: any) => [String(t.trackingToken), t]),
    );

    const entityIds = [
      ...new Set(
        tracks
          .map((t: any) => (t.entityId ? String(t.entityId) : ''))
          .filter(Boolean),
      ),
    ].map((id) => new Types.ObjectId(id));

    const sendsForEntities =
      entityIds.length > 0
        ? await this.emailTrackingModel
            .find({
              entityId: { $in: entityIds },
              ...userFilter,
            })
            .select('entityId createdAt')
            .sort({ createdAt: 1 })
            .lean()
            .exec()
        : [];

    const sendsByEntity = new Map<string, Date[]>();
    for (const send of sendsForEntities as any[]) {
      const key = String(send.entityId);
      const list = sendsByEntity.get(key) || [];
      list.push(new Date(send.createdAt));
      sendsByEntity.set(key, list);
    }

    // First reply per conversation (relatedTo) in the period
    const firstReplyByConversation = new Map<string, any>();
    for (const reply of replies as any[]) {
      const convKey = reply.relatedTo
        ? String(reply.relatedTo)
        : `token:${reply.metadata?.trackingToken}`;
      const existing = firstReplyByConversation.get(convKey);
      if (
        !existing ||
        new Date(reply.createdAt).getTime() <
          new Date(existing.createdAt).getTime()
      ) {
        firstReplyByConversation.set(convKey, reply);
      }
    }

    const attemptCounts = new Map<number, number>();
    const attemptValues: number[] = [];

    for (const reply of firstReplyByConversation.values()) {
      const token = String(reply.metadata?.trackingToken || '').trim();
      const track = trackByToken.get(token);
      if (!track?.entityId || !track.createdAt) continue;

      const entityKey = String(track.entityId);
      const sends = sendsByEntity.get(entityKey) || [];
      const replySendAt = new Date(track.createdAt).getTime();
      const attempt = sends.filter((d) => d.getTime() <= replySendAt).length;
      if (attempt < 1) continue;

      attemptCounts.set(attempt, (attemptCounts.get(attempt) || 0) + 1);
      attemptValues.push(attempt);
    }

    const repliesByAttempt = [...attemptCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([attempt, count]) => ({
        attempt,
        label:
          attempt === 1
            ? 'Send #1 (initial)'
            : `Send #${attempt} (${attempt - 1}${this.ordinalSuffix(attempt - 1)} follow-up)`,
        replies: count,
      }));

    const repliedConversations = attemptValues.length;
    const avgSendsAtReply =
      repliedConversations > 0
        ? Math.round(
            (attemptValues.reduce((s, n) => s + n, 0) / repliedConversations) *
              10,
          ) / 10
        : 0;
    const avgFollowUpsAtReply =
      repliedConversations > 0
        ? Math.round(
            (attemptValues.reduce((s, n) => s + Math.max(0, n - 1), 0) /
              repliedConversations) *
              10,
          ) / 10
        : 0;

    // Follow-up sends ≈ total tracked sends minus one initial per entity that got mail in period
    // Simpler KPI: tracked sends in period that are "not the first ever send" is hard;
    // report total tracked sends and note averages are at-reply.
    return {
      repliesByAttempt,
      avgSendsAtReply,
      avgFollowUpsAtReply,
      repliedConversations,
      totalFollowUpSendsInPeriod: Math.max(0, followUpSendsInPeriod),
      note: empty.note,
    };
  }

  private ordinalSuffix(n: number): string {
    const v = n % 100;
    if (v >= 11 && v <= 13) return 'th';
    switch (n % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  }

  private async aggregateRecordsByPipelineStage(
    model: Model<any>,
    matchFilter: Record<string, unknown>,
  ) {
    return model.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'pipelines',
          localField: 'pipeline',
          foreignField: '_id',
          as: 'pipeDoc',
        },
      },
      {
        $addFields: {
          pipelineIdStr: {
            $cond: [
              { $ifNull: ['$pipeline', false] },
              { $toString: '$pipeline' },
              null,
            ],
          },
          pipelineName: {
            $ifNull: [{ $arrayElemAt: ['$pipeDoc.name', 0] }, 'No pipeline'],
          },
          stageName: { $ifNull: ['$stage', 'Unknown'] },
        },
      },
      {
        $group: {
          _id: {
            pid: '$pipelineIdStr',
            pn: '$pipelineName',
            stage: '$stageName',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.pn': 1, count: -1 } },
    ]);
  }

  private reshapePipelineStageAgg(
    rows: Array<{
      _id: { pid: string | null; pn: string; stage: string };
      count: number;
    }>,
  ): Array<{
    pipelineId: string | null;
    pipelineName: string;
    total: number;
    stages: Array<{ stage: string; count: number }>;
  }> {
    const map = new Map<
      string,
      {
        pipelineId: string | null;
        pipelineName: string;
        stages: Array<{ stage: string; count: number }>;
      }
    >();

    for (const row of rows) {
      const pipelineId = row._id?.pid ?? null;
      const pipelineName = String(row._id?.pn || 'No pipeline').trim() || 'No pipeline';
      const key = pipelineId || '__none__';
      const stage = String(row._id?.stage || 'Unknown').trim() || 'Unknown';
      const count = Number(row.count) || 0;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          pipelineId,
          pipelineName,
          stages: [{ stage, count }],
        });
      } else {
        existing.stages.push({ stage, count });
      }
    }

    return [...map.values()]
      .map((p) => ({
        ...p,
        total: p.stages.reduce((s, st) => s + st.count, 0),
        stages: p.stages.sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }

  async getSalesDepartmentHealth(
    window: string = 'this_week',
    owner?: string,
  ) {
    const ownerKey = owner && owner !== 'All' ? String(owner) : 'all';
    const windowKey = String(window || 'this_week').trim().toLowerCase();
    const cacheKey = `crm:reporting:sales-health:v3:${ownerKey}:${windowKey}`;
    return this.appCache.getOrSet(
      cacheKey,
      this.appCache.crmReportingTtl(),
      () => this.computeSalesDepartmentHealth(windowKey, owner),
    );
  }

  private windowLabel(key: string): string {
    const labels: Record<string, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      this_week: 'This week',
      this_month: 'This month',
      last_30_days: 'Last 30 days',
    };
    return labels[key] || key;
  }

  private ownerRecordFilter(
    owner: string | undefined,
    field: 'leadOwner' | 'dealOwner',
  ): Record<string, unknown> {
    // Sync exact-match kept for call sites that cannot await; prefer ownerFieldFilter.
    if (!owner || owner === 'All' || owner === 'All authorized') return {};
    return { [field]: owner };
  }

  private async computeWindowWorkSnapshot(
    range: { start: Date; end: Date },
    owner?: string,
    authorId?: Types.ObjectId | Types.ObjectId[] | null,
  ) {
    const [leadOwnerFilter, dealOwnerFilter] = await Promise.all([
      this.ownerFieldFilter(owner, 'leadOwner'),
      this.ownerFieldFilter(owner, 'dealOwner'),
    ]);
    const leadMatch = {
      createdAt: { $gte: range.start, $lte: range.end },
      ...leadOwnerFilter,
    };
    const dealMatch = {
      createdAt: { $gte: range.start, $lte: range.end },
      ...dealOwnerFilter,
    };
    const wonMatch = {
      stage: 'Closed Won',
      $or: [
        { closedDate: { $gte: range.start, $lte: range.end } },
        {
          closedDate: { $exists: false },
          updatedAt: { $gte: range.start, $lte: range.end },
        },
      ],
      ...dealOwnerFilter,
    };
    const activityMatch: Record<string, unknown> = {
      createdAt: { $gte: range.start, $lte: range.end },
      type: { $nin: ['System'] },
    };
    const authorMatch = this.authorIdQueryValue(authorId);
    if (authorMatch != null) activityMatch.author = authorMatch;

    const emailMatch: Record<string, unknown> = {
      createdAt: { $gte: range.start, $lte: range.end },
    };
    if (authorMatch != null) emailMatch.userId = authorMatch;

    const replyMatch: Record<string, unknown> = {
      type: 'Email',
      createdAt: { $gte: range.start, $lte: range.end },
      'metadata.direction': 'inbound',
    };
    if (authorMatch != null) replyMatch.author = authorMatch;

    const [
      leadsCreated,
      leadsConverted,
      dealsCreated,
      dealsWon,
      activities,
      calls,
      emailsLogged,
      tasksLogged,
      meetings,
      trackedSends,
      emailOpened,
      emailClicked,
      replies,
    ] = await Promise.all([
      this.leadModel.countDocuments(leadMatch),
      this.leadModel.countDocuments({ ...leadMatch, converted: true }),
      this.dealModel.countDocuments(dealMatch),
      this.dealModel.countDocuments(wonMatch),
      this.activityModel.countDocuments(activityMatch),
      this.activityModel.countDocuments({ ...activityMatch, type: 'Call' }),
      this.activityModel.countDocuments({ ...activityMatch, type: 'Email' }),
      this.activityModel.countDocuments({ ...activityMatch, type: 'Task' }),
      this.activityModel.countDocuments({
        ...activityMatch,
        type: { $in: ['Meeting', 'Event'] },
      }),
      this.emailTrackingModel.countDocuments(emailMatch),
      this.emailTrackingModel.countDocuments({
        ...emailMatch,
        openCount: { $gt: 0 },
      }),
      this.emailTrackingModel.countDocuments({
        ...emailMatch,
        'clicks.0': { $exists: true },
      }),
      this.activityModel.countDocuments(replyMatch),
    ]);

    return {
      leadsCreated,
      leadsConverted,
      dealsCreated,
      dealsWon,
      activities,
      calls,
      emailsLogged,
      tasksLogged,
      meetings,
      trackedSends,
      emailOpened,
      emailClicked,
      replies,
    };
  }

  private async computeSalesDepartmentHealth(
    window: string,
    owner?: string,
  ) {
    const range = this.resolveWorkspaceWindow(window);
    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const authorId = authorIds.length ? authorIds : null;
    const exchangeRate = await this.getExchangeRate();

    const workDone = await this.computeWindowWorkSnapshot(
      range,
      owner,
      authorId,
    );

    const [todaySnap, weekSnap, monthSnap] = await Promise.all([
      this.computeWindowWorkSnapshot(
        this.resolveWorkspaceWindow('today'),
        owner,
        authorId,
      ),
      this.computeWindowWorkSnapshot(
        this.resolveWorkspaceWindow('this_week'),
        owner,
        authorId,
      ),
      this.computeWindowWorkSnapshot(
        this.resolveWorkspaceWindow('this_month'),
        owner,
        authorId,
      ),
    ]);

    const [leadOwnerFilter, dealOwnerFilter] = await Promise.all([
      this.ownerFieldFilter(owner, 'leadOwner'),
      this.ownerFieldFilter(owner, 'dealOwner'),
    ]);
    const openLeadFilter: Record<string, unknown> = {
      converted: { $ne: true },
      ...leadOwnerFilter,
    };
    const openDealFilter: Record<string, unknown> = {
      stage: { $nin: ['Closed Won', 'Closed Lost'] },
      ...dealOwnerFilter,
    };
    const touchCutoff = new Date();
    touchCutoff.setDate(touchCutoff.getDate() - STALE_LEAD_DAYS);

    const activityHuman: Record<string, unknown> = {
      createdAt: { $gte: range.start, $lte: range.end },
      type: { $nin: ['System'] },
    };
    const salesAuthorMatch = this.authorIdQueryValue(authorId);
    if (salesAuthorMatch != null) activityHuman.author = salesAuthorMatch;

    const [
      followUpHealth,
      openDeals,
      activityByDay,
      activityByType,
      repActivity,
      repLeads,
      repDeals,
      overdueTasks,
    ] = await Promise.all([
      this.getFollowUpHealth(openLeadFilter, touchCutoff),
      this.dealModel
        .find(openDealFilter)
        .select('dealValue currency probability stage expectedClosureDate pipeline')
        .lean()
        .exec(),
      this.activityModel.aggregate([
        { $match: activityHuman },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: this.reportingCalendarTz(),
              },
            },
            activities: { $sum: 1 },
            calls: {
              $sum: { $cond: [{ $eq: ['$type', 'Call'] }, 1, 0] },
            },
            emails: {
              $sum: { $cond: [{ $eq: ['$type', 'Email'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id',
            activities: 1,
            calls: 1,
            emails: 1,
          },
        },
      ]),
      this.activityModel.aggregate([
        { $match: activityHuman },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      owner && owner !== 'All'
        ? Promise.resolve([])
        : this.activityModel.aggregate(
            this.engagementByAuthorPipeline(activityHuman, 24),
          ),
      owner && owner !== 'All'
        ? Promise.resolve([])
        : this.leadModel.aggregate([
            {
              $match: {
                createdAt: { $gte: range.start, $lte: range.end },
              },
            },
            {
              $group: {
                _id: { $ifNull: ['$leadOwner', 'Unassigned'] },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 12 },
          ]),
      owner && owner !== 'All'
        ? Promise.resolve([])
        : this.dealModel.aggregate([
            {
              $match: {
                createdAt: { $gte: range.start, $lte: range.end },
              },
            },
            {
              $group: {
                _id: { $ifNull: ['$dealOwner', 'Unassigned'] },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 12 },
          ]),
      this.activityModel.countDocuments({
        type: 'Task',
        ...(salesAuthorMatch != null ? { author: salesAuthorMatch } : {}),
        'metadata.dueDate': { $exists: true, $lt: new Date().toISOString().slice(0, 10) },
        'metadata.status': { $ne: 'completed' },
      }),
    ]);

    let pipelineGross = 0;
    let pipelineWeighted = 0;
    let atRiskDeals = 0;
    const now = new Date();
    const healthPipelineIds = [
      ...new Set(
        (openDeals as Array<{ pipeline?: Types.ObjectId }>)
          .map((d) => (d.pipeline ? String(d.pipeline) : ''))
          .filter(Boolean),
      ),
    ];
    const healthPipelines =
      healthPipelineIds.length > 0
        ? await this.pipelineModel
            .find({
              _id: {
                $in: healthPipelineIds.map((id) => new Types.ObjectId(id)),
              },
            })
            .select('stages')
            .lean()
            .exec()
        : await this.pipelineModel
            .find({ type: 'deals' })
            .select('stages')
            .lean()
            .exec();
    const healthStageMaps = buildPipelineStageProbabilityMaps(
      healthPipelines as any[],
    );
    for (const d of openDeals as Array<{
      dealValue?: number;
      currency?: string;
      probability?: number;
      expectedClosureDate?: Date;
      stage?: string;
      pipeline?: Types.ObjectId;
    }>) {
      const val = this.toINR(
        Number(d.dealValue) || 0,
        String(d.currency || 'USD'),
        exchangeRate,
      );
      pipelineGross += val;
      const probability = resolveDealProbabilityFromStages(d, healthStageMaps);
      pipelineWeighted += val * (probability / 100);
      const close = d.expectedClosureDate
        ? new Date(d.expectedClosureDate)
        : null;
      if (close && close < now && d.stage !== 'Closed Won') atRiskDeals += 1;
    }

    const openRate =
      workDone.trackedSends > 0
        ? Math.round((workDone.emailOpened / workDone.trackedSends) * 1000) / 10
        : 0;
    const replyRate =
      workDone.trackedSends > 0
        ? Math.round((workDone.replies / workDone.trackedSends) * 1000) / 10
        : 0;

    let healthScore = 100;
    const stalePct =
      followUpHealth.openLeads > 0
        ? (followUpHealth.staleLeads / followUpHealth.openLeads) * 100
        : 0;
    healthScore -= Math.min(25, stalePct * 0.25);
    healthScore -= Math.min(15, overdueTasks * 1.5);
    if (followUpHealth.touchCoveragePercent < 40) healthScore -= 12;
    else if (followUpHealth.touchCoveragePercent < 60) healthScore -= 6;
    if (workDone.trackedSends >= 5 && openRate < 12) healthScore -= 8;
    if (workDone.activities === 0 && range.key === 'today') healthScore -= 15;
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    const healthStatus: 'healthy' | 'watch' | 'at_risk' =
      healthScore >= 75 ? 'healthy' : healthScore >= 50 ? 'watch' : 'at_risk';

    const collapsedRepActivity = await this.collapseEngagementByAuthor(
      repActivity as Array<{
        _id: string | Types.ObjectId | null;
        count: number;
      }>,
    );
    const [collapsedRepLeads, collapsedRepDeals] = await Promise.all([
      this.collapseOwnerCountRows(
        (repLeads as Array<{ _id: string; count: number }>).map((r) => ({
          owner: r._id || 'Unassigned',
          count: r.count,
        })),
      ),
      this.collapseOwnerCountRows(
        (repDeals as Array<{ _id: string; count: number }>).map((r) => ({
          owner: r._id || 'Unassigned',
          count: r.count,
        })),
      ),
    ]);

    const leaderboardMap = new Map<
      string,
      {
        name: string;
        activities: number;
        leadsCreated: number;
        dealsCreated: number;
      }
    >();
    for (const row of collapsedRepActivity) {
      const cur = leaderboardMap.get(row.name) || {
        name: row.name,
        activities: 0,
        leadsCreated: 0,
        dealsCreated: 0,
      };
      cur.activities += row.count;
      leaderboardMap.set(row.name, cur);
    }
    for (const row of collapsedRepLeads) {
      const cur = leaderboardMap.get(row.owner) || {
        name: row.owner,
        activities: 0,
        leadsCreated: 0,
        dealsCreated: 0,
      };
      cur.leadsCreated += row.count;
      leaderboardMap.set(row.owner, cur);
    }
    for (const row of collapsedRepDeals) {
      const cur = leaderboardMap.get(row.owner) || {
        name: row.owner,
        activities: 0,
        leadsCreated: 0,
        dealsCreated: 0,
      };
      cur.dealsCreated += row.count;
      leaderboardMap.set(row.owner, cur);
    }
    const repLeaderboard = [...leaderboardMap.values()]
      .sort(
        (a, b) =>
          b.activities + b.leadsCreated * 2 + b.dealsCreated * 3 -
          (a.activities + a.leadsCreated * 2 + a.dealsCreated * 3),
      )
      .slice(0, 10);

    return {
      window: range.key,
      windowLabel: this.windowLabel(range.key),
      health: {
        score: healthScore,
        status: healthStatus,
        indicators: [
          {
            key: 'touch_coverage',
            label: 'Lead touch coverage',
            value: `${followUpHealth.touchCoveragePercent}%`,
            status:
              followUpHealth.touchCoveragePercent >= 60
                ? 'good'
                : followUpHealth.touchCoveragePercent >= 40
                  ? 'watch'
                  : 'risk',
            hint: `${followUpHealth.leadsTouchedRecently} of ${followUpHealth.openLeads} open leads touched in ${followUpHealth.staleDays}d`,
          },
          {
            key: 'stale_leads',
            label: 'Stale leads',
            value: followUpHealth.staleLeads,
            status:
              followUpHealth.staleLeads === 0
                ? 'good'
                : followUpHealth.staleLeads <= 5
                  ? 'watch'
                  : 'risk',
            hint: 'Open leads with no recent activity',
          },
          {
            key: 'email_open_rate',
            label: 'Email open rate',
            value: `${openRate}%`,
            status:
              openRate >= 20 ? 'good' : openRate >= 10 ? 'watch' : 'risk',
            hint: `${workDone.emailOpened} of ${workDone.trackedSends} tracked sends`,
          },
          {
            key: 'overdue_tasks',
            label: 'Overdue tasks',
            value: overdueTasks,
            status:
              overdueTasks === 0 ? 'good' : overdueTasks <= 3 ? 'watch' : 'risk',
            hint: 'Tasks past due date',
          },
          {
            key: 'at_risk_deals',
            label: 'Past-due close deals',
            value: atRiskDeals,
            status: atRiskDeals === 0 ? 'good' : atRiskDeals <= 2 ? 'watch' : 'risk',
            hint: 'Open deals past expected close',
          },
        ],
      },
      workDone,
      comparison: {
        today: todaySnap,
        this_week: weekSnap,
        this_month: monthSnap,
      },
      activityByDay,
      activityByType: (activityByType as Array<{ _id: string; count: number }>).map(
        (r) => ({ type: r._id || 'Unknown', count: r.count }),
      ),
      repLeaderboard,
      pipeline: {
        openLeads: followUpHealth.openLeads,
        openDeals: openDeals.length,
        grossValueINR: Math.round(pipelineGross),
        weightedValueINR: Math.round(pipelineWeighted),
        staleLeads: followUpHealth.staleLeads,
        touchCoveragePercent: followUpHealth.touchCoveragePercent,
        overdueTasks,
        atRiskDeals,
        emailOpenRatePercent: openRate,
        emailReplyRatePercent: replyRate,
      },
    };
  }

  async getReportSummaryCharts(window: string = 'today', owner?: string) {
    const ownerKey = owner && owner !== 'All' ? String(owner) : 'all';
    const windowKey = String(window || 'today').trim().toLowerCase();
    const cacheKey = `crm:reporting:summary-charts:v3:${ownerKey}:${windowKey}`;
    return this.appCache.getOrSet(
      cacheKey,
      this.appCache.crmReportingTtl(),
      () => this.computeReportSummaryCharts(windowKey, owner),
    );
  }

  private hourLabelIn12h(h: number): string {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  private fillSummaryBuckets(
    rows: Array<{ bucket: string; count: number }>,
    range: { start: Date; end: Date },
    hourly: boolean,
  ): Array<{ bucket: string; label: string; count: number }> {
    const tz = this.reportingCalendarTz();
    const map = new Map(rows.map((r) => [r.bucket, r.count]));
    const out: Array<{ bucket: string; label: string; count: number }> = [];

    if (hourly) {
      for (let h = 0; h <= 23; h++) {
        const bucket = `${String(h).padStart(2, '0')}:00`;
        out.push({
          bucket,
          label: this.hourLabelIn12h(h),
          count: map.get(bucket) || 0,
        });
      }
      return out;
    }

    let cursorYmd = this.formatYmdInTz(range.start, tz);
    const endYmd = this.formatYmdInTz(range.end, tz);
    while (cursorYmd <= endYmd) {
      const mid = this.startOfYmdInTz(cursorYmd, tz);
      out.push({
        bucket: cursorYmd,
        label: mid.toLocaleDateString('en-US', {
          timeZone: tz,
          month: 'short',
          day: 'numeric',
        }),
        count: map.get(cursorYmd) || 0,
      });
      cursorYmd = this.addDaysToYmd(cursorYmd, 1);
    }
    return out;
  }

  /**
   * Avg hours from lead create → first tracked email (outreach),
   * and avg hours between consecutive tracked emails (follow-up).
   * Samples are sends that occurred inside the selected window (IST).
   */
  private async computeLeadOutreachTiming(
    range: { start: Date; end: Date; key?: string },
    owner?: string,
    hourly = false,
  ): Promise<{
    avgOutreachHours: number;
    avgFollowUpHours: number;
    outreachSamples: number;
    followUpSamples: number;
    outreachByBucket: Array<{ bucket: string; label: string; hours: number; samples: number }>;
    followUpByBucket: Array<{ bucket: string; label: string; hours: number; samples: number }>;
    note: string;
  }> {
    const tz = this.reportingCalendarTz();
    const leadOwnerFilter = await this.ownerFieldFilter(owner, 'leadOwner');
    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const authorMatch = this.authorIdQueryValue(
      authorIds.length ? authorIds : null,
    );

    const sendMatch: Record<string, unknown> = {
      createdAt: { $gte: range.start, $lte: range.end },
      entityId: { $exists: true, $ne: null },
      module: { $regex: /^leads?$/i },
    };
    if (authorMatch != null) sendMatch.userId = authorMatch;

    const entityIds = (await this.emailTrackingModel.distinct(
      'entityId',
      sendMatch,
    )) as Types.ObjectId[];

    const emptyBuckets = this.fillSummaryBuckets([], range, hourly).map(
      (b) => ({
        bucket: b.bucket,
        label: b.label,
        hours: 0,
        samples: 0,
      }),
    );
    const empty = {
      avgOutreachHours: 0,
      avgFollowUpHours: 0,
      outreachSamples: 0,
      followUpSamples: 0,
      outreachByBucket: emptyBuckets,
      followUpByBucket: emptyBuckets.map((b) => ({ ...b })),
      note: 'Outreach = hours from lead created to first tracked email. Follow-up = hours between consecutive tracked emails on the same lead. Averages use sends in the selected period (India time).',
    };

    if (!entityIds.length) return empty;

    const [allSends, leads] = await Promise.all([
      this.emailTrackingModel
        .find({
          entityId: { $in: entityIds },
          module: { $regex: /^leads?$/i },
        })
        .select('entityId createdAt')
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
      this.leadModel
        .find({ _id: { $in: entityIds }, ...leadOwnerFilter })
        .select('_id createdAt')
        .lean()
        .exec(),
    ]);

    const leadCreated = new Map<string, number>();
    for (const lead of leads as Array<{ _id: Types.ObjectId; createdAt?: Date }>) {
      if (lead?.createdAt) {
        leadCreated.set(String(lead._id), new Date(lead.createdAt).getTime());
      }
    }

    const sendsByEntity = new Map<string, number[]>();
    for (const row of allSends as Array<{
      entityId?: Types.ObjectId;
      createdAt?: Date;
    }>) {
      const id = row.entityId ? String(row.entityId) : '';
      if (!id || !leadCreated.has(id) || !row.createdAt) continue;
      const list = sendsByEntity.get(id) || [];
      list.push(new Date(row.createdAt).getTime());
      sendsByEntity.set(id, list);
    }

    const outreachHours: number[] = [];
    const followUpHours: number[] = [];
    const outreachBucketSums = new Map<string, { sum: number; n: number }>();
    const followUpBucketSums = new Map<string, { sum: number; n: number }>();

    const bucketKeyFor = (ms: number): string => {
      const d = new Date(ms);
      if (hourly) {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          hour12: false,
        }).formatToParts(d);
        let hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
        if (hour === 24) hour = 0;
        return `${String(hour).padStart(2, '0')}:00`;
      }
      return this.formatYmdInTz(d, tz);
    };

    const addSample = (
      map: Map<string, { sum: number; n: number }>,
      key: string,
      hours: number,
    ) => {
      const cur = map.get(key) || { sum: 0, n: 0 };
      cur.sum += hours;
      cur.n += 1;
      map.set(key, cur);
    };

    const rangeStartMs = range.start.getTime();
    const rangeEndMs = range.end.getTime();

    for (const [entityId, sends] of sendsByEntity) {
      const createdMs = leadCreated.get(entityId);
      if (createdMs == null || !sends.length) continue;
      sends.sort((a, b) => a - b);

      const first = sends[0];
      if (first >= rangeStartMs && first <= rangeEndMs) {
        const hours = Math.max(0, (first - createdMs) / 3600000);
        outreachHours.push(hours);
        addSample(outreachBucketSums, bucketKeyFor(first), hours);
      }

      for (let i = 1; i < sends.length; i++) {
        const sendAt = sends[i];
        if (sendAt < rangeStartMs || sendAt > rangeEndMs) continue;
        const hours = Math.max(0, (sendAt - sends[i - 1]) / 3600000);
        followUpHours.push(hours);
        addSample(followUpBucketSums, bucketKeyFor(sendAt), hours);
      }
    }

    const avg = (arr: number[]) =>
      arr.length
        ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10
        : 0;

    const toSeries = (sums: Map<string, { sum: number; n: number }>) =>
      this.fillSummaryBuckets([], range, hourly).map((b) => {
        const hit = sums.get(b.bucket);
        return {
          bucket: b.bucket,
          label: b.label,
          hours: hit
            ? Math.round((hit.sum / hit.n) * 10) / 10
            : 0,
          samples: hit?.n || 0,
        };
      });

    return {
      avgOutreachHours: avg(outreachHours),
      avgFollowUpHours: avg(followUpHours),
      outreachSamples: outreachHours.length,
      followUpSamples: followUpHours.length,
      outreachByBucket: toSeries(outreachBucketSums),
      followUpByBucket: toSeries(followUpBucketSums),
      note: empty.note,
    };
  }

  private async computeReportSummaryCharts(
    window: string,
    owner?: string,
  ) {
    const range = this.resolveWorkspaceWindow(window);
    const hourly =
      range.key === 'today' || range.key === 'yesterday';
    const tz = this.reportingCalendarTz();
    const bucketFormat = hourly ? '%H:00' : '%Y-%m-%d';
    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const authorMatch = this.authorIdQueryValue(
      authorIds.length ? authorIds : null,
    );
    const leadOwnerFilter = await this.ownerFieldFilter(owner, 'leadOwner');

    const leadMatch: Record<string, unknown> = {
      createdAt: { $gte: range.start, $lte: range.end },
      ...leadOwnerFilter,
    };

    const emailOpenMatch: Record<string, unknown> = {
      lastOpenedAt: { $gte: range.start, $lte: range.end },
      openCount: { $gt: 0 },
    };
    if (authorMatch != null) emailOpenMatch.userId = authorMatch;

    const emailReplyMatch: Record<string, unknown> = {
      type: 'Email',
      createdAt: { $gte: range.start, $lte: range.end },
      'metadata.direction': 'inbound',
      'metadata.matchReason': 'in_reply_to',
    };
    if (authorMatch != null) emailReplyMatch.author = authorMatch;

    const [
      emailOpensAgg,
      emailRepliesAgg,
      leadsByPipelineAgg,
      leadsByServiceAgg,
      totalLeadsAdded,
      leadTiming,
    ] = await Promise.all([
      this.emailTrackingModel.aggregate([
        { $match: emailOpenMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: bucketFormat,
                date: '$lastOpenedAt',
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.activityModel.aggregate([
        { $match: emailReplyMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: bucketFormat,
                date: '$createdAt',
                timezone: tz,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.leadModel.aggregate([
        { $match: leadMatch },
        {
          $lookup: {
            from: 'pipelines',
            localField: 'pipeline',
            foreignField: '_id',
            as: 'pipeDoc',
          },
        },
        {
          $addFields: {
            pipelineIdStr: {
              $cond: [
                { $ifNull: ['$pipeline', false] },
                { $toString: '$pipeline' },
                null,
              ],
            },
            pipelineName: {
              $ifNull: [
                { $arrayElemAt: ['$pipeDoc.name', 0] },
                'No pipeline',
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              pid: '$pipelineIdStr',
              pn: '$pipelineName',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.leadModel.aggregate([
        { $match: leadMatch },
        {
          $lookup: {
            from: 'serviceofferings',
            localField: 'relatedService',
            foreignField: '_id',
            as: 'svcDoc',
          },
        },
        {
          $addFields: {
            serviceIdStr: {
              $cond: [
                { $ifNull: ['$relatedService', false] },
                { $toString: '$relatedService' },
                null,
              ],
            },
            serviceName: {
              $ifNull: [
                { $arrayElemAt: ['$svcDoc.name', 0] },
                'No service',
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              sid: '$serviceIdStr',
              sn: '$serviceName',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.leadModel.countDocuments(leadMatch),
      this.computeLeadOutreachTiming(range, owner, hourly),
    ]);

    const emailOpens = this.fillSummaryBuckets(
      (emailOpensAgg as Array<{ _id: string; count: number }>).map((r) => ({
        bucket: r._id,
        count: r.count,
      })),
      range,
      hourly,
    );
    const emailReplies = this.fillSummaryBuckets(
      (emailRepliesAgg as Array<{ _id: string; count: number }>).map((r) => ({
        bucket: r._id,
        count: r.count,
      })),
      range,
      hourly,
    );

    const leadsByPipeline = (
      leadsByPipelineAgg as Array<{
        _id: { pid: string | null; pn: string };
        count: number;
      }>
    ).map((r) => ({
      pipelineId: r._id?.pid ?? null,
      pipelineName: String(r._id?.pn || 'No pipeline').trim() || 'No pipeline',
      count: r.count,
    }));

    const leadsByService = (
      leadsByServiceAgg as Array<{
        _id: { sid: string | null; sn: string };
        count: number;
      }>
    ).map((r) => ({
      serviceId: r._id?.sid ?? null,
      serviceName: String(r._id?.sn || 'No service').trim() || 'No service',
      count: r.count,
    }));

    const totalEmailOpens = emailOpens.reduce((s, r) => s + r.count, 0);
    const totalEmailReplies = emailReplies.reduce((s, r) => s + r.count, 0);

    return {
      window: range.key,
      windowLabel: this.windowLabel(range.key),
      timezone: tz,
      granularity: hourly ? ('hour' as const) : ('day' as const),
      emailOpens,
      emailReplies,
      leadsByPipeline,
      leadsByService,
      leadTiming,
      totals: {
        emailOpens: totalEmailOpens,
        emailReplies: totalEmailReplies,
        leadsAdded: totalLeadsAdded,
        avgOutreachHours: leadTiming.avgOutreachHours,
        avgFollowUpHours: leadTiming.avgFollowUpHours,
      },
    };
  }

  /**
   * Per-template outreach stats from EmailTracking (opens, clicks), merged with all saved templates.
   */
  async getEmailTemplatePerformance(
    days: string | number = 30,
    owner?: string,
  ): Promise<{
    periodDays: number;
    templates: Array<{
      templateId: string;
      name: string;
      type: string;
      isActive: boolean;
      sends: number;
      uniqueOpened: number;
      totalOpens: number;
      openRatePercent: number;
      totalClicks: number;
      uniqueClicked: number;
      clickRatePercent: number;
      leadsConverted: number;
      leadsNotConverted: number;
    }>;
    note: string;
  }> {
    const { currentStart: start, currentEnd: end, safeDays } = this.parseDateRange(days);

    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const authorMatch = this.authorIdQueryValue(
      authorIds.length ? authorIds : null,
    );
    const emailTrackMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
      templateId: { $ne: null },
    };
    if (authorMatch != null) emailTrackMatch.userId = authorMatch;

    const agg = await this.emailTrackingModel.aggregate([
      {
        $lookup: {
          from: 'leads',
          localField: 'entityId',
          foreignField: '_id',
          as: 'leadDoc'
        }
      },
      {
        $addFields: {
          leadConverted: { $arrayElemAt: ['$leadDoc.converted', 0] },
          isLead: { $cond: [{ $eq: ['$module', 'lead'] }, true, { $cond: [{ $eq: ['$module', 'Lead'] }, true, false] }] }
        }
      },
      {
        $group: {
          _id: '$templateId',
          sends: { $sum: 1 },
          totalOpens: { $sum: '$openCount' },
          uniqueOpened: {
            $sum: { $cond: [{ $gt: ['$openCount', 0] }, 1, 0] },
          },
          totalClicks: {
            $sum: { $size: { $ifNull: ['$clicks', []] } },
          },
          uniqueClicked: {
            $sum: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$clicks', []] } }, 0] },
                1,
                0,
              ],
            },
          },
          leadsConverted: {
            $sum: { $cond: [{ $and: ['$isLead', { $eq: ['$leadConverted', true] }] }, 1, 0] }
          },
          leadsNotConverted: {
            $sum: { $cond: [{ $and: ['$isLead', { $eq: ['$leadConverted', false] }] }, 1, 0] }
          }
        },
      },
    ]);

    type StatRow = {
      sends: number;
      totalOpens: number;
      uniqueOpened: number;
      totalClicks: number;
      uniqueClicked: number;
      leadsConverted: number;
      leadsNotConverted: number;
    };
    const statsById = new Map<string, StatRow>(
      (agg as Array<{ _id: Types.ObjectId; [k: string]: unknown }>).map(
        (row) => [
          String(row._id),
          {
            sends: Number(row.sends) || 0,
            totalOpens: Number(row.totalOpens) || 0,
            uniqueOpened: Number(row.uniqueOpened) || 0,
            totalClicks: Number(row.totalClicks) || 0,
            uniqueClicked: Number(row.uniqueClicked) || 0,
            leadsConverted: Number(row.leadsConverted) || 0,
            leadsNotConverted: Number(row.leadsNotConverted) || 0,
          },
        ],
      ),
    );

    const allTemplates = await this.emailTemplateModel
      .find()
      .select('name type isActive')
      .sort({ name: 1 })
      .lean()
      .exec();

    const templates = allTemplates.map((t) => {
      const id = String(t._id);
      const s =
        statsById.get(id) ||
        ({
          sends: 0,
          totalOpens: 0,
          uniqueOpened: 0,
          totalClicks: 0,
          uniqueClicked: 0,
          leadsConverted: 0,
          leadsNotConverted: 0,
        } satisfies StatRow);
      const openRatePercent =
        s.sends > 0
          ? Math.round((s.uniqueOpened / s.sends) * 1000) / 10
          : 0;
      const clickRatePercent =
        s.sends > 0
          ? Math.round((s.uniqueClicked / s.sends) * 1000) / 10
          : 0;
      return {
        templateId: id,
        name: t.name,
        type: t.type || 'standard',
        isActive: t.isActive !== false,
        sends: s.sends,
        uniqueOpened: s.uniqueOpened,
        totalOpens: s.totalOpens,
        openRatePercent,
        totalClicks: s.totalClicks,
        uniqueClicked: s.uniqueClicked,
        clickRatePercent,
        leadsConverted: s.leadsConverted,
        leadsNotConverted: s.leadsNotConverted,
      };
    });

    templates.sort((a, b) => {
      if (b.sends !== a.sends) return b.sends - a.sends;
      return b.openRatePercent - a.openRatePercent;
    });

    return {
      periodDays: safeDays,
      templates,
      note:
        'Tracked CRM sends only (inbox or workflow) where a template id was stored. Rates are unique recipients opened / clicked at least once, divided by sends in the period. Use the owner filter to match a specific sender’s mailbox sends.',
    };
  }

  /**
   * Per sending-address (from) stats: all tracked CRM sends in the period, grouped by fromEmail.
   */
  async getEmailSenderPerformance(
    days: string | number = 30,
    owner?: string,
  ): Promise<{
    periodDays: number;
    senders: Array<{
      fromEmail: string;
      sends: number;
      uniqueOpened: number;
      totalOpens: number;
      openRatePercent: number;
      totalClicks: number;
      uniqueClicked: number;
      clickRatePercent: number;
    }>;
    note: string;
  }> {
    const { currentStart: start, currentEnd: end, safeDays } = this.parseDateRange(days);

    const authorIds = await this.resolveHrmsAuthorIds(owner);
    const authorMatch = this.authorIdQueryValue(
      authorIds.length ? authorIds : null,
    );
    const emailTrackMatch: Record<string, unknown> = {
      createdAt: { $gte: start, $lt: end },
    };
    if (authorMatch != null) emailTrackMatch.userId = authorMatch;

    const agg = await this.emailTrackingModel.aggregate([
      { $match: emailTrackMatch },
      {
        $lookup: {
          from: 'useremailaccounts',
          localField: 'accountId',
          foreignField: '_id',
          as: '_acct',
        },
      },
      {
        $addFields: {
          normFrom: {
            $let: {
              vars: {
                fe: {
                  $toLower: {
                    $trim: { input: { $ifNull: ['$fromEmail', ''] } },
                  },
                },
                acctEmail: {
                  $toLower: {
                    $trim: {
                      input: {
                        $ifNull: [{ $arrayElemAt: ['$_acct.email', 0] }, ''],
                      },
                    },
                  },
                },
              },
              in: {
                $cond: [
                  { $ne: ['$$fe', ''] },
                  '$$fe',
                  {
                    $cond: [
                      { $ne: ['$$acctEmail', ''] },
                      '$$acctEmail',
                      'unknown / legacy',
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$normFrom',
          sends: { $sum: 1 },
          totalOpens: { $sum: '$openCount' },
          uniqueOpened: {
            $sum: { $cond: [{ $gt: ['$openCount', 0] }, 1, 0] },
          },
          totalClicks: {
            $sum: { $size: { $ifNull: ['$clicks', []] } },
          },
          uniqueClicked: {
            $sum: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$clicks', []] } }, 0] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { sends: -1, uniqueOpened: -1 } },
      { $limit: 100 },
      {
        $project: {
          _id: 0,
          fromEmail: '$_id',
          sends: 1,
          totalOpens: 1,
          uniqueOpened: 1,
          totalClicks: 1,
          uniqueClicked: 1,
        },
      },
    ]);

    type Row = {
      fromEmail: string;
      sends: number;
      uniqueOpened: number;
      totalOpens: number;
      totalClicks: number;
      uniqueClicked: number;
    };
    const senders = (
      agg as Array<Row & Record<string, unknown>>
    ).map((row) => {
      const sends = Number(row.sends) || 0;
      const uniqueOpened = Number(row.uniqueOpened) || 0;
      const uniqueClicked = Number(row.uniqueClicked) || 0;
      const openRatePercent =
        sends > 0 ? Math.round((uniqueOpened / sends) * 1000) / 10 : 0;
      const clickRatePercent =
        sends > 0 ? Math.round((uniqueClicked / sends) * 1000) / 10 : 0;
      const key = String(row.fromEmail || 'unknown / legacy');
      return {
        fromEmail: key === 'unknown / legacy' ? 'Unknown / legacy' : key,
        sends,
        uniqueOpened,
        totalOpens: Number(row.totalOpens) || 0,
        openRatePercent,
        totalClicks: Number(row.totalClicks) || 0,
        uniqueClicked,
        clickRatePercent,
      };
    });

    return {
      periodDays: safeDays,
      senders,
      note:
        'Each row is a sending address (mailbox or SMTP from) on tracked CRM outbound mail, resolved from the from-address or linked inbox account. “Sends” counts tracking records created in the period; open and click rates use unique recipients who opened or clicked at least once. In-app bounce/delivery receipts are not stored — use your mail provider for true deliverability.',
    };
  }

  /**
   * For inbound reply activities: record label/owner, receiving mailbox, CRM user who synced,
   * and (for clients) assigned users — so the workspace can show who has context on the thread.
   */
  private async buildInboundReplyAccessSummaries(
    rows: Array<Record<string, unknown>>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!rows.length) return out;

    const authorIds = [
      ...new Set(
        rows
          .map((r) => r.author)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];
    const authorDocs = authorIds.length
      ? await this.hrmsUserModel
          .find({
            _id: {
              $in: authorIds.map((id) => new Types.ObjectId(id)),
            },
          })
          .select('firstName lastName email')
          .lean()
          .exec()
      : [];
    const authorName = new Map<string, string>();
    for (const u of authorDocs) {
      const n =
        `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
        String(u.email || '').trim();
      authorName.set(String(u._id), n);
    }

    const leadIds: Types.ObjectId[] = [];
    const dealIds: Types.ObjectId[] = [];
    const contactIds: Types.ObjectId[] = [];
    const clientIds: Types.ObjectId[] = [];
    const orgIds: Types.ObjectId[] = [];

    for (const r of rows) {
      const rt = String(r.relatedType || '').toLowerCase();
      const rid = r.relatedTo as Types.ObjectId | undefined;
      if (!rid) continue;
      if (rt === 'lead') leadIds.push(rid);
      else if (rt === 'deal') dealIds.push(rid);
      else if (rt === 'contact') contactIds.push(rid);
      else if (rt === 'client') clientIds.push(rid);
      else if (rt === 'organization') orgIds.push(rid);
    }

    const [leads, deals, contacts, clients, orgs] = await Promise.all([
      leadIds.length
        ? this.leadModel
            .find({ _id: { $in: leadIds } })
            .select('firstName lastName email leadOwner')
            .lean()
            .exec()
        : [],
      dealIds.length
        ? this.dealModel
            .find({ _id: { $in: dealIds } })
            .select('title dealOwner')
            .lean()
            .exec()
        : [],
      contactIds.length
        ? this.contactModel
            .find({ _id: { $in: contactIds } })
            .select('firstName lastName email leadOwner')
            .lean()
            .exec()
        : [],
      clientIds.length
        ? this.clientModel
            .find({ _id: { $in: clientIds } })
            .select('name email assignedTo')
            .lean()
            .exec()
        : [],
      orgIds.length
        ? this.organizationModel
            .find({ _id: { $in: orgIds } })
            .select('name')
            .lean()
            .exec()
        : [],
    ]);

    const leadMap = new Map(leads.map((x) => [String(x._id), x]));
    const dealMap = new Map(deals.map((x) => [String(x._id), x]));
    const contactMap = new Map(contacts.map((x) => [String(x._id), x]));
    const clientMap = new Map(clients.map((x) => [String(x._id), x]));
    const orgMap = new Map(orgs.map((x) => [String(x._id), x]));

    const assignIds = new Set<string>();
    for (const c of clients) {
      const raw = (c as { assignedTo?: Types.ObjectId[] }).assignedTo;
      if (Array.isArray(raw)) {
        for (const a of raw) assignIds.add(String(a));
      }
    }
    const assignUsers = assignIds.size
      ? await this.hrmsUserModel
          .find({
            _id: {
              $in: [...assignIds].map((id) => new Types.ObjectId(id)),
            },
          })
          .select('firstName lastName email')
          .lean()
          .exec()
      : [];
    const assignName = new Map(
      assignUsers.map((u) => {
        const n =
          `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
          String(u.email || '').trim();
        return [String(u._id), n] as const;
      }),
    );

    for (const r of rows) {
      const id = String((r._id as Types.ObjectId) || '');
      if (!id) continue;
      const meta = (r.metadata || {}) as {
        toEmail?: string;
      };
      const rt = String(r.relatedType || '').toLowerCase();
      const rid = r.relatedTo ? String(r.relatedTo) : '';
      const mailbox = String(meta.toEmail || '').trim();
      const authorId = r.author ? String(r.author) : '';
      const syncedBy = authorId ? authorName.get(authorId) : '';

      const parts: string[] = [];
      let assignedPart = '';

      let recordLabel = '';
      let recordOwner = '';

      if (rt === 'lead' && rid) {
        const L = leadMap.get(rid) as
          | {
              firstName?: string;
              lastName?: string;
              email?: string;
              leadOwner?: string;
            }
          | undefined;
        if (L) {
          recordLabel =
            `${L.firstName || ''} ${L.lastName || ''}`.trim() ||
            String(L.email || '').trim() ||
            'Lead';
          recordOwner = String(L.leadOwner || '').trim();
        }
      } else if (rt === 'deal' && rid) {
        const D = dealMap.get(rid) as
          | { title?: string; dealOwner?: string }
          | undefined;
        if (D) {
          recordLabel = String(D.title || '').trim() || 'Deal';
          recordOwner = String(D.dealOwner || '').trim();
        }
      } else if (rt === 'contact' && rid) {
        const C = contactMap.get(rid) as
          | {
              firstName?: string;
              lastName?: string;
              email?: string;
              leadOwner?: string;
            }
          | undefined;
        if (C) {
          recordLabel =
            `${C.firstName || ''} ${C.lastName || ''}`.trim() ||
            String(C.email || '').trim() ||
            'Contact';
          recordOwner = String(C.leadOwner || '').trim();
        }
      } else if (rt === 'client' && rid) {
        const Cl = clientMap.get(rid) as
          | {
              name?: string;
              email?: string;
              assignedTo?: Types.ObjectId[];
            }
          | undefined;
        if (Cl) {
          recordLabel = String(Cl.name || Cl.email || '').trim() || 'Client';
          const assigned = Array.isArray(Cl.assignedTo)
            ? Cl.assignedTo
                .map((aid) => assignName.get(String(aid)))
                .filter(Boolean)
            : [];
          if (assigned.length) {
            assignedPart = `Assigned: ${assigned.join(', ')}`;
          }
        }
      } else if (rt === 'organization' && rid) {
        const O = orgMap.get(rid) as { name?: string } | undefined;
        if (O) {
          recordLabel = String(O.name || '').trim() || 'Company';
        }
      }

      if (recordLabel) parts.push(`Record: ${recordLabel}`);
      if (assignedPart) parts.push(assignedPart);
      if (recordOwner) parts.push(`Owner: ${recordOwner}`);
      if (mailbox) parts.push(`Mailbox: ${mailbox}`);
      if (syncedBy) parts.push(`Synced by ${syncedBy}`);

      const summary = parts.filter(Boolean).join(' · ');
      if (summary) out.set(id, summary);
    }

    return out;
  }

  /**
   * Stale follow-up rows: lead owner, who logged last activity, last tracked outbound sender/from address.
   */
  private async buildStaleLeadAccessSummaries(
    rows: Array<{
      _id: Types.ObjectId;
      leadOwner?: string;
      lastTouchAuthorId?: Types.ObjectId;
    }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!rows.length) return out;

    const leadIds = rows.map((r) => r._id);
    const latestTrack =
      leadIds.length > 0
        ? await this.emailTrackingModel
            .aggregate([
              {
                $match: {
                  module: 'leads',
                  entityId: { $in: leadIds },
                },
              },
              { $sort: { createdAt: -1 } },
              {
                $group: {
                  _id: '$entityId',
                  userId: { $first: '$userId' },
                  fromEmail: { $first: '$fromEmail' },
                },
              },
            ])
            .exec()
        : [];

    const trackMap = new Map<
      string,
      { userId?: Types.ObjectId; fromEmail?: string }
    >();
    for (const t of latestTrack) {
      trackMap.set(String(t._id), {
        userId: t.userId as Types.ObjectId | undefined,
        fromEmail: t.fromEmail ? String(t.fromEmail) : undefined,
      });
    }

    const userIds = new Set<string>();
    for (const r of rows) {
      if (r.lastTouchAuthorId) userIds.add(String(r.lastTouchAuthorId));
    }
    for (const t of latestTrack) {
      if (t.userId) userIds.add(String(t.userId));
    }
    const users = userIds.size
      ? await this.hrmsUserModel
          .find({
            _id: { $in: [...userIds].map((id) => new Types.ObjectId(id)) },
          })
          .select('firstName lastName email')
          .lean()
          .exec()
      : [];
    const userName = new Map<string, string>();
    for (const u of users) {
      userName.set(
        String(u._id),
        `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
          String(u.email || '').trim(),
      );
    }

    for (const r of rows) {
      const parts: string[] = [];
      const lo = String(r.leadOwner || '').trim();
      if (lo) parts.push(`Owner: ${lo}`);
      if (r.lastTouchAuthorId) {
        const nm = userName.get(String(r.lastTouchAuthorId));
        if (nm) parts.push(`Last activity by: ${nm}`);
      }
      const tr = trackMap.get(String(r._id));
      if (tr?.userId) {
        const nm = userName.get(String(tr.userId));
        if (nm) parts.push(`Last tracked send: ${nm}`);
        else if (tr.fromEmail) parts.push(`Last tracked send: ${tr.fromEmail}`);
      } else if (tr?.fromEmail) {
        parts.push(`Last send from: ${tr.fromEmail}`);
      }
      const summary = parts.filter(Boolean).join(' · ');
      if (summary) out.set(String(r._id), summary);
    }
    return out;
  }

  /**
   * Sales operations queue: leads with no logged outreach, stale leads, tracked emails never opened.
   */
  async getSalesAttention(
    owner?: string,
    ownerMatchExtras?: string[],
    window?: string,
    scopedAuthorId?: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<{
    neverContactedLeads: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
    }>;
    staleFollowUpThresholdDays: number;
    staleFollowUpDescription: string;
    staleLeads: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      lastTouchAt: string;
      accessSummary?: string;
    }>;
    unopenedTrackedEmails: Array<{
      id: string;
      recipient: string;
      subject?: string;
      createdAt: string;
      module?: string;
      entityId?: string;
    }>;
    replyReceivedEmails: Array<{
      id: string;
      fromEmail: string;
      subject?: string;
      createdAt: string;
      module?: string;
      entityId?: string;
      /** Who can see the record + where the reply landed (human-readable). */
      accessSummary?: string;
    }>;
    repliesAwaitingResponse: Array<{
      id: string;
      fromEmail: string;
      subject?: string;
      createdAt: string;
      module?: string;
      entityId?: string;
      accessSummary?: string;
    }>;
    openedTrackedEmails: Array<{
      id: string;
      recipient: string;
      subject?: string;
      createdAt: string;
      lastOpenedAt?: string;
      openCount: number;
      module?: string;
      entityId?: string;
    }>;
    meetingInvites: Array<{
      id: string;
      fromEmail: string;
      fromName?: string;
      subject?: string;
      inviteSummary?: string;
      inviteMethod?: string;
      createdAt: string;
      isRead: boolean;
      folder?: string;
    }>;
    note: string;
  }> {
    const key = this.appCache.reportingAttentionKey({
      owner,
      ownerMatchExtras,
      window,
      scopedAuthorId,
    });
    return this.appCache.getOrSet(key, this.appCache.crmReportingTtl(), () =>
      this.computeSalesAttention(
        owner,
        ownerMatchExtras,
        window,
        scopedAuthorId,
      ),
    );
  }

  private async computeSalesAttention(
    owner?: string,
    ownerMatchExtras?: string[],
    window?: string,
    scopedAuthorId?: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<{
    neverContactedLeads: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
    }>;
    staleFollowUpThresholdDays: number;
    staleFollowUpDescription: string;
    staleLeads: Array<{
      id: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      lastTouchAt: string;
      accessSummary?: string;
    }>;
    unopenedTrackedEmails: Array<{
      id: string;
      recipient: string;
      subject?: string;
      createdAt: string;
      module?: string;
      entityId?: string;
    }>;
    replyReceivedEmails: Array<{
      id: string;
      fromEmail: string;
      subject?: string;
      createdAt: string;
      module?: string;
      entityId?: string;
      accessSummary?: string;
    }>;
    repliesAwaitingResponse: Array<{
      id: string;
      fromEmail: string;
      subject?: string;
      createdAt: string;
      module?: string;
      entityId?: string;
      accessSummary?: string;
    }>;
    openedTrackedEmails: Array<{
      id: string;
      recipient: string;
      subject?: string;
      createdAt: string;
      lastOpenedAt?: string;
      openCount: number;
      module?: string;
      entityId?: string;
    }>;
    meetingInvites: Array<{
      id: string;
      fromEmail: string;
      fromName?: string;
      subject?: string;
      inviteSummary?: string;
      inviteMethod?: string;
      createdAt: string;
      isRead: boolean;
      folder?: string;
    }>;
    note: string;
  }> {
    const windowRange = this.resolveWorkspaceWindow(window);
    let leadOwnerKey = owner?.trim();
    if (
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      Types.ObjectId.isValid(leadOwnerKey) &&
      leadOwnerKey.length === 24
    ) {
      const label = await this.getHrmsDisplayOwnerLabel(
        new Types.ObjectId(leadOwnerKey),
      );
      if (label) leadOwnerKey = label;
    }

    const leadOwners = this.mergeOwnerMatchStrings(
      leadOwnerKey && leadOwnerKey !== 'All' ? leadOwnerKey : undefined,
      ownerMatchExtras,
    );

    const authorId =
      scopedAuthorId || (await this.resolveHrmsAuthorId(owner?.trim()));

    /** Owner name match OR leads this user has sent tracked email to (same visibility as outbound sender). */
    const leadFilter: Record<string, unknown> = { converted: { $ne: true } };
    if (leadOwners.length > 0 || authorId) {
      let trackingLeadIds: Types.ObjectId[] = [];
      if (authorId) {
        const authIn = Array.isArray(authorId)
          ? { $in: authorId }
          : authorId;
        const rawIds = await this.emailTrackingModel.distinct('entityId', {
          module: 'leads',
          userId: authIn,
          entityId: { $exists: true, $ne: null },
        });
        trackingLeadIds = rawIds
          .filter((id) => id != null && Types.ObjectId.isValid(String(id)))
          .map((id) => new Types.ObjectId(String(id)));
      }
      if (trackingLeadIds.length > 0) {
        leadFilter.$or = [
          leadOwners.length === 1
            ? { leadOwner: leadOwners[0] }
            : { leadOwner: { $in: leadOwners } },
          { _id: { $in: trackingLeadIds } },
        ];
      } else {
        if (leadOwners.length === 1) leadFilter.leadOwner = leadOwners[0];
        else if (leadOwners.length > 1) leadFilter.leadOwner = { $in: leadOwners };
      }
    }
    const now = new Date();
    const staleCutoff = new Date(windowRange.start);
    const staleMeta = this.buildStaleFollowUpMeta(windowRange, now);
    const emailSince = windowRange.start;

    const emailMatch: Record<string, unknown> = {
      createdAt: { $gte: emailSince, $lte: windowRange.end },
    };
    if (authorId) {
      emailMatch.userId = Array.isArray(authorId)
        ? { $in: authorId }
        : authorId;
    }

    const lastTouchLookup = {
      $lookup: {
        from: 'activities',
        let: { lid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$relatedTo', '$$lid'] },
                  { $eq: ['$relatedType', 'Lead'] },
                  { $ne: ['$type', 'System'] },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 as const } },
          { $limit: 1 },
        ],
        as: 'lastTouch',
      },
    };

    const [
      relatedInterestIds,
      neverRows,
      staleRows,
      coldEmails,
      openedEmails,
    ] = await Promise.all([
      this.getRecordIdsByOwners(leadOwners, authorId),
      this.leadModel.aggregate([
        {
          $match: {
            ...leadFilter,
            // Align "No outreach" with the selected workspace date window
            createdAt: { $gte: windowRange.start, $lte: windowRange.end },
          },
        },
        lastTouchLookup,
        { $match: { $expr: { $eq: [{ $size: '$lastTouch' }, 0] } } },
        { $sort: { createdAt: -1 as const } },
        { $limit: 25 },
        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            organization: 1,
            leadOwner: 1,
          },
        },
      ]),
      this.leadModel.aggregate([
        { $match: leadFilter },
        lastTouchLookup,
        { $match: { $expr: { $gt: [{ $size: '$lastTouch' }, 0] } } },
        {
          $addFields: {
            lastAt: { $arrayElemAt: ['$lastTouch.createdAt', 0] },
          },
        },
        { $match: { lastAt: { $lt: staleCutoff } } },
        { $sort: { lastAt: 1 as const } },
        { $limit: 25 },
        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            organization: 1,
            leadOwner: 1,
            lastAt: 1,
            lastTouchAuthorId: { $arrayElemAt: ['$lastTouch.author', 0] },
          },
        },
      ]),
      this.emailTrackingModel
        .find({
          ...emailMatch,
          openCount: 0,
          $or: [{ clicks: { $exists: false } }, { clicks: { $size: 0 } }],
        })
        .sort({ createdAt: -1 })
        .limit(200)
        .select('recipient subject module entityId createdAt')
        .lean()
        .exec(),
      this.emailTrackingModel
        .find({
          ...emailMatch,
          $or: [{ openCount: { $gt: 0 } }, { 'clicks.0': { $exists: true } }],
        })
        .sort({ lastOpenedAt: -1, createdAt: -1 })
        .limit(200)
        .select(
          'recipient subject module entityId createdAt lastOpenedAt openCount',
        )
        .lean()
        .exec(),
    ]);

    const authIn = Array.isArray(authorId) ? { $in: authorId } : authorId;
    const replyFilter: Record<string, unknown> = {
      type: 'Email',
      createdAt: { $gte: emailSince, $lte: windowRange.end },
      'metadata.direction': 'inbound',
      'metadata.matchReason': { $in: ['in_reply_to', 'sender_email'] },
    };
    if (authorId) {
      if (relatedInterestIds.length > 0) {
        replyFilter.$or = [
          { author: authIn },
          { relatedTo: { $in: relatedInterestIds } },
        ];
      } else {
        replyFilter.author = authIn;
      }
    }

    const replyEmailsRaw = await this.activityModel
      .find(replyFilter)
      .sort({ createdAt: -1 })
      .limit(200)
      .select('createdAt metadata relatedTo relatedType author')
      .lean()
      .exec();

    // Same inbound message can exist as multiple activities (lead + contact, or race).
    // Keep one row per synced inbox email / logical reply for the work queue.
    const replyEmails = (() => {
      const seenInbox = new Set<string>();
      const seenLogical = new Set<string>();
      const out: typeof replyEmailsRaw = [];
      for (const a of replyEmailsRaw) {
        const row = a as {
          _id: Types.ObjectId;
          createdAt?: Date;
          metadata?: {
            fromEmail?: string;
            subject?: string;
            inboxEmailId?: Types.ObjectId | string;
          };
          relatedTo?: Types.ObjectId;
        };
        const inboxId = String(row.metadata?.inboxEmailId || '').trim();
        if (inboxId) {
          if (seenInbox.has(inboxId)) continue;
          seenInbox.add(inboxId);
        } else {
          const logical = [
            String(row.metadata?.fromEmail || '')
              .trim()
              .toLowerCase(),
            String(row.metadata?.subject || '')
              .trim()
              .toLowerCase(),
            row.relatedTo ? String(row.relatedTo) : '',
            row.createdAt ? new Date(row.createdAt).toISOString() : '',
          ].join('\0');
          if (seenLogical.has(logical)) continue;
          seenLogical.add(logical);
        }
        out.push(a);
      }
      return out;
    })();

    const inviteUserFilter: Record<string, unknown> = {
      date: { $gte: emailSince, $lte: windowRange.end },
      folder: {
        $nin: [
          'Sent',
          'Sent Mail',
          'Sent Items',
          'Sent Messages',
          '[Gmail]/Sent Mail',
          '[Google Mail]/Sent Mail',
          'sentitems',
          'Drafts',
          'Draft',
          '[Gmail]/Drafts',
          '[Google Mail]/Drafts',
          'drafts',
          'Trash',
          'Deleted Items',
          'Deleted',
          '[Gmail]/Trash',
          'Spam',
          'Junk',
          'Junk Email',
          '[Gmail]/Spam',
        ],
      },
      $or: [
        { isMeetingInvite: true },
        { 'meta.attachments.contentType': { $regex: /calendar|ics/i } },
        { 'meta.attachments.filename': { $regex: /\.ics$/i } },
        {
          subject: {
            $regex:
              /^(invitation|invite|meeting invitation|accepted:|declined:|tentative:|canceled:|cancelled:)|invited you to|meeting request|calendar invitation/i,
          },
        },
      ],
    };
    if (authorId) {
      inviteUserFilter.userId = Array.isArray(authorId)
        ? { $in: authorId }
        : authorId;
    }

    const meetingInviteRows = await this.inboxEmailModel
      .find(inviteUserFilter)
      .sort({ date: -1 })
      .limit(100)
      .select(
        'from fromName subject inviteSummary inviteMethod date isRead folder',
      )
      .lean()
      .exec();

    const staleAccessByLeadId = await this.buildStaleLeadAccessSummaries(
      staleRows as Array<{
        _id: Types.ObjectId;
        leadOwner?: string;
        lastTouchAuthorId?: Types.ObjectId;
      }>,
    );

    const mapNever = (r: {
      _id: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      email?: string;
      organization?: string;
      leadOwner?: string;
    }) => ({
      id: String(r._id),
      name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Lead',
      email: r.email || '',
      organization: r.organization,
      leadOwner: r.leadOwner,
    });

    const mapStale = (r: {
      _id: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      email?: string;
      organization?: string;
      leadOwner?: string;
      lastAt?: Date;
      lastTouchAuthorId?: Types.ObjectId;
    }) => ({
      ...mapNever(r),
      lastTouchAt: r.lastAt ? new Date(r.lastAt).toISOString() : '',
      accessSummary: staleAccessByLeadId.get(String(r._id)),
    });

    const escapeRx = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const replyAwaitingFlags = await Promise.all(
      replyEmails.map(async (a) => {
        const row = a as {
          _id: Types.ObjectId;
          createdAt?: Date;
          metadata?: {
            fromEmail?: string;
            inboxEmailId?: Types.ObjectId | string;
          };
          relatedTo?: Types.ObjectId;
          relatedType?: string;
        };
        const fromEmail = String(row.metadata?.fromEmail || '')
          .trim()
          .toLowerCase();
        // Without a CRM record we cannot prove follow-up; keep out of "awaiting".
        if (!row.relatedTo || !row.relatedType) {
          return { id: String(row._id), awaiting: false };
        }
        const since = row.createdAt || new Date(0);

        // 1) Outbound CRM Email activity on the same record after this inbound reply.
        // Match client address when present; also accept blank toEmail (Graph /reply
        // often logs without a populated To) — same record after the reply = responded.
        const outboundOr: Record<string, unknown>[] = [
          { 'metadata.toEmail': { $in: [null, ''] } },
          { 'metadata.toEmail': { $exists: false } },
        ];
        if (fromEmail) {
          outboundOr.push({
            'metadata.toEmail': {
              $regex: escapeRx(fromEmail),
              $options: 'i',
            },
          });
        }
        const outbound = await this.activityModel
          .findOne({
            relatedTo: row.relatedTo,
            relatedType: row.relatedType,
            type: 'Email',
            'metadata.direction': 'outbound',
            createdAt: { $gt: since },
            $or: outboundOr,
          })
          .select('_id')
          .lean()
          .exec();
        if (outbound) {
          return { id: String(row._id), awaiting: false };
        }

        // 2) Inbox Sent reply after this inbound (thread replyToInboxEmailId and/or
        // CRM-linked send to the same client). Covers cases where an activity row
        // was never written (e.g. reply without entityId on the payload).
        const inboxOr: Record<string, unknown>[] = [];
        const inboundInboxId = row.metadata?.inboxEmailId
          ? String(row.metadata.inboxEmailId)
          : '';
        if (inboundInboxId) {
          inboxOr.push({ 'meta.replyToInboxEmailId': inboundInboxId });
        }
        if (fromEmail) {
          const entityIdStr = String(row.relatedTo);
          inboxOr.push({
            $and: [
              {
                $or: [
                  { 'meta.direction': 'outbound' },
                  {
                    folder: {
                      $in: [
                        'Sent',
                        'Sent Mail',
                        'Sent Items',
                        'Sent Messages',
                        '[Gmail]/Sent Mail',
                        '[Google Mail]/Sent Mail',
                        'sentitems',
                      ],
                    },
                  },
                ],
              },
              { to: { $regex: escapeRx(fromEmail), $options: 'i' } },
              {
                $or: [
                  { 'meta.entityId': entityIdStr },
                  ...(Types.ObjectId.isValid(entityIdStr)
                    ? [{ 'meta.entityId': new Types.ObjectId(entityIdStr) }]
                    : []),
                ],
              },
            ],
          });
        }
        if (inboxOr.length > 0) {
          const sentReply = await this.inboxEmailModel
            .findOne({
              date: { $gt: since },
              $or: inboxOr,
            })
            .select('_id')
            .lean()
            .exec();
          if (sentReply) {
            return { id: String(row._id), awaiting: false };
          }
        }

        return { id: String(row._id), awaiting: true };
      }),
    );
    const awaitingSet = new Set(
      replyAwaitingFlags.filter((x) => x.awaiting).map((x) => x.id),
    );

    const accessByActivityId = await this.buildInboundReplyAccessSummaries(
      replyEmails as unknown as Array<Record<string, unknown>>,
    );

    const mappedReplies = replyEmails.map((a) => {
      const row = a as {
        _id: Types.ObjectId;
        createdAt?: Date;
        metadata?: {
          fromEmail?: string;
          subject?: string;
        };
        relatedTo?: Types.ObjectId;
        relatedType?: string;
      };
      const relatedType = (row.relatedType || '').toLowerCase();
      const module =
        relatedType === 'lead'
          ? 'leads'
          : relatedType === 'deal'
            ? 'deals'
            : relatedType === 'contact'
              ? 'contacts'
              : relatedType === 'client'
                ? 'clients'
                : relatedType === 'organization'
                  ? 'organizations'
                  : undefined;
      return {
        id: String(row._id),
        fromEmail: String(row.metadata?.fromEmail || ''),
        subject: row.metadata?.subject,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        module,
        entityId: row.relatedTo ? String(row.relatedTo) : undefined,
        accessSummary: accessByActivityId.get(String(row._id)),
      };
    });

    return {
      neverContactedLeads: neverRows.map(mapNever),
      staleFollowUpThresholdDays: staleMeta.thresholdDays,
      staleFollowUpDescription: staleMeta.description,
      staleLeads: staleRows.map(mapStale),
      unopenedTrackedEmails: coldEmails.map((e) => {
        const row = e as {
          _id: Types.ObjectId;
          recipient?: string;
          subject?: string;
          createdAt?: Date;
          module?: string;
          entityId?: Types.ObjectId;
        };
        return {
          id: String(row._id),
          recipient: row.recipient || '',
          subject: row.subject,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
          module: row.module,
          entityId: row.entityId ? String(row.entityId) : undefined,
        };
      }),
      replyReceivedEmails: mappedReplies,
      repliesAwaitingResponse: mappedReplies.filter((r) =>
        awaitingSet.has(r.id),
      ),
      openedTrackedEmails: openedEmails.map((e) => {
        const row = e as {
          _id: Types.ObjectId;
          recipient?: string;
          subject?: string;
          createdAt?: Date;
          lastOpenedAt?: Date;
          openCount?: number;
          module?: string;
          entityId?: Types.ObjectId;
        };
        return {
          id: String(row._id),
          recipient: row.recipient || '',
          subject: row.subject,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
          lastOpenedAt: row.lastOpenedAt
            ? new Date(row.lastOpenedAt).toISOString()
            : undefined,
          openCount: Number(row.openCount) || 0,
          module: row.module,
          entityId: row.entityId ? String(row.entityId) : undefined,
        };
      }),
      meetingInvites: meetingInviteRows.map((e) => {
        const row = e as {
          _id: Types.ObjectId;
          from?: string;
          fromName?: string;
          subject?: string;
          inviteSummary?: string;
          inviteMethod?: string;
          date?: Date;
          isRead?: boolean;
          folder?: string;
        };
        return {
          id: String(row._id),
          fromEmail: row.from || '',
          fromName: row.fromName,
          subject: row.subject,
          inviteSummary: row.inviteSummary,
          inviteMethod: row.inviteMethod,
          createdAt: row.date ? new Date(row.date).toISOString() : '',
          isRead: Boolean(row.isRead),
          folder: row.folder,
        };
      }),
      note: 'Open leads only (not converted). “No outreach” = no logged non-system activity on the lead. “Stale” = last non-system touch before the workspace time window (same as the header filter). When you filter by a rep, stale / no-outreach lists include leads they own by name OR leads they have sent tracked email to. Tracked sends are split into “Unopened” and “Opened”; inbound replies use tracked-thread headers. Reply rows show record, owner or assignees, mailbox, and sync user; stale rows show owner, last activity author, and last tracked outbound sender. Meeting invites come from synced inbox mail with calendar attachments or invite subjects.',
    };
  }

  /**
   * Sales workspace: attention queue, priority tasks, open pipeline by stage,
   * deals with expected close dates, and a cross-record activity stream.
   * @param owner Lead/deal owner string filter, or "All" for org-wide pipeline.
   * @param scopedAuthorId When set, scopes tasks and activity to that rep.
   * @param dealAccessFilter Same visibility as GET /crm/deals (null = all deals).
   */
  private parseWorkspaceSections(
    sectionsParam?: string,
  ): Set<string> | null {
    if (!sectionsParam?.trim()) return null;
    const parts = sectionsParam
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => WORKSPACE_SECTIONS.has(s));
    if (!parts.length) return null;
    return new Set(parts);
  }

  private wantsWorkspaceSection(
    sections: Set<string> | null,
    name: string,
  ): boolean {
    return sections == null || sections.has(name);
  }

  async getSalesWorkspace(
    owner: string,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    ownerMatchExtras?: string[],
    window?: string,
    sections?: string,
    dealAccessFilter?: Record<string, unknown> | null,
  ): Promise<{
    attention: Awaited<ReturnType<ReportingService['getSalesAttention']>>;
    pipelineByStage: Array<{ stage: string; count: number; value: number }>;
    priorityTasks: Array<{
      id: string;
      title: string;
      status: string;
      dueDate?: string;
      overdue: boolean;
      relatedType?: string;
      relatedTo?: string;
      authorName?: string;
    }>;
    dealsClosingSoon: Array<{
      id: string;
      title: string;
      stage: string;
      dealValue: number;
      expectedClosureDate?: string;
      dealOwner?: string;
      currency?: string;
    }>;
    recentActivities: Array<{
      id: string;
      type: string;
      title?: string;
      contentSnippet: string;
      createdAt: string;
      relatedType?: string;
      relatedTo?: string;
      authorName?: string;
    }>;
    todayFocus: {
      dealsToMoveToday: number;
      overdueFollowUps: number;
      proposalsAwaitingResponse: number;
      hotLeadsNoAction: number;
    };
    atRiskDeals: Array<{
      id: string;
      title: string;
      stage: string;
      dealValue: number;
      expectedClosureDate?: string;
      reasons: string[];
      riskScore: number;
    }>;
    nextStepRequired: Array<{
      id: string;
      title: string;
      stage: string;
      dealValue: number;
      expectedClosureDate?: string;
      hasNextStep: boolean;
    }>;
    leadsAddedByDay: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
      stageEntered: Array<{ stage: string; count: number }>;
    }>;
    platformOpportunitiesAddedByDay: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
    }>;
    dealsAddedByDay: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
    }>;
    window: WorkspaceWindow;
  }> {
    const cacheKey = this.appCache.reportingWorkspaceKey({
      owner,
      ownerMatchExtras,
      window,
      sections,
      scopedAuthorId,
      dealAccessFilter,
    });
    try {
      return await this.appCache.getOrSet(
        cacheKey,
        this.appCache.crmReportingTtl(),
        () =>
          this.buildSalesWorkspace(
            owner,
            scopedAuthorId,
            ownerMatchExtras,
            window,
            sections,
            dealAccessFilter,
          ),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`getSalesWorkspace failed: ${msg}`, stack);
      let attention: Awaited<
        ReturnType<ReportingService['getSalesAttention']>
      >;
      try {
        attention = await this.getSalesAttention(
          owner,
          ownerMatchExtras,
          window,
          scopedAuthorId,
        );
      } catch (e2) {
        this.logger.error('getSalesAttention fallback failed', e2 as Error);
        attention = {
          neverContactedLeads: [],
          staleFollowUpThresholdDays: 7,
          staleFollowUpDescription: '',
          staleLeads: [],
          unopenedTrackedEmails: [],
          replyReceivedEmails: [],
          repliesAwaitingResponse: [],
          openedTrackedEmails: [],
          meetingInvites: [],
          note: '',
        };
      }
      return {
        attention,
        pipelineByStage: [],
        priorityTasks: [],
        dealsClosingSoon: [],
        recentActivities: [],
        todayFocus: {
          dealsToMoveToday: 0,
          overdueFollowUps: 0,
          proposalsAwaitingResponse: 0,
          hotLeadsNoAction: 0,
        },
        atRiskDeals: [],
        nextStepRequired: [],
        leadsAddedByDay: [],
        platformOpportunitiesAddedByDay: [],
        dealsAddedByDay: [],
        window: this.resolveWorkspaceWindow(window).key,
      };
    }
  }

  private async buildSalesWorkspace(
    owner: string,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    ownerMatchExtras?: string[],
    window?: string,
    sectionsParam?: string,
    dealAccessFilter?: Record<string, unknown> | null,
  ): Promise<{
    attention: Awaited<ReturnType<ReportingService['getSalesAttention']>>;
    pipelineByStage: Array<{ stage: string; count: number; value: number }>;
    priorityTasks: Array<{
      id: string;
      title: string;
      status: string;
      dueDate?: string;
      overdue: boolean;
      relatedType?: string;
      relatedTo?: string;
      authorName?: string;
    }>;
    dealsClosingSoon: Array<{
      id: string;
      title: string;
      stage: string;
      dealValue: number;
      expectedClosureDate?: string;
      dealOwner?: string;
      currency?: string;
    }>;
    recentActivities: Array<{
      id: string;
      type: string;
      title?: string;
      contentSnippet: string;
      createdAt: string;
      relatedType?: string;
      relatedTo?: string;
      authorName?: string;
    }>;
    todayFocus: {
      dealsToMoveToday: number;
      overdueFollowUps: number;
      proposalsAwaitingResponse: number;
      hotLeadsNoAction: number;
    };
    atRiskDeals: Array<{
      id: string;
      title: string;
      stage: string;
      dealValue: number;
      expectedClosureDate?: string;
      reasons: string[];
      riskScore: number;
    }>;
    nextStepRequired: Array<{
      id: string;
      title: string;
      stage: string;
      dealValue: number;
      expectedClosureDate?: string;
      hasNextStep: boolean;
    }>;
    leadsAddedByDay: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
      stageEntered: Array<{ stage: string; count: number }>;
    }>;
    platformOpportunitiesAddedByDay: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
    }>;
    dealsAddedByDay: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
    }>;
    upcomingFollowUps?: {
      items: Array<{
        jobId: string;
        runAt: string;
        entityType: 'Lead' | 'Contact';
        entityId: string;
        name: string;
        email: string;
        organization?: string;
        leadOwner?: string;
        stepLabel: string;
        overdue: boolean;
      }>;
      totalPending: number;
      overdueCount: number;
      nextRunAt: string | null;
    };
    window: WorkspaceWindow;
  }> {
    const sectionFilter = this.parseWorkspaceSections(sectionsParam);
    const wantAttention = this.wantsWorkspaceSection(sectionFilter, 'attention');
    const wantTasks = this.wantsWorkspaceSection(sectionFilter, 'tasks');
    const wantDeals = this.wantsWorkspaceSection(sectionFilter, 'deals');
    const wantActivity = this.wantsWorkspaceSection(sectionFilter, 'activity');
    const wantLeads = this.wantsWorkspaceSection(sectionFilter, 'leads');
    const wantLeadStatus = this.wantsWorkspaceSection(
      sectionFilter,
      'lead_status',
    );
    const wantUpcomingFollowUps = this.wantsWorkspaceSection(
      sectionFilter,
      'upcoming_follow_ups',
    );

    const windowRange = this.resolveWorkspaceWindow(window);
    const leadIntakeWindow = this.resolveReportingCalendarWindow(window);
    const exchangeRate = wantDeals
      ? await this.getExchangeRate()
      : 1;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const horizon = new Date(startOfToday);
    horizon.setDate(horizon.getDate() + 45);

    const dealOpenStages = {
      stage: { $nin: ['Closed Won', 'Closed Lost'] },
    };
    const dealMatch = wantDeals
      ? this.buildSalesWorkspaceDealMatch(dealOpenStages, dealAccessFilter)
      : dealOpenStages;

    const taskQuery: Record<string, unknown> = {
      type: 'Task',
      status: { $nin: ['Done', 'Completed', 'done', 'completed'] },
    };
    if (scopedAuthorId) {
      const authorMatch = Array.isArray(scopedAuthorId)
        ? { $in: scopedAuthorId }
        : scopedAuthorId;
      // Rep view: include tasks they created (author) or that are assigned to them (assignee).
      taskQuery.$or = [
        { author: authorMatch },
        { assignee: authorMatch },
      ];
    } else if (owner && owner !== 'All') {
      // Named rep selected but author id unknown — do not show every rep’s tasks (HubSpot-like per-rep view).
      taskQuery._id = { $in: [] };
    }

    const recentActivityFilter: Record<string, unknown> = {
      createdAt: { $gte: windowRange.start, $lte: windowRange.end },
    };
    if (scopedAuthorId) {
      const authorMatch = Array.isArray(scopedAuthorId)
        ? { $in: scopedAuthorId }
        : scopedAuthorId;
      recentActivityFilter.$or = [
        { author: authorMatch },
        { assignee: authorMatch },
      ];
    } else if (owner && owner !== 'All') {
      recentActivityFilter._id = { $in: [] };
    }

    const [
      attention,
      taskDocs,
      closingDeals,
      openDealsForStage,
      recentRaw,
      auditRaw,
      leadsAddedByDay,
      platformOpportunitiesAddedByDay,
      dealsAddedByDay,
      leadFollowUpAndIntake,
      upcomingFollowUps,
    ] = await Promise.all([
      wantAttention
        ? this.getSalesAttention(
            owner,
            ownerMatchExtras,
            windowRange.key,
            scopedAuthorId,
          )
        : Promise.resolve(null),
      wantTasks
        ? this.activityModel
            .find(taskQuery)
            .sort({ updatedAt: -1 })
            .limit(80)
            .lean()
            .exec()
        : Promise.resolve([]),
      wantDeals
        ? this.dealModel
            .find({
              ...dealMatch,
              expectedClosureDate: {
                $gte: new Date(startOfToday.getTime() - 7 * 86400000),
                $lte: horizon,
              },
            })
            .sort({ expectedClosureDate: 1 })
            .limit(15)
            .select(
              'title stage dealValue dealValueINR currency expectedClosureDate dealOwner',
            )
            .lean()
            .exec()
        : Promise.resolve([]),
      wantDeals
        ? this.dealModel
            .find(dealMatch)
            .select(
              'title stage dealValue dealValueINR currency expectedClosureDate dealOwner nextStep updatedAt',
            )
            .lean()
            .exec()
        : Promise.resolve([]),
      wantActivity
        ? this.activityModel
            .find(recentActivityFilter)
            .sort({ createdAt: -1 })
            .limit(40)
            .select(
              'type title content createdAt relatedTo relatedType author assignee metadata status',
            )
            .lean()
            .exec()
        : Promise.resolve([]),
      wantActivity
        ? this.auditLogModel
            .find({
              user: scopedAuthorId ? scopedAuthorId : { $exists: true },
              createdAt: { $gte: windowRange.start, $lte: windowRange.end },
              module: {
                $nin: [
                  'system',
                  'audit-logs',
                  'crm-users',
                  'tasks',
                  'notes',
                  'activities',
                  'emails',
                  'calls',
                  'meetings',
                  'communications',
                  'inbox-accounts',
                  'sync-tokens',
                  'sync-meta',
                  'token',
                  'session',
                  'auth',
                  'health',
                  'metrics',
                  'logs',
                  'leads',
                  'deals',
                  'contacts',
                  'organizations',
                  'clients',
                  'platform-opportunities',
                ],
              },
            })
            .sort({ createdAt: -1 })
            .limit(35)
            .select(
              'action module entityId description changes createdAt user',
            )
            .lean()
            .exec()
        : Promise.resolve([]),
      wantLeads
        ? this.getLeadsAddedByDayForSalesWorkspace(
            owner,
            ownerMatchExtras,
            scopedAuthorId,
            leadIntakeWindow.start,
            leadIntakeWindow.end,
          )
        : Promise.resolve([]),
      wantLeads
        ? this.getPlatformOpportunitiesAddedByDayForSalesWorkspace(
            owner,
            ownerMatchExtras,
            scopedAuthorId,
            leadIntakeWindow.start,
            leadIntakeWindow.end,
          )
        : Promise.resolve([]),
      wantLeads || wantDeals
        ? this.getDealsAddedByDayForSalesWorkspace(
            owner,
            ownerMatchExtras,
            scopedAuthorId,
            leadIntakeWindow.start,
            leadIntakeWindow.end,
          )
        : Promise.resolve([]),
      wantLeadStatus
        ? this.getLeadFollowUpAndIntakeForSalesWorkspace(
            owner,
            ownerMatchExtras,
            scopedAuthorId,
          )
        : Promise.resolve(null),
      wantUpcomingFollowUps
        ? this.getUpcomingFollowUpsForSalesWorkspace(
            owner,
            ownerMatchExtras,
            scopedAuthorId,
          )
        : Promise.resolve(null),
    ]);

    const stageMap = new Map<string, { count: number; value: number }>();
    for (const d of openDealsForStage) {
      const st = (d as { stage?: string }).stage || 'Unknown';
      const cur = stageMap.get(st) || { count: 0, value: 0 };
      cur.count += 1;
      cur.value += this.toINR(Number((d as { dealValue?: number }).dealValue) || 0, String((d as { currency?: string }).currency || 'USD'), exchangeRate);
      stageMap.set(st, cur);
    }
    const pipelineByStage = Array.from(stageMap.entries())
      .map(([stage, v]) => ({ stage, ...v }))
      .sort((a, b) => b.value - a.value);

    const taskRows = taskDocs as unknown as Array<Record<string, unknown>>;
    const recentRows = recentRaw as unknown as Array<Record<string, unknown>>;
    const auditRows = auditRaw as unknown as Array<Record<string, unknown>>;

    const authorNameMap = await this.hrmsAuthorNameByIds([
      ...taskRows.map((t) => t.author),
      ...taskRows.map((t) => t.assignee),
      ...recentRows.map((a) => a.author),
      ...recentRows.map((a) => a.assignee),
      ...auditRows.map((l) => l.user),
    ]);

    const authorNameFor = (author: unknown): string | undefined => {
      if (author == null) return undefined;
      const id =
        typeof author === 'object' &&
        author !== null &&
        '_id' in (author as Record<string, unknown>)
          ? String((author as { _id: unknown })._id)
          : String(author);
      return authorNameMap.get(id);
    };

    const parseDue = (
      meta: { dueDate?: string; dueAt?: string } | undefined,
    ): Date | null => {
      const raw = meta?.dueDate || meta?.dueAt;
      if (!raw) return null;
      const t = new Date(raw);
      return Number.isNaN(t.getTime()) ? null : t;
    };

    const scopedSid = scopedAuthorId ? String(scopedAuthorId) : '';
    const taskAssigneeSid = (t: Record<string, unknown>): string => {
      const asg = t.assignee;
      if (asg == null) return '';
      if (
        typeof asg === 'object' &&
        asg !== null &&
        '_id' in (asg as Record<string, unknown>)
      ) {
        return String((asg as { _id: unknown })._id);
      }
      return String(asg);
    };

    const sortedTaskRows = [...taskRows].sort((a, b) => {
      if (scopedSid) {
        const ra = taskAssigneeSid(a) === scopedSid ? 0 : 1;
        const rb = taskAssigneeSid(b) === scopedSid ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      const da = parseDue(
        a.metadata as { dueDate?: string; dueAt?: string } | undefined,
      );
      const db = parseDue(
        b.metadata as { dueDate?: string; dueAt?: string } | undefined,
      );
      const oa = da && da < startOfToday ? 0 : 1;
      const ob = db && db < startOfToday ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const ta = da ? da.getTime() : Infinity;
      const tb = db ? db.getTime() : Infinity;
      return ta - tb;
    });

    const priorityTasks = sortedTaskRows
      .map((t) => {
        const due = parseDue(
          t.metadata as { dueDate?: string; dueAt?: string } | undefined,
        );
        const overdue = !!(due && due < startOfToday);
        return {
          id: String(t._id),
          title: (t.title as string) || 'Task',
          status: (t.status as string) || 'Backlog',
          dueDate: due ? due.toISOString() : undefined,
          overdue,
          relatedType: t.relatedType as string | undefined,
          relatedTo: t.relatedTo ? String(t.relatedTo) : undefined,
          authorName: authorNameFor(t.author),
        };
      })
      .slice(0, 20);

    const recentActivities = await this.buildWorkspaceRecentActivities(
      recentRows,
      auditRows,
      authorNameFor,
    );

    const dealsClosingSoon = (
      closingDeals as unknown as Array<Record<string, unknown>>
    ).map((d) => ({
      id: String(d._id),
      title: (d.title as string) || 'Deal',
      stage: (d.stage as string) || '',
      dealValue: Number(d.dealValue) || 0,
      dealValueINR: this.toINR(Number(d.dealValue) || 0, String(d.currency || 'USD'), exchangeRate),
      expectedClosureDate: d.expectedClosureDate
        ? new Date(d.expectedClosureDate as Date).toISOString()
        : undefined,
      dealOwner: d.dealOwner as string | undefined,
      currency: d.currency as string | undefined,
    }));

    const openDealIds = (openDealsForStage as Array<{ _id: Types.ObjectId }>).map(
      (d) => d._id,
    );
    const dealTaskRows =
      openDealIds.length > 0
        ? await this.activityModel
            .find({
              type: 'Task',
              relatedType: 'Deal',
              relatedTo: { $in: openDealIds },
              status: { $nin: ['Done', 'Completed', 'done', 'completed'] },
            })
            .select('relatedTo metadata')
            .lean()
            .exec()
        : [];
    const dealActivityAgg =
      openDealIds.length > 0
        ? await this.activityModel.aggregate([
            {
              $match: {
                relatedType: 'Deal',
                relatedTo: { $in: openDealIds },
                type: { $nin: ['System'] },
              },
            },
            {
              $group: {
                _id: '$relatedTo',
                lastAt: { $max: '$createdAt' },
              },
            },
          ])
        : [];
    const lastActivityByDeal = new Map(
      (dealActivityAgg as Array<{ _id: Types.ObjectId; lastAt?: Date }>).map(
        (r) => [String(r._id), r.lastAt],
      ),
    );
    const overdueTaskByDeal = new Set<string>();
    for (const t of dealTaskRows as Array<{
      relatedTo?: Types.ObjectId;
      metadata?: { dueDate?: string; dueAt?: string };
    }>) {
      if (!t.relatedTo) continue;
      const due = parseDue(t.metadata);
      if (due && due < startOfToday) {
        overdueTaskByDeal.add(String(t.relatedTo));
      }
    }

    const atRiskDeals = (
      openDealsForStage as unknown as Array<Record<string, unknown>>
    )
      .map((d) => {
        const id = String(d._id);
        const reasons: string[] = [];
        let riskScore = 0;
        const stage = String(d.stage || '');
        const nextStep = String(d.nextStep || '').trim();
        const expectedClose = d.expectedClosureDate
          ? new Date(d.expectedClosureDate as Date)
          : null;
        const lastActivity = lastActivityByDeal.get(id);

        if (!nextStep) {
          reasons.push('No next step');
          riskScore += 35;
        }
        if (
          lastActivity &&
          new Date().getTime() - new Date(lastActivity).getTime() >
            7 * 24 * 60 * 60 * 1000
        ) {
          reasons.push('No activity in 7+ days');
          riskScore += 30;
        }
        if (!lastActivity) {
          reasons.push('No logged deal activity');
          riskScore += 25;
        }
        if (overdueTaskByDeal.has(id)) {
          reasons.push('Overdue follow-up task');
          riskScore += 20;
        }
        if (
          expectedClose &&
          expectedClose < horizon &&
          expectedClose >= startOfToday &&
          !nextStep
        ) {
          reasons.push('Close date near but no plan');
          riskScore += 20;
        }
        if (stage.toLowerCase().includes('proposal') && !lastActivity) {
          reasons.push('Proposal stage without engagement');
          riskScore += 15;
        }
        return {
          id,
          title: String(d.title || 'Deal'),
          stage,
          dealValue: Number(d.dealValue) || 0,
          dealValueINR: this.toINR(Number(d.dealValue) || 0, String(d.currency || 'USD'), exchangeRate),
          expectedClosureDate: expectedClose
            ? expectedClose.toISOString()
            : undefined,
          reasons,
          riskScore: Math.min(100, riskScore),
        };
      })
      .filter((d) => d.reasons.length > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.dealValue - a.dealValue)
      .slice(0, 12);

    const nextStepRequired = (
      openDealsForStage as unknown as Array<Record<string, unknown>>
    )
      .filter((d) => !String(d.nextStep || '').trim())
      .map((d) => ({
        id: String(d._id),
        title: String(d.title || 'Deal'),
        stage: String(d.stage || ''),
        dealValue: Number(d.dealValue) || 0,
        dealValueINR: this.toINR(Number(d.dealValue) || 0, String(d.currency || 'USD'), exchangeRate),
        expectedClosureDate: d.expectedClosureDate
          ? new Date(d.expectedClosureDate as Date).toISOString()
          : undefined,
        hasNextStep: false,
      }))
      .sort((a, b) => b.dealValue - a.dealValue)
      .slice(0, 12);

    const proposalsAwaitingResponse = (
      openDealsForStage as unknown as Array<Record<string, unknown>>
    ).filter((d) => {
      const stage = String(d.stage || '').toLowerCase();
      if (!stage.includes('proposal')) return false;
      const last = lastActivityByDeal.get(String(d._id));
      if (!last) return true;
      return (
        new Date().getTime() - new Date(last).getTime() >
        5 * 24 * 60 * 60 * 1000
      );
    }).length;

    const todayFocus = {
      dealsToMoveToday: atRiskDeals.length,
      overdueFollowUps: priorityTasks.filter((t) => t.overdue).length,
      proposalsAwaitingResponse,
      hotLeadsNoAction: attention?.openedTrackedEmails?.length ?? 0,
    };

    const payload: Record<string, unknown> = { window: windowRange.key };
    if (wantAttention && attention) {
      payload.attention = attention;
    }
    if (wantTasks) {
      payload.priorityTasks = priorityTasks;
    }
    if (wantDeals) {
      payload.pipelineByStage = pipelineByStage;
      payload.dealsClosingSoon = dealsClosingSoon;
      payload.atRiskDeals = atRiskDeals;
      payload.nextStepRequired = nextStepRequired;
      payload.todayFocus = todayFocus;
    }
    if (wantActivity) {
      payload.recentActivities = recentActivities;
    }
    if (wantLeads) {
      payload.leadsAddedByDay = leadsAddedByDay;
      payload.platformOpportunitiesAddedByDay = platformOpportunitiesAddedByDay;
    }
    if (wantLeads || wantDeals) {
      payload.dealsAddedByDay = dealsAddedByDay;
    }
    if (wantLeadStatus && leadFollowUpAndIntake) {
      payload.leadFollowUpWeek = leadFollowUpAndIntake.leadFollowUpWeek;
      payload.leadFollowUpByWindow = leadFollowUpAndIntake.leadFollowUpByWindow;
      payload.leadIntake = leadFollowUpAndIntake.leadIntake;
    }
    if (wantUpcomingFollowUps && upcomingFollowUps) {
      payload.upcomingFollowUps = upcomingFollowUps;
    }
    return payload as Awaited<ReturnType<ReportingService['buildSalesWorkspace']>>;
  }

  private escapeRegexLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Case-insensitive owner string match with flexible whitespace.
   * Matches display name, email, or legacy ObjectId hex stored in leadOwner/dealOwner.
   */
  private ownerFieldNameMatch(
    field: 'leadOwner' | 'dealOwner' | 'ownerLabel',
    owners: string[],
  ): Record<string, unknown> | null {
    const cleaned = [
      ...new Set(
        owners
          .map((o) => String(o || '').trim().replace(/\s+/g, ' '))
          .filter(Boolean),
      ),
    ].filter((o) => o !== 'All' && o !== 'All authorized');
    if (!cleaned.length) return null;

    const clauseFor = (raw: string): Record<string, unknown> => {
      const flex = this.escapeRegexLiteral(raw).replace(/\s+/g, '\\s+');
      return {
        [field]: { $regex: `^${flex}$`, $options: 'i' },
      };
    };

    if (cleaned.length === 1) return clauseFor(cleaned[0]);
    return { $or: cleaned.map(clauseFor) };
  }

  /** @deprecated use ownerFieldNameMatch('leadOwner', ...) */
  private leadOwnerNameMatch(
    owners: string[],
  ): Record<string, unknown> | null {
    return this.ownerFieldNameMatch('leadOwner', owners);
  }

  /**
   * New leads created in the workspace time window, grouped by calendar day and lead pipeline.
   * Visibility matches CRM lead list ownership (leadOwner / createdBy / sharedWith) — not email-tracking.
   */
  private async buildLeadCreatedVisibilityForWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<Record<string, unknown>> {
    let leadOwnerKey = owner?.trim();
    if (
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      leadOwnerKey !== 'All authorized' &&
      Types.ObjectId.isValid(leadOwnerKey) &&
      leadOwnerKey.length === 24
    ) {
      const label = await this.getHrmsDisplayOwnerLabel(
        new Types.ObjectId(leadOwnerKey),
      );
      if (label) leadOwnerKey = label;
    }

    // Org-wide workspace (admin/subadmin "All owners") — count every lead in the window.
    if (
      !scopedAuthorId &&
      (!leadOwnerKey ||
        leadOwnerKey === 'All' ||
        leadOwnerKey === 'All authorized')
    ) {
      return {};
    }

    const primaryForMerge =
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      leadOwnerKey !== 'All authorized'
        ? leadOwnerKey
        : undefined;
    const leadOwners = this.mergeOwnerMatchStrings(
      primaryForMerge,
      ownerMatchExtras,
    ).filter((o) => o !== 'All authorized');
    const authorId =
      scopedAuthorId || (await this.resolveHrmsAuthorId(owner?.trim()));

    const orClauses: Record<string, unknown>[] = [];
    const ownerClause = this.ownerFieldNameMatch('leadOwner', leadOwners);
    if (ownerClause) {
      if (Array.isArray((ownerClause as { $or?: unknown }).$or)) {
        orClauses.push(
          ...((ownerClause as { $or: Record<string, unknown>[] }).$or),
        );
      } else {
        orClauses.push(ownerClause);
      }
    }
    if (authorId) {
      const ids = Array.isArray(authorId) ? authorId : [authorId];
      const authIn = ids.length === 1 ? ids[0] : { $in: ids };
      orClauses.push({ createdBy: authIn });
      orClauses.push({ sharedWith: authIn });
      // Legacy imports sometimes stored the HRMS user ObjectId hex in leadOwner.
      for (const id of ids) {
        orClauses.push({ leadOwner: String(id) });
      }
    }

    if (orClauses.length === 0) return {};
    if (orClauses.length === 1) return orClauses[0];
    return { $or: orClauses };
  }

  private async resolveWorkspaceTrackingLeadIds(
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<Set<string>> {
    if (!scopedAuthorId) return new Set();
    const authIn = Array.isArray(scopedAuthorId)
      ? { $in: scopedAuthorId }
      : scopedAuthorId;
    const rawIds = await this.emailTrackingModel.distinct('entityId', {
      module: 'leads',
      userId: authIn,
      entityId: { $exists: true, $ne: null },
    });
    return new Set(
      rawIds
        .filter((id) => id != null && Types.ObjectId.isValid(String(id)))
        .map((id) => String(id)),
    );
  }

  private describePendingFollowUpJob(
    job: WorkflowDelayedJob & { _id: Types.ObjectId },
  ): string {
    const branch = String(job.branchLabel || '').trim();
    if (branch) return branch;
    const ew = job.emailWait;
    if (ew?.firstOutreachGate) {
      if (ew.alternateStepIndex != null && ew.alternateStepIndex >= 0) {
        return `Alternate outreach (step ${ew.alternateStepIndex + 1})`;
      }
      return 'Waiting for open / alternate outreach';
    }
    if (ew?.branchOnTimeoutSteps?.length) {
      return 'Follow-up if no open';
    }
    return 'Scheduled follow-up';
  }

  /** Pending workflow sends (follow-up sequences) for leads/contacts in workspace scope. */
  async getUpcomingFollowUpsForSalesWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    options?: { limit?: number; daysAhead?: number },
  ): Promise<{
    items: Array<{
      jobId: string;
      runAt: string;
      entityType: 'Lead' | 'Contact';
      entityId: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      stepLabel: string;
      overdue: boolean;
    }>;
    totalPending: number;
    overdueCount: number;
    nextRunAt: string | null;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
    const daysAhead = Math.min(Math.max(options?.daysAhead ?? 60, 1), 180);
    const now = new Date();
    const horizon = new Date(now.getTime() + daysAhead * 86400000);

    const isOrgWide =
      !scopedAuthorId &&
      (!owner?.trim() || owner === 'All' || owner === 'All authorized');

    let leadOwnerKey = owner?.trim();
    if (
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      leadOwnerKey !== 'All authorized' &&
      Types.ObjectId.isValid(leadOwnerKey) &&
      leadOwnerKey.length === 24
    ) {
      const label = await this.getHrmsDisplayOwnerLabel(
        new Types.ObjectId(leadOwnerKey),
      );
      if (label) leadOwnerKey = label;
    }
    const primaryForMerge =
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      leadOwnerKey !== 'All authorized'
        ? leadOwnerKey
        : undefined;
    const leadOwners = this.mergeOwnerMatchStrings(
      primaryForMerge,
      ownerMatchExtras,
    );
    const trackingLeadIds = await this.resolveWorkspaceTrackingLeadIds(
      scopedAuthorId,
    );

    const jobRows = await this.delayedJobModel
      .find({
        status: 'pending',
        entityType: { $in: ['Lead', 'Contact'] },
        runAt: { $lte: horizon },
      })
      .sort({ runAt: 1 })
      .limit(400)
      .lean()
      .exec();

    const leadIds = [
      ...new Set(
        jobRows
          .filter((j) => j.entityType === 'Lead')
          .map((j) => String(j.entityId)),
      ),
    ].filter((id) => Types.ObjectId.isValid(id));
    const contactIds = [
      ...new Set(
        jobRows
          .filter((j) => j.entityType === 'Contact')
          .map((j) => String(j.entityId)),
      ),
    ].filter((id) => Types.ObjectId.isValid(id));

    const [leads, contacts] = await Promise.all([
      leadIds.length
        ? this.leadModel
            .find({ _id: { $in: leadIds.map((id) => new Types.ObjectId(id)) } })
            .select(
              'firstName lastName email organization leadOwner pipeline',
            )
            .lean()
            .exec()
        : Promise.resolve([]),
      contactIds.length
        ? this.contactModel
            .find({
              _id: { $in: contactIds.map((id) => new Types.ObjectId(id)) },
            })
            .select('firstName lastName email organization leadOwner')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const leadById = new Map(
      leads.map((l) => [
        String(l._id),
        {
          name: [l.firstName, l.lastName].filter(Boolean).join(' ').trim(),
          email: String(l.email || '').trim(),
          organization: String(l.organization || '').trim(),
          leadOwner: String(l.leadOwner || '').trim(),
        },
      ]),
    );
    const contactById = new Map(
      contacts.map((c) => [
        String(c._id),
        {
          name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim(),
          email: String(c.email || '').trim(),
          organization: String(c.organization || '').trim(),
          leadOwner: String(c.leadOwner || '').trim(),
        },
      ]),
    );

    const inScope = (entityType: string, entityId: string): boolean => {
      if (isOrgWide) return true;
      const rec =
        entityType === 'Lead'
          ? leadById.get(entityId)
          : contactById.get(entityId);
      if (!rec) return false;
      if (entityType === 'Lead' && trackingLeadIds.has(entityId)) return true;
      const lo = rec.leadOwner;
      if (!lo) return false;
      return leadOwners.some((o) => o.toLowerCase() === lo.toLowerCase());
    };

    const items: Array<{
      jobId: string;
      runAt: string;
      entityType: 'Lead' | 'Contact';
      entityId: string;
      name: string;
      email: string;
      organization?: string;
      leadOwner?: string;
      stepLabel: string;
      overdue: boolean;
    }> = [];
    let totalPending = 0;
    let overdueCount = 0;

    for (const job of jobRows) {
      const entityId = String(job.entityId);
      const entityType = job.entityType as 'Lead' | 'Contact';
      if (!inScope(entityType, entityId)) continue;
      const rec =
        entityType === 'Lead'
          ? leadById.get(entityId)
          : contactById.get(entityId);
      if (!rec) continue;
      const runAt = new Date(job.runAt);
      const overdue = runAt.getTime() < now.getTime();
      totalPending += 1;
      if (overdue) overdueCount += 1;
      if (items.length >= limit) continue;
      items.push({
        jobId: String(job._id),
        runAt: runAt.toISOString(),
        entityType,
        entityId,
        name: rec.name || rec.email || 'Record',
        email: rec.email,
        organization: rec.organization || undefined,
        leadOwner: rec.leadOwner || undefined,
        stepLabel: this.describePendingFollowUpJob(
          job as WorkflowDelayedJob & { _id: Types.ObjectId },
        ),
        overdue,
      });
    }

    return {
      items,
      totalPending,
      overdueCount,
      nextRunAt: items[0]?.runAt ?? null,
    };
  }

  private async getLeadsAddedByDayForSalesWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    start: Date,
    end: Date,
  ): Promise<
    Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
      stageEntered: Array<{ stage: string; count: number }>;
    }>
  > {
    const createdVisibility = await this.buildLeadCreatedVisibilityForWorkspace(
      owner,
      ownerMatchExtras,
      scopedAuthorId,
    );
    const tz = this.reportingCalendarTz();

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      // Match CRM Leads board: converted leads become deals and leave this count.
      converted: { $ne: true },
      createdAt: { $gte: start, $lte: end },
      ...createdVisibility,
    };

    type AggRow = {
      _id: { d: string; pid: string | null; pn: string; stage: string };
      count: number;
    };
    // Match CRM Leads module: only boards with type "leads" (LinkedIn / Twitter /
    // Lead Qualification, etc.). Exclude lead docs stuck on deals pipelines.
    const [raw, stageEnteredByDay] = await Promise.all([
      this.leadModel
        .aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'pipelines',
              localField: 'pipeline',
              foreignField: '_id',
              as: 'pipeDoc',
            },
          },
          {
            $addFields: {
              pipelineType: {
                $ifNull: [{ $arrayElemAt: ['$pipeDoc.type', 0] }, null],
              },
            },
          },
          {
            $match: {
              $or: [
                { pipelineType: 'leads' },
                { pipeline: null },
                { pipeline: { $exists: false } },
              ],
            },
          },
          {
            $addFields: {
              dayKey: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: tz,
                },
              },
              pipelineIdStr: {
                $cond: [
                  { $ifNull: ['$pipeline', false] },
                  { $toString: '$pipeline' },
                  null,
                ],
              },
              pipelineName: {
                $ifNull: [
                  { $arrayElemAt: ['$pipeDoc.name', 0] },
                  'No pipeline',
                ],
              },
              stageName: {
                $let: {
                  vars: {
                    st: {
                      $trim: {
                        input: {
                          $convert: {
                            input: { $ifNull: ['$stage', '$status'] },
                            to: 'string',
                            onError: '',
                            onNull: '',
                          },
                        },
                      },
                    },
                  },
                  in: {
                    $cond: [{ $gt: [{ $strLenCP: '$$st' }, 0] }, '$$st', 'New'],
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: {
                d: '$dayKey',
                pid: '$pipelineIdStr',
                pn: '$pipelineName',
                stage: '$stageName',
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.d': 1, '_id.pn': 1, '_id.stage': 1 } },
        ])
        .exec() as Promise<AggRow[]>,
      this.getLeadStageEnteredByDayForSalesWorkspace(
        owner,
        ownerMatchExtras,
        scopedAuthorId,
        start,
        end,
        tz,
      ),
    ]);

    const dayMap = new Map<
      string,
      {
        pipelines: Map<
          string,
          { pipelineId: string | null; pipelineName: string; count: number }
        >;
        stages: Map<string, number>;
      }
    >();

    for (const row of raw) {
      const day = row._id?.d;
      if (!day) continue;
      const pid = row._id.pid;
      const pname = String(row._id.pn || 'No pipeline').trim() || 'No pipeline';
      const stage = String(row._id.stage || 'New').trim() || 'New';
      const c = Number(row.count) || 0;
      if (!dayMap.has(day)) {
        dayMap.set(day, { pipelines: new Map(), stages: new Map() });
      }
      const bucket = dayMap.get(day)!;
      const pkey = pid == null ? `__none__:${pname}` : String(pid);
      const prev = bucket.pipelines.get(pkey);
      if (prev) prev.count += c;
      else
        bucket.pipelines.set(pkey, {
          pipelineId: pid,
          pipelineName: pname,
          count: c,
        });
      bucket.stages.set(stage, (bucket.stages.get(stage) || 0) + c);
    }

    const allDays = new Set<string>([
      ...dayMap.keys(),
      ...stageEnteredByDay.keys(),
    ]);
    const out: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
      stageEntered: Array<{ stage: string; count: number }>;
    }> = [];

    for (const d of [...allDays].sort()) {
      const bucket = dayMap.get(d);
      const byPipeline = bucket
        ? [...bucket.pipelines.values()].sort((a, b) => b.count - a.count)
        : [];
      const byStage = bucket
        ? [...bucket.stages.entries()]
            .map(([stage, count]) => ({ stage, count }))
            .sort((a, b) => b.count - a.count)
        : [];
      const stageEnteredMap = stageEnteredByDay.get(d);
      const stageEntered = stageEnteredMap
        ? [...stageEnteredMap.entries()]
            .map(([stage, count]) => ({ stage, count }))
            .sort((a, b) => b.count - a.count)
        : [];
      const total = byPipeline.reduce((s, x) => s + x.count, 0);
      // Keep days that have creates and/or stage moves (Dead / Converted / etc.)
      if (total === 0 && stageEntered.length === 0) continue;
      out.push({ date: d, total, byPipeline, byStage, stageEntered });
    }
    return out;
  }

  /**
   * Stage moves in the window (e.g. Moved to Dead, Converted) from lead update /
   * convert activities — scoped with the same owner visibility as lead intake.
   */
  private async getLeadStageEnteredByDayForSalesWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    start: Date,
    end: Date,
    tz: string,
  ): Promise<Map<string, Map<string, number>>> {
    const createdVisibility = await this.buildLeadCreatedVisibilityForWorkspace(
      owner,
      ownerMatchExtras,
      scopedAuthorId,
    );

    const acts = (await this.activityModel
      .find({
        type: 'System',
        relatedType: 'Lead',
        createdAt: { $gte: start, $lte: end },
        $or: [
          { title: 'Lead Updated', content: /Stage from .+ to '/i },
          { title: 'Lead Life-cycle Transition' },
          { title: 'Lead Converted' },
          { content: { $regex: /successfully converted lead/i } },
        ],
      })
      .select('content title createdAt relatedTo')
      .limit(5000)
      .lean()
      .exec()) as Array<{
      content?: string;
      title?: string;
      createdAt?: Date;
      relatedTo?: Types.ObjectId;
    }>;

    if (!acts.length) return new Map();

    const leadIds = [
      ...new Set(
        acts
          .map((a) => (a.relatedTo ? String(a.relatedTo) : ''))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    if (!leadIds.length) return new Map();

    const scopedLeads = (await this.leadModel
      .aggregate([
        {
          $match: {
            _id: { $in: leadIds },
            isDeleted: { $ne: true },
            ...createdVisibility,
          },
        },
        {
          $lookup: {
            from: 'pipelines',
            localField: 'pipeline',
            foreignField: '_id',
            as: 'pipeDoc',
          },
        },
        {
          $addFields: {
            pipelineType: {
              $ifNull: [{ $arrayElemAt: ['$pipeDoc.type', 0] }, null],
            },
          },
        },
        {
          $match: {
            $or: [
              { pipelineType: 'leads' },
              { pipeline: null },
              { pipeline: { $exists: false } },
            ],
          },
        },
        { $project: { _id: 1 } },
      ])
      .exec()) as Array<{ _id: Types.ObjectId }>;
    const inScope = new Set(scopedLeads.map((l) => String(l._id)));

    const stageFromContent = (title: string, content: string): string | null => {
      const t = String(title || '');
      const c = String(content || '');
      // Converted leaves the Leads board and is counted under Deals intake instead.
      if (
        /life-cycle transition/i.test(t) ||
        /converted/i.test(t) ||
        /successfully converted lead/i.test(c)
      ) {
        return null;
      }
      const m = /Stage from\s+'([^']*)'\s+to\s+'([^']*)'/i.exec(c);
      if (!m) return null;
      const to = String(m[2] || '').trim();
      if (!to) return null;
      if (/^converted$/i.test(to)) return null;
      return to;
    };

    const dayMap = new Map<string, Map<string, number>>();
    // One move per lead per day per target stage (avoid duplicate activity spam)
    const seen = new Set<string>();

    for (const act of acts) {
      const lid = act.relatedTo ? String(act.relatedTo) : '';
      if (!lid || !inScope.has(lid)) continue;
      const stage = stageFromContent(
        String(act.title || ''),
        String(act.content || ''),
      );
      if (!stage) continue;
      const when = act.createdAt ? new Date(act.createdAt) : null;
      if (!when || Number.isNaN(when.getTime())) continue;
      const day = this.formatYmdInTz(when, tz);
      const dedupeKey = `${day}|${lid}|${stage.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      const smap = dayMap.get(day)!;
      smap.set(stage, (smap.get(stage) || 0) + 1);
    }
    return dayMap;
  }

  private async buildDealCreatedVisibilityForWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<Record<string, unknown>> {
    let ownerKey = owner?.trim();
    if (
      ownerKey &&
      ownerKey !== 'All' &&
      ownerKey !== 'All authorized' &&
      Types.ObjectId.isValid(ownerKey) &&
      ownerKey.length === 24
    ) {
      const label = await this.getHrmsDisplayOwnerLabel(
        new Types.ObjectId(ownerKey),
      );
      if (label) ownerKey = label;
    }

    if (
      !scopedAuthorId &&
      (!ownerKey || ownerKey === 'All' || ownerKey === 'All authorized')
    ) {
      return {};
    }

    const primaryForMerge =
      ownerKey && ownerKey !== 'All' && ownerKey !== 'All authorized'
        ? ownerKey
        : undefined;
    const owners = this.mergeOwnerMatchStrings(
      primaryForMerge,
      ownerMatchExtras,
    ).filter((o) => o !== 'All authorized');
    const authorId =
      scopedAuthorId || (await this.resolveHrmsAuthorId(owner?.trim()));

    const orClauses: Record<string, unknown>[] = [];
    const nameClause = this.ownerFieldNameMatch('dealOwner', owners);
    if (nameClause) {
      if (Array.isArray((nameClause as { $or?: unknown }).$or)) {
        orClauses.push(
          ...((nameClause as { $or: Record<string, unknown>[] }).$or),
        );
      } else {
        orClauses.push(nameClause);
      }
    }
    if (authorId) {
      const ids = Array.isArray(authorId) ? authorId : [authorId];
      const authIn = ids.length === 1 ? ids[0] : { $in: ids };
      orClauses.push({ createdBy: authIn });
      orClauses.push({ sharedWith: authIn });
      for (const id of ids) {
        orClauses.push({ dealOwner: String(id) });
      }
    }

    if (orClauses.length === 0) return {};
    if (orClauses.length === 1) return orClauses[0];
    return { $or: orClauses };
  }

  /** Deals created in the window on type=deals pipelines only (never mixed with leads). */
  private async getDealsAddedByDayForSalesWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    start: Date,
    end: Date,
  ): Promise<
    Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
    }>
  > {
    const createdVisibility = await this.buildDealCreatedVisibilityForWorkspace(
      owner,
      ownerMatchExtras,
      scopedAuthorId,
    );
    const tz = this.reportingCalendarTz();

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      createdAt: { $gte: start, $lte: end },
      ...createdVisibility,
    };

    type AggRow = {
      _id: { d: string; pid: string | null; pn: string; stage: string };
      count: number;
    };

    const raw = (await this.dealModel
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'pipelines',
            localField: 'pipeline',
            foreignField: '_id',
            as: 'pipeDoc',
          },
        },
        {
          $addFields: {
            pipelineType: {
              $ifNull: [{ $arrayElemAt: ['$pipeDoc.type', 0] }, 'deals'],
            },
          },
        },
        {
          // CRM Deals boards: type deals or legacy missing type (defaults to deals).
          $match: {
            $or: [
              { pipelineType: 'deals' },
              { pipelineType: null },
              { pipeline: null },
              { pipeline: { $exists: false } },
            ],
          },
        },
        // Never count lead / platform boards as deals.
        {
          $match: {
            pipelineType: { $nin: ['leads', 'platform_opportunities'] },
          },
        },
        {
          $addFields: {
            dayKey: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: tz,
              },
            },
            pipelineIdStr: {
              $cond: [
                { $ifNull: ['$pipeline', false] },
                { $toString: '$pipeline' },
                null,
              ],
            },
            pipelineName: {
              $ifNull: [{ $arrayElemAt: ['$pipeDoc.name', 0] }, 'No pipeline'],
            },
            stageName: {
              $let: {
                vars: {
                  st: {
                    $trim: {
                      input: {
                        $convert: {
                          input: { $ifNull: ['$stage', ''] },
                          to: 'string',
                          onError: '',
                          onNull: '',
                        },
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $gt: [{ $strLenCP: '$$st' }, 0] },
                    '$$st',
                    'Unknown',
                  ],
                },
              },
            },
          },
        },
        {
          $group: {
            _id: {
              d: '$dayKey',
              pid: '$pipelineIdStr',
              pn: '$pipelineName',
              stage: '$stageName',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.d': 1, '_id.pn': 1 } },
      ])
      .exec()) as AggRow[];

    const dayMap = new Map<
      string,
      {
        pipelines: Map<
          string,
          { pipelineId: string | null; pipelineName: string; count: number }
        >;
        stages: Map<string, number>;
      }
    >();

    for (const row of raw) {
      const day = row._id?.d;
      if (!day) continue;
      const pid = row._id.pid;
      const pname = String(row._id.pn || 'No pipeline').trim() || 'No pipeline';
      const stage = String(row._id.stage || 'Unknown').trim() || 'Unknown';
      const c = Number(row.count) || 0;
      if (!dayMap.has(day)) {
        dayMap.set(day, { pipelines: new Map(), stages: new Map() });
      }
      const bucket = dayMap.get(day)!;
      const pkey = pid == null ? `__none__:${pname}` : String(pid);
      const prev = bucket.pipelines.get(pkey);
      if (prev) prev.count += c;
      else
        bucket.pipelines.set(pkey, {
          pipelineId: pid,
          pipelineName: pname,
          count: c,
        });
      bucket.stages.set(stage, (bucket.stages.get(stage) || 0) + c);
    }

    const out: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
      byStage: Array<{ stage: string; count: number }>;
    }> = [];

    for (const d of [...dayMap.keys()].sort()) {
      const bucket = dayMap.get(d)!;
      const byPipeline = [...bucket.pipelines.values()].sort(
        (a, b) => b.count - a.count,
      );
      const byStage = [...bucket.stages.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count);
      const total = byPipeline.reduce((s, x) => s + x.count, 0);
      out.push({ date: d, total, byPipeline, byStage });
    }
    return out;
  }

  private async buildPlatformCreatedVisibilityForWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<Record<string, unknown>> {
    let ownerKey = owner?.trim();
    if (
      ownerKey &&
      ownerKey !== 'All' &&
      ownerKey !== 'All authorized' &&
      Types.ObjectId.isValid(ownerKey) &&
      ownerKey.length === 24
    ) {
      const label = await this.getHrmsDisplayOwnerLabel(
        new Types.ObjectId(ownerKey),
      );
      if (label) ownerKey = label;
    }

    if (
      !scopedAuthorId &&
      (!ownerKey || ownerKey === 'All' || ownerKey === 'All authorized')
    ) {
      return {};
    }

    const primaryForMerge =
      ownerKey && ownerKey !== 'All' && ownerKey !== 'All authorized'
        ? ownerKey
        : undefined;
    const owners = this.mergeOwnerMatchStrings(
      primaryForMerge,
      ownerMatchExtras,
    ).filter((o) => o !== 'All authorized');
    const authorId =
      scopedAuthorId || (await this.resolveHrmsAuthorId(owner?.trim()));

    const orClauses: Record<string, unknown>[] = [];
    const nameClause = this.ownerFieldNameMatch('ownerLabel', owners);
    if (nameClause) {
      if (Array.isArray((nameClause as { $or?: unknown }).$or)) {
        orClauses.push(
          ...((nameClause as { $or: Record<string, unknown>[] }).$or),
        );
      } else {
        orClauses.push(nameClause);
      }
    }
    if (authorId) {
      const ids = Array.isArray(authorId) ? authorId : [authorId];
      const authIn = ids.length === 1 ? ids[0] : { $in: ids };
      orClauses.push({ createdBy: authIn });
      orClauses.push({ sharedWith: authIn });
      for (const id of ids) {
        orClauses.push({ ownerLabel: String(id) });
      }
    }

    if (orClauses.length === 0) return {};
    if (orClauses.length === 1) return orClauses[0];
    return { $or: orClauses };
  }

  private async getPlatformOpportunitiesAddedByDayForSalesWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
    start: Date,
    end: Date,
  ): Promise<
    Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
    }>
  > {
    const createdVisibility =
      await this.buildPlatformCreatedVisibilityForWorkspace(
        owner,
        ownerMatchExtras,
        scopedAuthorId,
      );
    const tz = this.reportingCalendarTz();

    const match: Record<string, unknown> = {
      createdAt: { $gte: start, $lte: end },
      ...createdVisibility,
    };

    type AggRow = {
      _id: { d: string; pid: string | null; pn: string };
      count: number;
    };

    const raw = (await this.platformOpportunityModel
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'pipelines',
            let: { lp: '$pipeline' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$lp'] },
                  type: 'platform_opportunities',
                },
              },
              { $project: { name: 1 } },
              { $limit: 1 },
            ],
            as: 'pipeDoc',
          },
        },
        {
          $addFields: {
            dayKey: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: tz,
              },
            },
            pipelineIdStr: {
              $cond: [
                { $ifNull: ['$pipeline', false] },
                { $toString: '$pipeline' },
                null,
              ],
            },
            pipelineName: {
              $ifNull: [
                { $arrayElemAt: ['$pipeDoc.name', 0] },
                {
                  $cond: [
                    {
                      $gt: [
                        {
                          $strLenCP: {
                            $ifNull: ['$opportunitySourcePlatform', ''],
                          },
                        },
                        0,
                      ],
                    },
                    '$opportunitySourcePlatform',
                    'No pipeline',
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              d: '$dayKey',
              pid: '$pipelineIdStr',
              pn: '$pipelineName',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.d': 1, '_id.pn': 1 } },
      ])
      .exec()) as AggRow[];

    const dayMap = new Map<
      string,
      Map<string, { pipelineId: string | null; pipelineName: string; count: number }>
    >();

    for (const row of raw) {
      const day = row._id?.d;
      if (!day) continue;
      const pid = row._id.pid;
      const pname = String(row._id.pn || 'No pipeline').trim() || 'No pipeline';
      const c = Number(row.count) || 0;
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      const pmap = dayMap.get(day)!;
      const key = pid == null ? `__none__:${pname}` : String(pid);
      const prev = pmap.get(key);
      if (prev) prev.count += c;
      else pmap.set(key, { pipelineId: pid, pipelineName: pname, count: c });
    }

    const out: Array<{
      date: string;
      total: number;
      byPipeline: Array<{
        pipelineId: string | null;
        pipelineName: string;
        count: number;
      }>;
    }> = [];

    const sortedDays = [...dayMap.keys()].sort();
    for (const d of sortedDays) {
      const pmap = dayMap.get(d)!;
      const byPipeline = [...pmap.values()].sort((a, b) => b.count - a.count);
      const total = byPipeline.reduce((s, x) => s + x.count, 0);
      out.push({ date: d, total, byPipeline });
    }
    return out;
  }

  private async getLeadFollowUpAndIntakeForSalesWorkspace(
    owner: string,
    ownerMatchExtras: string[] | undefined,
    scopedAuthorId: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<{
    leadFollowUpWeek: {
      weekStart: string;
      weekEnd: string;
      totalLeadsAdded: number;
      followUpScheduled: number;
      followUpDone: number;
      notScheduled: number;
      scheduledNotDone: number;
      notScheduledLeads: Array<{
        id: string;
        name: string;
        email: string;
        organization?: string;
        leadOwner?: string;
        createdAt: string;
      }>;
      scheduledNotDoneLeads: Array<{
        id: string;
        name: string;
        email: string;
        organization?: string;
        leadOwner?: string;
        createdAt: string;
      }>;
    };
    leadFollowUpByWindow: {
      today: {
        totalLeadsAdded: number;
        followUpScheduled: number;
        followUpDone: number;
        notScheduled: number;
        scheduledNotDone: number;
        notScheduledLeads: Array<{
          id: string;
          name: string;
          email: string;
          organization?: string;
          leadOwner?: string;
          createdAt: string;
        }>;
        scheduledNotDoneLeads: Array<{
          id: string;
          name: string;
          email: string;
          organization?: string;
          leadOwner?: string;
          createdAt: string;
        }>;
      };
      yesterday: {
        totalLeadsAdded: number;
        followUpScheduled: number;
        followUpDone: number;
        notScheduled: number;
        scheduledNotDone: number;
        notScheduledLeads: Array<{
          id: string;
          name: string;
          email: string;
          organization?: string;
          leadOwner?: string;
          createdAt: string;
        }>;
        scheduledNotDoneLeads: Array<{
          id: string;
          name: string;
          email: string;
          organization?: string;
          leadOwner?: string;
          createdAt: string;
        }>;
      };
      thisWeek: {
        totalLeadsAdded: number;
        followUpScheduled: number;
        followUpDone: number;
        notScheduled: number;
        scheduledNotDone: number;
        notScheduledLeads: Array<{
          id: string;
          name: string;
          email: string;
          organization?: string;
          leadOwner?: string;
          createdAt: string;
        }>;
        scheduledNotDoneLeads: Array<{
          id: string;
          name: string;
          email: string;
          organization?: string;
          leadOwner?: string;
          createdAt: string;
        }>;
      };
    };
    leadIntake: {
      today: Array<{
        id: string;
        name: string;
        email: string;
        organization?: string;
        leadOwner?: string;
        status: string;
        entityType?: 'lead' | 'platformOpportunity';
        createdAt: string;
      }>;
      yesterday: Array<{
        id: string;
        name: string;
        email: string;
        organization?: string;
        leadOwner?: string;
        status: string;
        entityType?: 'lead' | 'platformOpportunity';
        createdAt: string;
      }>;
      thisWeek: Array<{
        id: string;
        name: string;
        email: string;
        organization?: string;
        leadOwner?: string;
        status: string;
        entityType?: 'lead' | 'platformOpportunity';
        createdAt: string;
      }>;
    };
  }> {
    const createdVisibility = await this.buildLeadCreatedVisibilityForWorkspace(
      owner,
      ownerMatchExtras,
      scopedAuthorId,
    );
    const today = this.resolveReportingCalendarWindow('today');
    const yesterday = this.resolveReportingCalendarWindow('yesterday');
    const week = this.resolveReportingCalendarWindow('this_week');
    // One DB round-trip for intake windows; then split in-memory.
    // Keep parity with prior behavior by allowing up to 300 rows per bucket.
    const weekLeadRaw = await this.leadModel
      .find({
        createdAt: { $gte: week.start, $lte: week.end },
        ...createdVisibility,
      })
      .select('_id firstName lastName email organization leadOwner stage status createdAt')
      .sort({ createdAt: -1 })
      .limit(900)
      .lean()
      .exec();
    let leadOwnerKey = owner?.trim();
    if (
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      leadOwnerKey !== 'All authorized' &&
      Types.ObjectId.isValid(leadOwnerKey) &&
      leadOwnerKey.length === 24
    ) {
      const label = await this.getHrmsDisplayOwnerLabel(
        new Types.ObjectId(leadOwnerKey),
      );
      if (label) leadOwnerKey = label;
    }
    const primaryForMerge =
      leadOwnerKey &&
      leadOwnerKey !== 'All' &&
      leadOwnerKey !== 'All authorized'
        ? leadOwnerKey
        : undefined;
    const leadOwners = this.mergeOwnerMatchStrings(
      primaryForMerge,
      ownerMatchExtras,
    ).filter((o) => o !== 'All authorized');
    const authorId =
      scopedAuthorId || (await this.resolveHrmsAuthorId(owner?.trim()));
    const platformVisibility: Record<string, unknown> = {};
    if (leadOwners.length > 0 || authorId) {
      const ownerFilter =
        leadOwners.length === 1 ? leadOwners[0] : { $in: leadOwners };
      const authIn = Array.isArray(authorId) ? { $in: authorId } : authorId;
      const orClauses: Record<string, unknown>[] = [];
      if (leadOwners.length > 0) {
        orClauses.push({ ownerLabel: ownerFilter });
      }
      if (authorId) {
        orClauses.push({ createdBy: authIn });
        orClauses.push({ sharedWith: authIn });
      }
      if (orClauses.length === 1) {
        Object.assign(platformVisibility, orClauses[0]);
      } else if (orClauses.length > 1) {
        platformVisibility.$or = orClauses;
      }
    }
    const weekPlatformRaw = await this.platformOpportunityModel
      .find({
        createdAt: { $gte: week.start, $lte: week.end },
        ...platformVisibility,
      })
      .select(
        '_id title platformClientLabel opportunitySourcePlatform ownerLabel stage platformEngagementStatus createdAt',
      )
      .sort({ createdAt: -1 })
      .limit(900)
      .lean()
      .exec();
    const toLead = (l: Record<string, unknown>) => {
      const first = String(l.firstName || '').trim();
      const last = String(l.lastName || '').trim();
      return {
        id: String(l._id),
        name: [first, last].filter(Boolean).join(' ') || 'Unnamed lead',
        email: String(l.email || ''),
        organization: String(l.organization || '') || undefined,
        leadOwner: String(l.leadOwner || '') || undefined,
        status: String(l.stage || l.status || 'New').trim() || 'New',
        createdAt: l.createdAt
          ? new Date(String(l.createdAt)).toISOString()
          : new Date().toISOString(),
      };
    };
    const weekRowsAll = (weekLeadRaw as unknown as Array<Record<string, unknown>>).map(
      toLead,
    );
    const platformRowsAll = (
      weekPlatformRaw as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      const title = String(row.title || '').trim();
      const client = String(row.platformClientLabel || '').trim();
      const platform = String(row.opportunitySourcePlatform || '').trim();
      return {
        id: String(row._id),
        name: title || client || 'Platform opportunity',
        email: '',
        organization: client || platform || undefined,
        leadOwner: String(row.ownerLabel || '') || undefined,
        status:
          String(row.stage || row.platformEngagementStatus || 'New').trim() || 'New',
        entityType: 'platformOpportunity' as const,
        createdAt: row.createdAt
          ? new Date(String(row.createdAt)).toISOString()
          : new Date().toISOString(),
      };
    });
    const intakeRowsAll = [...weekRowsAll, ...platformRowsAll]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 900);
    const inRange = (isoTs: string, start: Date, end: Date) => {
      const t = new Date(isoTs).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };
    const todayRows = intakeRowsAll
      .filter((l) => inRange(l.createdAt, today.start, today.end))
      .slice(0, 300);
    const yesterdayRows = intakeRowsAll
      .filter((l) => inRange(l.createdAt, yesterday.start, yesterday.end))
      .slice(0, 300);
    const weekRows = intakeRowsAll.slice(0, 300);

    // Follow-up KPIs / scheduled counts: CRM leads only (same source as leads-added-by-day).
    const followUpSourceRows = weekRowsAll.slice(0, 300);
    const todayLeadRows = weekRowsAll
      .filter((l) => inRange(l.createdAt, today.start, today.end))
      .slice(0, 300);
    const yesterdayLeadRows = weekRowsAll
      .filter((l) => inRange(l.createdAt, yesterday.start, yesterday.end))
      .slice(0, 300);
    const weekLeadIds = followUpSourceRows
      .filter((l) => Types.ObjectId.isValid(l.id))
      .map((l) => new Types.ObjectId(l.id));
    const scheduledSet = new Set<string>();
    const doneSet = new Set<string>();
    if (weekLeadIds.length > 0) {
      const acts = (await this.activityModel
        .find({
          relatedType: 'Lead',
          relatedTo: { $in: weekLeadIds },
          $or: [
            { title: 'Follow-up sequence scheduled' },
            { title: 'Follow-up sequence stopped' },
            { title: 'Follow-up sequence cancelled' },
            { 'metadata.followUpSequence': true },
            { 'metadata.branchLabel': 'Follow-up sequence' },
          ],
        })
        .select('relatedTo title metadata')
        .lean()
        .exec()) as Array<{
        relatedTo?: Types.ObjectId;
        title?: string;
        metadata?: {
          workflowScheduled?: boolean;
          followUpSequence?: boolean;
          status?: string;
          branchLabel?: string;
        };
      }>;
      for (const a of acts) {
        const lid = a.relatedTo ? String(a.relatedTo) : '';
        if (!lid) continue;
        const title = String(a.title || '');
        const meta = a.metadata || {};
        if (
          title === 'Follow-up sequence scheduled' ||
          (meta.workflowScheduled === true && meta.followUpSequence === true)
        ) {
          scheduledSet.add(lid);
        }
        if (
          title === 'Follow-up sequence stopped' ||
          title === 'Follow-up sequence cancelled' ||
          (meta.branchLabel === 'Follow-up sequence' &&
            (meta.status === 'success' || meta.status === 'skipped'))
        ) {
          doneSet.add(lid);
        }
      }
    }

    const summarizeWindow = (rows: typeof weekRows) => {
      const scheduledLeads = rows.filter((lead) => scheduledSet.has(lead.id));
      const doneLeads = rows.filter((lead) => doneSet.has(lead.id));
      const notScheduledLeads = rows.filter((lead) => !scheduledSet.has(lead.id));
      const scheduledNotDoneLeads = rows.filter(
        (lead) => scheduledSet.has(lead.id) && !doneSet.has(lead.id),
      );
      return {
        totalLeadsAdded: rows.length,
        followUpScheduled: scheduledLeads.length,
        followUpDone: doneLeads.length,
        notScheduled: notScheduledLeads.length,
        scheduledNotDone: scheduledNotDoneLeads.length,
        notScheduledLeads,
        scheduledNotDoneLeads,
      };
    };
    const weekSummary = summarizeWindow(followUpSourceRows);
    const todaySummary = summarizeWindow(todayLeadRows);
    const yesterdaySummary = summarizeWindow(yesterdayLeadRows);

    return {
      leadFollowUpWeek: {
        weekStart: week.start.toISOString(),
        weekEnd: week.end.toISOString(),
        totalLeadsAdded: weekSummary.totalLeadsAdded,
        followUpScheduled: weekSummary.followUpScheduled,
        followUpDone: weekSummary.followUpDone,
        notScheduled: weekSummary.notScheduled,
        scheduledNotDone: weekSummary.scheduledNotDone,
        notScheduledLeads: weekSummary.notScheduledLeads,
        scheduledNotDoneLeads: weekSummary.scheduledNotDoneLeads,
      },
      leadFollowUpByWindow: {
        today: todaySummary,
        yesterday: yesterdaySummary,
        thisWeek: weekSummary,
      },
      leadIntake: {
        today: todayRows,
        yesterday: yesterdayRows,
        thisWeek: weekRows,
      },
    };
  }

  private async getRecordIdsByOwners(
    leadOwners: string[],
    authorId: Types.ObjectId | Types.ObjectId[] | null,
  ): Promise<Types.ObjectId[]> {
    if (leadOwners.length === 0 && !authorId) return [];

    const filter =
      leadOwners.length === 1 ? leadOwners[0] : { $in: leadOwners };
    const authIn = Array.isArray(authorId) ? { $in: authorId } : authorId;
    const [lids, dids, cids, clids] = await Promise.all([
      this.leadModel.distinct('_id', { leadOwner: filter }),
      this.dealModel.distinct('_id', { dealOwner: filter }),
      this.contactModel.distinct('_id', { leadOwner: filter }),
      authorId ? this.clientModel.distinct('_id', { assignedTo: authIn }) : [],
    ]);

    const all = [...lids, ...dids, ...cids, ...clids];
    return all
      .filter((id) => id != null && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private activityPlainSnippet(
    content?: string,
    maxLen = 220,
  ): string {
    if (!content) return '';
    const s = String(content)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  }

  private displayActivityType(
    rawType: string,
    metadata?: Record<string, unknown>,
  ): string {
    const t = String(rawType || '').trim();
    if (metadata?.workflowExecution) return 'Workflow';
    if (metadata?.workflowScheduled || metadata?.workflowCancelled) {
      return 'Workflow';
    }
    if (t === 'Activity' && metadata?.workflowId) return 'Workflow';
    if (t === 'Email') return 'Email';
    if (t === 'Task') return 'Task';
    if (t === 'Note') return 'Note';
    if (t === 'Call') return 'Call';
    if (t === 'Meeting' || t === 'Event') return 'Meeting';
    if (t === 'System') return 'System';
    return t || 'Activity';
  }

  private displayActivityTitle(
    row: Record<string, unknown>,
    displayType: string,
  ): string {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const title = String(row.title || '').trim();
    if (displayType === 'Email') {
      const subj = String(metadata.subject || title || '').trim();
      return subj || 'Email';
    }
    if (displayType === 'Workflow') {
      if (metadata.workflowScheduled) {
        return title || 'Follow-up scheduled';
      }
      if (metadata.workflowCancelled) {
        return title || 'Follow-up cancelled';
      }
      if (metadata.status === 'skipped') {
        return title || 'Workflow stopped';
      }
      return title || 'Workflow run';
    }
    if (displayType === 'Task') {
      const status = String(row.status || metadata.status || '').trim();
      return status ? `${title || 'Task'} · ${status}` : title || 'Task';
    }
    return title || displayType;
  }

  private async resolveCrmRecordLabelMap(
    pairs: Array<{ relatedType?: string; relatedTo?: string }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const byType = new Map<string, Set<string>>();

    for (const p of pairs) {
      const rt = moduleToRelatedType(String(p.relatedType || ''));
      const id = String(p.relatedTo || '').trim();
      if (!Types.ObjectId.isValid(id)) continue;
      const key = rt.toLowerCase();
      if (!byType.has(key)) byType.set(key, new Set());
      byType.get(key)!.add(id);
    }

    const load = async (
      model: Model<{ _id: Types.ObjectId }>,
      ids: string[],
      labelFn: (doc: Record<string, unknown>) => string,
      relatedType: string,
    ) => {
      if (!ids.length) return;
      const docs = await model
        .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
        .select('_id firstName lastName email name title organization')
        .lean()
        .exec();
      for (const doc of docs as unknown as Array<Record<string, unknown>>) {
        const id = String(doc._id);
        const label = labelFn(doc);
        if (label) out.set(`${relatedType}:${id}`, label);
      }
    };

    const leadIds = [...(byType.get('lead') || [])];
    if (leadIds.length) {
      await load(
        this.leadModel as Model<{ _id: Types.ObjectId }>,
        leadIds,
        (d) =>
          `${String(d.firstName || '')} ${String(d.lastName || '')}`.trim() ||
          String(d.email || '') ||
          'Lead',
        'Lead',
      );
    }
    const contactIds = [...(byType.get('contact') || [])];
    if (contactIds.length) {
      await load(
        this.contactModel as Model<{ _id: Types.ObjectId }>,
        contactIds,
        (d) =>
          `${String(d.firstName || '')} ${String(d.lastName || '')}`.trim() ||
          String(d.email || '') ||
          'Contact',
        'Contact',
      );
    }
    const dealIds = [...(byType.get('deal') || [])];
    if (dealIds.length) {
      await load(
        this.dealModel as Model<{ _id: Types.ObjectId }>,
        dealIds,
        (d) => String(d.title || d.organization || 'Deal'),
        'Deal',
      );
    }
    const clientIds = [...(byType.get('client') || [])];
    if (clientIds.length) {
      await load(
        this.clientModel as Model<{ _id: Types.ObjectId }>,
        clientIds,
        (d) => String(d.name || d.email || 'Client'),
        'Client',
      );
    }
    const orgIds = [...(byType.get('organization') || [])];
    if (orgIds.length) {
      await load(
        this.organizationModel as Model<{ _id: Types.ObjectId }>,
        orgIds,
        (d) => String(d.name || 'Company'),
        'Organization',
      );
    }

    return out;
  }

  private async buildWorkspaceRecentActivities(
    recentRows: Array<Record<string, unknown>>,
    auditRows: Array<Record<string, unknown>>,
    authorNameFor: (author: unknown) => string | undefined,
  ): Promise<
    Array<{
      id: string;
      type: string;
      title?: string;
      contentSnippet: string;
      createdAt: string;
      relatedType?: string;
      relatedTo?: string;
      authorName?: string;
      recordLabel?: string;
      href?: string | null;
      auditAction?: string;
      auditModule?: string;
      changesSummary?: string;
      source?: 'activity' | 'audit';
    }>
  > {
    const activityItems = recentRows.map((a) => {
      const metadata = (a.metadata || {}) as Record<string, unknown>;
      const displayType = this.displayActivityType(
        String(a.type || ''),
        metadata,
      );
      const relatedType = String(a.relatedType || '').trim() || undefined;
      const relatedTo = a.relatedTo ? String(a.relatedTo) : undefined;
      let contentSnippet = this.activityPlainSnippet(a.content as string);
      if (displayType === 'Email' && metadata.fromEmail) {
        const from = String(metadata.fromEmail);
        contentSnippet = contentSnippet
          ? `From ${from} — ${contentSnippet}`
          : `From ${from}`;
      }
      return {
        id: String(a._id),
        type: displayType,
        title: this.displayActivityTitle(a, displayType),
        contentSnippet,
        createdAt: a.createdAt
          ? new Date(a.createdAt as Date).toISOString()
          : '',
        relatedType,
        relatedTo,
        authorName: authorNameFor(a.author),
        source: 'activity' as const,
      };
    });

    const auditItems = auditRows.map((l) => {
      const action = String(l.action || 'action');
      const module = String(l.module || '');
      const relatedType = moduleToRelatedType(module);
      const relatedTo = l.entityId ? String(l.entityId) : undefined;
      const changesSummary = summarizeAuditChanges(l.changes);
      const description = String(l.description || '').trim();
      return {
        id: String(l._id),
        type: 'Audit',
        title: `${actionVerb(action)} · ${module.replace(/-/g, ' ')}`,
        contentSnippet:
          description ||
          changesSummary ||
          `${action} on ${module}`,
        createdAt: l.createdAt
          ? new Date(l.createdAt as Date).toISOString()
          : '',
        relatedType,
        relatedTo,
        authorName: authorNameFor(l.user),
        auditAction: action,
        auditModule: module,
        changesSummary: changesSummary || undefined,
        source: 'audit' as const,
      };
    });

    const merged = [...activityItems, ...auditItems].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const labelMap = await this.resolveCrmRecordLabelMap(
      merged.map((m) => ({
        relatedType: m.relatedType,
        relatedTo: m.relatedTo,
      })),
    );

    return merged.map((m) => {
      const rt = moduleToRelatedType(String(m.relatedType || ''));
      const recordLabel =
        m.relatedTo && rt
          ? labelMap.get(`${rt}:${m.relatedTo}`) || undefined
          : undefined;
      const href = crmRecordPath(rt, m.relatedTo);
      return { ...m, recordLabel, href };
    });
  }
}
