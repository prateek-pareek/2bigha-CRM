import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { EmailIntelligenceService } from './email-intelligence.service';
import { UpdateEmailIntelligenceSettingsDto } from './dto/update-email-intelligence-settings.dto';
import { LinkedinFinderDto } from './dto/linkedin-finder.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { WebsiteEmailExtractorDto } from './dto/website-email-extractor.dto';
import { WebsiteEmailExtractorService } from './website-email-extractor.service';

@Controller('crm/email-intelligence')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmailIntelligenceController {
  constructor(
    private readonly emailIntelligenceService: EmailIntelligenceService,
    private readonly websiteEmailExtractorService: WebsiteEmailExtractorService,
  ) {}

  @Get('status')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
    'settings:read',
    'settings:write',
  )
  getStatus() {
    return this.emailIntelligenceService.getStatus();
  }

  @Get('settings')
  @Permissions('settings:read', 'settings:write')
  getSettings() {
    return this.emailIntelligenceService.getSettings();
  }

  @Put('settings')
  @Permissions('settings:write')
  saveSettings(@Body() dto: UpdateEmailIntelligenceSettingsDto) {
    return this.emailIntelligenceService.saveSettings(dto);
  }

  @Post('linkedin')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
  )
  linkedinFinder(@Body() dto: LinkedinFinderDto) {
    return this.emailIntelligenceService.linkedinFinder(dto.url, {
      enrichMobile: dto.enrichMobile,
      full: dto.full,
      providerId: dto.providerId,
    });
  }

  @Post('verify')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
  )
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailIntelligenceService.verifyEmail(dto.email, {
      enrichMobile: dto.enrichMobile,
      providerId: dto.providerId,
    });
  }

  @Post('website-emails')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
  )
  extractWebsiteEmails(@Body() dto: WebsiteEmailExtractorDto) {
    return this.websiteEmailExtractorService.extractFromWebsite(dto.url, {
      crawlContactPages: dto.crawlContactPages,
    });
  }
}

/** Backward-compatible routes for earlier email-finder integration. */
@Controller('crm/email-finder')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmailFinderLegacyController {
  constructor(private readonly emailIntelligenceService: EmailIntelligenceService) {}

  @Get('status')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
    'settings:read',
    'settings:write',
  )
  async legacyStatus() {
    const status = await this.emailIntelligenceService.getStatus();
    const linkedin = status.capabilities.linkedinFinder;
    return {
      available: linkedin.available,
      configured: linkedin.providerIds.length > 0,
      isActive: linkedin.available,
      capabilities: status.capabilities,
    };
  }

  @Get('settings')
  @Permissions('settings:read', 'settings:write')
  async legacySettings() {
    const { providers } = await this.emailIntelligenceService.getSettings();
    const tomba = providers.find((p) => p.id === 'tomba');
    return {
      isActive: !!tomba?.enabled,
      apiKey: tomba?.apiKey ?? '',
      hasApiSecret: !!tomba?.hasApiSecret,
      configured: !!tomba?.configured,
      providers,
    };
  }

  @Put('settings')
  @Permissions('settings:write')
  legacySave(
    @Body()
    body: {
      apiKey?: string;
      apiSecret?: string;
      isActive?: boolean;
    },
  ) {
    return this.emailIntelligenceService.saveSettings({
      providers: {
        tomba: {
          enabled: body.isActive,
          apiKey: body.apiKey,
          apiSecret: body.apiSecret,
          capabilities: {
            linkedinFinder: true,
            emailVerifier: true,
          },
        },
      },
    });
  }

  @Post('linkedin')
  @Permissions(
    'leads:read',
    'leads:write',
    'contacts:read',
    'contacts:write',
  )
  legacyLinkedin(@Body() dto: LinkedinFinderDto) {
    return this.emailIntelligenceService.linkedinFinder(dto.url, {
      enrichMobile: dto.enrichMobile,
      full: dto.full,
    });
  }
}
