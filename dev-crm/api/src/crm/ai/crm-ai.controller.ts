import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CrmAiService } from './crm-ai.service';
import { CrmOutreachAiSettingsService } from './crm-outreach-ai-settings.service';
import { CrmProposalAiSettingsService } from '../proposals/crm-proposal-ai-settings.service';
import { CrmContractAiSettingsService } from '../proposals/crm-contract-ai-settings.service';
import { UpdateCrmOutreachAiSettingsDto } from '../dto/update-crm-outreach-ai-settings.dto';
import { UpdateCrmProposalAiSettingsDto } from '../dto/update-crm-proposal-ai-settings.dto';
import { UpdateCrmContractAiSettingsDto } from '../dto/update-crm-contract-ai-settings.dto';

@Controller('crm/ai')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmAiController {
  constructor(
    private readonly crmAiService: CrmAiService,
    private readonly outreachAiSettingsService: CrmOutreachAiSettingsService,
    private readonly proposalAiSettingsService: CrmProposalAiSettingsService,
    private readonly contractAiSettingsService: CrmContractAiSettingsService,
  ) {}

  @Get('settings')
  @Permissions('settings:read', 'settings:write')
  getOutreachAiSettings() {
    return this.outreachAiSettingsService.getPublicDto();
  }

  /** Lets the email composer hide “Draft with AI” when no API key — never requires env to be set. */
  @Get('status')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
    'workflows:write',
    'settings:read',
    'settings:write',
  )
  async getAiStatus() {
    const outreach = await this.outreachAiSettingsService.getDraftAvailability();
    const [proposal, contract] = await Promise.all([
      this.proposalAiSettingsService.getPublicDto(),
      this.contractAiSettingsService.getPublicDto(),
    ]);
    return {
      ...outreach,
      proposalDraftAvailable: !!proposal.proposalDraftAvailable,
      proposalEnabledInSettings: (proposal as { enabled?: boolean }).enabled !== false,
      contractDraftAvailable: !!contract.contractDraftAvailable,
      contractEnabledInSettings: (contract as { enabled?: boolean }).enabled !== false,
    };
  }

  @Get('proposal-settings')
  @Permissions('settings:read', 'settings:write', 'proposals:read')
  getProposalAiSettings() {
    return this.proposalAiSettingsService.getPublicDto();
  }

  @Patch('proposal-settings')
  @Permissions('settings:write')
  patchProposalAiSettings(@Body() body: UpdateCrmProposalAiSettingsDto) {
    return this.proposalAiSettingsService.update(body);
  }

  @Post('proposal-settings/apply-mathionix-defaults')
  @Permissions('settings:write')
  applyMathionixProposalDefaults() {
    return this.proposalAiSettingsService.applyMathionixDefaults();
  }

  @Get('contract-settings')
  @Permissions('settings:read', 'settings:write', 'proposals:read')
  getContractAiSettings() {
    return this.contractAiSettingsService.getPublicDto();
  }

  @Patch('contract-settings')
  @Permissions('settings:write')
  patchContractAiSettings(@Body() body: UpdateCrmContractAiSettingsDto) {
    return this.contractAiSettingsService.update(body);
  }

  @Post('contract-settings/apply-mathionix-defaults')
  @Permissions('settings:write')
  applyMathionixContractDefaults() {
    return this.contractAiSettingsService.applyMathionixDefaults();
  }

  @Post('draft-contract')
  @Permissions(
    'leads:write',
    'contacts:write',
    'deals:write',
    'platform-opportunities:write',
    'proposals:write',
  )
  draftContract(
    @Request() req: any,
    @Body()
    body: {
      module?: string;
      entityId?: string;
      issuerProfile?: 'agency' | 'freelancer';
      clientNeeds?: string;
      instructions?: string;
      contractType?: string;
    },
  ) {
    const mod = String(body.module || '')
      .trim()
      .toLowerCase();
    const allowed = [
      'leads',
      'contacts',
      'deals',
      'platform-opportunities',
    ] as const;
    if (!allowed.includes(mod as (typeof allowed)[number])) {
      throw new BadRequestException(
        'module must be "leads", "contacts", "deals", or "platform-opportunities"',
      );
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    return this.crmAiService.draftContractFromRecord(
      req.user,
      mod as (typeof allowed)[number],
      entityId,
      {
        issuerProfile: body.issuerProfile,
        clientNeeds: body.clientNeeds,
        instructions: body.instructions,
        contractType: body.contractType,
      },
    );
  }

  @Patch('settings')
  @Permissions('settings:write')
  patchOutreachAiSettings(@Body() body: UpdateCrmOutreachAiSettingsDto) {
    return this.outreachAiSettingsService.update(body);
  }

  /**
   * Generate a draft subject + HTML body for outreach to a lead or contact,
   * using record fields, custom fields, LinkedIn post metadata, and CRM AI outreach settings.
   */
  @Post('check-outreach-context')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
    'workflows:write',
  )
  checkOutreachContext(
    @Request() req: any,
    @Body()
    body: {
      module?: string;
      entityId?: string;
      requiredContextFields?: string[];
      missingContextAction?: 'skip' | 'draft_anyway' | 'create_task';
    },
  ) {
    const mod = String(body.module || '')
      .trim()
      .toLowerCase();
    if (mod !== 'leads' && mod !== 'contacts') {
      throw new BadRequestException('module must be "leads" or "contacts"');
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    return this.crmAiService.checkPersonOutreachContext(
      req.user,
      mod as 'leads' | 'contacts',
      entityId,
      {
        requiredContextFields: body.requiredContextFields as never,
        missingContextAction: body.missingContextAction,
      },
    );
  }

  @Post('draft-person-email')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
    'workflows:write',
  )
  draftPersonEmail(
    @Request() req: any,
    @Body()
    body: {
      module?: string;
      entityId?: string;
      instructions?: string;
      requiredContextFields?: string[];
      missingContextAction?: 'skip' | 'draft_anyway' | 'create_task';
      skipContextCheck?: boolean;
    },
  ) {
    const mod = String(body.module || '')
      .trim()
      .toLowerCase();
    if (mod !== 'leads' && mod !== 'contacts') {
      throw new BadRequestException('module must be "leads" or "contacts"');
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    return this.crmAiService.draftPersonOutreachEmail(
      req.user,
      mod as 'leads' | 'contacts',
      entityId,
      body.instructions,
      {
        requiredContextFields: body.requiredContextFields as never,
        missingContextAction: body.missingContextAction,
        skipContextCheck: body.skipContextCheck === true,
      },
    );
  }

  /** Generate a short personalized X/Twitter cold-DM (manual copy + send on X). */
  @Post('draft-person-x-dm')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
    'workflows:write',
  )
  draftPersonXDm(
    @Request() req: any,
    @Body()
    body: {
      module?: string;
      entityId?: string;
      instructions?: string;
    },
  ) {
    const mod = String(body.module || '')
      .trim()
      .toLowerCase();
    if (mod !== 'leads' && mod !== 'contacts') {
      throw new BadRequestException('module must be "leads" or "contacts"');
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    return this.crmAiService.draftPersonOutreachXDm(
      req.user,
      mod as 'leads' | 'contacts',
      entityId,
      body.instructions,
    );
  }

  @Post('draft-proposal')
  @Permissions(
    'leads:write',
    'contacts:write',
    'deals:write',
    'platform-opportunities:write',
    'proposals:write',
  )
  draftProposal(
    @Request() req: any,
    @Body()
    body: {
      module?: string;
      entityId?: string;
      issuerProfile?: 'agency' | 'freelancer';
      kind?: 'proposal' | 'quotation';
      clientNeeds?: string;
      instructions?: string;
    },
  ) {
    const mod = String(body.module || '')
      .trim()
      .toLowerCase();
    const allowed = [
      'leads',
      'contacts',
      'deals',
      'platform-opportunities',
    ] as const;
    if (!allowed.includes(mod as (typeof allowed)[number])) {
      throw new BadRequestException(
        'module must be "leads", "contacts", "deals", or "platform-opportunities"',
      );
    }
    const entityId = String(body.entityId || '').trim();
    if (!entityId) {
      throw new BadRequestException('entityId is required');
    }
    return this.crmAiService.draftProposalFromRecord(
      req.user,
      mod as (typeof allowed)[number],
      entityId,
      {
        issuerProfile: body.issuerProfile,
        kind: body.kind,
        clientNeeds: body.clientNeeds,
        instructions: body.instructions,
      },
    );
  }

  @Post('draft-reply-email')
  @Permissions('leads:write', 'contacts:write')
  draftReplyEmail(
    @Request() req: any,
    @Body()
    body: {
      inboxEmailId?: string;
      instructions?: string;
    },
  ) {
    const inboxEmailId = String(body.inboxEmailId || '').trim();
    if (!inboxEmailId) {
      throw new BadRequestException('inboxEmailId is required');
    }
    return this.crmAiService.draftInboxFollowUpReplyEmail(
      req.user,
      inboxEmailId,
      body.instructions,
    );
  }

  @Post('draft-client-portal-update')
  @Permissions('clients:write', 'deals:write')
  draftClientPortalUpdate(
    @Request() req: any,
    @Body()
    body: {
      dealId?: string;
      cadence?: 'daily' | 'weekly' | 'general';
      instructions?: string;
      lookbackHours?: number;
    },
  ) {
    const dealId = String(body?.dealId || '').trim();
    if (!dealId) {
      throw new BadRequestException('dealId is required');
    }
    return this.crmAiService.draftClientPortalUpdate(req.user, dealId, {
      cadence: body?.cadence,
      instructions: body?.instructions,
      lookbackHours:
        typeof body?.lookbackHours === 'number' ? body.lookbackHours : undefined,
    });
  }
}
