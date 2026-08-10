import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Integration, IntegrationDocument } from './schemas/integration.schema';
import { CRMService } from '../core/crm.service';
import {
  DEFAULT_VOICE_CALLING_CONFIG,
  InitiateVoiceCallDto,
  VoiceCallingConfig,
  VoiceProviderId,
  VOICE_CALLING_INTEGRATION_TYPE,
} from './voice-calling.types';

function maskSecret(value?: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length <= 6) return '••••••';
  return `${v.slice(0, 3)}••••${v.slice(-2)}`;
}

function normalizeE164(raw: string): string {
  const cleaned = String(raw || '').trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  // Assume already includes country code digits
  return `+${cleaned.replace(/^\+/, '')}`;
}

@Injectable()
export class VoiceCallingService {
  private readonly logger = new Logger(VoiceCallingService.name);

  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<IntegrationDocument>,
    private readonly crmService: CRMService,
  ) {}

  async getConfig(opts?: { revealSecrets?: boolean }): Promise<{
    isActive: boolean;
    status: string;
    config: VoiceCallingConfig;
    secretsConfigured: Record<VoiceProviderId, boolean>;
  }> {
    const doc = await this.integrationModel
      .findOne({ type: VOICE_CALLING_INTEGRATION_TYPE })
      .lean()
      .exec();
    const raw = (doc as any)?.config || {};
    const config = this.mergeConfig(raw);
    const reveal = !!opts?.revealSecrets;

    const sanitized: VoiceCallingConfig = {
      activeProvider: config.activeProvider,
      providers: {
        twilio: {
          ...config.providers.twilio,
          authToken: reveal
            ? config.providers.twilio.authToken || ''
            : maskSecret(config.providers.twilio.authToken),
        },
        readymode: {
          ...config.providers.readymode,
          apiKey: reveal
            ? config.providers.readymode.apiKey || ''
            : maskSecret(config.providers.readymode.apiKey),
        },
        elevenlabs: {
          ...config.providers.elevenlabs,
          apiKey: reveal
            ? config.providers.elevenlabs.apiKey || ''
            : maskSecret(config.providers.elevenlabs.apiKey),
        },
      },
    };

    return {
      isActive: !!(doc as any)?.isActive,
      status: (doc as any)?.status || 'disconnected',
      config: sanitized,
      secretsConfigured: {
        twilio: !!(config.providers.twilio.accountSid && config.providers.twilio.authToken && config.providers.twilio.fromNumber),
        readymode: !!(config.providers.readymode.apiKey && config.providers.readymode.apiUrl),
        elevenlabs: !!(
          config.providers.elevenlabs.apiKey &&
          config.providers.elevenlabs.agentId &&
          config.providers.elevenlabs.agentPhoneNumberId
        ),
      },
    };
  }

  async saveConfig(body: {
    isActive?: boolean;
    config?: Partial<VoiceCallingConfig> & {
      providers?: Partial<VoiceCallingConfig['providers']>;
    };
  }) {
    const existing = await this.integrationModel
      .findOne({ type: VOICE_CALLING_INTEGRATION_TYPE })
      .lean()
      .exec();
    const prev = this.mergeConfig((existing as any)?.config || {});
    const next = this.mergeConfig({
      ...prev,
      ...(body.config || {}),
      providers: {
        twilio: {
          ...prev.providers.twilio,
          ...(body.config?.providers?.twilio || {}),
        },
        readymode: {
          ...prev.providers.readymode,
          ...(body.config?.providers?.readymode || {}),
        },
        elevenlabs: {
          ...prev.providers.elevenlabs,
          ...(body.config?.providers?.elevenlabs || {}),
        },
      },
    });

    // Preserve secrets when UI sends masked values
    next.providers.twilio.authToken = this.preserveSecret(
      body.config?.providers?.twilio?.authToken,
      prev.providers.twilio.authToken,
    );
    next.providers.readymode.apiKey = this.preserveSecret(
      body.config?.providers?.readymode?.apiKey,
      prev.providers.readymode.apiKey,
    );
    next.providers.elevenlabs.apiKey = this.preserveSecret(
      body.config?.providers?.elevenlabs?.apiKey,
      prev.providers.elevenlabs.apiKey,
    );

    const activeProvider = next.activeProvider;
    const providerCfg = next.providers[activeProvider];
    const providerReady = !!(providerCfg as any)?.enabled && this.isProviderConfigured(activeProvider, next);
    const isActive = body.isActive ?? (existing as any)?.isActive ?? true;

    await this.integrationModel
      .findOneAndUpdate(
        { type: VOICE_CALLING_INTEGRATION_TYPE },
        {
          $set: {
            name: 'Voice calling',
            type: VOICE_CALLING_INTEGRATION_TYPE,
            providerId: 'voice-calling',
            module: 'leads',
            authType: 'api_key',
            isActive,
            status: isActive && providerReady ? 'connected' : 'disconnected',
            connectedAt: isActive && providerReady ? new Date() : (existing as any)?.connectedAt,
            config: next,
            lastError: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return this.getConfig();
  }

  async getStatusForCatalog(): Promise<{
    connectionStatus: 'connected' | 'disconnected';
    connectedAt?: Date | null;
    detail?: string | null;
  }> {
    const doc = await this.integrationModel
      .findOne({ type: VOICE_CALLING_INTEGRATION_TYPE })
      .lean()
      .exec();
    if (!doc) {
      return { connectionStatus: 'disconnected', connectedAt: null, detail: 'Not configured' };
    }
    const config = this.mergeConfig((doc as any).config || {});
    const ready =
      !!(doc as any).isActive &&
      this.isProviderConfigured(config.activeProvider, config) &&
      !!(config.providers[config.activeProvider] as any)?.enabled;
    return {
      connectionStatus: ready ? 'connected' : 'disconnected',
      connectedAt: (doc as any).connectedAt ?? (doc as any).updatedAt ?? null,
      detail: ready
        ? `Active: ${config.activeProvider}`
        : `Configure ${config.activeProvider} credentials`,
    };
  }

  async initiateCall(dto: InitiateVoiceCallDto, user: any) {
    const doc = await this.integrationModel
      .findOne({ type: VOICE_CALLING_INTEGRATION_TYPE })
      .lean()
      .exec();
    if (!doc || !(doc as any).isActive) {
      throw new BadRequestException(
        'Voice calling is not enabled. Configure it under Settings → Integrations → Voice calling.',
      );
    }
    const config = this.mergeConfig((doc as any).config || {});
    const provider = (dto.provider || config.activeProvider) as VoiceProviderId;
    if (!this.isProviderConfigured(provider, config)) {
      throw new BadRequestException(
        `${provider} is not fully configured. Add credentials in Voice calling settings.`,
      );
    }
    if (!(config.providers[provider] as any)?.enabled) {
      throw new BadRequestException(`${provider} is disabled. Enable it in Voice calling settings.`);
    }

    const toNumber = normalizeE164(dto.toNumber);
    if (!toNumber || toNumber.length < 8) {
      throw new BadRequestException('Enter a valid phone number with country code.');
    }

    let result: {
      provider: VoiceProviderId;
      externalId?: string;
      status: string;
      message: string;
      raw?: any;
    };

    if (provider === 'twilio') {
      result = await this.callViaTwilio(config, toNumber);
    } else if (provider === 'readymode') {
      result = await this.callViaReadymode(config, toNumber, dto);
    } else if (provider === 'elevenlabs') {
      result = await this.callViaElevenLabs(config, toNumber, dto);
    } else {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }

    let activity: any = null;
    if (dto.relatedTo && Types.ObjectId.isValid(dto.relatedTo)) {
      try {
        activity = await this.crmService.createActivity(
          {
            type: 'Call',
            title: `Outbound call via ${provider}`,
            content: [
              `Called ${dto.leadName || toNumber}`,
              `To: ${toNumber}`,
              `Provider: ${provider}`,
              result.externalId ? `Call id: ${result.externalId}` : null,
              result.message,
            ]
              .filter(Boolean)
              .join('\n'),
            relatedTo: dto.relatedTo,
            relatedType: dto.relatedType || 'Lead',
            metadata: {
              direction: 'Outbound',
              status: result.status,
              provider,
              to: toNumber,
              externalId: result.externalId,
              source: 'voice-calling',
            },
          },
          user,
        );
      } catch (err) {
        this.logger.warn(
          `Call placed but activity log failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { ...result, activity };
  }

  private async callViaTwilio(config: VoiceCallingConfig, toNumber: string) {
    const tw = config.providers.twilio;
    const accountSid = String(tw.accountSid || '').trim();
    const authToken = String(tw.authToken || '').trim();
    const fromNumber = normalizeE164(String(tw.fromNumber || ''));
    const agentPhone = normalizeE164(String(tw.agentPhone || ''));

    if (!accountSid || !authToken || !fromNumber) {
      throw new BadRequestException('Twilio Account SID, Auth Token, and From number are required.');
    }

    // Click-to-call: ring agent, then Dial lead. Else call lead with a short notice.
    const twiml = agentPhone
      ? `<Response><Say voice="alice">Connecting you to the lead.</Say><Dial callerId="${fromNumber}">${toNumber}</Dial></Response>`
      : `<Response><Say voice="alice">Hello from Mathionix CRM. This is an outbound call.</Say><Pause length="2"/><Hangup/></Response>`;

    const dialTarget = agentPhone || toNumber;
    const body = new URLSearchParams({
      To: dialTarget,
      From: fromNumber,
      Twiml: twiml,
    });

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || data?.error_message || `Twilio error ${res.status}`;
      this.logger.error(`Twilio call failed: ${msg}`);
      throw new BadRequestException(msg);
    }

    return {
      provider: 'twilio' as const,
      externalId: data?.sid,
      status: data?.status || 'queued',
      message: agentPhone
        ? `Ringing your phone (${agentPhone}); answer to connect to ${toNumber}.`
        : `Call queued to ${toNumber} from ${fromNumber}.`,
      raw: { sid: data?.sid, status: data?.status },
    };
  }

  private async callViaReadymode(
    config: VoiceCallingConfig,
    toNumber: string,
    dto: InitiateVoiceCallDto,
  ) {
    const rm = config.providers.readymode;
    const apiUrl = String(rm.apiUrl || '').trim();
    const apiKey = String(rm.apiKey || '').trim();
    if (!apiUrl || !apiKey) {
      throw new BadRequestException('Readymode API URL and API key are required.');
    }

    const headerName = String(rm.authHeaderName || 'Authorization').trim() || 'Authorization';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [headerName]: headerName.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : apiKey,
    };

    const payload = {
      phone: toNumber,
      to: toNumber,
      campaignId: rm.campaignId || undefined,
      leadName: dto.leadName,
      relatedTo: dto.relatedTo,
      relatedType: dto.relatedType || 'Lead',
      source: 'mathionix-crm',
    };

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg =
        data?.message || data?.error || text?.slice(0, 200) || `Readymode error ${res.status}`;
      throw new BadRequestException(msg);
    }

    return {
      provider: 'readymode' as const,
      externalId: String(data?.id || data?.callId || data?.call_id || ''),
      status: String(data?.status || 'submitted'),
      message: `Call submitted to Readymode for ${toNumber}.`,
      raw: data,
    };
  }

  private async callViaElevenLabs(
    config: VoiceCallingConfig,
    toNumber: string,
    dto: InitiateVoiceCallDto,
  ) {
    const el = config.providers.elevenlabs;
    const apiKey = String(el.apiKey || '').trim();
    const agentId = String(el.agentId || '').trim();
    const agentPhoneNumberId = String(el.agentPhoneNumberId || '').trim();
    if (!apiKey || !agentId || !agentPhoneNumberId) {
      throw new BadRequestException(
        'ElevenLabs API key, agent id, and agent phone number id are required.',
      );
    }

    const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: {
            lead_name: dto.leadName || '',
            related_to: dto.relatedTo || '',
            related_type: dto.relatedType || 'Lead',
          },
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.detail?.message ||
        data?.detail ||
        data?.message ||
        `ElevenLabs error ${res.status}`;
      throw new BadRequestException(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    return {
      provider: 'elevenlabs' as const,
      externalId: String(data?.callSid || data?.conversation_id || data?.call_sid || ''),
      status: String(data?.status || 'initiated'),
      message: `ElevenLabs agent call started to ${toNumber}.`,
      raw: data,
    };
  }

  private isProviderConfigured(provider: VoiceProviderId, config: VoiceCallingConfig): boolean {
    if (provider === 'twilio') {
      const t = config.providers.twilio;
      return !!(t.accountSid && t.authToken && t.fromNumber);
    }
    if (provider === 'readymode') {
      const r = config.providers.readymode;
      return !!(r.apiKey && r.apiUrl);
    }
    if (provider === 'elevenlabs') {
      const e = config.providers.elevenlabs;
      return !!(e.apiKey && e.agentId && e.agentPhoneNumberId);
    }
    return false;
  }

  private mergeConfig(raw: any): VoiceCallingConfig {
    const active =
      raw?.activeProvider === 'readymode' ||
      raw?.activeProvider === 'elevenlabs' ||
      raw?.activeProvider === 'twilio'
        ? raw.activeProvider
        : DEFAULT_VOICE_CALLING_CONFIG.activeProvider;
    return {
      activeProvider: active,
      providers: {
        twilio: {
          ...DEFAULT_VOICE_CALLING_CONFIG.providers.twilio,
          ...(raw?.providers?.twilio || {}),
        },
        readymode: {
          ...DEFAULT_VOICE_CALLING_CONFIG.providers.readymode,
          ...(raw?.providers?.readymode || {}),
        },
        elevenlabs: {
          ...DEFAULT_VOICE_CALLING_CONFIG.providers.elevenlabs,
          ...(raw?.providers?.elevenlabs || {}),
        },
      },
    };
  }

  private preserveSecret(incoming: string | undefined, previous?: string): string | undefined {
    if (incoming == null) return previous;
    const v = String(incoming);
    if (!v.trim()) return previous || '';
    if (v.includes('••••')) return previous || '';
    return v;
  }

  async disconnect() {
    await this.integrationModel
      .findOneAndUpdate(
        { type: VOICE_CALLING_INTEGRATION_TYPE },
        {
          $set: {
            isActive: false,
            status: 'disconnected',
            'config.providers.twilio.enabled': false,
            'config.providers.readymode.enabled': false,
            'config.providers.elevenlabs.enabled': false,
          },
        },
      )
      .exec();
    return { success: true, message: 'Voice calling disconnected' };
  }
}
