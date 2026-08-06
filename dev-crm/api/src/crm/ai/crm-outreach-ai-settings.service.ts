import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isAnyLlmProviderConfigured } from '../../integrations/llm/llm-config.service';
import {
  CrmOutreachAiSettings,
  CrmOutreachAiSettingsDocument,
} from '../schemas/crm-outreach-ai-settings.schema';
import { UpdateCrmOutreachAiSettingsDto } from '../dto/update-crm-outreach-ai-settings.dto';

/** Seeded when no document exists — tuned for IT consulting / tech services outreach. */
export const DEFAULT_IT_CONSULTING_SUMMARY =
  'We are an IT consulting and technology services firm. We help organizations with cloud strategy and migration, secure modern infrastructure, custom software and integrations, data platforms, DevOps maturity, and ongoing managed services. Outreach should sound competent and specific to technical and business buyers (e.g. CIOs, CTOs, VPs Engineering)—credible, outcome-oriented, and free of vague buzzwords. Do not invent certifications, client logos, or metrics that are not supplied in the CRM context.';

@Injectable()
export class CrmOutreachAiSettingsService {
  private static readonly DOC_KEY = 'default';

  constructor(
    @InjectModel(CrmOutreachAiSettings.name, 'crmConnection')
    private readonly model: Model<CrmOutreachAiSettingsDocument>,
  ) {}

  async getOrCreate(): Promise<CrmOutreachAiSettingsDocument> {
    let doc = await this.model
      .findOne({ key: CrmOutreachAiSettingsService.DOC_KEY })
      .exec();
    if (!doc) {
      doc = await this.model.create({
        key: CrmOutreachAiSettingsService.DOC_KEY,
        enabled: true,
        businessSummary: DEFAULT_IT_CONSULTING_SUMMARY,
        tonePreset: 'consultative',
      });
    }
    return doc;
  }

  /** Plain object for AI prompt building (no Mongoose internals). */
  async getEffectiveForPrompt(): Promise<Record<string, unknown>> {
    const doc = await this.getOrCreate();
    const o = doc.toObject();
    return {
      enabled: o.enabled,
      businessName: o.businessName || '',
      businessSummary: o.businessSummary || DEFAULT_IT_CONSULTING_SUMMARY,
      servicesOffered: o.servicesOffered || '',
      idealClientProfile: o.idealClientProfile || '',
      tonePreset: o.tonePreset || 'consultative',
      signatureOrClosing: o.signatureOrClosing || '',
      mustMention: o.mustMention || '',
      avoidSaying: o.avoidSaying || '',
      additionalSystemContext: o.additionalSystemContext || '',
      anthropicModel: (o.llmModel || o.anthropicModel || '').trim(),
      llmModel: (o.llmModel || o.anthropicModel || '').trim(),
      llmProvider: (o.llmProvider || 'auto').trim(),
    };
  }

  /** Defaults when DB is unavailable — never throws; AI still works if API key is set. */
  private buildPromptFallback(): Record<string, unknown> {
    return {
      enabled: true,
      businessName: '',
      businessSummary: DEFAULT_IT_CONSULTING_SUMMARY,
      servicesOffered: '',
      idealClientProfile: '',
      tonePreset: 'consultative',
      signatureOrClosing: '',
      mustMention: '',
      avoidSaying: '',
      additionalSystemContext: '',
      anthropicModel: (process.env.AI_LLM_MODEL || process.env.ANTHROPIC_MODEL || '').trim(),
      llmModel: (process.env.AI_LLM_MODEL || process.env.ANTHROPIC_MODEL || '').trim(),
      llmProvider: process.env.AI_LLM_PROVIDER?.trim() || 'auto',
    };
  }

  /** Used by draft endpoint — never throws. */
  async getEffectiveForPromptSafe(): Promise<Record<string, unknown>> {
    try {
      return await this.getEffectiveForPrompt();
    } catch {
      return this.buildPromptFallback();
    }
  }

  /** Whether person-email draft can run (env + settings). Never throws. */
  async getDraftAvailability(): Promise<{
    apiKeyConfigured: boolean;
    enabledInSettings: boolean;
    personDraftAvailable: boolean;
  }> {
    const apiKeyConfigured = isAnyLlmProviderConfigured();
    const s = await this.getEffectiveForPromptSafe();
    const enabledInSettings = s.enabled !== false;
    return {
      apiKeyConfigured,
      enabledInSettings,
      personDraftAvailable: apiKeyConfigured && enabledInSettings,
    };
  }

  /** Safe for settings UI (no secrets). Never throws — missing env vars do not break the app. */
  async getPublicDto() {
    const apiKeyConfigured = isAnyLlmProviderConfigured();
    try {
      const doc = await this.getOrCreate();
      const o = doc.toObject();
      const enabled = o.enabled !== false;
      return {
        enabled: !!o.enabled,
        businessName: o.businessName || '',
        businessSummary: o.businessSummary || '',
        servicesOffered: o.servicesOffered || '',
        idealClientProfile: o.idealClientProfile || '',
        tonePreset: o.tonePreset || 'consultative',
        signatureOrClosing: o.signatureOrClosing || '',
        mustMention: o.mustMention || '',
        avoidSaying: o.avoidSaying || '',
        additionalSystemContext: o.additionalSystemContext || '',
        anthropicModel: (o.llmModel || o.anthropicModel || '').trim(),
        llmModel: (o.llmModel || o.anthropicModel || '').trim(),
        llmProvider: (o.llmProvider || 'auto').trim(),
        updatedAt: o.updatedAt,
        apiKeyConfigured,
        personDraftAvailable: apiKeyConfigured && enabled,
        settingsPersisted: true,
      };
    } catch {
      return {
        enabled: true,
        businessName: '',
        businessSummary: DEFAULT_IT_CONSULTING_SUMMARY,
        servicesOffered: '',
        idealClientProfile: '',
        tonePreset: 'consultative',
        signatureOrClosing: '',
        mustMention: '',
        avoidSaying: '',
        additionalSystemContext: '',
        anthropicModel: (process.env.AI_LLM_MODEL || process.env.ANTHROPIC_MODEL || '').trim(),
        llmModel: (process.env.AI_LLM_MODEL || process.env.ANTHROPIC_MODEL || '').trim(),
        llmProvider: process.env.AI_LLM_PROVIDER?.trim() || 'auto',
        updatedAt: undefined,
        apiKeyConfigured,
        personDraftAvailable: apiKeyConfigured,
        settingsPersisted: false,
      };
    }
  }

  async update(dto: UpdateCrmOutreachAiSettingsDto) {
    try {
      await this.getOrCreate();
    } catch {
      return { ...(await this.getPublicDto()), saveFailed: true as const };
    }
    const patch: Record<string, unknown> = {};
    if (dto.enabled !== undefined) patch.enabled = dto.enabled;
    if (dto.businessName !== undefined) patch.businessName = dto.businessName;
    if (dto.businessSummary !== undefined)
      patch.businessSummary = dto.businessSummary;
    if (dto.servicesOffered !== undefined)
      patch.servicesOffered = dto.servicesOffered;
    if (dto.idealClientProfile !== undefined)
      patch.idealClientProfile = dto.idealClientProfile;
    if (dto.tonePreset !== undefined) patch.tonePreset = dto.tonePreset;
    if (dto.signatureOrClosing !== undefined)
      patch.signatureOrClosing = dto.signatureOrClosing;
    if (dto.mustMention !== undefined) patch.mustMention = dto.mustMention;
    if (dto.avoidSaying !== undefined) patch.avoidSaying = dto.avoidSaying;
    if (dto.additionalSystemContext !== undefined)
      patch.additionalSystemContext = dto.additionalSystemContext;
    if (dto.anthropicModel !== undefined)
      patch.anthropicModel = dto.anthropicModel;
    if (dto.llmModel !== undefined) {
      patch.llmModel = dto.llmModel;
      patch.anthropicModel = dto.llmModel;
    }
    if (dto.llmProvider !== undefined) patch.llmProvider = dto.llmProvider;
    if (Object.keys(patch).length > 0) {
      try {
        await this.model
          .findOneAndUpdate(
            { key: CrmOutreachAiSettingsService.DOC_KEY },
            { $set: patch },
            { new: true },
          )
          .exec();
      } catch {
        return { ...(await this.getPublicDto()), saveFailed: true as const };
      }
    }
    return this.getPublicDto();
  }
}
