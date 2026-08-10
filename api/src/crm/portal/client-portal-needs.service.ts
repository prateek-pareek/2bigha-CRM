import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { MailService } from '../../mail/mail.service';
import {
  PortalClientNeed,
  PortalClientNeedDocument,
} from '../schemas/portal-client-need.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

@Injectable()
export class ClientPortalNeedsService {
  constructor(
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(PortalClientNeed.name, 'crmConnection')
    private needModel: Model<PortalClientNeedDocument>,
    private readonly mailService: MailService,
  ) {}

  private async resolveDealId(idOrRecordId: string): Promise<string | null> {
    if (Types.ObjectId.isValid(idOrRecordId)) {
      const byId = await this.dealModel.findById(idOrRecordId).select('_id').exec();
      if (byId) return String(byId._id);
    }
    const byRecord = await this.dealModel
      .findOne({ recordId: idOrRecordId })
      .select('_id')
      .exec();
    return byRecord ? String(byRecord._id) : null;
  }

  async findByDealId(dealId: string) {
    const id = await this.resolveDealId(dealId);
    if (!id) throw new NotFoundException('Deal not found');
    return this.needModel
      .find({ deal: new Types.ObjectId(id) })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async create(
    dealId: string,
    body: {
      category: string;
      title: string;
      description?: string;
      dueDate?: string;
      status?: string;
      sortOrder?: number;
    },
  ) {
    const id = await this.resolveDealId(dealId);
    if (!id) throw new NotFoundException('Deal not found');
    const doc = new this.needModel({
      deal: new Types.ObjectId(id),
      category: body.category,
      title: body.title,
      description: body.description,
      status: body.status || 'open',
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      sortOrder: body.sortOrder ?? 0,
    });
    
    const saved = await doc.save();

    // Send email to client if contact Person email exists
    try {
      const deal = await this.dealModel
        .findById(id)
        .populate('contactPerson', 'email firstName lastName')
        .exec();
      if (deal) {
        const cp = (deal as any).contactPerson;
        if (cp && cp.email && deal.portalToken) {
          const clientEmail = String(cp.email).trim();
          const clientName = `${cp.firstName || ''} ${cp.lastName || ''}`.trim() || 'Client';
          const dealTitle = deal.title || 'your project';
          let baseDomain = String(deal.portalDomain || '').trim() || 'https://mathionix.com';
          if (baseDomain.replace(/\/+$/, '') === 'https://mathionix.tech') {
            baseDomain = 'https://mathionix.com';
          }
          const portalUrl = `${baseDomain.replace(/\/+$/, '')}/portal/${deal.portalToken}`;
          
          let formattedDueDate = '';
          if (body.dueDate) {
            formattedDueDate = new Date(body.dueDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          }

          const html = `
            <div style="background: #ffffff; color: #1e293b; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 28px; font-weight: bold; color: #007a94; letter-spacing: -0.5px;">Mathionix</span>
                </div>
                <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin-top: 0; text-align: center;">Action Required: New Document Request</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6;">Hello ${clientName},</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.6;">A new request has been opened for your project <strong>${dealTitle}</strong>. Please provide the requested item below to proceed with the next steps:</p>
                
                <div style="background: #fafbfc; border-left: 4px solid #007a94; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b;">${body.category}</p>
                    <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #0f172a;">${body.title}</p>
                    ${body.description ? `<p style="margin: 0 0 8px 0; font-size: 13px; color: #475569;">${body.description}</p>` : ''}
                    ${formattedDueDate ? `<p style="margin: 0; font-size: 12px; color: #ef4444; font-weight: 600;">Due Date: ${formattedDueDate}</p>` : ''}
                </div>

                <div style="text-align: center; margin: 30px 0 10px 0;">
                    <a href="${portalUrl}" style="background-color: #007a94; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 122, 148, 0.2);">Upload Document / Access Portal</a>
                </div>
            </div>
          `;

          await this.mailService.sendMail({
            to: clientEmail,
            subject: `[Mathionix Technologies] Action Required: New Document Request - ${body.title}`,
            html,
          });
          console.log(`Successfully sent document request email to: ${clientEmail}`);
        }
      }
    } catch (err) {
      console.error('Failed to send document request email:', err);
    }

    return saved;
  }

  async update(
    needId: string,
    body: Partial<{
      category: string;
      title: string;
      description: string;
      dueDate: string | null;
      status: string;
      sortOrder: number;
      satisfiedDocUrl: string | null;
      satisfiedAt: Date | string | null;
    }>,
  ) {
    const existing = await this.needModel.findById(needId).exec();
    if (!existing) throw new NotFoundException('Item not found');
    if (body.category !== undefined) existing.category = body.category;
    if (body.title !== undefined) existing.title = body.title;
    if (body.description !== undefined) existing.description = body.description;
    if (body.status !== undefined) existing.status = body.status;
    if (body.sortOrder !== undefined) existing.sortOrder = body.sortOrder;
    if (body.dueDate !== undefined) {
      existing.dueDate =
        body.dueDate === null || body.dueDate === ''
          ? undefined
          : new Date(body.dueDate);
    }
    if (body.satisfiedDocUrl !== undefined) {
      existing.satisfiedDocUrl = body.satisfiedDocUrl === null ? undefined : body.satisfiedDocUrl;
    }
    if (body.satisfiedAt !== undefined) {
      existing.satisfiedAt = body.satisfiedAt === null ? undefined : new Date(body.satisfiedAt);
    }
    return existing.save();
  }

  async findByNeedId(needId: string) {
    const existing = await this.needModel.findById(needId).select('deal').lean().exec();
    if (!existing) throw new NotFoundException('Item not found');
    return existing;
  }

  async remove(needId: string) {
    const r = await this.needModel.findByIdAndUpdate(needId, softDeleteUpdate(), { new: true }).exec();
    if (!r) throw new NotFoundException('Item not found');
    return { success: true };
  }

  /** Used by public portal API — no auth. */
  async findByDealObjectId(dealObjectId: Types.ObjectId) {
    return this.needModel
      .find({ deal: dealObjectId })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  }
}
