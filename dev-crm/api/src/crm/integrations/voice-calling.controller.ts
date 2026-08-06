import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { VoiceCallingService } from './voice-calling.service';
import type { InitiateVoiceCallDto, VoiceCallingConfig } from './voice-calling.types';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class VoiceCallingController {
  constructor(private readonly voiceCallingService: VoiceCallingService) {}

  @Get('integrations/voice')
  @Permissions('settings:write')
  getConfig() {
    return this.voiceCallingService.getConfig();
  }

  @Post('integrations/voice')
  @Permissions('settings:write')
  saveConfig(
    @Body()
    body: {
      isActive?: boolean;
      config?: Partial<VoiceCallingConfig> & {
        providers?: Partial<VoiceCallingConfig['providers']>;
      };
    },
  ) {
    return this.voiceCallingService.saveConfig(body);
  }

  @Delete('integrations/voice')
  @Permissions('settings:write')
  disconnect() {
    return this.voiceCallingService.disconnect();
  }

  /** Place an outbound call to a lead/contact phone via the active provider. */
  @Post('voice/calls')
  @Permissions('leads:write')
  initiateCall(@Body() body: InitiateVoiceCallDto, @Req() req: any) {
    return this.voiceCallingService.initiateCall(body, req.user);
  }

  @Get('voice/status')
  @Permissions('leads:read')
  async statusForUi() {
    const cfg = await this.voiceCallingService.getConfig();
    return {
      isActive: cfg.isActive,
      activeProvider: cfg.config.activeProvider,
      secretsConfigured: cfg.secretsConfigured,
      status: cfg.status,
    };
  }
}
