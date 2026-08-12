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
}
