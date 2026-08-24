import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  EmailCampaign,
  EmailCampaignDocument,
  EmailCampaignRecipient,
  EmailCampaignStatus,
} from '../schemas/email-campaign.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  EmailTemplate,
  EmailTemplateDocument,
} from '../schemas/email-template.schema';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';
import { EmailTemplateMergeService } from './email-template-merge.service';
import { fillEmailTemplateVariables } from '../shared/email-template-fill.util';
import { CrmSegmentsService } from '../segments/crm-segments.service';

type RecipientInput = {
  email: string;
  name?: string;
  module?: string;
  entityId?: string;
};

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);

  constructor(
    @InjectModel(EmailCampaign.name, 'crmConnection')
    private campaignModel: Model<EmailCampaignDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(EmailTemplate.name, 'crmConnection')
    private templateModel: Model<EmailTemplateDocument>,
    private readonly inboxAccounts: InboxAccountsService,
    private readonly templateMerge: EmailTemplateMergeService,
    private readonly segmentsService: CrmSegmentsService,
  ) {}

  async findAll(
    userId: string,
    query?: { status?: string; search?: string },
  ) {
    const filter: Record<string, unknown> = {
      createdBy: new Types.ObjectId(userId),
    };
    if (query?.status && query.status !== 'all') {
      filter.status = query.status;
    }
    if (query?.search?.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
      ];
    }
    const rows = await this.campaignModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return rows.map((r) => this.serializeCampaign(r));
  }

  async findOne(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    return this.serializeCampaign(doc.toObject());
  }

  async create(
    userId: string,
    data: {
      name: string;
      description?: string;
      subject: string;
      bodyHtml: string;
      templateId?: string;
      recipients?: RecipientInput[];
      scheduledAt?: string;
      enforceCrmRecipient?: boolean;
      aiDraftPerRecipient?: boolean;
      aiInstructions?: string;
      retryOnSendFail?: boolean;
      maxEmailsPerSenderInBatch?: number;
      mailboxSplit?: {
        mode?: 'round_robin' | 'random' | 'sticky_entity';
        accountIds?: string[];
      };
      sendNow?: boolean;
      segmentId?: string;
    },
    user?: { userId: string; email?: string; [key: string]: unknown },
    userEmail?: string,
  ) {
    let segmentId: Types.ObjectId | undefined;
    let recipientInput = data.recipients || [];
    if (data.segmentId && Types.ObjectId.isValid(data.segmentId)) {
      const exported = await this.segmentsService.exportCampaignRecipients(
        data.segmentId,
        user,
      );
      if (!exported.recipients.length) {
        throw new BadRequestException(
          'Selected segment has no members with a valid email address.',
        );
      }
      recipientInput = exported.recipients;
      segmentId = new Types.ObjectId(data.segmentId);
    }
    const recipients = await this.normalizeRecipients(recipientInput);
    if (!recipients.length) {
      throw new BadRequestException('Add at least one recipient.');
    }
    const subject = String(data.subject || '').trim();
    const bodyHtml = String(data.bodyHtml || '').trim();
    if (!subject) throw new BadRequestException('Subject is required.');
    if (!bodyHtml) throw new BadRequestException('Email body is required.');

    const scheduledAt = data.scheduledAt
      ? new Date(data.scheduledAt)
      : undefined;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date.');
    }

    let status: EmailCampaignStatus = 'draft';
    if (data.sendNow) status = 'draft';
    else if (scheduledAt && scheduledAt.getTime() > Date.now()) {
      status = 'scheduled';
    }

    const doc = await this.campaignModel.create({
      name: String(data.name || '').trim() || 'Untitled campaign',
      description: String(data.description || '').trim(),
      status,
      subject,
      bodyHtml,
      templateId:
        data.templateId && Types.ObjectId.isValid(data.templateId)
          ? new Types.ObjectId(data.templateId)
          : undefined,
      segmentId,
      recipients,
      scheduledAt: scheduledAt && status === 'scheduled' ? scheduledAt : undefined,
      createdBy: new Types.ObjectId(userId),
      enforceCrmRecipient: data.enforceCrmRecipient !== false,
      aiDraftPerRecipient: data.aiDraftPerRecipient === true,
      aiInstructions: String(data.aiInstructions || '').trim(),
      retryOnSendFail: data.retryOnSendFail !== false,
      maxEmailsPerSenderInBatch: data.maxEmailsPerSenderInBatch,
      mailboxSplit: data.mailboxSplit,
      totalRecipients: recipients.length,
    });

    if (data.sendNow) {
      const email = userEmail ?? user?.email;
      await this.executeCampaign(String(doc._id), userId, email);
      return this.findOne(userId, String(doc._id));
    }
    return this.serializeCampaign(doc.toObject());
  }

  async update(
    userId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      subject: string;
      bodyHtml: string;
      templateId: string;
      recipients: RecipientInput[];
      scheduledAt: string | null;
      enforceCrmRecipient: boolean;
      aiDraftPerRecipient: boolean;
      aiInstructions: string;
      retryOnSendFail: boolean;
      maxEmailsPerSenderInBatch: number;
      mailboxSplit: {
        mode?: 'round_robin' | 'random' | 'sticky_entity';
        accountIds?: string[];
      };
      segmentId?: string | null;
    }>,
    user?: { userId: string; [key: string]: unknown },
  ) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (!['draft', 'scheduled'].includes(doc.status)) {
      throw new BadRequestException(
        'Only draft or scheduled campaigns can be edited.',
      );
    }

    if (data.name != null) doc.name = String(data.name).trim() || doc.name;
    if (data.description != null) doc.description = String(data.description);
    if (data.subject != null) doc.subject = String(data.subject).trim();
    if (data.bodyHtml != null) doc.bodyHtml = String(data.bodyHtml).trim();
    if (data.templateId !== undefined) {
      doc.templateId =
        data.templateId && Types.ObjectId.isValid(data.templateId)
          ? new Types.ObjectId(data.templateId)
          : undefined;
    }
    if (data.segmentId !== undefined) {
      if (data.segmentId && Types.ObjectId.isValid(data.segmentId)) {
        const exported = await this.segmentsService.exportCampaignRecipients(
          data.segmentId,
          user ?? { userId },
        );
        if (!exported.recipients.length) {
          throw new BadRequestException(
            'Selected segment has no members with a valid email address.',
          );
        }
        doc.segmentId = new Types.ObjectId(data.segmentId);
        doc.recipients = await this.normalizeRecipients(exported.recipients);
        doc.totalRecipients = doc.recipients.length;
      } else {
        doc.segmentId = undefined;
      }
    } else if (data.recipients) {
      const recipients = await this.normalizeRecipients(data.recipients);
      if (!recipients.length) {
        throw new BadRequestException('Add at least one recipient.');
      }
      doc.recipients = recipients;
      doc.totalRecipients = recipients.length;
    }
    if (data.enforceCrmRecipient != null) {
      doc.enforceCrmRecipient = data.enforceCrmRecipient;
    }
    if (data.aiDraftPerRecipient != null) {
      doc.aiDraftPerRecipient = data.aiDraftPerRecipient;
    }
    if (data.aiInstructions != null) {
      doc.aiInstructions = String(data.aiInstructions).trim();
    }
    if (data.retryOnSendFail != null) doc.retryOnSendFail = data.retryOnSendFail;
    if (data.maxEmailsPerSenderInBatch != null) {
      doc.maxEmailsPerSenderInBatch = data.maxEmailsPerSenderInBatch;
    }
    if (data.mailboxSplit != null) doc.mailboxSplit = data.mailboxSplit;

    if (data.scheduledAt !== undefined) {
      if (data.scheduledAt === null || data.scheduledAt === '') {
        doc.scheduledAt = undefined;
        doc.status = 'draft';
      } else {
        const scheduledAt = new Date(data.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          throw new BadRequestException('Invalid scheduled date.');
        }
        doc.scheduledAt = scheduledAt;
        doc.status =
          scheduledAt.getTime() > Date.now() ? 'scheduled' : 'draft';
      }
    }

    await doc.save();
    return this.serializeCampaign(doc.toObject());
  }

  async remove(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (doc.status === 'sending') {
      throw new BadRequestException('Cannot delete a campaign while sending.');
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    if (Types.ObjectId.isValid(String(userId))) {
      doc.deletedBy = new Types.ObjectId(String(userId));
    }
    await doc.save();
    return { success: true };
  }

  async cancel(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (doc.status !== 'scheduled') {
      throw new BadRequestException('Only scheduled campaigns can be cancelled.');
    }
    doc.status = 'cancelled';
    doc.scheduledAt = undefined;
    await doc.save();
    return this.serializeCampaign(doc.toObject());
  }

  async sendNow(userId: string, id: string, userEmail?: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (!['draft', 'scheduled', 'failed'].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot send campaign in status "${doc.status}".`,
      );
    }
    await this.executeCampaign(id, userId, userEmail);
    return this.findOne(userId, id);
  }

  async duplicate(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    const copy = await this.campaignModel.create({
      name: `${doc.name} (copy)`,
      description: doc.description,
      status: 'draft',
      subject: doc.subject,
      bodyHtml: doc.bodyHtml,
      templateId: doc.templateId,
      recipients: (doc.recipients || []).map((r) => ({
        email: r.email,
        name: r.name,
        module: r.module,
        entityId: r.entityId,
        status: 'pending',
      })),
      createdBy: new Types.ObjectId(userId),
      enforceCrmRecipient: doc.enforceCrmRecipient,
      aiDraftPerRecipient: doc.aiDraftPerRecipient,
      aiInstructions: doc.aiInstructions,
      retryOnSendFail: doc.retryOnSendFail,
      maxEmailsPerSenderInBatch: doc.maxEmailsPerSenderInBatch,
      mailboxSplit: doc.mailboxSplit,
      totalRecipients: doc.recipients?.length || 0,
    });
    return this.serializeCampaign(copy.toObject());
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledCampaigns() {
    const due = await this.campaignModel
      .find({
        status: 'scheduled',
        scheduledAt: { $lte: new Date() },
      })
      .limit(5)
      .exec();
    for (const camp of due) {
      try {
        await this.executeCampaign(
          String(camp._id),
          String(camp.createdBy),
          undefined,
        );
      } catch (e: any) {
        this.logger.error(
          `Scheduled campaign ${camp._id} failed: ${e?.message || e}`,
        );
      }
    }
  }

  async executeCampaign(
    campaignId: string,
    userId: string,
    userEmail?: string,
  ) {
    const doc = await this.campaignModel.findById(campaignId).exec();
    if (!doc) throw new NotFoundException('Campaign not found');
    if (doc.status === 'sending') {
      throw new BadRequestException('Campaign is already sending.');
    }
    if (doc.status === 'completed') {
      throw new BadRequestException('Campaign already completed.');
    }

    doc.status = 'sending';
    doc.startedAt = new Date();
    doc.lastError = undefined;
    doc.sentCount = 0;
    doc.failedCount = 0;
    await doc.save();

    const sender = userEmail
      ? { email: userEmail }
      : undefined;
    const pending = (doc.recipients || []).filter((r) => r.status === 'pending');
    const needsMerge =
      !doc.aiDraftPerRecipient &&
      (/\{\{/.test(doc.subject) || /\{\{/.test(doc.bodyHtml));

    try {
      if (doc.aiDraftPerRecipient || !needsMerge) {
        const bulkRecipients = pending.map((r) => ({
          email: r.email,
          name: r.name,
          module: (r.module || 'leads') as
            | 'leads'
            | 'contacts'
            | 'organizations'
            | 'clients',
          entityId: r.entityId ? String(r.entityId) : undefined,
        }));

        const result = await this.inboxAccounts.sendBulkSmart(userId, {
          recipients: bulkRecipients,
          subject: doc.subject,
          body: doc.bodyHtml,
          enforceCrmRecipient: doc.enforceCrmRecipient,
          mailboxSplit: doc.mailboxSplit,
          retryOnSendFail: doc.retryOnSendFail,
          aiDraftPerRecipient: doc.aiDraftPerRecipient,
          aiInstructions: doc.aiInstructions || undefined,
          maxEmailsPerSenderInBatch: doc.maxEmailsPerSenderInBatch,
        });

        const resultByEmail = new Map(
          (result.results || []).map((r) => [r.email.toLowerCase(), r]),
        );
        for (const rec of doc.recipients) {
          if (rec.status !== 'pending') continue;
          const row = resultByEmail.get(rec.email.toLowerCase());
          if (row?.success) {
            rec.status = 'sent';
            rec.sentAt = new Date();
            rec.accountId = row.accountId
              ? new Types.ObjectId(row.accountId)
              : undefined;
            rec.errorMessage = undefined;
          } else {
            rec.status = 'failed';
            rec.errorMessage = row?.error || 'Send failed';
          }
        }
        doc.sentCount = result.sent;
        doc.failedCount = result.failed;
        if (!result.success && result.sent === 0) {
          doc.lastError = result.results?.[0]?.error || 'All sends failed';
        }
      } else {
        let sent = 0;
        let failed = 0;
        for (const rec of pending) {
          try {
            const merge =
              rec.entityId && rec.module
                ? await this.templateMerge.mergeForComposer(
                    rec.module,
                    String(rec.entityId),
                    sender,
                  )
                : {};
            const subject = fillEmailTemplateVariables(doc.subject, merge);
            const body = fillEmailTemplateVariables(doc.bodyHtml, merge);
            const accounts = await this.inboxAccounts.findAccountsByUser(userId);
            const firstAccount = Array.isArray(accounts) ? accounts[0] : null;
            const accountId =
              doc.mailboxSplit?.accountIds?.[0] ||
              (firstAccount
                ? String((firstAccount as { _id?: unknown })._id ?? '')
                : '');
            if (!accountId) {
              rec.status = 'failed';
              rec.errorMessage = 'No connected mailbox';
              failed += 1;
              continue;
            }
            const res = await this.inboxAccounts.sendFromAccount(
              userId,
              accountId,
              {
                to: rec.email,
                subject,
                body,
                module: rec.module,
                entityId: rec.entityId ? String(rec.entityId) : undefined,
                enforceCrmRecipient: doc.enforceCrmRecipient,
                templateId: doc.templateId
                  ? String(doc.templateId)
                  : undefined,
              },
              userEmail,
            );
            if (res.success) {
              rec.status = 'sent';
              rec.sentAt = new Date();
              rec.accountId = new Types.ObjectId(accountId);
              sent += 1;
            } else {
              rec.status = 'failed';
              rec.errorMessage = res.error || 'Send failed';
              failed += 1;
            }
          } catch (e: any) {
            rec.status = 'failed';
            rec.errorMessage = e?.message || 'Send failed';
            failed += 1;
          }
        }
        doc.sentCount = sent;
        doc.failedCount = failed;
      }

      doc.status =
        doc.failedCount > 0 && doc.sentCount === 0 ? 'failed' : 'completed';
      doc.completedAt = new Date();
      doc.markModified('recipients');
      await doc.save();
    } catch (e: any) {
      doc.status = 'failed';
      doc.lastError = e?.message || 'Campaign send failed';
      doc.completedAt = new Date();
      await doc.save();
      throw e;
    }

    return this.serializeCampaign(doc.toObject());
  }

  private async getOwnedCampaign(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Campaign not found');
    }
    const doc = await this.campaignModel.findOne({
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId),
    });
    if (!doc) throw new NotFoundException('Campaign not found');
    return doc;
  }

  private async normalizeRecipients(
    input: RecipientInput[],
  ): Promise<EmailCampaignRecipient[]> {
    const seen = new Set<string>();
    const out: EmailCampaignRecipient[] = [];
    for (const raw of input) {
      const email = String(raw.email || '')
        .trim()
        .toLowerCase();
      if (!email.includes('@') || seen.has(email)) continue;
      seen.add(email);
      let module = raw.module;
      let entityId =
        raw.entityId && Types.ObjectId.isValid(raw.entityId)
          ? new Types.ObjectId(raw.entityId)
          : undefined;
      if (!entityId) {
        const linked = await this.linkRecipientByEmail(email);
        module = linked.module;
        entityId = linked.entityId;
      }
      out.push({
        email,
        name: raw.name?.trim() || undefined,
        module,
        entityId,
        status: 'pending',
      });
    }
    return out;
  }

  private async linkRecipientByEmail(email: string): Promise<{
    module?: string;
    entityId?: Types.ObjectId;
  }> {
    const lead = await this.leadModel
      .findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') })
      .select('_id firstName lastName')
      .lean()
      .exec();
    if (lead?._id) {
      return { module: 'leads', entityId: lead._id as Types.ObjectId };
    }
    const contact = await this.contactModel
      .findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') })
      .select('_id firstName lastName')
      .lean()
      .exec();
    if (contact?._id) {
      return { module: 'contacts', entityId: contact._id as Types.ObjectId };
    }
    return {};
  }

  private serializeCampaign(raw: Record<string, any>) {
    return {
      ...raw,
      id: String(raw._id),
      _id: String(raw._id),
      templateId: raw.templateId ? String(raw.templateId) : undefined,
      segmentId: raw.segmentId ? String(raw.segmentId) : undefined,
      createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
      scheduledAt: raw.scheduledAt
        ? new Date(raw.scheduledAt as Date).toISOString()
        : undefined,
      startedAt: raw.startedAt
        ? new Date(raw.startedAt as Date).toISOString()
        : undefined,
      completedAt: raw.completedAt
        ? new Date(raw.completedAt as Date).toISOString()
        : undefined,
      createdAt: raw.createdAt
        ? new Date(raw.createdAt as Date).toISOString()
        : undefined,
      updatedAt: raw.updatedAt
        ? new Date(raw.updatedAt as Date).toISOString()
        : undefined,
      recipients: Array.isArray(raw.recipients)
        ? raw.recipients.map((r: Record<string, unknown>) => ({
            ...r,
            entityId: r.entityId ? String(r.entityId) : undefined,
            accountId: r.accountId ? String(r.accountId) : undefined,
            sentAt: r.sentAt
              ? new Date(r.sentAt as Date).toISOString()
              : undefined,
          }))
        : [],
    };
  }

  async loadTemplate(templateId: string) {
    if (!Types.ObjectId.isValid(templateId)) {
      throw new BadRequestException('Invalid template id');
    }
    const t = await this.templateModel.findById(templateId).lean().exec();
    if (!t) throw new NotFoundException('Template not found');
    return { subject: t.subject, bodyHtml: t.body };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
