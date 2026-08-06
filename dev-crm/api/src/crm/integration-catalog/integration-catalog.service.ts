import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Integration, IntegrationDocument } from '../schemas/integration.schema';
import { TeamsBotService } from '../../teams-bot/teams-bot.service';
import {
  INTEGRATION_CATALOG,
  IntegrationCatalogDefinition,
  getCatalogDefinition,
} from './integration-catalog.registry';
import { EMAIL_INTELLIGENCE_INTEGRATION_TYPE } from '../email-intelligence/email-intelligence.types';
import { VoiceCallingService } from '../integrations/voice-calling.service';
import { VOICE_CALLING_INTEGRATION_TYPE } from '../integrations/voice-calling.types';

export type CatalogConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'coming_soon'
  | 'error';

export interface CatalogItemDto extends IntegrationCatalogDefinition {
  connectionStatus: CatalogConnectionStatus;
  connectedAt?: Date | string | null;
  detail?: string | null;
  /** Portal path to start / finish connect (same as configurePath for Phase 1). */
  connectPath: string;
}

@Injectable()
export class IntegrationCatalogService {
  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<IntegrationDocument>,
    private readonly teamsBotService: TeamsBotService,
    private readonly voiceCallingService: VoiceCallingService,
  ) {}

  async listCatalog(): Promise<{ items: CatalogItemDto[] }> {
    const items = await Promise.all(
      INTEGRATION_CATALOG.map((def) => this.toCatalogItem(def)),
    );
    return { items };
  }

  async getCatalogItem(providerId: string): Promise<CatalogItemDto> {
    const def = getCatalogDefinition(providerId);
    if (!def) {
      throw new NotFoundException(`Unknown integration: ${providerId}`);
    }
    return this.toCatalogItem(def);
  }

  /**
   * Phase 1: disconnect only where we own a single install document.
   * Teams webhooks stay managed on the integrations page (multiple rows).
   */
  async disconnect(providerId: string): Promise<{ success: boolean; message: string }> {
    const def = getCatalogDefinition(providerId);
    if (!def) {
      throw new NotFoundException(`Unknown integration: ${providerId}`);
    }
    if (def.availability !== 'live') {
      throw new BadRequestException(`${def.name} is not available yet`);
    }

    switch (providerId) {
      case 'whatsapp-business':
        await this.integrationModel
          .findOneAndUpdate(
            { type: 'whatsapp' },
            { $set: { isActive: false, status: 'disconnected' } },
          )
          .exec();
        return { success: true, message: 'WhatsApp disconnected' };

      case 'google-postmaster':
        await this.integrationModel
          .deleteOne({ type: 'google_postmaster' })
          .exec();
        return { success: true, message: 'Google Postmaster disconnected' };

      case 'email-intelligence':
        await this.integrationModel
          .updateOne(
            { type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE },
            { $set: { status: 'disconnected', isActive: false } },
          )
          .exec();
        // Soft-disable: clear enabled flags on providers without deleting keys
        {
          const doc = await this.integrationModel
            .findOne({ type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE })
            .lean()
            .exec();
          const providers = (doc as any)?.providers;
          if (providers && typeof providers === 'object') {
            const next = { ...providers };
            for (const key of Object.keys(next)) {
              next[key] = { ...next[key], enabled: false };
            }
            await this.integrationModel
              .updateOne(
                { type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE },
                { $set: { providers: next } },
              )
              .exec();
          }
        }
        return { success: true, message: 'Email intelligence providers disabled' };

      case 'voice-calling':
        return this.voiceCallingService.disconnect();

      case 'microsoft-teams':
        throw new BadRequestException(
          'Manage Teams channel webhooks individually on the Integrations page',
        );

      case 'slack':
        await this.integrationModel.deleteMany({ name: 'Slack' }).exec();
        return { success: true, message: 'Slack disconnected' };

      default:
        throw new BadRequestException(`Disconnect not supported for ${def.name}`);
    }
  }

  private async toCatalogItem(
    def: IntegrationCatalogDefinition,
  ): Promise<CatalogItemDto> {
    if (def.availability === 'coming_soon') {
      return {
        ...def,
        connectionStatus: 'coming_soon',
        connectedAt: null,
        detail: 'Coming in a later phase',
        connectPath: def.configurePath,
      };
    }

    const status = await this.resolveStatus(def);
    return {
      ...def,
      ...status,
      connectPath: def.configurePath,
    };
  }

  private async resolveStatus(
    def: IntegrationCatalogDefinition,
  ): Promise<{
    connectionStatus: CatalogConnectionStatus;
    connectedAt?: Date | string | null;
    detail?: string | null;
  }> {
    switch (def.id) {
      case 'microsoft-teams': {
        const hooks = await this.integrationModel
          .find({ name: 'Microsoft Teams', isActive: true })
          .lean()
          .exec();
        const bot = this.teamsBotService.getConfigurationStatus();
        const connected = hooks.length > 0 || bot.botReady;
        const first = hooks[0] as { createdAt?: Date } | undefined;
        return {
          connectionStatus: connected ? 'connected' : 'disconnected',
          connectedAt: first?.createdAt ?? null,
          detail: [
            hooks.length > 0
              ? `${hooks.length} channel webhook${hooks.length === 1 ? '' : 's'}`
              : 'No channel webhooks',
            bot.botReady ? 'Bot ready' : 'Bot not configured',
          ].join(' · '),
        };
      }

      case 'slack': {
        const hooks = await this.integrationModel
          .find({ name: 'Slack', isActive: true })
          .lean()
          .exec();
        const first = hooks[0] as { createdAt?: Date } | undefined;
        return {
          connectionStatus: hooks.length > 0 ? 'connected' : 'disconnected',
          connectedAt: first?.createdAt ?? null,
          detail:
            hooks.length > 0
              ? `${hooks.length} channel webhook${hooks.length === 1 ? '' : 's'}`
              : 'No channel webhooks',
        };
      }

      case 'whatsapp-business': {
        const doc = await this.integrationModel
          .findOne({ type: 'whatsapp' })
          .lean()
          .exec();
        const apiKey = (doc as any)?.apiKey || (doc as any)?.config?.apiKey;
        const active = !!(doc as any)?.isActive && !!apiKey;
        return {
          connectionStatus: active ? 'connected' : 'disconnected',
          connectedAt: (doc as any)?.updatedAt ?? (doc as any)?.createdAt ?? null,
          detail: active ? 'API key configured' : 'Not configured',
        };
      }

      case 'google-postmaster': {
        const doc = await this.integrationModel
          .findOne({ type: 'google_postmaster' })
          .lean()
          .exec();
        const cfg = (doc as any)?.config ?? {};
        const connected = !!(cfg.refreshToken || (doc as any)?.refreshToken);
        return {
          connectionStatus: connected ? 'connected' : 'disconnected',
          connectedAt: (doc as any)?.updatedAt ?? null,
          detail: connected
            ? cfg.connectedEmail || 'Google account linked'
            : 'Not connected',
        };
      }

      case 'email-intelligence': {
        const doc = await this.integrationModel
          .findOne({ type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE })
          .lean()
          .exec();
        const providers = (doc as any)?.providers ?? {};
        const enabledCount = Object.values(providers).filter(
          (p: any) => p?.enabled && (p?.apiKey || '').trim(),
        ).length;
        return {
          connectionStatus: enabledCount > 0 ? 'connected' : 'disconnected',
          connectedAt: (doc as any)?.updatedAt ?? null,
          detail:
            enabledCount > 0
              ? `${enabledCount} provider${enabledCount === 1 ? '' : 's'} enabled`
              : 'No providers enabled',
        };
      }

      case 'voice-calling':
        return this.voiceCallingService.getStatusForCatalog();

      default:
        return {
          connectionStatus: 'disconnected',
          connectedAt: null,
          detail: null,
        };
    }
  }
}
