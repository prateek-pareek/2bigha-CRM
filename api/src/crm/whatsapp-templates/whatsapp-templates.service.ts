import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhatsAppTemplate,
  WhatsAppTemplateDocument,
  WhatsAppTemplateStatus,
} from './schemas/whatsapp-template.schema';
import { Integration } from '../integrations/schemas/integration.schema';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsAppTemplateDto } from './dto/update-whatsapp-template.dto';

const META_API = 'https://graph.facebook.com/v18.0';

/**
 * Standalone service for the new /crm/whatsapp/templates module.
 *
 * Intentionally does NOT depend on `WhatsAppService`
 * (api/src/crm/integrations/whatsapp.service.ts) — that service is wired
 * into the existing `crm.module.ts` monolith and is not exported, and its
 * job (send messages/templates, cache a read-only Meta template list on the
 * Integration doc) is unrelated to authoring/submitting templates. Rather
 * than touch the working monolith to export it, this service duplicates
 * the small Meta Graph API client pattern (`getWhatsAppConfig` + fetch with
 * `Authorization: Bearer`) already used there. See plan notes: a future
 * cleanup could extract both into a shared `whatsapp.module.ts`.
 */
@Injectable()
export class WhatsAppTemplatesService {
  private readonly logger = new Logger(WhatsAppTemplatesService.name);

  constructor(
    @InjectModel(WhatsAppTemplate.name, 'crmConnection')
    private readonly templateModel: Model<WhatsAppTemplateDocument>,
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<any>,
  ) {}

  private async getWhatsAppConfig(): Promise<{
    apiKey: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    provider?: 'meta' | 'aisensy';
    aisensyProjectId?: string;
    aisensyProjectApiPassword?: string;
  } | null> {
    const config = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .lean()
      .exec();
    if (!config?.apiKey || !config?.isActive) {
      return null;
    }
    const provider = config.provider === 'aisensy' ? 'aisensy' : 'meta';
    if (provider === 'meta' && !config.phoneNumberId) {
      return null;
    }
    return {
      apiKey: config.apiKey,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId
        ? String(config.businessAccountId)
        : undefined,
      provider,
      aisensyProjectId: config.aisensyProjectId
        ? String(config.aisensyProjectId)
        : undefined,
      aisensyProjectApiPassword: config.aisensyProjectApiPassword
        ? String(config.aisensyProjectApiPassword)
        : undefined,
    };
  }

  /** Extracts the sorted set of `{{n}}` placeholder numbers in a string. */
  private extractPlaceholders(text?: string): number[] {
    if (!text) return [];
    const matches = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
    return [...new Set(matches.map((m) => parseInt(m[1], 10)))].sort(
      (a, b) => a - b,
    );
  }

  /**
   * Meta requires: any component containing `{{n}}` placeholders must have
   * them sequential starting at 1 with no gaps, and must carry an `example`
   * with a matching number of values — otherwise template submission is
   * rejected outright. Validate this up front so authors get a clear error
   * before we ever call Meta.
   */
  private validateComponents(
    components: CreateWhatsAppTemplateDto['components'],
  ): void {
    if (!components?.length) {
      throw new BadRequestException('At least one component is required');
    }

    const bodyComponents = components.filter((c) => c.type === 'BODY');
    if (bodyComponents.length !== 1) {
      throw new BadRequestException(
        'Exactly one BODY component is required',
      );
    }
    if (!bodyComponents[0].text?.trim()) {
      throw new BadRequestException('BODY component text is required');
    }

    for (const component of components) {
      if (component.type === 'FOOTER' && component.text) {
        if (this.extractPlaceholders(component.text).length > 0) {
          throw new BadRequestException(
            'FOOTER text cannot contain {{n}} variables',
          );
        }
      }

      if (component.type === 'HEADER' || component.type === 'BODY') {
        const slots = this.extractPlaceholders(component.text);
        if (!slots.length) continue;

        const sequential = slots.every((n, idx) => n === idx + 1);
        if (!sequential) {
          throw new BadRequestException(
            `${component.type} variables must be sequential starting at {{1}} with no gaps (found: ${slots
              .map((n) => `{{${n}}}`)
              .join(', ')})`,
          );
        }

        const exampleValues =
          component.example?.body_text?.[0] ??
          component.example?.header_text ??
          [];
        if (!Array.isArray(exampleValues) || exampleValues.length !== slots.length) {
          throw new BadRequestException(
            `${component.type} has ${slots.length} variable(s) but is missing a matching "example" — Meta requires example values for every {{n}} placeholder`,
          );
        }
      }

      if (component.type === 'BUTTONS' && component.buttons) {
        if (component.buttons.length > 3) {
          throw new BadRequestException('A template supports at most 3 buttons');
        }
        for (const button of component.buttons) {
          if (button.type === 'URL' && !button.url) {
            throw new BadRequestException('URL buttons require a url');
          }
          if (button.type === 'PHONE_NUMBER' && !button.phone_number) {
            throw new BadRequestException(
              'PHONE_NUMBER buttons require a phone_number',
            );
          }
        }
      }
    }
  }

  async create(
    dto: CreateWhatsAppTemplateDto,
    userId?: string,
  ): Promise<WhatsAppTemplateDocument> {
    this.validateComponents(dto.components);

    const existing = await this.templateModel
      .findOne({ name: dto.name, language: dto.language })
      .exec();
    if (existing) {
      throw new ConflictException(
        `A template named "${dto.name}" already exists for language "${dto.language}"`,
      );
    }

    return this.templateModel.create({
      ...dto,
      status: 'DRAFT',
      source: 'local',
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
  }

  async findAll(filter: { status?: string } = {}): Promise<
    WhatsAppTemplateDocument[]
  > {
    const query: Record<string, any> = {};
    if (filter.status) query.status = filter.status;
    return this.templateModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findOne(id: string): Promise<WhatsAppTemplateDocument> {
    const template = await this.templateModel.findById(id).exec();
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async update(
    id: string,
    dto: UpdateWhatsAppTemplateDto,
  ): Promise<WhatsAppTemplateDocument> {
    const template = await this.findOne(id);
    if (!['DRAFT', 'REJECTED'].includes(template.status)) {
      throw new ConflictException(
        `Cannot edit a template with status "${template.status}" — only DRAFT or REJECTED templates can be edited`,
      );
    }

    const merged = {
      name: dto.name ?? template.name,
      language: dto.language ?? template.language,
      category: dto.category ?? template.category,
      components: dto.components ?? template.components,
    } as CreateWhatsAppTemplateDto;
    this.validateComponents(merged.components);

    Object.assign(template, merged, {
      status: 'DRAFT',
      lastError: undefined,
      rejectionReason: undefined,
    });
    await template.save();
    return template;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const template = await this.findOne(id);
    if (!['DRAFT', 'REJECTED'].includes(template.status)) {
      throw new ConflictException(
        `Cannot delete a template with status "${template.status}" — only DRAFT or REJECTED templates can be deleted`,
      );
    }
    await this.templateModel.deleteOne({ _id: template._id }).exec();
    return { success: true };
  }

  /**
   * Records which AiSensy dashboard Campaign this template maps to. There's
   * no confirmed public AiSensy endpoint to create/submit a template or
   * check its approval status (see AiSensyClient's doc comment) — so this
   * is a manual mapping step, not a network call. A DRAFT template moving
   * into this state is nudged to PENDING so it doesn't look silently
   * unfinished; flip it to APPROVED yourself (via `setStatus`) once you've
   * confirmed in AiSensy's dashboard that the campaign is live.
   */
  async linkAiSensyCampaign(
    id: string,
    aisensyCampaignName: string,
  ): Promise<WhatsAppTemplateDocument> {
    const name = String(aisensyCampaignName || '').trim();
    if (!name) {
      throw new BadRequestException('aisensyCampaignName is required');
    }
    const template = await this.findOne(id);
    template.aisensyCampaignName = name;
    template.source = 'aisensy';
    if (template.status === 'DRAFT') template.status = 'PENDING';
    template.lastError = undefined;
    await template.save();
    return template;
  }

  /**
   * Manually flips a template's status — used for the `aisensy` source
   * where approval happens in AiSensy's own dashboard and can't be polled
   * via API, so the operator confirms it here instead of an automated sync.
   */
  async setStatus(
    id: string,
    status: WhatsAppTemplateStatus,
  ): Promise<WhatsAppTemplateDocument> {
    const template = await this.findOne(id);
    template.status = status;
    if (status === 'APPROVED' && !template.approvedAt) {
      template.approvedAt = new Date();
    }
    await template.save();
    return template;
  }

  /** Submit a local draft to Meta for review via the message_templates create endpoint. */
  async submit(id: string): Promise<WhatsAppTemplateDocument> {
    const template = await this.findOne(id);
    if (!['DRAFT', 'REJECTED'].includes(template.status)) {
      throw new ConflictException(
        `Template already submitted (status: "${template.status}")`,
      );
    }

    const config = await this.getWhatsAppConfig();
    if (!config) {
      throw new BadRequestException('WhatsApp integration is not configured or inactive');
    }

    if (config.provider === 'aisensy') {
      if (!config.aisensyProjectId || !config.aisensyProjectApiPassword) {
        throw new BadRequestException(
          "AiSensy Project ID and Project API Password are required to submit templates. Add them in Settings → Integrations → WhatsApp.",
        );
      }

      // Map local template to AiSensy wa_template POST payload
      const bodyComp = template.components.find((c: any) => String(c.type).toUpperCase() === 'BODY');
      const text = bodyComp?.text || '';
      const examples = bodyComp?.example?.body_text?.[0] || [];
      const fallbackExamples = [
        'John Doe',
        'Meadows Villa',
        'August 25',
        '11:00 AM',
        'representative',
        '2Bigha Services',
      ];
      let sample_text = text;
      const matches = text.match(/\{\{\s*\d+\s*\}\}/g) || [];
      for (const match of matches) {
        const num = parseInt(match.replace(/\D/g, ''), 10);
        const val = examples[num - 1] || fallbackExamples[num - 1] || 'value';
        sample_text = sample_text.replace(match, `[${val}]`);
      }

      const headerComp = template.components.find((c: any) => String(c.type).toUpperCase() === 'HEADER');
      const footerComp = template.components.find((c: any) => String(c.type).toUpperCase() === 'FOOTER');
      const buttonsComp = template.components.find((c: any) => String(c.type).toUpperCase() === 'BUTTONS');

      let type = 'TEXT';
      let header_type: string | undefined = undefined;
      if (headerComp) {
        const format = String(headerComp.format || '').toUpperCase();
        if (format === 'IMAGE') {
          type = 'IMAGE';
          header_type = 'IMAGE';
        } else if (format === 'VIDEO') {
          type = 'VIDEO';
          header_type = 'VIDEO';
        } else if (format === 'DOCUMENT') {
          type = 'FILE';
          header_type = 'VIDEO';
        } else if (format === 'TEXT') {
          header_type = 'TEXT';
        }
      }

      let languageMap: Record<string, string> = {
        'en': 'English',
        'en_us': 'English',
        'en_gb': 'English',
        'hi': 'Hindi',
        'es': 'Spanish',
        'pt': 'Portuguese',
      };
      const langKey = String(template.language || '').toLowerCase().replace('_', '-');
      const langName = languageMap[langKey] || languageMap[langKey.split('-')[0]] || 'English';

      const category = String(template.category || 'MARKETING').toUpperCase();

      let message_action_type: string | undefined = undefined;
      let call_to_action: any[] | undefined = undefined;
      let quick_replies: string[] | undefined = undefined;

      if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
        const btns = buttonsComp.buttons;
        const hasUrlOrPhone = btns.some((b: any) => ['URL', 'PHONE_NUMBER'].includes(String(b.type).toUpperCase()));
        const hasQuickReply = btns.some((b: any) => String(b.type).toUpperCase() === 'QUICK_REPLY');

        if (hasUrlOrPhone && hasQuickReply) {
          message_action_type = 'All';
        } else if (hasUrlOrPhone) {
          message_action_type = 'CTA';
        } else if (hasQuickReply) {
          message_action_type = 'QuickReplies';
        }

        if (hasUrlOrPhone) {
          call_to_action = btns
            .filter((b: any) => ['URL', 'PHONE_NUMBER'].includes(String(b.type).toUpperCase()))
            .map((b: any) => ({
              type: String(b.type).toUpperCase() === 'PHONE_NUMBER' ? 'Phone Number' : 'URL',
              button_title: b.text || 'Action',
              button_value: b.url || b.phoneNumber || b.phone_number || '',
            }));
        }
        if (hasQuickReply) {
          quick_replies = btns
            .filter((b: any) => String(b.type).toUpperCase() === 'QUICK_REPLY')
            .map((b: any) => b.text || 'Reply');
        }
      }

      const payload: any = {
        label: template.name,
        category,
        type,
        language: langName,
        name: template.name,
        text,
        sample_text,
      };

      if (header_type) payload.header_type = header_type;
      if (headerComp?.text && header_type === 'TEXT') payload.header_text = headerComp.text;
      if (footerComp?.text) payload.footer_text = footerComp.text;
      if (message_action_type) payload.message_action_type = message_action_type;
      if (call_to_action) payload.call_to_action = call_to_action;
      if (quick_replies) payload.quick_replies = quick_replies;
      console.log('AiSensy Submit Payload:', JSON.stringify(payload, null, 2));
      try {
        const res = await fetch(
          `https://apis.aisensy.com/project-apis/v1/project/${config.aisensyProjectId}/wa_template`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-AiSensy-Project-API-Pwd': config.aisensyProjectApiPassword || '',
            },
            body: JSON.stringify(payload),
          },
        );

        const data: any = await res.json().catch(() => ({}));

        if (!res.ok) {
          const errorMessage =
            data?.message ||
            data?.error ||
            'Failed to submit template to AiSensy';
          this.logger.error(`AiSensy template submit failed: ${JSON.stringify(data)}`);
          template.status = 'REJECTED';
          template.lastError = errorMessage;
          await template.save();
          throw new BadRequestException(errorMessage);
        }

        template.status = 'PENDING';
        template.aisensyCampaignName = template.name;
        template.submittedAt = new Date();
        template.lastError = undefined;
        await template.save();
        return template;
      } catch (e: any) {
        this.logger.error(`AiSensy template submit error: ${e?.message}`);
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException(e?.message || 'AiSensy submit failed');
      }
    }

    if (!config.businessAccountId) {
      throw new BadRequestException(
        'Business Account ID (WABA) is required to submit templates. Add it in WhatsApp integration settings.',
      );
    }

    try {
      const res = await fetch(
        `${META_API}/${config.businessAccountId}/message_templates`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: template.name,
            language: template.language,
            category: template.category,
            components: template.components,
          }),
        },
      );
      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMessage =
          data?.error?.message ||
          data?.error?.error_user_msg ||
          'Failed to submit template to Meta';
        this.logger.error(`WhatsApp template submit failed: ${JSON.stringify(data)}`);
        template.status = 'REJECTED';
        template.lastError = errorMessage;
        await template.save();
        throw new BadRequestException(errorMessage);
      }

      template.status = data?.status ? String(data.status) as any : 'PENDING';
      template.metaTemplateId = data?.id ? String(data.id) : template.metaTemplateId;
      template.submittedAt = new Date();
      template.lastError = undefined;
      await template.save();
      return template;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(`WhatsApp template submit error: ${e?.message}`);
      template.status = 'REJECTED';
      template.lastError = e?.message || 'Failed to submit template';
      await template.save();
      throw new BadRequestException(template.lastError);
    }
  }

  /**
   * Pull the latest status/quality info for every template from Meta and
   * upsert into this collection — matched by `metaTemplateId` when known,
   * else by `(name, language)` (Meta's own uniqueness rule). Also picks up
   * templates that exist on Meta but weren't authored through this module
   * (e.g. created directly in Business Manager) and records them as
   * `source: 'meta'` so the merged list stays complete.
   *
   * This is intentionally a separate sync path from
   * `WhatsAppService.syncTemplates()` (which still feeds the older settings
   * page / inbox template picker via `Integration.templates`) — see the
   * class-level doc comment.
   */
  async syncStatuses(): Promise<{
    success: boolean;
    synced?: number;
    error?: string;
  }> {
    const config = await this.getWhatsAppConfig();
    if (!config) {
      return { success: false, error: 'WhatsApp not configured or inactive' };
    }
    if (config.provider === 'aisensy') {
      return {
        success: false,
        error:
          "AiSensy doesn't expose a public template-list API — manage & approve templates in the AiSensy dashboard, then map each one to a Campaign name under Settings → WhatsApp templates.",
      };
    }
    if (!config.businessAccountId) {
      return {
        success: false,
        error:
          'Business Account ID (WABA) is required to sync templates. Add it in WhatsApp integration settings.',
      };
    }

    try {
      let synced = 0;
      let url: string | null =
        `${META_API}/${config.businessAccountId}/message_templates` +
        `?fields=name,status,language,category,components,id,quality_score,rejected_reason&limit=100`;

      while (url) {
        const res: Response = await fetch(url, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errorMessage =
            data?.error?.message ||
            data?.error?.error_user_msg ||
            'Failed to sync template statuses from Meta';
          this.logger.error(`WhatsApp template sync failed: ${JSON.stringify(data)}`);
          return { success: false, error: errorMessage };
        }

        const page = Array.isArray(data?.data) ? data.data : [];
        for (const row of page) {
          const metaId = row.id ? String(row.id) : undefined;
          const name = String(row.name || '');
          const language = String(row.language || '');
          const status = String(row.status || 'PENDING');
          const matchFilter = metaId
            ? { metaTemplateId: metaId }
            : { name, language };

          const existing = await this.templateModel.findOne(matchFilter).exec();
          const wasApproved = existing?.status === 'APPROVED';

          await this.templateModel.updateOne(
            matchFilter,
            {
              $set: {
                name,
                language,
                category: row.category || existing?.category || 'UTILITY',
                components: Array.isArray(row.components)
                  ? row.components
                  : existing?.components || [],
                status,
                metaTemplateId: metaId,
                rejectionReason: row.rejected_reason || undefined,
                qualityScore: row.quality_score?.score || undefined,
                lastSyncedAt: new Date(),
                ...(status === 'APPROVED' && !wasApproved
                  ? { approvedAt: new Date() }
                  : {}),
                ...(existing ? {} : { source: 'meta' }),
              },
            },
            { upsert: true },
          );
          synced += 1;
        }

        url = data?.paging?.next ? String(data.paging.next) : null;
      }

      return { success: true, synced };
    } catch (e: any) {
      this.logger.error(`WhatsApp template sync error: ${e?.message}`);
      return { success: false, error: e?.message || 'Failed to sync templates' };
    }
  }
}
