import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  WebsiteLead,
  WebsiteLeadDocument,
} from '../schemas/website-lead.schema';
import {
  WebsiteChatSession,
  WebsiteChatSessionDocument,
} from '../schemas/website-chat-session.schema';
import { SubmitWebsiteContactDto } from './dto/submit-website-contact.dto';
import { SubmitWebsiteChatDto } from './dto/submit-website-chat.dto';
import { CRMService } from '../core/crm.service';
import { SalesAgentTriggerService } from '../sales-agent/sales-agent-cron.service';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

function normalizeAudience(raw?: string): 'freelancer' | 'agency' | 'both' {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'freelancer' || s === 'agency') return s;
  return 'both';
}

function rejectHoneypot(value?: string): void {
  if (String(value ?? '').trim()) {
    throw new BadRequestException('Invalid submission');
  }
}

@Injectable()
export class WebsiteInboundService {
  constructor(
    @InjectModel(WebsiteLead.name, 'crmConnection')
    private readonly websiteLeadModel: Model<WebsiteLeadDocument>,
    @InjectModel(WebsiteChatSession.name, 'crmConnection')
    private readonly chatSessionModel: Model<WebsiteChatSessionDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
    @Inject(forwardRef(() => SalesAgentTriggerService))
    private readonly salesAgentTrigger: SalesAgentTriggerService,
  ) {}

  async submitContact(
    dto: SubmitWebsiteContactDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    rejectHoneypot(dto.website);
    const doc = await this.websiteLeadModel.create({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName?.trim() || undefined,
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || undefined,
      company: dto.company?.trim() || undefined,
      subject: dto.subject?.trim() || undefined,
      message: dto.message.trim(),
      audience: normalizeAudience(dto.audience),
      formType: dto.formType?.trim() || 'contact',
      pageUrl: dto.pageUrl?.trim() || undefined,
      websiteHost: dto.websiteHost?.trim() || undefined,
      utmSource: dto.utmSource?.trim() || undefined,
      utmMedium: dto.utmMedium?.trim() || undefined,
      utmCampaign: dto.utmCampaign?.trim() || undefined,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      status: 'new',
    });
    return {
      ok: true,
      id: String(doc._id),
      message: 'Thank you — we will get back to you shortly.',
    };
  }

  async submitChatMessage(
    dto: SubmitWebsiteChatDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    rejectHoneypot(dto.website);
    const body = dto.message.trim();
    if (!body) throw new BadRequestException('message is required');

    const sessionKey = dto.sessionKey?.trim() || randomUUID();
    const now = new Date();
    const message = {
      body,
      sender: 'visitor' as const,
      createdAt: now,
    };

    let session = await this.chatSessionModel
      .findOne({ sessionKey })
      .exec();

    if (!session) {
      session = await this.chatSessionModel.create({
        sessionKey,
        visitorName: dto.visitorName?.trim() || undefined,
        visitorEmail: dto.visitorEmail?.trim().toLowerCase() || undefined,
        audience: normalizeAudience(dto.audience),
        pageUrl: dto.pageUrl?.trim() || undefined,
        websiteHost: dto.websiteHost?.trim() || undefined,
        status: 'open',
        messages: [message],
        lastMessageAt: now,
        unreadByStaff: true,
      });
      void this.maybeTriggerChatAgent(session);
    } else {
      if (dto.visitorName?.trim()) session.visitorName = dto.visitorName.trim();
      if (dto.visitorEmail?.trim()) {
        session.visitorEmail = dto.visitorEmail.trim().toLowerCase();
      }
      session.messages.push(message);
      session.lastMessageAt = now;
      session.unreadByStaff = true;
      if (session.status === 'closed') session.status = 'open';
      await session.save();
    }

    return {
      ok: true,
      sessionKey: session.sessionKey,
      sessionId: String(session._id),
      message: 'Message received.',
    };
  }

  async listWebsiteLeads(query: {
    page?: number;
    pageSize?: number;
    status?: string;
    audience?: string;
    search?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const filter: Record<string, unknown> = {};
    if (query.status && query.status !== '__all__') {
      filter.status = query.status;
    }
    if (query.audience === 'freelancer' || query.audience === 'agency') {
      filter.audience = { $in: [query.audience, 'both'] };
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { company: re },
        { message: re },
        { subject: re },
      ];
    }
    const [items, total] = await Promise.all([
      this.websiteLeadModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.websiteLeadModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, pageSize };
  }

  async getWebsiteLead(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    const doc = await this.websiteLeadModel.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('Not found');
    return doc;
  }

  async deleteWebsiteLead(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    const doc = await this.websiteLeadModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
    if (!doc) throw new NotFoundException('Not found');
    return { ok: true, id: String(doc._id) };
  }

  async patchWebsiteLead(
    id: string,
    body: { status?: string; notes?: string },
  ) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    const doc = await this.websiteLeadModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Not found');
    if (body.status) {
      const allowed = ['new', 'in_progress', 'converted', 'spam'];
      if (!allowed.includes(body.status)) {
        throw new BadRequestException('Invalid status');
      }
      doc.status = body.status;
    }
    if (body.notes !== undefined) {
      doc.notes = body.notes.trim() || undefined;
    }
    await doc.save();
    return doc.toObject();
  }

  async convertWebsiteLeadToCrmLead(id: string, actor: any) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    const wl = await this.websiteLeadModel.findById(id).exec();
    if (!wl) throw new NotFoundException('Not found');
    if (wl.convertedLeadId) {
      return {
        websiteLead: wl.toObject(),
        crmLeadId: String(wl.convertedLeadId),
        alreadyConverted: true,
      };
    }
    const lead = (await this.crmService.createLead(
      {
        firstName: wl.firstName,
        lastName: wl.lastName || undefined,
        email: wl.email,
        phone: wl.phone,
        mobileNo: wl.phone,
        organization: wl.company,
        source: `Website — ${wl.formType || 'contact'}`,
        status: 'New',
        stage: 'New',
      },
      actor,
    )) as unknown as { _id: Types.ObjectId };
    wl.convertedLeadId = lead._id;
    wl.status = 'converted';
    await wl.save();
    this.salesAgentTrigger.onEvent({
      trigger: 'website_inbound',
      recordType: 'Lead',
      recordId: String(lead._id),
      user: actor,
      metadata: { websiteLeadId: id, formType: wl.formType },
    });
    return {
      websiteLead: wl.toObject(),
      crmLeadId: String(lead._id),
      alreadyConverted: false,
    };
  }

  async listChatSessions(query: {
    page?: number;
    pageSize?: number;
    status?: string;
    unreadOnly?: boolean;
    audience?: string;
    search?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const filter: Record<string, unknown> = {};
    if (query.status && query.status !== '__all__') {
      filter.status = query.status;
    }
    if (query.unreadOnly) filter.unreadByStaff = true;
    if (query.audience === 'freelancer' || query.audience === 'agency') {
      filter.audience = { $in: [query.audience, 'both'] };
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { visitorName: re },
        { visitorEmail: re },
        { sessionKey: re },
        { 'messages.body': re },
      ];
    }
    const [items, total] = await Promise.all([
      this.chatSessionModel
        .find(filter)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select('-messages')
        .lean()
        .exec(),
      this.chatSessionModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, pageSize };
  }

  async getChatSession(id: string) {
    const byId =
      Types.ObjectId.isValid(id) &&
      (await this.chatSessionModel.findById(id).lean().exec());
    if (byId) return byId;
    const byKey = await this.chatSessionModel
      .findOne({ sessionKey: id.trim() })
      .lean()
      .exec();
    if (!byKey) throw new NotFoundException('Not found');
    return byKey;
  }

  async patchChatSession(
    id: string,
    body: {
      status?: string;
      staffNotes?: string;
      unreadByStaff?: boolean;
    },
  ) {
    const doc = await this.resolveChatSessionDoc(id);
    if (body.status) {
      if (!['open', 'closed'].includes(body.status)) {
        throw new BadRequestException('Invalid status');
      }
      doc.status = body.status;
    }
    if (body.staffNotes !== undefined) {
      doc.staffNotes = body.staffNotes.trim() || undefined;
    }
    if (body.unreadByStaff !== undefined) {
      doc.unreadByStaff = body.unreadByStaff;
    }
    await doc.save();
    return doc.toObject();
  }

  async staffReplyToChat(
    id: string,
    body: { message: string; staffName?: string },
    actor: any,
  ) {
    const doc = await this.resolveChatSessionDoc(id);
    const text = body.message?.trim();
    if (!text) throw new BadRequestException('message is required');
    const staffName =
      body.staffName?.trim() ||
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      actor?.name ||
      'Team';
    const now = new Date();
    doc.messages.push({
      body: text,
      sender: 'staff',
      staffName,
      createdAt: now,
    });
    doc.lastMessageAt = now;
    doc.unreadByStaff = false;
    await doc.save();
    return doc.toObject();
  }

  private async maybeTriggerChatAgent(session: WebsiteChatSessionDocument) {
    const email = String(session.visitorEmail || '').trim();
    if (!email || !email.includes('@')) return;
    if (session.convertedLeadId) {
      this.salesAgentTrigger.onEvent({
        trigger: 'chat_inbound',
        recordType: 'Lead',
        recordId: session.convertedLeadId,
        metadata: {
          chatSessionId: String(session._id),
          sessionKey: session.sessionKey,
          message: session.messages?.[0]?.body,
        },
      });
      return;
    }
    try {
      const [firstName, ...rest] = (session.visitorName || 'Website Chat').split(/\s+/);
      const lead = await this.crmService.createLead(
        {
          firstName: firstName || 'Website',
          lastName: rest.join(' ') || 'Chat',
          email,
          source: 'Website Chat',
          status: 'New',
          stage: 'New',
        },
        undefined,
      );
      const leadId = String((lead as any)?._id || '');
      if (!leadId) return;
      session.convertedLeadId = leadId;
      await session.save();
      this.salesAgentTrigger.onEvent({
        trigger: 'chat_inbound',
        recordType: 'Lead',
        recordId: leadId,
        metadata: {
          chatSessionId: String(session._id),
          sessionKey: session.sessionKey,
          message: session.messages?.[0]?.body,
        },
      });
    } catch {
      // Lead creation may fail on duplicates — agent can still be triggered manually
    }
  }

  private async resolveChatSessionDoc(
    id: string,
  ): Promise<WebsiteChatSessionDocument> {
    if (Types.ObjectId.isValid(id)) {
      const byId = await this.chatSessionModel.findById(id).exec();
      if (byId) return byId;
    }
    const byKey = await this.chatSessionModel
      .findOne({ sessionKey: id.trim() })
      .exec();
    if (!byKey) throw new NotFoundException('Not found');
    return byKey;
  }
}
