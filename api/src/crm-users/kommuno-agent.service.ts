import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CRMUser } from './schemas/user.schema';
import { Integration, IntegrationDocument } from '../crm/integrations/schemas/integration.schema';

export interface KommunoSyncResult {
  status: 'synced' | 'failed' | 'skipped';
  kommunoAgentId?: string;
  error?: string;
  syncedAt: Date;
}

export interface KommunoConfig {
  enabled: boolean;
  apiKey: string;
  apiUrl: string;
  smeId: string;
  callerId: string;
}

@Injectable()
export class KommunoAgentService {
  private readonly logger = new Logger(KommunoAgentService.name);

  constructor(
    @Optional()
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel?: Model<IntegrationDocument>,
  ) {}

  /** Resolves Kommuno credentials from MongoDB Voice Calling integration or environment variables. */
  async getConfig(): Promise<KommunoConfig> {
    let apiKey = String(process.env.KOMMUNO_API_KEY || '').trim();
    let smeId = String(process.env.KOMMUNO_SME_ID || '').trim();
    let apiUrl = String(
      process.env.KOMMUNO_API_BASE_URL ||
        process.env.KOMMUNO_BASE_URL ||
        'https://dialer-crmapi.kommuno.com/v1/kcrm',
    ).trim();
    let callerId = String(process.env.KOMMUNO_VIRTUAL_NUMBER || '').trim();
    let enabled = true;

    try {
      if (this.integrationModel) {
        const doc = await this.integrationModel
          .findOne({ type: 'voice-calling' })
          .lean()
          .exec();
        const kConfig = (doc as any)?.config?.providers?.kommuno;
        if (kConfig) {
          if (kConfig.apiKey) apiKey = String(kConfig.apiKey).trim();
          if (kConfig.smeId) smeId = String(kConfig.smeId).trim();
          if (kConfig.apiUrl) apiUrl = String(kConfig.apiUrl).trim();
          if (kConfig.callerId) callerId = String(kConfig.callerId).trim();
          if (kConfig.enabled !== undefined) enabled = !!kConfig.enabled;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not load Kommuno integration from DB: ${err?.message}`);
    }

    apiUrl = apiUrl.replace(/\/+$/, '').replace(/^"|"$/g, '');
    smeId = smeId.replace(/^"|"$/g, '');
    apiKey = apiKey.replace(/^"|"$/g, '');

    return {
      enabled,
      apiKey,
      apiUrl: apiUrl || 'https://dialer-crmapi.kommuno.com/v1/kcrm',
      smeId,
      callerId,
    };
  }

  private getBaseUrl(config: KommunoConfig): string {
    const base = config.apiUrl.replace(/\/+$/, '');
    return `${base}/${config.smeId}`;
  }

  private getHeaders(config: KommunoConfig) {
    return {
      apikey: config.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private normalizePhone(phone?: string): string {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  async syncAgentCreate(agent: CRMUser): Promise<KommunoSyncResult> {
    const config = await this.getConfig();

    if (!config.enabled) {
      return {
        status: 'skipped',
        error: 'Kommuno integration is disabled. Enable it in Settings → Integrations → Voice.',
        syncedAt: new Date(),
      };
    }

    if (!config.apiKey || !config.smeId) {
      return {
        status: 'failed',
        error: 'Kommuno API Key and SME ID are required. Please configure them in Settings → Integrations → Voice (Kommuno).',
        syncedAt: new Date(),
      };
    }

    const agentMobile = this.normalizePhone(agent.agentMobile || agent.email.split('@')[0]);
    if (!agentMobile || agentMobile.replace(/\D/g, '').length < 10) {
      return {
        status: 'failed',
        error: 'Valid Agent mobile number with country code (e.g. +919876543210) is required.',
        syncedAt: new Date(),
      };
    }

    const inTime = agent.agentInTime || '09:00';
    const outTime = agent.agentOutTime || '18:00';
    const scheduleDays = ['MON', 'TUE', 'WED', 'THU', 'FRI'].map((day) => ({
      day,
      inTime,
      outTime,
    }));

    const payload = {
      agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email.split('@')[0],
      agentMobile,
      agentEmail: agent.email,
      status: agent.isActive !== false ? 1 : 0,
      inTime,
      outTime,
      stickyAgent: 'soft',
      stickyDays: 7,
      agentMasking: agent.agentMasking ? 1 : 0,
      outPermission: agent.agentOutPermission !== false ? 1 : 0,
      scheduleDays,
    };

    const url = `${this.getBaseUrl(config)}/addAgent`;
    try {
      this.logger.log(`Calling Kommuno addAgent: ${url} for ${agent.email}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(config),
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status && data.status !== 200 && data.status !== '200')) {
        const msg = data.message || data.error || `Kommuno API error (HTTP ${res.status})`;
        throw new Error(msg);
      }

      const agentId = String(data?.data?.agentId || data?.data?.agent_id || data?.agentId || '').trim();
      if (!agentId) {
        throw new Error(data.message || 'Kommuno addAgent did not return an agentId');
      }

      return {
        status: 'synced',
        kommunoAgentId: agentId,
        syncedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.error(`Kommuno addAgent failed for ${agent.email}: ${e.message}`);
      return {
        status: 'failed',
        error: e.message || 'Kommuno integration error',
        syncedAt: new Date(),
      };
    }
  }

  async syncAgentUpdate(agent: CRMUser): Promise<KommunoSyncResult> {
    const config = await this.getConfig();

    if (!config.enabled) {
      return {
        status: 'skipped',
        error: 'Kommuno integration is disabled. Enable it in Settings → Integrations → Voice.',
        syncedAt: new Date(),
      };
    }

    if (!config.apiKey || !config.smeId) {
      return {
        status: 'failed',
        error: 'Kommuno API Key and SME ID are required. Please configure them in Settings → Integrations → Voice (Kommuno).',
        syncedAt: new Date(),
      };
    }

    if (!agent.kommunoAgentId) {
      return this.syncAgentCreate(agent);
    }

    const agentMobile = this.normalizePhone(agent.agentMobile);
    if (!agentMobile || agentMobile.replace(/\D/g, '').length < 10) {
      return {
        status: 'failed',
        error: 'Valid Agent mobile number with country code (e.g. +919876543210) is required.',
        syncedAt: new Date(),
      };
    }

    const inTime = agent.agentInTime || '09:00';
    const outTime = agent.agentOutTime || '18:00';
    const scheduleDays = ['MON', 'TUE', 'WED', 'THU', 'FRI'].map((day) => ({
      day,
      inTime,
      outTime,
    }));

    const payload = {
      agentId: Number(agent.kommunoAgentId) || agent.kommunoAgentId,
      agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email.split('@')[0],
      agentMobile,
      agentEmail: agent.email,
      status: agent.isActive !== false ? 1 : 0,
      inTime,
      outTime,
      stickyAgent: 'soft',
      stickyDays: 7,
      agentMasking: agent.agentMasking ? 1 : 0,
      outPermission: agent.agentOutPermission !== false ? 1 : 0,
      scheduleDays,
    };

    const url = `${this.getBaseUrl(config)}/updateAgent`;
    try {
      this.logger.log(`Calling Kommuno updateAgent: ${url} for agentId=${agent.kommunoAgentId}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(config),
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status && data.status !== 200 && data.status !== '200')) {
        const msg = data.message || data.error || `Kommuno API error (HTTP ${res.status})`;
        throw new Error(msg);
      }

      return {
        status: 'synced',
        kommunoAgentId: agent.kommunoAgentId,
        syncedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.error(`Kommuno updateAgent failed for ${agent.email}: ${e.message}`);
      return {
        status: 'failed',
        error: e.message || 'Kommuno integration error',
        syncedAt: new Date(),
      };
    }
  }

  async syncAgentDelete(agentOrId: CRMUser | string): Promise<KommunoSyncResult> {
    const config = await this.getConfig();
    const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId.kommunoAgentId;

    if (!config.enabled || !config.apiKey || !config.smeId || !agentId) {
      return {
        status: 'skipped',
        syncedAt: new Date(),
      };
    }

    const payload = {
      agentId: Number(agentId) || agentId,
    };

    const url = `${this.getBaseUrl(config)}/deleteAgent`;
    try {
      this.logger.log(`Calling Kommuno deleteAgent: ${url} for agentId=${agentId}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(config),
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status && data.status !== 200 && data.status !== '200')) {
        const msg = data.message || data.error || `Kommuno API error (HTTP ${res.status})`;
        throw new Error(msg);
      }

      return {
        status: 'synced',
        syncedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.error(`Kommuno deleteAgent failed for agentId=${agentId}: ${e.message}`);
      return {
        status: 'failed',
        error: e.message || 'Kommuno integration error',
        syncedAt: new Date(),
      };
    }
  }
}
