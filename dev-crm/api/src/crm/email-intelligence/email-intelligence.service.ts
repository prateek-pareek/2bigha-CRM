import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Integration } from '../schemas/integration.schema';
import {
  EMAIL_INTELLIGENCE_INTEGRATION_TYPE,
  EmailCapability,
  EmailIntelligenceStatusDto,
  EmailIntelligenceStoredDoc,
  EmailProviderId,
  EmailProviderPublicDto,
  EmailProviderStoredConfig,
  EmailVerificationNormalized,
  LEGACY_EMAIL_FINDER_TYPE,
} from './email-intelligence.types';
import { UpdateEmailIntelligenceSettingsDto } from './dto/update-email-intelligence-settings.dto';
import {
  EMAIL_PROVIDER_DEFINITIONS,
  EmailProviderRegistry,
} from './providers/provider.registry';
import { EmailProviderAdapter } from './providers/email-provider.interface';
import {
  isProviderConfigured,
  providerCredentials,
} from './utils/provider-auth.util';

const DEFAULT_CAPABILITIES = {
  linkedinFinder: true,
  emailVerifier: true,
};

@Injectable()
export class EmailIntelligenceService {
  private readonly logger = new Logger(EmailIntelligenceService.name);

  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<any>,
    private readonly providerRegistry: EmailProviderRegistry,
  ) {}

  private defaultProviderConfig(
    def: (typeof EMAIL_PROVIDER_DEFINITIONS)[number],
  ): EmailProviderStoredConfig {
    return {
      enabled: false,
      apiKey: '',
      apiSecret: '',
      capabilities: { ...DEFAULT_CAPABILITIES },
      priority: def.defaultPriority,
    };
  }

  private async loadDoc(): Promise<EmailIntelligenceStoredDoc['providers']> {
    let doc = await this.integrationModel
      .findOne({ type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE })
      .lean()
      .exec();

    if (!doc?.providers) {
      const legacy = await this.integrationModel
        .findOne({ type: LEGACY_EMAIL_FINDER_TYPE })
        .lean()
        .exec();
      if (legacy?.apiKey && legacy?.apiSecret) {
        const migrated: EmailIntelligenceStoredDoc['providers'] = {
          tomba: {
            enabled: !!legacy.isActive,
            apiKey: String(legacy.apiKey).trim(),
            apiSecret: String(legacy.apiSecret).trim(),
            capabilities: { ...DEFAULT_CAPABILITIES },
            priority: 10,
          },
        };
        await this.integrationModel
          .findOneAndUpdate(
            { type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE },
            {
              type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE,
              name: 'Email intelligence',
              module: 'all',
              providers: migrated,
            },
            { upsert: true },
          )
          .exec();
        return this.mergeWithDefaults(migrated);
      }
    }

    return this.mergeWithDefaults(doc?.providers ?? {});
  }

  private mergeWithDefaults(
    stored: Record<string, EmailProviderStoredConfig>,
  ): EmailIntelligenceStoredDoc['providers'] {
    const providers: EmailIntelligenceStoredDoc['providers'] = {};
    for (const def of EMAIL_PROVIDER_DEFINITIONS) {
      const existing = stored[def.id];
      providers[def.id] = {
        ...this.defaultProviderConfig(def),
        ...existing,
        capabilities: {
          ...DEFAULT_CAPABILITIES,
          ...existing?.capabilities,
        },
        priority: existing?.priority ?? def.defaultPriority,
      };
    }
    return providers;
  }

  private async persistProviders(
    providers: EmailIntelligenceStoredDoc['providers'],
  ) {
    await this.integrationModel
      .findOneAndUpdate(
        { type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE },
        {
          type: EMAIL_INTELLIGENCE_INTEGRATION_TYPE,
          name: 'Email intelligence',
          module: 'all',
          providers,
        },
        { upsert: true },
      )
      .exec();
  }

  async getSettings(): Promise<{ providers: EmailProviderPublicDto[] }> {
    const stored = await this.loadDoc();
    const providers = EMAIL_PROVIDER_DEFINITIONS.map((def) => {
      const cfg = stored[def.id] ?? this.defaultProviderConfig(def);
      const apiKey = cfg.apiKey?.trim() ?? '';
      const apiSecret = cfg.apiSecret?.trim() ?? '';
      const configured = isProviderConfigured(def.authMode, cfg);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        supportedCapabilities: def.capabilities,
        docsUrl: def.docsUrl,
        authMode: def.authMode,
        requiresApiSecret: def.authMode === 'apiKeySecret',
        freeApiAccess: def.freeApiAccess,
        freeTierHint: def.freeTierHint,
        enabled: !!cfg.enabled,
        configured,
        hasApiSecret: apiSecret.length > 0,
        apiKey,
        webhookUrl: cfg.webhookUrl?.trim() ?? '',
        capabilities: {
          linkedinFinder: !!cfg.capabilities?.linkedinFinder,
          emailVerifier: !!cfg.capabilities?.emailVerifier,
        },
        priority: cfg.priority ?? def.defaultPriority,
      } satisfies EmailProviderPublicDto;
    });
    providers.sort((a, b) => a.priority - b.priority);
    return { providers };
  }

  async getStatus(): Promise<EmailIntelligenceStatusDto> {
    const stored = await this.loadDoc();
    const capabilities: EmailIntelligenceStatusDto['capabilities'] = {
      linkedinFinder: { available: false, providerIds: [] },
      emailVerifier: { available: false, providerIds: [] },
    };

    const ordered = this.getOrderedProviders(stored);
    for (const { id, config } of ordered) {
      if (!this.isProviderReady(id, config)) continue;
      const adapter = this.providerRegistry.get(id);
      if (!adapter) continue;

      if (
        config.capabilities.linkedinFinder &&
        this.providerRegistry.supportsCapability(adapter, 'linkedinFinder')
      ) {
        capabilities.linkedinFinder.available = true;
        capabilities.linkedinFinder.providerIds.push(id);
      }
      if (
        config.capabilities.emailVerifier &&
        this.providerRegistry.supportsCapability(adapter, 'emailVerifier')
      ) {
        capabilities.emailVerifier.available = true;
        capabilities.emailVerifier.providerIds.push(id);
      }
    }

    return { capabilities };
  }

  async saveSettings(dto: UpdateEmailIntelligenceSettingsDto) {
    const stored = await this.loadDoc();

    for (const def of EMAIL_PROVIDER_DEFINITIONS) {
      const patch = dto.providers?.[def.id];
      if (!patch) continue;

      const current = stored[def.id] ?? this.defaultProviderConfig(def);
      const apiKey =
        patch.apiKey !== undefined ? patch.apiKey.trim() : (current.apiKey?.trim() ?? '');
      const incomingSecret = patch.apiSecret?.trim() ?? '';
      const apiSecret =
        incomingSecret.length > 0
          ? incomingSecret
          : (current.apiSecret?.trim() ?? '');

      const nextConfig: EmailProviderStoredConfig = {
        enabled: patch.enabled ?? current.enabled,
        apiKey,
        apiSecret,
        webhookUrl:
          patch.webhookUrl !== undefined
            ? patch.webhookUrl.trim()
            : current.webhookUrl?.trim(),
        priority: patch.priority ?? current.priority,
        capabilities: {
          linkedinFinder:
            patch.capabilities?.linkedinFinder ??
            current.capabilities.linkedinFinder,
          emailVerifier:
            patch.capabilities?.emailVerifier ??
            current.capabilities.emailVerifier,
        },
      };

      if (nextConfig.enabled && !isProviderConfigured(def.authMode, nextConfig)) {
        const credHint =
          def.authMode === 'apiKeySecret'
            ? 'API key and secret are required'
            : 'API key is required';
        throw new BadRequestException(`${def.name}: ${credHint} when enabled.`);
      }

      stored[def.id] = nextConfig;
    }

    await this.persistProviders(stored);
    return this.getSettings();
  }

  async linkedinFinder(
    url: string,
    options?: { enrichMobile?: boolean; full?: boolean; providerId?: string },
  ) {
    const normalized = url.trim();
    if (!normalized) {
      throw new BadRequestException('LinkedIn profile URL is required.');
    }
    if (!/linkedin\.com/i.test(normalized)) {
      throw new BadRequestException('URL must be a LinkedIn profile link.');
    }

    const { providerId, result } = await this.executeCapability(
      'linkedinFinder',
      options?.providerId as EmailProviderId | undefined,
      async (adapter, credentials) =>
        adapter.linkedinFinder(credentials, normalized, options),
    );

    return { provider: providerId, data: result };
  }

  async verifyEmail(
    email: string,
    options?: { enrichMobile?: boolean; providerId?: string },
  ): Promise<EmailVerificationNormalized & { provider: EmailProviderId }> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Email address is required.');
    }

    const { providerId, result } = await this.executeCapability(
      'emailVerifier',
      options?.providerId as EmailProviderId | undefined,
      async (adapter, credentials) =>
        adapter.emailVerifier(credentials, normalized, options),
    );

    return { ...result, provider: providerId };
  }

  private getOrderedProviders(
    providers: EmailIntelligenceStoredDoc['providers'],
  ): { id: EmailProviderId; config: EmailProviderStoredConfig }[] {
    return EMAIL_PROVIDER_DEFINITIONS.map((def) => ({
      id: def.id,
      config: providers[def.id] ?? this.defaultProviderConfig(def),
    })).sort((a, b) => a.config.priority - b.config.priority);
  }

  private isProviderReady(
    id: EmailProviderId,
    config: EmailProviderStoredConfig,
  ): boolean {
    if (!config.enabled) return false;
    const def = this.providerRegistry.getDefinition(id);
    if (!def) return false;
    return isProviderConfigured(def.authMode, config);
  }

  private getProviderChain(
    capability: EmailCapability,
    providers: EmailIntelligenceStoredDoc['providers'],
    preferredId?: EmailProviderId,
  ): {
    id: EmailProviderId;
    config: EmailProviderStoredConfig;
    adapter: EmailProviderAdapter;
  }[] {
    const chain: {
      id: EmailProviderId;
      config: EmailProviderStoredConfig;
      adapter: EmailProviderAdapter;
    }[] = [];

    const ordered = this.getOrderedProviders(providers);
    if (preferredId) {
      const preferred = ordered.find((p) => p.id === preferredId);
      if (preferred) {
        ordered.splice(ordered.indexOf(preferred), 1);
        ordered.unshift(preferred);
      }
    }

    for (const entry of ordered) {
      if (!this.isProviderReady(entry.id, entry.config)) continue;
      const adapter = this.providerRegistry.get(entry.id);
      if (!adapter) continue;
      if (!this.providerRegistry.supportsCapability(adapter, capability)) continue;
      if (!entry.config.capabilities[capability]) continue;
      chain.push({ ...entry, adapter });
    }

    return chain;
  }

  private async executeCapability<T>(
    capability: EmailCapability,
    preferredProviderId: EmailProviderId | undefined,
    run: (
      adapter: EmailProviderAdapter,
      credentials: ReturnType<typeof providerCredentials>,
    ) => Promise<T>,
  ): Promise<{ providerId: EmailProviderId; result: T }> {
    const providers = await this.loadDoc();
    const chain = this.getProviderChain(capability, providers, preferredProviderId);

    if (chain.length === 0) {
      throw new ServiceUnavailableException(
        `No provider is enabled for ${capability}. Configure providers under CRM Settings → Integrations → Email intelligence.`,
      );
    }

    let lastMessage = 'All providers failed.';
    for (const { id, config, adapter } of chain) {
      const def = this.providerRegistry.getDefinition(id)!;
      const credentials = providerCredentials(def.authMode, config);
      try {
        const result = await run(adapter, credentials);
        return { providerId: id, result };
      } catch (err) {
        lastMessage =
          err instanceof BadRequestException
            ? String(err.message)
            : err instanceof Error
              ? err.message
              : lastMessage;
        this.logger.warn(
          `Provider ${id} failed for ${capability}: ${lastMessage}`,
        );
      }
    }

    throw new BadRequestException(lastMessage);
  }
}
