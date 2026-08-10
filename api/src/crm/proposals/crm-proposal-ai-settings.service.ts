import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CrmProposalAiSettings,
  CrmProposalAiSettingsDocument,
} from '../schemas/crm-proposal-ai-settings.schema';
import { UpdateCrmProposalAiSettingsDto } from './dto/update-crm-proposal-ai-settings.dto';
import { CrmOutreachAiSettingsService } from '../ai/crm-outreach-ai-settings.service';
import {
  applyMathionixAgencyFallbacks,
  MATHIONIX_AGENCY_INTRO,
  MATHIONIX_FREELANCER_PAYMENT_TERMS,
  MATHIONIX_SEED_AGENCY,
} from '../ai/crm-proposal-mathionix-defaults.util';
import { isAnyLlmProviderConfigured } from '../../integrations/llm/llm-config.service';

export const DEFAULT_AGENCY_INTRO = MATHIONIX_AGENCY_INTRO;

export const DEFAULT_FREELANCER_INTRO =
  'I am an independent IT consultant and full-stack developer focused on delivering high-quality software for startups and growing businesses. I work hands-on from discovery through deployment, with clear communication and predictable milestones.';

export const DEFAULT_SECTION_OUTLINE = `1. Introduction
2. Project overview
3. Scope of work
4. Commercials & pricing
5. Timeline & delivery milestones
6. Tech stack
7. Terms & responsibilities
8. Why work with us
9. Next steps`;

@Injectable()
export class CrmProposalAiSettingsService {
  private static readonly DOC_KEY = 'default';

  constructor(
    @InjectModel(CrmProposalAiSettings.name, 'crmConnection')
    private readonly model: Model<CrmProposalAiSettingsDocument>,
    private readonly outreachAiSettings: CrmOutreachAiSettingsService,
  ) {}

  async getOrCreate(): Promise<CrmProposalAiSettingsDocument> {
    let doc = await this.model
      .findOne({ key: CrmProposalAiSettingsService.DOC_KEY })
      .exec();
    if (!doc) {
      doc = await this.model.create({
        key: CrmProposalAiSettingsService.DOC_KEY,
        enabled: true,
        defaultIssuerProfile: 'agency',
        useSharedOutreachContext: true,
        freelancerIntro: DEFAULT_FREELANCER_INTRO,
        freelancerPaymentTerms: MATHIONIX_FREELANCER_PAYMENT_TERMS,
        sectionOutline: DEFAULT_SECTION_OUTLINE,
        tonePreset: 'consultative',
        ...MATHIONIX_SEED_AGENCY,
      });
    }
    return doc;
  }

  private docToPromptRecord(
    o: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      enabled: o.enabled !== false,
      defaultIssuerProfile:
        o.defaultIssuerProfile === 'freelancer' ? 'freelancer' : 'agency',
      useSharedOutreachContext: o.useSharedOutreachContext !== false,
      agencyName: String(o.agencyName || ''),
      agencyIntro: String(o.agencyIntro || DEFAULT_AGENCY_INTRO),
      agencyServices: String(o.agencyServices || ''),
      agencyDifferentiators: String(o.agencyDifferentiators || ''),
      agencyPaymentTerms: String(o.agencyPaymentTerms || ''),
      agencyTechStack: String(o.agencyTechStack || ''),
      agencyPortfolio: String(o.agencyPortfolio || ''),
      freelancerName: String(o.freelancerName || ''),
      freelancerIntro: String(o.freelancerIntro || DEFAULT_FREELANCER_INTRO),
      freelancerServices: String(o.freelancerServices || ''),
      freelancerDifferentiators: String(o.freelancerDifferentiators || ''),
      freelancerPaymentTerms: String(o.freelancerPaymentTerms || ''),
      freelancerTechStack: String(o.freelancerTechStack || ''),
      freelancerPortfolio: String(o.freelancerPortfolio || ''),
      tonePreset: String(o.tonePreset || 'consultative'),
      sectionOutline: String(o.sectionOutline || DEFAULT_SECTION_OUTLINE),
      mustInclude: String(o.mustInclude || ''),
      mustAvoid: String(o.mustAvoid || ''),
      additionalContext: String(o.additionalContext || ''),
    };
  }

  async getEffectiveForPrompt(): Promise<Record<string, unknown>> {
    const doc = await this.getOrCreate();
    const base = this.docToPromptRecord(doc.toObject() as Record<string, unknown>);

    if (base.useSharedOutreachContext) {
      try {
        const outreach = await this.outreachAiSettings.getEffectiveForPrompt();
        if (!base.agencyName && outreach.businessName) {
          base.agencyName = outreach.businessName;
        }
        if (!base.agencyServices && outreach.servicesOffered) {
          base.agencyServices = outreach.servicesOffered;
        }
        if (!base.agencyDifferentiators && outreach.businessSummary) {
          base.agencyDifferentiators = outreach.businessSummary;
        }
        if (!base.freelancerName && outreach.businessName) {
          base.freelancerName = outreach.businessName;
        }
        if (!base.freelancerServices && outreach.servicesOffered) {
          base.freelancerServices = outreach.servicesOffered;
        }
        if (!base.mustInclude && outreach.mustMention) {
          base.mustInclude = outreach.mustMention;
        }
        if (!base.mustAvoid && outreach.avoidSaying) {
          base.mustAvoid = outreach.avoidSaying;
        }
        if (!base.additionalContext && outreach.additionalSystemContext) {
          base.additionalContext = outreach.additionalSystemContext;
        }
      } catch {
        /* outreach settings optional */
      }
    }

    return applyMathionixAgencyFallbacks(base);
  }

  async applyMathionixDefaults(): Promise<Record<string, unknown>> {
    await this.getOrCreate();
    await this.model
      .findOneAndUpdate(
        { key: CrmProposalAiSettingsService.DOC_KEY },
        { $set: { ...MATHIONIX_SEED_AGENCY, freelancerPaymentTerms: MATHIONIX_FREELANCER_PAYMENT_TERMS } },
        { new: true },
      )
      .exec();
    return this.getPublicDto();
  }

  async getEffectiveForPromptSafe(): Promise<Record<string, unknown>> {
    try {
      return await this.getEffectiveForPrompt();
    } catch {
      return applyMathionixAgencyFallbacks(
        this.docToPromptRecord({
          enabled: true,
          defaultIssuerProfile: 'agency',
          useSharedOutreachContext: true,
          freelancerIntro: DEFAULT_FREELANCER_INTRO,
          freelancerPaymentTerms: MATHIONIX_FREELANCER_PAYMENT_TERMS,
          sectionOutline: DEFAULT_SECTION_OUTLINE,
          tonePreset: 'consultative',
          ...MATHIONIX_SEED_AGENCY,
        }),
      );
    }
  }

  async getPublicDto() {
    const apiKeyConfigured = isAnyLlmProviderConfigured();
    try {
      const doc = await this.getOrCreate();
      const o = doc.toObject();
      const enabled = o.enabled !== false;
      let outreachEnabled = true;
      try {
        const outreach = await this.outreachAiSettings.getEffectiveForPromptSafe();
        outreachEnabled = outreach.enabled !== false;
      } catch {
        outreachEnabled = true;
      }
      return {
        ...this.docToPromptRecord(o as Record<string, unknown>),
        updatedAt: o.updatedAt,
        apiKeyConfigured,
        proposalDraftAvailable: apiKeyConfigured && enabled && outreachEnabled,
        settingsPersisted: true,
      };
    } catch {
      return {
        ...this.docToPromptRecord({
          enabled: true,
          defaultIssuerProfile: 'agency',
          useSharedOutreachContext: true,
          agencyIntro: DEFAULT_AGENCY_INTRO,
          freelancerIntro: DEFAULT_FREELANCER_INTRO,
          sectionOutline: DEFAULT_SECTION_OUTLINE,
          tonePreset: 'consultative',
        }),
        updatedAt: undefined,
        apiKeyConfigured,
        proposalDraftAvailable: apiKeyConfigured,
        settingsPersisted: false,
      };
    }
  }

  async update(dto: UpdateCrmProposalAiSettingsDto) {
    try {
      await this.getOrCreate();
    } catch {
      return { ...(await this.getPublicDto()), saveFailed: true as const };
    }

    const patch: Record<string, unknown> = {};
    const fields: (keyof UpdateCrmProposalAiSettingsDto)[] = [
      'enabled',
      'defaultIssuerProfile',
      'useSharedOutreachContext',
      'agencyName',
      'agencyIntro',
      'agencyServices',
      'agencyDifferentiators',
      'agencyPaymentTerms',
      'agencyTechStack',
      'agencyPortfolio',
      'freelancerName',
      'freelancerIntro',
      'freelancerServices',
      'freelancerDifferentiators',
      'freelancerPaymentTerms',
      'freelancerTechStack',
      'freelancerPortfolio',
      'tonePreset',
      'sectionOutline',
      'mustInclude',
      'mustAvoid',
      'additionalContext',
    ];
    for (const key of fields) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }

    if (Object.keys(patch).length > 0) {
      try {
        await this.model
          .findOneAndUpdate(
            { key: CrmProposalAiSettingsService.DOC_KEY },
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
