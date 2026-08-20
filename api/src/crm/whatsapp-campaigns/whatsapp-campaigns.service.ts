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
  WhatsAppCampaign,
  WhatsAppCampaignDocument,
  WhatsAppCampaignRecipient,
  WhatsAppCampaignStatus,
} from './schemas/whatsapp-campaign.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { Integration } from '../integrations/schemas/integration.schema';
import { AiSensyClient } from '../integrations/aisensy-client.util';
import { WhatsAppTemplatesService } from '../whatsapp-templates/whatsapp-templates.service';
import { WhatsAppService } from '../integrations/whatsapp.service';

type RecipientInput = {
  waId?: string;
  leadId?: string;
  name?: string;
  templateParams?: string[];
};

function normalizeWaId(waId: string): string {
  return String(waId || '').replace(/\D/g, '');
}

@Injectable()
export class WhatsAppCampaignsService {
  private readonly logger = new Logger(WhatsAppCampaignsService.name);

  constructor(
    @InjectModel(WhatsAppCampaign.name, 'crmConnection')
    private campaignModel: Model<WhatsAppCampaignDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Integration.name, 'crmConnection')
    private integrationModel: Model<any>,
    private readonly templatesService: WhatsAppTemplatesService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  private async getAiSensyConfig(): Promise<{
    apiKey: string;
    sourceLabel?: string;
  }> {
    const config = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .lean()
      .exec();
    if (!config?.apiKey || !config?.isActive || config.provider !== 'aisensy') {
      throw new BadRequestException(
        'AiSensy is not configured as the active WhatsApp provider — set it up under Settings → Integrations → WhatsApp first.',
      );
    }
    return { apiKey: config.apiKey, sourceLabel: config.sourceLabel };
  }

  async findAll(userId: string, query?: { status?: string; search?: string }) {
    const filter: Record<string, unknown> = {
      createdBy: new Types.ObjectId(userId),
    };
    if (query?.status && query.status !== 'all') filter.status = query.status;
    if (query?.search?.trim()) {
      filter.name = { $regex: query.search.trim(), $options: 'i' };
    }
    const rows = await this.campaignModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return rows.map((r) => this.serialize(r));
  }

  async findOne(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    return this.serialize(doc.toObject());
  }

  /** Resolves a mixed list of explicit waId's / leadId's into deduped campaign recipients. */
  private async normalizeRecipients(
    input: RecipientInput[],
  ): Promise<WhatsAppCampaignRecipient[]> {
    const seen = new Set<string>();
    const out: WhatsAppCampaignRecipient[] = [];
    for (const raw of input) {
      let waId = normalizeWaId(raw.waId || '');
      let leadId: Types.ObjectId | undefined;
      let name = raw.name?.trim();

      if (raw.leadId && Types.ObjectId.isValid(raw.leadId)) {
        const lead = await this.leadModel
          .findById(raw.leadId)
          .select('firstName lastName phone mobileNo')
          .lean()
          .exec();
        if (lead) {
          leadId = lead._id as Types.ObjectId;
          if (!waId) waId = normalizeWaId((lead as any).mobileNo || (lead as any).phone || '');
          if (!name) {
            name = `${(lead as any).firstName || ''} ${(lead as any).lastName || ''}`.trim();
          }
        }
      }

      if (waId.length < 10 || seen.has(waId)) continue;
      seen.add(waId);
      out.push({
        waId,
        name: name || undefined,
        leadId,
        templateParams: raw.templateParams || [],
        status: 'pending',
      });
    }
    return out;
  }

  async create(
    userId: string,
    data: {
      name: string;
      description?: string;
      templateId: string;
      aisensyCampaignName?: string;
      recipients?: RecipientInput[];
      scheduledAt?: string;
      throttlePerMinute?: number;
      sendNow?: boolean;
      mediaUrl?: string;
      mediaFilename?: string;
    },
  ) {
    if (!Types.ObjectId.isValid(data.templateId)) {
      throw new BadRequestException('A valid templateId is required');
    }
    const template = await this.templatesService.findOne(data.templateId);
    const aisensyCampaignName =
      String(data.aisensyCampaignName || template.aisensyCampaignName || '').trim();
    if (!aisensyCampaignName) {
      throw new BadRequestException(
        'This template has no AiSensy campaign mapped — set one on the template first, or pass aisensyCampaignName explicitly.',
      );
    }

    // Auto-create API campaign on AiSensy to guarantee it exists
    const configIntegration = await this.integrationModel.findOne({ type: 'whatsapp' }).lean().exec();
    if (configIntegration?.provider === 'aisensy' && configIntegration.aisensyProjectId && configIntegration.aisensyProjectApiPassword) {
      try {
        const url = `https://apis.aisensy.com/project-apis/v1/project/${configIntegration.aisensyProjectId}/campaign/api`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-AiSensy-Project-API-Pwd': String(configIntegration.aisensyProjectApiPassword),
          },
          body: JSON.stringify({
            template_name: template.name,
            campaign_name: aisensyCampaignName,
          }),
        });
        this.logger.log(`Ensured live API campaign "${aisensyCampaignName}" exists on AiSensy for template "${template.name}".`);
      } catch (err: any) {
        this.logger.error(`Failed to auto-create campaign on AiSensy: ${err?.message}`);
      }
    }

    const recipients = await this.normalizeRecipients(data.recipients || []);
    if (!recipients.length) {
      throw new BadRequestException('Add at least one recipient with a valid phone number.');
    }

    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : undefined;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date.');
    }

    let status: WhatsAppCampaignStatus = 'draft';
    if (!data.sendNow && scheduledAt && scheduledAt.getTime() > Date.now()) {
      status = 'scheduled';
    }

    const doc = await this.campaignModel.create({
      name: String(data.name || '').trim() || 'Untitled campaign',
      description: String(data.description || '').trim(),
      status,
      templateId: new Types.ObjectId(data.templateId),
      templateName: template.name,
      aisensyCampaignName,
      recipients,
      scheduledAt: scheduledAt && status === 'scheduled' ? scheduledAt : undefined,
      createdBy: new Types.ObjectId(userId),
      throttlePerMinute: data.throttlePerMinute && data.throttlePerMinute > 0
        ? Math.min(1000, Math.floor(data.throttlePerMinute))
        : 60,
      totalRecipients: recipients.length,
      mediaUrl: data.mediaUrl,
      mediaFilename: data.mediaFilename,
    });

    if (data.sendNow) {
      // Persist status: 'sending' BEFORE kicking off executeCampaign() —
      // it re-reads the doc from the DB on its very first iteration and
      // bails out if status isn't 'sending' yet (so pause/cancel can react
      // promptly mid-run). Flipping the status after firing the background
      // send is a race: the read can land before this save commits and the
      // whole campaign silently no-ops still sitting in 'draft'.
      doc.status = 'sending';
      doc.startedAt = new Date();
      await doc.save();
      void this.executeCampaign(String(doc._id)).catch((e) =>
        this.logger.error(`Campaign ${doc._id} failed: ${e?.message || e}`),
      );
    }
    return this.serialize(doc.toObject());
  }

  async update(
    userId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      recipients: RecipientInput[];
      scheduledAt: string | null;
      throttlePerMinute: number;
    }>,
  ) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (!['draft', 'scheduled'].includes(doc.status)) {
      throw new BadRequestException('Only draft or scheduled campaigns can be edited.');
    }

    if (data.name != null) doc.name = String(data.name).trim() || doc.name;
    if (data.description != null) doc.description = String(data.description);
    if (data.recipients) {
      const recipients = await this.normalizeRecipients(data.recipients);
      if (!recipients.length) {
        throw new BadRequestException('Add at least one recipient with a valid phone number.');
      }
      doc.recipients = recipients;
      doc.totalRecipients = recipients.length;
    }
    if (data.throttlePerMinute != null && data.throttlePerMinute > 0) {
      doc.throttlePerMinute = Math.min(1000, Math.floor(data.throttlePerMinute));
    }
    if (data.scheduledAt !== undefined) {
      if (!data.scheduledAt) {
        doc.scheduledAt = undefined;
        doc.status = 'draft';
      } else {
        const scheduledAt = new Date(data.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          throw new BadRequestException('Invalid scheduled date.');
        }
        doc.scheduledAt = scheduledAt;
        doc.status = scheduledAt.getTime() > Date.now() ? 'scheduled' : 'draft';
      }
    }

    await doc.save();
    return this.serialize(doc.toObject());
  }

  async remove(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (doc.status === 'sending') {
      throw new BadRequestException('Pause or cancel the campaign before deleting it.');
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    if (Types.ObjectId.isValid(String(userId))) doc.deletedBy = new Types.ObjectId(String(userId));
    await doc.save();
    return { success: true };
  }

  async cancel(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (!['scheduled', 'paused', 'draft'].includes(doc.status)) {
      throw new BadRequestException('Only a draft, scheduled, or paused campaign can be cancelled.');
    }
    doc.status = 'cancelled';
    doc.scheduledAt = undefined;
    await doc.save();
    return this.serialize(doc.toObject());
  }

  async pause(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (doc.status !== 'sending') {
      throw new BadRequestException('Only a currently-sending campaign can be paused.');
    }
    doc.status = 'paused';
    await doc.save();
    return this.serialize(doc.toObject());
  }

  async resume(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (doc.status !== 'paused') {
      throw new BadRequestException('Only a paused campaign can be resumed.');
    }
    doc.status = 'sending';
    await doc.save();
    void this.executeCampaign(id).catch((e) =>
      this.logger.error(`Campaign ${id} failed on resume: ${e?.message || e}`),
    );
    return this.serialize(doc.toObject());
  }

  async launch(userId: string, id: string) {
    const doc = await this.getOwnedCampaign(userId, id);
    if (!['draft', 'scheduled', 'failed'].includes(doc.status)) {
      throw new BadRequestException(`Cannot launch a campaign in status "${doc.status}".`);
    }
    doc.status = 'sending';
    doc.startedAt = new Date();
    doc.lastError = undefined;
    await doc.save();
    void this.executeCampaign(id).catch((e) =>
      this.logger.error(`Campaign ${id} failed: ${e?.message || e}`),
    );
    return this.serialize(doc.toObject());
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledCampaigns() {
    const due = await this.campaignModel
      .find({ status: 'scheduled', scheduledAt: { $lte: new Date() } })
      .limit(5)
      .exec();
    for (const camp of due) {
      camp.status = 'sending';
      camp.startedAt = new Date();
      await camp.save();
      void this.executeCampaign(String(camp._id)).catch((e) =>
        this.logger.error(`Scheduled campaign ${camp._id} failed: ${e?.message || e}`),
      );
    }
  }

  /**
   * Safety net for the in-process send loop described on `executeCampaign()`
   * — a server restart mid-send leaves a campaign parked in `status:
   * 'sending'` with recipients still `pending` and no code left running to
   * finish them. Every minute, pick up any such campaign whose `updatedAt`
   * hasn't moved in STALE_AFTER_MS (i.e. nothing has completed a send
   * recently, since every send updates the doc) and re-launch it.
   *
   * This is a heuristic, not a distributed lock: on a multi-instance
   * deployment two instances could both decide the same campaign is stale at
   * once. Acceptable here (this CRM runs a single API instance) but
   * revisit with a proper lock/queue if that changes.
   */
  private static readonly STALE_AFTER_MS = 3 * 60 * 1000;

  @Cron(CronExpression.EVERY_MINUTE)
  async resumeStuckCampaigns() {
    const staleBefore = new Date(Date.now() - WhatsAppCampaignsService.STALE_AFTER_MS);
    const stuck = await this.campaignModel
      .find({
        status: 'sending',
        updatedAt: { $lte: staleBefore },
        recipients: { $elemMatch: { status: 'pending' } },
      })
      .limit(5)
      .exec();
    for (const camp of stuck) {
      const lastProgress = (camp as unknown as { updatedAt?: Date }).updatedAt;
      this.logger.warn(
        `Campaign ${camp._id} looked stuck in 'sending' (no progress since ${lastProgress?.toISOString()}) — resuming.`,
      );
      void this.executeCampaign(String(camp._id)).catch((e) =>
        this.logger.error(`Stuck campaign ${camp._id} failed to resume: ${e?.message || e}`),
      );
    }
  }

  /**
   * Sends the campaign's pending recipients one at a time, spaced out per
   * `throttlePerMinute`, checking the campaign's live status between every
   * send so a `pause()`/`cancel()` call takes effect promptly instead of
   * only at the next launch. Runs fire-and-forget from launch()/resume()/
   * the scheduler — this is in-process, not a durable job queue, so a
   * server restart mid-send leaves the remaining recipients `pending` until
   * `resumeStuckCampaigns()` (below) notices no progress has been made in a
   * while and re-launches it; that's a heuristic safety net, not a true
   * job queue with delivery guarantees.
   */
  private async executeCampaign(campaignId: string): Promise<void> {
    const config = await this.getAiSensyConfig();
    const client = new AiSensyClient(config.apiKey);

    let doc = await this.campaignModel.findById(campaignId).exec();
    if (!doc) throw new NotFoundException('Campaign not found');

    const template = await this.templatesService.findOne(doc.templateId.toString());

    const delayMs = Math.max(1, Math.round(60000 / doc.throttlePerMinute));

    for (const rec of doc.recipients) {
      if (rec.status !== 'pending') continue;

      // Re-read status before every send so pause/cancel take effect promptly.
      doc = await this.campaignModel.findById(campaignId).exec();
      if (!doc || doc.status !== 'sending') break;

      const target = doc.recipients.find((r) => r.waId === rec.waId && r.status === 'pending');
      if (!target) continue;

      try {
        const result = await client.sendCampaignMessage({
          destination: target.waId,
          campaignName: doc.aisensyCampaignName,
          userName: target.name,
          source: config.sourceLabel,
          templateParams: target.templateParams,
          media: doc.mediaUrl ? {
            url: doc.mediaUrl,
            filename: doc.mediaFilename || 'file'
          } : undefined
        });
        if (result.success) {
          target.status = 'sent';
          target.sentAt = new Date();
          target.providerMessageId = result.raw?.messageId ? String(result.raw.messageId) : undefined;
          doc.sentCount += 1;

          // Log campaign message into chat history
          try {
            const bodyComp = template.components?.find((c: any) => String(c.type).toUpperCase() === 'BODY');
            let bodyText = bodyComp?.text || '';
            if (Array.isArray(target.templateParams)) {
              target.templateParams.forEach((param, i) => {
                bodyText = bodyText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), param);
              });
            }

            await this.whatsappService.logOutboundMessage({
              phone: target.waId,
              body: bodyText,
              messageId: target.providerMessageId,
              sentBy: doc.createdBy,
              module: 'whatsapp-campaigns',
              entityId: doc._id,
              mediaUrl: doc.mediaUrl,
              mediaFilename: doc.mediaFilename,
              rawPayload: result.raw,
              templateName: template.name,
            });
          } catch (err: any) {
            this.logger.error(`Failed to log campaign message in chat history: ${err?.message}`);
          }
        } else {
          target.status = 'failed';
          target.errorMessage = result.error || 'Send failed';
          doc.failedCount += 1;
        }
      } catch (e: any) {
        target.status = 'failed';
        target.errorMessage = e?.message || 'Send failed';
        doc.failedCount += 1;
      }
      doc.markModified('recipients');
      await doc.save();

      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    doc = await this.campaignModel.findById(campaignId).exec();
    if (!doc || doc.status !== 'sending') return; // paused or cancelled mid-run

    const stillPending = doc.recipients.some((r) => r.status === 'pending');
    if (!stillPending) {
      doc.status = doc.failedCount > 0 && doc.sentCount === 0 ? 'failed' : 'completed';
      doc.completedAt = new Date();
      if (doc.status === 'failed') doc.lastError = 'All sends failed';
      await doc.save();
    }
  }

  private async getOwnedCampaign(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Campaign not found');
    const doc = await this.campaignModel.findOne({
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId),
    });
    if (!doc) throw new NotFoundException('Campaign not found');
    return doc;
  }

  private serialize(raw: Record<string, any>) {
    return {
      ...raw,
      id: String(raw._id),
      _id: String(raw._id),
      templateId: raw.templateId ? String(raw.templateId) : undefined,
      createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt).toISOString() : undefined,
      startedAt: raw.startedAt ? new Date(raw.startedAt).toISOString() : undefined,
      completedAt: raw.completedAt ? new Date(raw.completedAt).toISOString() : undefined,
      createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
      recipients: Array.isArray(raw.recipients)
        ? raw.recipients.map((r: Record<string, unknown>) => ({
            ...r,
            leadId: r.leadId ? String(r.leadId) : undefined,
            sentAt: r.sentAt ? new Date(r.sentAt as Date).toISOString() : undefined,
          }))
        : [],
    };
  }

  private async getProjectConfig(): Promise<{ projectId: string; pwd: string }> {
    const config = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .lean()
      .exec();
    if (!config?.aisensyProjectId || !config?.aisensyProjectApiPassword || config.provider !== 'aisensy') {
      throw new BadRequestException(
        'AiSensy is not configured as the active WhatsApp provider with Project credentials.',
      );
    }
    return {
      projectId: String(config.aisensyProjectId),
      pwd: String(config.aisensyProjectApiPassword),
    };
  }

  async getLiveCampaigns() {
    const { projectId, pwd } = await this.getProjectConfig();
    const res = await fetch(`https://apis.aisensy.com/project-apis/v1/project/${projectId}/campaign/api`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-AiSensy-Project-API-Pwd': pwd,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(data?.message || data?.error || 'Failed to fetch campaigns from AiSensy');
    }
    return data;
  }

  async createLiveCampaign(body: Record<string, unknown>) {
    const { projectId, pwd } = await this.getProjectConfig();
    const res = await fetch(`https://apis.aisensy.com/project-apis/v1/project/${projectId}/campaign/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-AiSensy-Project-API-Pwd': pwd,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(data?.message || data?.error || 'Failed to create campaign in AiSensy');
    }
    return data;
  }

  async getLiveCampaignDetails(campaignId: string) {
    const { projectId, pwd } = await this.getProjectConfig();
    const res = await fetch(`https://apis.aisensy.com/project-apis/v1/project/${projectId}/campaign/${campaignId}/details`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-AiSensy-Project-API-Pwd': pwd,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(data?.message || data?.error || 'Failed to fetch campaign details from AiSensy');
    }
    return data;
  }

  async getLiveCampaignAnalytics(campaignId: string) {
    const { projectId, pwd } = await this.getProjectConfig();
    const res = await fetch(`https://apis.aisensy.com/project-apis/v1/project/${projectId}/campaign/${campaignId}/analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-AiSensy-Project-API-Pwd': pwd,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(data?.message || data?.error || 'Failed to fetch campaign analytics from AiSensy');
    }
    return data;
  }
}
