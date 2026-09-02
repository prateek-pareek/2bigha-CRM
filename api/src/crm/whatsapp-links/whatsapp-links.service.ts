import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as mongoose from 'mongoose';
import {
  WhatsAppLeadLink,
  WhatsAppLeadLinkDocument,
} from './schemas/whatsapp-lead-link.schema';
import { Lead } from '../records/schemas/lead.schema';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

function normalizeWaId(waId: string): string {
  return String(waId || '').replace(/\D/g, '');
}

@Injectable()
export class WhatsAppLinksService {
  constructor(
    @InjectModel(WhatsAppLeadLink.name, 'crmConnection')
    private readonly linkModel: Model<WhatsAppLeadLinkDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<any>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private readonly crmUserModel: Model<CRMUserDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** Attaches (or moves) a WhatsApp conversation to a Lead. */
  async link(
    waId: string,
    leadId: string,
    userId?: string,
  ): Promise<WhatsAppLeadLinkDocument> {
    const normalizedWaId = normalizeWaId(waId);
    if (normalizedWaId.length < 10) {
      throw new BadRequestException('A valid phone number is required');
    }
    if (!Types.ObjectId.isValid(leadId)) {
      throw new BadRequestException('A valid leadId is required');
    }
    const lead = await this.leadModel.findById(leadId).select('_id').lean().exec();
    if (!lead) throw new NotFoundException('Lead not found');

    return this.linkModel
      .findOneAndUpdate(
        { waId: normalizedWaId },
        {
          $set: {
            waId: normalizedWaId,
            leadId: new Types.ObjectId(leadId),
            linkedBy: userId ? new Types.ObjectId(userId) : undefined,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async unlink(waId: string): Promise<{ success: boolean }> {
    await this.linkModel.deleteOne({ waId: normalizeWaId(waId) }).exec();
    return { success: true };
  }

  /** Resolves which Lead (if any) a WhatsApp conversation is attached to. */
  async findByWaId(waId: string): Promise<{
    waId: string;
    leadId: string;
    leadName: string;
    assignee?: { _id: string; name: string; email?: string; accessType?: 'read' | 'read_write' };
    temporaryGrants?: any[];
  } | null> {
    const normWa = normalizeWaId(waId);
    const link = await this.linkModel
      .findOne({ waId: normWa })
      .populate('leadId', 'firstName lastName')
      .populate('assignee', 'firstName lastName email')
      .populate('temporaryGrants.userId', 'firstName lastName email')
      .lean()
      .exec();

    if (link) {
      const lead = link.leadId as any;
      const ass = link.assignee as any;
      return {
        waId: link.waId,
        leadId: String(lead?._id || lead),
        leadName: lead?.firstName
          ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
          : '',
        assignee: ass ? {
          _id: String(ass._id),
          name: `${ass.firstName || ''} ${ass.lastName || ''}`.trim() || ass.email,
          email: ass.email,
          accessType: link.assigneeAccessType || 'read_write',
        } : undefined,
        temporaryGrants: await Promise.all(
          (link.temporaryGrants || []).map(async (g: any) => {
            let u = g.userId as any;
            if (!u || typeof u === 'string' || u instanceof Types.ObjectId || !u.email) {
              const uid = u?._id ? String(u._id) : String(u || g.userId);
              if (Types.ObjectId.isValid(uid)) {
                u = await this.crmUserModel.findById(uid).select('firstName lastName email').lean().exec();
                if (!u) {
                  u = await this.userModel.findById(uid).select('firstName lastName email').lean().exec();
                }
              }
            }
            return {
              userId: u?._id ? String(u._id) : String(g.userId),
              userEmail: u?.email || '',
              userName: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : '',
              accessType: g.accessType,
              expiresAt: g.expiresAt,
            };
          }),
        ),
      };
    }

    // Fallback search by phone number directly in Lead collection
    const phoneDigits = normWa.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      const localNumber = phoneDigits.slice(-10);
      const lead = await this.leadModel
        .findOne({
          $or: [
            { mobileNo: new RegExp(localNumber + '$') },
            { phone: new RegExp(localNumber + '$') },
            { mobileNo: phoneDigits },
            { phone: phoneDigits },
          ],
        })
        .select('firstName lastName')
        .lean()
        .exec();

      if (lead) {
        return {
          waId: normWa,
          leadId: String(lead._id),
          leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        };
      }
    }

    return null;
  }

  /** Every WhatsApp conversation attached to a given Lead. */
  async findByLeadId(leadId: string): Promise<{ waId: string }[]> {
    if (!Types.ObjectId.isValid(leadId)) return [];
    const links = await this.linkModel
      .find({ leadId: new Types.ObjectId(leadId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return links.map((l) => ({ waId: l.waId }));
  }

  private async resolveCrmUserId(assigneeId: string): Promise<string> {
    if (!Types.ObjectId.isValid(assigneeId)) return assigneeId;
    // 1. Try finding by CRMUser ID directly
    let dbUser = await this.crmUserModel.findById(assigneeId).lean().exec();
    if (dbUser) {
      return String(dbUser._id);
    }
    // 2. Fallback: Try finding SuiteUser by assigneeId, then resolve CRMUser by email
    const suiteUser = await this.userModel.findById(assigneeId).lean().exec();
    if (suiteUser && (suiteUser as any).email) {
      const crmUser = await this.crmUserModel.findOne({ email: (suiteUser as any).email }).lean().exec();
      if (crmUser) {
        return String(crmUser._id);
      }
    }
    return assigneeId;
  }

  /** Assigns (or reassigns) a WhatsApp conversation to a CRM user, for agent-wise triage. */
  async assign(
    waId: string,
    assigneeId: string,
    actorId?: string,
    accessType?: 'read' | 'read_write',
  ): Promise<WhatsAppLeadLinkDocument> {
    const normalizedWaId = normalizeWaId(waId);
    if (normalizedWaId.length < 10) {
      throw new BadRequestException('A valid phone number is required');
    }
    if (!Types.ObjectId.isValid(assigneeId)) {
      throw new BadRequestException('A valid assignee is required');
    }
    const resolvedId = await this.resolveCrmUserId(assigneeId);
    return this.linkModel
      .findOneAndUpdate(
        { waId: normalizedWaId },
        {
          $set: {
            waId: normalizedWaId,
            assignee: new Types.ObjectId(resolvedId),
            assigneeAccessType: accessType || 'read_write',
            assignedBy: actorId ? new Types.ObjectId(actorId) : undefined,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async unassign(waId: string): Promise<{ success: boolean }> {
    await this.linkModel
      .updateOne(
        { waId: normalizeWaId(waId) },
        { $unset: { assignee: 1, assignedBy: 1, assigneeAccessType: 1 } },
      )
      .exec();
    return { success: true };
  }

  /** Every waId currently assigned to a given CRM user — powers the inbox's agent filter. */
  async findByAssignee(assigneeId: string): Promise<{ waId: string }[]> {
    if (!Types.ObjectId.isValid(assigneeId)) return [];
    const resolvedId = await this.resolveCrmUserId(assigneeId);
    const links = await this.linkModel
      .find({ assignee: new Types.ObjectId(resolvedId) })
      .lean()
      .exec();
    return links.map((l) => ({ waId: l.waId }));
  }

  /**
   * All conversation-level metadata (lead link + assignee) in one shot, so
   * the inbox can build a `waId -> {leadName, assigneeName}` map without a
   * round trip per contact.
   */
  async listAll(): Promise<
    Array<{
      waId: string;
      leadId: string | null;
      leadName: string;
      assigneeId: string | null;
      assigneeName: string;
    }>
  > {
    const links = await this.linkModel
      .find()
      .populate('leadId', 'firstName lastName')
      .populate('assignee', 'firstName lastName email')
      .lean()
      .exec();
    return links.map((l) => {
      const lead = l.leadId as any;
      const assignee = l.assignee as any;
      return {
        waId: l.waId,
        leadId: lead ? String(lead._id || lead) : null,
        leadName: lead?.firstName
          ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
          : '',
        assigneeId: assignee ? String(assignee._id || assignee) : null,
        assigneeName: assignee?.firstName
          ? `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim()
          : assignee?.email || '',
      };
    });
  }
}
