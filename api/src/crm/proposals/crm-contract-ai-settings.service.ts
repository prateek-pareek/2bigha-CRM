import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CrmContractAiSettings,
  CrmContractAiSettingsDocument,
} from '../schemas/crm-contract-ai-settings.schema';
import { UpdateCrmContractAiSettingsDto } from './dto/update-crm-contract-ai-settings.dto';
import { CrmProposalAiSettingsService } from './crm-proposal-ai-settings.service';
import { CrmOutreachAiSettingsService } from '../ai/crm-outreach-ai-settings.service';
import {
  applyMathionixContractAgencyFallbacks,
  DEFAULT_CONTRACT_SECTION_OUTLINE,
  MATHIONIX_SEED_CONTRACT_AGENCY,
  MATHIONIX_SEED_CONTRACT_FREELANCER,
} from '../ai/crm-contract-mathionix-defaults.util';
import { isAnyLlmProviderConfigured } from '../../integrations/llm/llm-config.service';

@Injectable()
export class CrmContractAiSettingsService {
  private static readonly DOC_KEY = 'default';

  constructor(
    @InjectModel(CrmContractAiSettings.name, 'crmConnection')
    private readonly model: Model<CrmContractAiSettingsDocument>,
    private readonly proposalAiSettings: CrmProposalAiSettingsService,
    private readonly outreachAiSettings: CrmOutreachAiSettingsService,
  ) {}

  async getOrCreate(): Promise<CrmContractAiSettingsDocument> {
    let doc = await this.model
      .findOne({ key: CrmContractAiSettingsService.DOC_KEY })
      .exec();
    if (!doc) {
      doc = await this.model.create({
        key: CrmContractAiSettingsService.DOC_KEY,
        enabled: true,
        defaultIssuerProfile: 'agency',
        useSharedProposalContext: true,
        tonePreset: 'formal',
        ...MATHIONIX_SEED_CONTRACT_AGENCY,
        ...MATHIONIX_SEED_CONTRACT_FREELANCER,
        contractSectionOutline: DEFAULT_CONTRACT_SECTION_OUTLINE,
      });
    }
    return doc;
  }

  private docToRecord(o: Record<string, unknown>): Record<string, unknown> {
    return {
      enabled: o.enabled !== false,
      defaultIssuerProfile:
        o.defaultIssuerProfile === 'freelancer' ? 'freelancer' : 'agency',
      useSharedProposalContext: o.useSharedProposalContext !== false,
      agencyLegalName: String(o.agencyLegalName || ''),
      agencyRegisteredAddress: String(o.agencyRegisteredAddress || ''),
      agencySignatoryName: String(o.agencySignatoryName || ''),
      agencySignatoryTitle: String(o.agencySignatoryTitle || ''),
      agencyGstOrReg: String(o.agencyGstOrReg || ''),
      agencyStandardClauses: String(o.agencyStandardClauses || ''),
      freelancerLegalName: String(o.freelancerLegalName || ''),
      freelancerAddress: String(o.freelancerAddress || ''),
      freelancerIdDocument: String(o.freelancerIdDocument || ''),
      freelancerStandardClauses: String(o.freelancerStandardClauses || ''),
      governingLaw: String(o.governingLaw || ''),
      contractSectionOutline: String(
        o.contractSectionOutline || DEFAULT_CONTRACT_SECTION_OUTLINE,
      ),
      tonePreset: String(o.tonePreset || 'formal'),
      mustInclude: String(o.mustInclude || ''),
      mustAvoid: String(o.mustAvoid || ''),
      additionalContext: String(o.additionalContext || ''),
    };
  }

  async getEffectiveForPrompt(): Promise<Record<string, unknown>> {
    const doc = await this.getOrCreate();
    let base = this.docToRecord(doc.toObject() as Record<string, unknown>);

    if (base.useSharedProposalContext) {
      try {
        const proposal = await this.proposalAiSettings.getEffectiveForPrompt();
        if (!base.agencyLegalName && proposal.agencyName) {
          base.agencyLegalName = proposal.agencyName;
        }
        if (!base.agencyRegisteredAddress && proposal.agencyIntro) {
          base.agencyRegisteredAddress = `[See company intro: ${String(proposal.agencyIntro).slice(0, 200)}…]`;
        }
        if (!base.freelancerLegalName && proposal.freelancerName) {
          base.freelancerLegalName = proposal.freelancerName;
        }
        if (!base.mustInclude && proposal.mustInclude) {
          base.mustInclude = proposal.mustInclude;
        }
        if (!base.mustAvoid && proposal.mustAvoid) {
          base.mustAvoid = proposal.mustAvoid;
        }
      } catch {
        /* optional */
      }
    }

    return applyMathionixContractAgencyFallbacks(base);
  }

  async getEffectiveForPromptSafe(): Promise<Record<string, unknown>> {
    try {
      return await this.getEffectiveForPrompt();
    } catch {
      return applyMathionixContractAgencyFallbacks(
        this.docToRecord({
          enabled: true,
          defaultIssuerProfile: 'agency',
          useSharedProposalContext: true,
          tonePreset: 'formal',
          ...MATHIONIX_SEED_CONTRACT_AGENCY,
          ...MATHIONIX_SEED_CONTRACT_FREELANCER,
          contractSectionOutline: DEFAULT_CONTRACT_SECTION_OUTLINE,
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
      let proposalEnabled = true;
      let outreachEnabled = true;
      try {
        const [proposal, outreach] = await Promise.all([
          this.proposalAiSettings.getEffectiveForPromptSafe(),
          this.outreachAiSettings.getEffectiveForPromptSafe(),
        ]);
        proposalEnabled = proposal.enabled !== false;
        outreachEnabled = outreach.enabled !== false;
      } catch {
        proposalEnabled = true;
        outreachEnabled = true;
      }
      return {
        ...this.docToRecord(o as Record<string, unknown>),
        updatedAt: o.updatedAt,
        apiKeyConfigured,
        contractDraftAvailable:
          apiKeyConfigured && enabled && proposalEnabled && outreachEnabled,
        settingsPersisted: true,
      };
    } catch {
      return {
        ...applyMathionixContractAgencyFallbacks(
          this.docToRecord({
            enabled: true,
            defaultIssuerProfile: 'agency',
            useSharedProposalContext: true,
            tonePreset: 'formal',
            ...MATHIONIX_SEED_CONTRACT_AGENCY,
            ...MATHIONIX_SEED_CONTRACT_FREELANCER,
          }),
        ),
        updatedAt: undefined,
        apiKeyConfigured,
        contractDraftAvailable: apiKeyConfigured,
        settingsPersisted: false,
      };
    }
  }

  async applyMathionixDefaults() {
    await this.getOrCreate();
    await this.model
      .findOneAndUpdate(
        { key: CrmContractAiSettingsService.DOC_KEY },
        {
          $set: {
            ...MATHIONIX_SEED_CONTRACT_AGENCY,
            ...MATHIONIX_SEED_CONTRACT_FREELANCER,
          },
        },
        { new: true },
      )
      .exec();
    return this.getPublicDto();
  }

  async update(dto: UpdateCrmContractAiSettingsDto) {
    try {
      await this.getOrCreate();
    } catch {
      return { ...(await this.getPublicDto()), saveFailed: true as const };
    }

    const patch: Record<string, unknown> = {};
    const fields: (keyof UpdateCrmContractAiSettingsDto)[] = [
      'enabled',
      'defaultIssuerProfile',
      'useSharedProposalContext',
      'agencyLegalName',
      'agencyRegisteredAddress',
      'agencySignatoryName',
      'agencySignatoryTitle',
      'agencyGstOrReg',
      'agencyStandardClauses',
      'freelancerLegalName',
      'freelancerAddress',
      'freelancerIdDocument',
      'freelancerStandardClauses',
      'governingLaw',
      'contractSectionOutline',
      'tonePreset',
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
            { key: CrmContractAiSettingsService.DOC_KEY },
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
