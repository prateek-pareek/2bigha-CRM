import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { CRMUsersService } from '../crm-users/crm-users.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { CRMService } from '../core/crm.service';
import { PmAssignRole } from '../property-listings/twobigha-pm-assignment.service';
import { PmActivityLogService } from '../subscriptions/pm-activity-log.service';

export type PmPipelineTaskRole =
  | PmAssignRole
  | 'visit'
  | 'report_review'
  | 'rm_oversee';

const ROLE_TITLES: Record<PmPipelineTaskRole, string> = {
  manager: 'Own PM case',
  legal: 'Complete legal verification',
  field: 'Prepare for field visit',
  visit: 'Conduct field visit',
  report_review: 'Review visit report',
  rm_oversee: 'Oversee PM pipeline',
};

const ROLE_CHECKLISTS: Partial<Record<PmPipelineTaskRole, string[]>> = {
  manager: [
    'Review property details & maps link',
    'Assign Legal Manager',
    'Assign Field Agent after legal clears',
    'Review visit report when submitted',
  ],
  legal: [
    'Start legal verification',
    'Complete checklist items',
    'Record summary note',
    'Mark verification complete',
  ],
  field: [
    'Confirm visit schedule',
    'Arrive on site & check in',
    'Complete visit checklist',
    'Submit visit report',
  ],
  visit: [
    'Travel to property',
    'Geo check-in near maps pin',
    'Capture visit findings',
    'Submit report for RM review',
  ],
  report_review: [
    'Review each report section',
    'Approve or request changes',
    'Notify field agent of outcome',
  ],
};

@Injectable()
export class PmTaskBridgeService {
  private readonly logger = new Logger(PmTaskBridgeService.name);

  constructor(
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    private readonly crmUsers: CRMUsersService,
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
    private readonly pmActivityLog: PmActivityLogService,
  ) {}

  private eventKey(listingId: string, role: PmPipelineTaskRole) {
    return `pm:${listingId}:${role}`;
  }

  private checklistFor(role: PmPipelineTaskRole) {
    return (ROLE_CHECKLISTS[role] || []).map((title, i) => ({
      id: `${role}-${i + 1}`,
      title,
      done: false,
    }));
  }

  private normalizeStatus(status?: string): string {
    const s = String(status || '').trim();
    if (!s || ['Backlog', 'To Do', 'Pending', 'Open'].includes(s)) return 'Open';
    if (['Completed', 'Done'].includes(s)) return 'Done';
    if (s === 'In Progress') return 'In Progress';
    return s;
  }

  async resolveAssigneeUserId(opts: {
    source?: 'twobigha' | 'crm';
    id?: string;
    twobighaAdminId?: string;
    email?: string;
  }): Promise<string | undefined> {
    const tryHrmsById = async (id?: string) => {
      if (!id || !Types.ObjectId.isValid(id)) return undefined;
      const row = await this.hrmsUserModel.findById(id).select('_id').lean().exec();
      return row ? String(row._id) : undefined;
    };
    const tryHrmsByEmail = async (email?: string) => {
      const e = String(email || '').trim().toLowerCase();
      if (!e) return undefined;
      const row = await this.hrmsUserModel
        .findOne({ email: new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
        .select('_id')
        .lean()
        .exec();
      return row ? String(row._id) : undefined;
    };

    if (opts.source === 'crm' && opts.id) {
      const asHrms = await tryHrmsById(opts.id);
      if (asHrms) return asHrms;
      const crmUser = await this.crmUsers.findById(opts.id);
      const byEmail = await tryHrmsByEmail(crmUser?.email || opts.email);
      if (byEmail) return byEmail;
      return opts.id;
    }

    const adminId = opts.twobighaAdminId || (opts.source === 'twobigha' ? opts.id : undefined);
    if (adminId) {
      const linked = await this.crmUsers.findByTwobighaAdminId(adminId);
      if (linked) {
        const byEmail = await tryHrmsByEmail(linked.email);
        if (byEmail) return byEmail;
        const asHrms = await tryHrmsById(String(linked._id));
        if (asHrms) return asHrms;
        return String(linked._id);
      }
    }
    return tryHrmsByEmail(opts.email);
  }

  async upsertPipelineTask(input: {
    listingId: string;
    listingTitle?: string;
    leadId?: string;
    role: PmPipelineTaskRole;
    assigneeSource?: 'twobigha' | 'crm';
    assigneeId?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    twobighaAdminId?: string;
    authorId?: string;
    dueDate?: string;
    status?: string;
    priority?: 'Low' | 'Medium' | 'High';
    isReassign?: boolean;
    extraContent?: string;
  }): Promise<Activity | null> {
    try {
      const listingOid =
        input.listingId && Types.ObjectId.isValid(input.listingId)
          ? new Types.ObjectId(input.listingId)
          : undefined;
      const leadOid =
        input.leadId && Types.ObjectId.isValid(input.leadId)
          ? new Types.ObjectId(input.leadId)
          : undefined;
      const key = this.eventKey(input.listingId, input.role);
      const title = `${ROLE_TITLES[input.role]} — ${input.listingTitle || 'PM property'}`;
      const assigneeUserId = await this.resolveAssigneeUserId({
        source: input.assigneeSource,
        id: input.assigneeId,
        twobighaAdminId: input.twobighaAdminId || (input.assigneeSource === 'twobigha' ? input.assigneeId : undefined),
        email: input.assigneeEmail,
      });

      const existing = await this.activityModel
        .findOne({
          type: 'Task',
          isDeleted: { $ne: true },
          'metadata.pmEventKey': key,
        })
        .exec();

      const involved: { id: Types.ObjectId; type: string }[] = [];
      if (leadOid) involved.push({ id: leadOid, type: 'Lead' });
      if (listingOid) involved.push({ id: listingOid, type: 'PropertyListing' });

      const baseMeta = {
        pmPipeline: true,
        pmEvent: true,
        pmEventKey: key,
        pmRole: input.role,
        propertyListingId: input.listingId,
        relatedPropertyId: input.listingId,
        relatedPropertyTitle: input.listingTitle,
        leadId: input.leadId,
        pmAssigneeName: input.assigneeName,
        priority: input.priority || 'High',
        checklist: this.checklistFor(input.role),
        ...(input.dueDate
          ? {
              dueDate: new Date(input.dueDate).toISOString(),
              isCalendarEvent: true,
              eventCategory: 'pm_visit',
            }
          : {}),
      };

      if (existing) {
        const prevAssignee = existing.assignee ? String(existing.assignee) : '';
        const nextAssignee = assigneeUserId || null;
        const meta = {
          ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
          ...baseMeta,
          checklist:
            Array.isArray(existing.metadata?.checklist) && existing.metadata.checklist.length
              ? existing.metadata.checklist
              : baseMeta.checklist,
        };
        const updated = await this.crmService.updateActivity(
          String(existing._id),
          {
            title,
            content:
              input.extraContent ||
              existing.content ||
              `Property Management pipeline task (${input.role}).`,
            status: this.normalizeStatus(input.status || existing.status || 'Open'),
            assignee: nextAssignee,
            relatedTo: leadOid || listingOid || existing.relatedTo,
            relatedType: leadOid ? 'Lead' : listingOid ? 'PropertyListing' : existing.relatedType,
            involvedEntities: involved.length ? involved : existing.involvedEntities,
            metadata: meta,
          },
          undefined,
          { skipReassignNotify: false, forceNotifyReassign: input.isReassign || prevAssignee !== String(nextAssignee || '') },
        );
        return updated;
      }

      return await this.crmService.createActivity(
        {
          type: 'Task',
          title,
          content:
            input.extraContent ||
            `Auto-created from Property Management pipeline (${ROLE_TITLES[input.role]}).`,
          status: this.normalizeStatus(input.status || 'Open'),
          author: input.authorId,
          assignee: assigneeUserId,
          relatedTo: leadOid || listingOid,
          relatedType: leadOid ? 'Lead' : listingOid ? 'PropertyListing' : undefined,
          involvedEntities: involved,
          metadata: {
            ...baseMeta,
            activityLog: [
              {
                id: new Types.ObjectId().toString(),
                at: new Date().toISOString(),
                action: 'created',
                detail: `PM pipeline task created for ${input.role}`,
              },
            ],
            comments: [],
          },
        },
        input.authorId ? { userId: input.authorId, _id: input.authorId } : undefined,
      );
    } catch (err: any) {
      this.logger.warn(`upsertPipelineTask failed: ${err?.message || err}`);
      return null;
    }
  }

  async completePipelineTask(listingId: string, role: PmPipelineTaskRole, authorId?: string) {
    const key = this.eventKey(listingId, role);
    const existing = await this.activityModel
      .findOne({ type: 'Task', isDeleted: { $ne: true }, 'metadata.pmEventKey': key })
      .exec();
    if (!existing) return null;
    return this.crmService.updateActivity(
      String(existing._id),
      { status: 'Done' },
      authorId ? { userId: authorId, _id: authorId } : undefined,
    );
  }

  async onStaffAssigned(input: {
    listing: Record<string, any>;
    role: PmAssignRole;
    source: 'twobigha' | 'crm';
    pickId: string;
    pickName?: string;
    authorId?: string;
    wasReassign: boolean;
  }) {
    const listingId = String(input.listing._id || input.listing.id || '');
    const leadId = input.listing.leadId ? String(input.listing.leadId) : undefined;
    const title = input.listing.title || 'PM property';

    await this.pmActivityLog.log({
      leadId,
      propertyListingId: listingId,
      authorId: input.authorId,
      eventType: input.wasReassign ? 'pm_staff_reassigned' : 'pm_staff_assigned',
      title: input.wasReassign
        ? `Reassigned ${input.role}`
        : `Assigned ${input.role}`,
      content: `${input.pickName || input.pickId} → ${input.role}`,
      metadata: { role: input.role, source: input.source, pickId: input.pickId },
    });

    await this.upsertPipelineTask({
      listingId,
      listingTitle: title,
      leadId,
      role: input.role,
      assigneeSource: input.source,
      assigneeId: input.pickId,
      assigneeName: input.pickName,
      twobighaAdminId: input.source === 'twobigha' ? input.pickId : undefined,
      authorId: input.authorId,
      isReassign: input.wasReassign,
      priority: 'High',
      status: 'Open',
    });

    // Process-flow: same RM owns the case end-to-end — keep an RM oversee task open.
    if (input.role === 'manager') {
      await this.upsertPipelineTask({
        listingId,
        listingTitle: title,
        leadId,
        role: 'rm_oversee',
        assigneeSource: input.source,
        assigneeId: input.pickId,
        assigneeName: input.pickName,
        twobighaAdminId: input.source === 'twobigha' ? input.pickId : undefined,
        authorId: input.authorId,
        isReassign: input.wasReassign,
        priority: 'Medium',
        status: 'In Progress',
        extraContent: 'Regional Manager owns this PM case through legal, visit, and report approval.',
      });
    }
  }

  async onStaffUnassigned(listing: Record<string, any>, role: PmAssignRole, authorId?: string) {
    const listingId = String(listing._id || listing.id || '');
    await this.completePipelineTask(listingId, role, authorId);
    await this.pmActivityLog.log({
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      propertyListingId: listingId,
      authorId,
      eventType: 'pm_staff_unassigned',
      title: `Unassigned ${role}`,
      content: `Cleared ${role} assignment on PM property.`,
      metadata: { role },
    });
  }

  async onVisitScheduled(input: {
    listing: Record<string, any>;
    scheduledAt: string;
    agentId: string;
    authorId?: string;
    notes?: string;
  }) {
    const listingId = String(input.listing._id || input.listing.id || '');
    const leadId = input.listing.leadId ? String(input.listing.leadId) : undefined;
    await this.pmActivityLog.log({
      leadId,
      propertyListingId: listingId,
      authorId: input.authorId,
      eventType: 'pm_visit_scheduled',
      title: 'Field visit scheduled',
      content: `Visit scheduled for ${input.scheduledAt}`,
      metadata: { scheduledAt: input.scheduledAt, agentId: input.agentId, notes: input.notes },
    });

    await this.upsertPipelineTask({
      listingId,
      listingTitle: input.listing.title,
      leadId,
      role: 'visit',
      assigneeSource: 'twobigha',
      assigneeId: input.agentId,
      twobighaAdminId: input.agentId,
      assigneeName: input.listing.fieldAssigneeName,
      authorId: input.authorId,
      dueDate: input.scheduledAt,
      status: 'Open',
      priority: 'High',
      extraContent: input.notes || 'Field visit scheduled from PM pipeline.',
    });

    // Also stamp due date on the field assignment task
    await this.upsertPipelineTask({
      listingId,
      listingTitle: input.listing.title,
      leadId,
      role: 'field',
      assigneeSource: 'twobigha',
      assigneeId: input.agentId,
      twobighaAdminId: input.agentId,
      assigneeName: input.listing.fieldAssigneeName,
      authorId: input.authorId,
      dueDate: input.scheduledAt,
      status: 'In Progress',
    });
  }

  async onLegalStarted(listing: Record<string, any>, authorId?: string) {
    const listingId = String(listing._id || listing.id || '');
    await this.upsertPipelineTask({
      listingId,
      listingTitle: listing.title,
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      role: 'legal',
      assigneeName: listing.legalAssigneeName,
      twobighaAdminId: listing.legalAssigneeId,
      assigneeSource: 'twobigha',
      assigneeId: listing.legalAssigneeId,
      authorId,
      status: 'In Progress',
    });
    await this.pmActivityLog.log({
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      propertyListingId: listingId,
      authorId,
      eventType: 'pm_legal_started',
      title: 'Legal verification started',
      content: 'Legal check started on this PM property.',
    });
  }

  async onLegalCompleted(listing: Record<string, any>, authorId?: string) {
    const listingId = String(listing._id || listing.id || '');
    await this.completePipelineTask(listingId, 'legal', authorId);
    await this.pmActivityLog.log({
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      propertyListingId: listingId,
      authorId,
      eventType: 'pm_legal_completed',
      title: 'Legal verification completed',
      content: 'Legal check completed.',
    });
  }

  async onVisitReportSubmitted(listing: Record<string, any>, authorId?: string) {
    const listingId = String(listing._id || listing.id || '');
    await this.completePipelineTask(listingId, 'visit', authorId);
    await this.completePipelineTask(listingId, 'field', authorId);
    await this.upsertPipelineTask({
      listingId,
      listingTitle: listing.title,
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      role: 'report_review',
      assigneeSource: 'twobigha',
      assigneeId: listing.rmAssigneeId,
      twobighaAdminId: listing.rmAssigneeId,
      assigneeName: listing.rmAssigneeName,
      authorId,
      status: 'Open',
      priority: 'High',
      extraContent: 'Visit report is pending RM review (section verdicts / approve / changes requested).',
    });
    await this.pmActivityLog.log({
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      propertyListingId: listingId,
      authorId,
      eventType: 'pm_visit_report_submitted',
      title: 'Visit report submitted',
      content: 'Awaiting Regional Manager review.',
    });
  }

  async onVisitReportReviewed(
    listing: Record<string, any>,
    decision: 'Approved' | 'Rejected' | 'Changes Requested',
    authorId?: string,
  ) {
    const listingId = String(listing._id || listing.id || '');
    if (decision === 'Approved') {
      await this.completePipelineTask(listingId, 'report_review', authorId);
      await this.completePipelineTask(listingId, 'rm_oversee', authorId);
      await this.completePipelineTask(listingId, 'manager', authorId);
    } else if (decision === 'Rejected') {
      await this.upsertPipelineTask({
        listingId,
        listingTitle: listing.title,
        leadId: listing.leadId ? String(listing.leadId) : undefined,
        role: 'report_review',
        assigneeSource: 'twobigha',
        assigneeId: listing.rmAssigneeId,
        twobighaAdminId: listing.rmAssigneeId,
        assigneeName: listing.rmAssigneeName,
        authorId,
        status: 'Done',
        extraContent: 'Report rejected — reschedule field visit.',
      });
    } else {
      await this.upsertPipelineTask({
        listingId,
        listingTitle: listing.title,
        leadId: listing.leadId ? String(listing.leadId) : undefined,
        role: 'visit',
        assigneeSource: 'twobigha',
        assigneeId: listing.fieldAssigneeId,
        twobighaAdminId: listing.fieldAssigneeId,
        assigneeName: listing.fieldAssigneeName,
        authorId,
        status: 'Open',
        priority: 'High',
        extraContent: 'Changes requested on visit report — field agent to fix and resubmit.',
      });
    }
    await this.pmActivityLog.log({
      leadId: listing.leadId ? String(listing.leadId) : undefined,
      propertyListingId: listingId,
      authorId,
      eventType: 'pm_visit_report_reviewed',
      title: `Visit report ${decision}`,
      content: `RM decision: ${decision}`,
      metadata: { decision },
    });
  }
}
