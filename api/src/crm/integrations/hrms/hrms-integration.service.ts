import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CRMUser, CRMUserDocument } from '../../crm-users/schemas/user.schema';
import { User, UserDocument } from '../../../users/schemas/user.schema';
import { Lead, LeadDocument } from '../../records/schemas/lead.schema';
import { Activity, ActivityDocument } from '../../records/schemas/activity.schema';
import { CrmNotifyService } from '../../notifications/crm-notify.service';
import {
  HrmsSyncEventLog,
  HrmsSyncEventLogDocument,
} from './schemas/hrms-sync-event-log.schema';
import {
  HrmsAttendancePayload,
  HrmsEmployeePayload,
  HrmsEmploymentStatusPayload,
  HrmsSyncEnvelope,
  HrmsSyncEventType,
  UNAVAILABLE_ATTENDANCE_STATUSES,
} from './hrms-sync.types';

@Injectable()
export class HrmsIntegrationService {
  private readonly logger = new Logger(HrmsIntegrationService.name);

  constructor(
    @InjectModel(CRMUser.name, 'crmConnection')
    private readonly crmUserModel: Model<CRMUserDocument>,
    @InjectModel(User.name)
    private readonly platformUserModel: Model<UserDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(HrmsSyncEventLog.name, 'crmConnection')
    private readonly eventLogModel: Model<HrmsSyncEventLogDocument>,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  async isDuplicateEvent(eventId: string): Promise<boolean> {
    if (!eventId) return false;
    const existing = await this.eventLogModel
      .findOne({ eventId })
      .select('_id')
      .lean()
      .exec();
    return !!existing;
  }

  async markEvent(
    eventId: string,
    eventType: string,
    payload: unknown,
    status: 'processed' | 'ignored' | 'failed',
    error?: string,
  ) {
    await this.eventLogModel
      .findOneAndUpdate(
        { eventId },
        {
          $set: {
            eventType,
            payload: (payload || {}) as Record<string, unknown>,
            status,
            error,
            processedAt: new Date(),
          },
          $setOnInsert: { eventId },
        },
        { upsert: true },
      )
      .exec();
  }

  async handleEnvelope(envelope: HrmsSyncEnvelope): Promise<{ ok: boolean; detail?: string }> {
    const { eventId, eventType, payload } = envelope || ({} as HrmsSyncEnvelope);
    if (!eventId || !eventType) {
      return { ok: false, detail: 'eventId and eventType are required' };
    }
    if (await this.isDuplicateEvent(eventId)) {
      return { ok: true, detail: 'duplicate_ignored' };
    }

    try {
      switch (eventType as HrmsSyncEventType) {
        case 'employee.eligible':
        case 'employee.updated':
          await this.upsertEligibleEmployee(payload as HrmsEmployeePayload);
          break;
        case 'employee.ineligible':
          await this.markIneligible(payload as HrmsEmployeePayload);
          break;
        case 'attendance.day':
          await this.applyAttendance(payload as HrmsAttendancePayload);
          break;
        case 'employment.status':
          await this.applyEmploymentStatus(payload as HrmsEmploymentStatusPayload);
          break;
        default:
          await this.markEvent(eventId, eventType, payload, 'ignored', 'unknown_event');
          return { ok: true, detail: 'unknown_event_ignored' };
      }
      await this.markEvent(eventId, eventType, payload, 'processed');
      return { ok: true };
    } catch (err: any) {
      this.logger.error(`HRMS event ${eventId} failed`, err);
      await this.markEvent(
        eventId,
        eventType,
        payload,
        'failed',
        err?.message || String(err),
      );
      return { ok: false, detail: err?.message || 'processing_failed' };
    }
  }

  /**
   * §2.3 — create/update as unassigned pending CRM Admin grant.
   * Does NOT assign CRM roles or activate login.
   */
  async upsertEligibleEmployee(employee: HrmsEmployeePayload): Promise<CRMUserDocument> {
    const email = String(employee?.email || '')
      .trim()
      .toLowerCase();
    const hrmsEmployeeId = String(employee?.hrmsEmployeeId || '').trim();
    if (!email || !hrmsEmployeeId) {
      throw new Error('email and hrmsEmployeeId are required');
    }

    const existing =
      (await this.crmUserModel.findOne({ hrmsEmployeeId }).exec()) ||
      (await this.crmUserModel.findOne({ email }).exec());

    const wasPendingOrNew =
      !existing ||
      existing.provisioningStatus === 'pending_access' ||
      existing.provisioningStatus === 'revoked' ||
      existing.provisioningStatus === 'hidden';

    const identitySet: Record<string, unknown> = {
      firstName: employee.firstName || existing?.firstName || 'Employee',
      lastName: employee.lastName ?? existing?.lastName ?? '',
      email,
      hrmsEmployeeId,
      department: employee.departmentName || existing?.department,
      designation: employee.designationName || existing?.designation,
      employmentStatus: employee.employmentStatus || 'Active',
      hrmsReportsToEmployeeId: employee.reportsToEmployeeId,
      hrmsSyncStatus: 'synced',
      hrmsSyncedAt: new Date(),
      hrmsSyncError: undefined,
    };

    if (employee.phone) {
      identitySet.agentMobile = employee.phone;
    }

    // Never overwrite an active granted user's role/activation from HRMS.
    if (!existing || existing.provisioningStatus !== 'active') {
      identitySet.provisioningStatus = 'pending_access';
      identitySet.isActive = false;
      // Clear role so Admin must assign deliberately
      if (!existing?.roleId) {
        identitySet.role = 'Unassigned';
        identitySet.roleId = null;
      }
    } else {
      identitySet.provisioningStatus = 'active';
    }

    const passwordHash = await bcrypt.hash(
      process.env.HRMS_SYNC_PLACEHOLDER_PASSWORD || 'ChangeMe@HrmsSync1!',
      10,
    );

    const doc = await this.crmUserModel
      .findOneAndUpdate(
        existing?._id ? { _id: existing._id } : { email },
        {
          $set: identitySet,
          $setOnInsert: {
            password: passwordHash,
            authProvider: 'local',
            permissions: [],
            accessibleEmailAccounts: [],
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    // Keep platform User in sync for JWT identity, but leave inactive until grant
    await this.upsertPlatformUser(doc, employee, doc.provisioningStatus === 'active');

    if (wasPendingOrNew && doc.provisioningStatus === 'pending_access') {
      await this.notifyAdmins({
        event: 'hrms_user_pending',
        title: 'HRMS employee pending CRM access',
        message: `${doc.firstName} ${doc.lastName || ''} (${doc.email}) synced from HRMS and awaits role grant.`.trim(),
        link: '/crm/settings/users?tab=hrms-pending',
        metadata: { hrmsEmployeeId, email },
      });
    }

    return doc;
  }

  async markIneligible(employee: Partial<HrmsEmployeePayload> & { reason?: string }) {
    const hrmsEmployeeId = String(employee?.hrmsEmployeeId || '').trim();
    const email = String(employee?.email || '')
      .trim()
      .toLowerCase();
    const query = hrmsEmployeeId
      ? { hrmsEmployeeId }
      : email
        ? { email }
        : null;
    if (!query) return;

    const doc = await this.crmUserModel
      .findOneAndUpdate(
        query,
        {
          $set: {
            provisioningStatus: 'revoked',
            isActive: false,
            hrmsSyncStatus: 'synced',
            hrmsSyncedAt: new Date(),
            employmentStatus: employee.employmentStatus || undefined,
          },
        },
        { new: true },
      )
      .exec();

    if (!doc) return;

    await this.platformUserModel
      .updateOne(
        { email: doc.email },
        {
          $pull: { permittedTools: { $in: ['CRM', 'crm'] } },
          $inc: { accessVersion: 1 },
        },
      )
      .exec()
      .catch(() => undefined);

    await this.notifyAdmins({
      event: 'hrms_user_revoked',
      title: 'CRM eligibility revoked (HRMS)',
      message: `${doc.firstName} ${doc.lastName || ''} is no longer CRM-eligible${employee.reason ? `: ${employee.reason}` : ''}.`.trim(),
      link: '/crm/settings/users?tab=hrms-pending',
      metadata: { hrmsEmployeeId: doc.hrmsEmployeeId, email: doc.email },
      alsoEmail: doc.email,
    });
  }

  async applyAttendance(payload: HrmsAttendancePayload) {
    const hrmsEmployeeId = String(payload?.hrmsEmployeeId || '').trim();
    const email = String(payload?.email || '')
      .trim()
      .toLowerCase();
    const date = String(payload?.date || '').slice(0, 10);
    const status = String(payload?.status || '').trim();
    if (!date || (!hrmsEmployeeId && !email)) return;

    const query = hrmsEmployeeId ? { hrmsEmployeeId } : { email };
    const doc = await this.crmUserModel.findOne(query).exec();
    if (!doc) return;
    // Only affect users who exist in CRM from HRMS (pending or active)
    if (
      doc.provisioningStatus !== 'active' &&
      doc.provisioningStatus !== 'pending_access'
    ) {
      return;
    }

    const today = this.todayYmd();
    const unavailable =
      date === today && UNAVAILABLE_ATTENDANCE_STATUSES.has(status);

    if (unavailable) {
      const becameUnavailable =
        doc.availabilityStatus !== 'unavailable_today' ||
        doc.availabilityDate !== date;
      doc.availabilityStatus = 'unavailable_today';
      doc.availabilityDate = date;
      doc.availabilitySource = payload.source || 'hrms';
      doc.availabilityAttendanceStatus = status;
      await doc.save();
      if (becameUnavailable) {
        await this.onBecameUnavailable(doc);
      }
    } else if (date === today) {
      doc.availabilityStatus = 'available';
      doc.availabilityDate = date;
      doc.availabilitySource = payload.source || 'hrms';
      doc.availabilityAttendanceStatus = status;
      await doc.save();
    } else if (
      doc.availabilityDate === date &&
      doc.availabilityStatus === 'unavailable_today'
    ) {
      // Historical correction for the flagged day
      doc.availabilityStatus = 'available';
      doc.availabilityAttendanceStatus = status;
      await doc.save();
    }
  }

  async applyEmploymentStatus(payload: HrmsEmploymentStatusPayload) {
    const status = String(payload?.status || '').trim();
    const inactive = ['Inactive', 'Suspended', 'Terminated', 'Resigned'].includes(
      status,
    );
    if (inactive) {
      await this.markIneligible({
        hrmsEmployeeId: payload.hrmsEmployeeId,
        email: payload.email,
        employmentStatus: status,
        reason: payload.reason || status,
      });
      return;
    }
    // Active again — leave as pending_access for Admin re-confirm if previously revoked
    const hrmsEmployeeId = String(payload.hrmsEmployeeId || '').trim();
    if (!hrmsEmployeeId) return;
    const doc = await this.crmUserModel.findOne({ hrmsEmployeeId }).exec();
    if (!doc) return;
    doc.employmentStatus = status;
    if (doc.provisioningStatus === 'revoked') {
      doc.provisioningStatus = 'pending_access';
      doc.isActive = false;
    }
    await doc.save();
  }

  async grantAccess(
    crmUserId: string,
    opts: { roleId: string; reportsToUserId?: string; activate?: boolean },
  ): Promise<CRMUserDocument> {
    if (!Types.ObjectId.isValid(crmUserId)) {
      throw new Error('Invalid CRM user id');
    }
    if (!opts?.roleId || !Types.ObjectId.isValid(opts.roleId)) {
      throw new Error('A valid roleId is required');
    }
    const doc = await this.crmUserModel.findById(crmUserId).exec();
    if (!doc) throw new Error('CRM user not found');

    doc.roleId = new Types.ObjectId(opts.roleId);
    doc.role = 'user';
    doc.provisioningStatus = 'active';
    doc.isActive = opts.activate !== false;
    await doc.save();

    await this.upsertPlatformUser(
      doc,
      {
        hrmsEmployeeId: doc.hrmsEmployeeId || '',
        email: doc.email,
        firstName: doc.firstName,
        lastName: doc.lastName,
      },
      true,
      opts.reportsToUserId,
    );

    return doc;
  }

  async listPendingHrmsUsers() {
    return this.crmUserModel
      .find({
        provisioningStatus: { $in: ['pending_access', 'revoked'] },
        hrmsEmployeeId: { $exists: true, $ne: '' },
      })
      .populate('roleId')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async listUnavailableToday() {
    const today = this.todayYmd();
    return this.crmUserModel
      .find({
        availabilityStatus: 'unavailable_today',
        availabilityDate: today,
        provisioningStatus: { $in: ['active', 'pending_access'] },
      })
      .populate('roleId')
      .exec();
  }

  /** Clear yesterday's unavailable flags for users with no fresh attendance today. */
  async revertStaleAvailability() {
    const today = this.todayYmd();
    const result = await this.crmUserModel
      .updateMany(
        {
          availabilityStatus: 'unavailable_today',
          availabilityDate: { $ne: today },
        },
        {
          $set: {
            availabilityStatus: 'available',
            availabilityDate: today,
            availabilitySource: 'day_rollover',
          },
        },
      )
      .exec();
    return result.modifiedCount || 0;
  }

  /**
   * Active, CRM-eligible, available assignees for pickers.
   */
  async listAssignableCrmUsers() {
    const today = this.todayYmd();
    return this.crmUserModel
      .find({
        isActive: true,
        provisioningStatus: { $in: ['active', 'manual'] },
        $or: [
          { availabilityStatus: { $ne: 'unavailable_today' } },
          { availabilityDate: { $ne: today } },
          { availabilityStatus: { $exists: false } },
        ],
      })
      .populate('roleId')
      .exec();
  }

  private async onBecameUnavailable(doc: CRMUserDocument) {
    const name = `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || doc.email;
    await this.notifyAdmins({
      event: 'hrms_user_unavailable',
      title: 'Unavailable Today',
      message: `${name} is ${doc.availabilityAttendanceStatus || 'unavailable'} today (HRMS). Today's follow-ups and open tasks need coverage.`,
      link: '/crm/settings/users?tab=hrms-unavailable',
      metadata: {
        hrmsEmployeeId: doc.hrmsEmployeeId,
        email: doc.email,
        status: doc.availabilityAttendanceStatus,
      },
      alsoEmail: doc.email,
    });

    await this.reassignTodaysWorkload(doc);
  }

  /**
   * Soft-assisted reassignment: move today's due Task/Call activities to an available teammate
   * when one can be resolved (reportsTo / any available active user). Flag leads with
   * nextFollowUpAt today in metadata via notification (ownership kept unless cover found).
   */
  async reassignTodaysWorkload(unavailable: CRMUserDocument) {
    const today = this.todayYmd();
    const cover = await this.findCoverAssignee(unavailable);
    if (!cover) {
      this.logger.warn(
        `No cover assignee for unavailable user ${unavailable.email}; notifying only`,
      );
      return { reassignedActivities: 0, coveredBy: null };
    }

    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(`${today}T23:59:59.999Z`);

    const activities = await this.activityModel
      .find({
        assignee: unavailable._id,
        type: { $in: ['Task', 'Call', 'Meeting', 'Event'] },
        isDeleted: { $ne: true },
        $or: [
          { 'metadata.dueAt': { $gte: dayStart, $lte: dayEnd } },
          { 'metadata.scheduledAt': { $gte: dayStart, $lte: dayEnd } },
          { 'metadata.eventTime': { $gte: dayStart, $lte: dayEnd } },
        ],
      })
      .exec();

    let reassigned = 0;
    for (const act of activities) {
      const prev = act.assignee;
      act.assignee = cover._id as any;
      act.metadata = {
        ...(act.metadata || {}),
        hrmsAutoReassignedFrom: String(prev),
        hrmsAutoReassignedAt: new Date().toISOString(),
        hrmsAutoReassignReason: 'unavailable_today',
      };
      await act.save();
      reassigned += 1;
    }

    // Leads with follow-up today: notify cover (do not silently steal ownership)
    const followUps = await this.leadModel
      .find({
        createdBy: unavailable._id,
        nextFollowUpAt: { $gte: dayStart, $lte: dayEnd },
        isDeleted: { $ne: true },
      })
      .select('_id name nextFollowUpAt')
      .limit(50)
      .lean()
      .exec();

    if (reassigned > 0 || followUps.length > 0) {
      await this.crmNotify.notify({
        event: 'hrms_workload_reassigned',
        title: 'Coverage for unavailable teammate',
        message: `${unavailable.firstName} is unavailable. ${reassigned} task(s)/call(s) reassigned to you; ${followUps.length} lead follow-up(s) due today still owned by them.`,
        recipient: { email: cover.email },
        alsoNotify: [{ email: unavailable.email }],
        link: '/crm/workspace',
        metadata: {
          fromUserId: String(unavailable._id),
          toUserId: String(cover._id),
          reassignedActivities: reassigned,
          followUpLeadIds: followUps.map((l: any) => String(l._id)),
        },
        type: 'hrms_workload_reassigned',
      });
    }

    return { reassignedActivities: reassigned, coveredBy: cover.email };
  }

  private async findCoverAssignee(
    unavailable: CRMUserDocument,
  ): Promise<CRMUserDocument | null> {
    const today = this.todayYmd();
    const availableFilter: Record<string, unknown> = {
      _id: { $ne: unavailable._id },
      isActive: true,
      provisioningStatus: { $in: ['active', 'manual'] as const },
      $or: [
        { availabilityStatus: { $ne: 'unavailable_today' } },
        { availabilityDate: { $ne: today } },
      ],
    };

    // Prefer someone who reports to the same manager via platform User.reportsTo
    const platform = await this.platformUserModel
      .findOne({ email: unavailable.email })
      .select('reportsTo')
      .lean()
      .exec();
    if (platform?.reportsTo) {
      const manager = await this.platformUserModel
        .findById(platform.reportsTo)
        .select('email')
        .lean()
        .exec();
      if (manager?.email) {
        const mgrCrm = await this.crmUserModel
          .findOne({ email: manager.email, ...availableFilter } as any)
          .exec();
        if (mgrCrm) return mgrCrm;
      }
      const peers = await this.platformUserModel
        .find({
          reportsTo: platform.reportsTo,
          email: { $ne: unavailable.email },
        })
        .select('email')
        .lean()
        .exec();
      const peerEmails = peers.map((p) => p.email).filter(Boolean);
      if (peerEmails.length) {
        const peerCrm = await this.crmUserModel
          .findOne({ email: { $in: peerEmails }, ...availableFilter } as any)
          .exec();
        if (peerCrm) return peerCrm;
      }
    }

    return this.crmUserModel.findOne(availableFilter as any).exec();
  }

  private async upsertPlatformUser(
    crmUser: CRMUserDocument,
    employee: Partial<HrmsEmployeePayload>,
    active: boolean,
    reportsToUserId?: string,
  ) {
    const email = crmUser.email;
    const existing = await this.platformUserModel.findOne({ email }).exec();
    const patch: Record<string, unknown> = {
      email,
      firstName: crmUser.firstName,
      lastName: crmUser.lastName || '',
    };
    if (reportsToUserId && Types.ObjectId.isValid(reportsToUserId)) {
      patch.reportsTo = new Types.ObjectId(reportsToUserId);
    }
    if (!existing) {
      const passwordHash = await bcrypt.hash(
        process.env.HRMS_SYNC_PLACEHOLDER_PASSWORD || 'ChangeMe@HrmsSync1!',
        10,
      );
      await this.platformUserModel.create({
        ...patch,
        password: passwordHash,
        role: 'Employee',
        permittedTools: active ? ['CRM'] : [],
        permissions: [],
      });
    } else {
      const tools = new Set(
        (existing.permittedTools || []).map((t: string) => String(t).toUpperCase()),
      );
      if (active) tools.add('CRM');
      else tools.delete('CRM');
      patch.permittedTools = Array.from(tools);
      if (!active) {
        patch.accessVersion = (existing.accessVersion || 0) + 1;
      }
      await this.platformUserModel.updateOne({ _id: existing._id }, { $set: patch }).exec();
    }
  }

  private async notifyAdmins(opts: {
    event: any;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
    alsoEmail?: string;
  }) {
    const admins = await this.crmUserModel
      .find({
        isActive: true,
        $or: [
          { role: { $regex: /admin/i } },
          { permissions: 'settings:admin' },
        ],
      })
      .select('email')
      .limit(20)
      .lean()
      .exec();

    const recipients = admins.map((a) => a.email).filter(Boolean) as string[];
    if (recipients.length === 0) {
      // Fall back to platform super-ish users
      const platformAdmins = await this.platformUserModel
        .find({
          $or: [
            { role: { $regex: /admin|ceo/i } },
            { permittedTools: 'CRM' },
          ],
        })
        .select('email')
        .limit(10)
        .lean()
        .exec();
      recipients.push(...platformAdmins.map((u) => u.email).filter(Boolean));
    }

    const primary = recipients[0];
    if (!primary) return;

    await this.crmNotify.notify({
      event: opts.event,
      title: opts.title,
      message: opts.message,
      recipient: { email: primary },
      alsoNotify: [
        ...recipients.slice(1).map((email) => ({ email })),
        ...(opts.alsoEmail ? [{ email: opts.alsoEmail }] : []),
      ],
      link: opts.link,
      metadata: opts.metadata,
      type: opts.event,
    });
  }

  private todayYmd(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
