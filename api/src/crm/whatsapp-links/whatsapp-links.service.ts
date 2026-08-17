import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhatsAppLeadLink,
  WhatsAppLeadLinkDocument,
} from './schemas/whatsapp-lead-link.schema';
import { Lead } from '../records/schemas/lead.schema';

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
  } | null> {
    const link = await this.linkModel
      .findOne({ waId: normalizeWaId(waId) })
      .populate('leadId', 'firstName lastName')
      .lean()
      .exec();
    if (!link) return null;
    const lead = link.leadId as any;
    return {
      waId: link.waId,
      leadId: String(lead?._id || lead),
      leadName: lead?.firstName
        ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim()
        : '',
    };
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

  /** Assigns (or reassigns) a WhatsApp conversation to a CRM user, for agent-wise triage. */
  async assign(
    waId: string,
    assigneeId: string,
    actorId?: string,
  ): Promise<WhatsAppLeadLinkDocument> {
    const normalizedWaId = normalizeWaId(waId);
    if (normalizedWaId.length < 10) {
      throw new BadRequestException('A valid phone number is required');
    }
    if (!Types.ObjectId.isValid(assigneeId)) {
      throw new BadRequestException('A valid assignee is required');
    }
    return this.linkModel
      .findOneAndUpdate(
        { waId: normalizedWaId },
        {
          $set: {
            waId: normalizedWaId,
            assignee: new Types.ObjectId(assigneeId),
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
        { $unset: { assignee: 1, assignedBy: 1 } },
      )
      .exec();
    return { success: true };
  }

  /** Every waId currently assigned to a given CRM user — powers the inbox's agent filter. */
  async findByAssignee(assigneeId: string): Promise<{ waId: string }[]> {
    if (!Types.ObjectId.isValid(assigneeId)) return [];
    const links = await this.linkModel
      .find({ assignee: new Types.ObjectId(assigneeId) })
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
