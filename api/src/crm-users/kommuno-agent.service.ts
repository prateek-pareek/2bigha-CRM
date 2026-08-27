import { Injectable, Logger } from '@nestjs/common';
import { CRMUser } from './schemas/user.schema';

export interface KommunoSyncResult {
  status: 'synced' | 'failed' | 'skipped';
  kommunoAgentId?: string;
  error?: string;
  syncedAt: Date;
}

@Injectable()
export class KommunoAgentService {
  private readonly logger = new Logger(KommunoAgentService.name);

  private isConfigured(): boolean {
    return !!(
      process.env.KOMMUNO_API_KEY &&
      process.env.KOMMUNO_SME_ID &&
      (process.env.KOMMUNO_API_BASE_URL || process.env.KOMMUNO_BASE_URL)
    );
  }

  private getBaseUrl(): string {
    const baseUrl = String(
      process.env.KOMMUNO_API_BASE_URL ||
        process.env.KOMMUNO_BASE_URL ||
        'https://dialer-crmapi.kommuno.com/v1/kcrm',
    )
      .trim()
      .replace(/\/+$/, '')
      .replace(/^"|"$/g, ''); // Robustly strip any quotes if user copies them in .env
    const smeId = String(process.env.KOMMUNO_SME_ID).trim();
    return `${baseUrl}/${smeId}`;
  }

  private getHeaders() {
    return {
      apikey: String(process.env.KOMMUNO_API_KEY).trim(),
      'Content-Type': 'application/json',
    };
  }

  private normalizePhone(phone?: string): string {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  async syncAgentCreate(agent: CRMUser): Promise<KommunoSyncResult> {
    if (!this.isConfigured()) {
      return {
        status: 'skipped',
        error: 'Kommuno integration is disabled or not configured in environment.',
        syncedAt: new Date(),
      };
    }

    const agentMobile = this.normalizePhone(agent.agentMobile || agent.email.split('@')[0]);
    if (!agentMobile || agentMobile.length < 8) {
      return {
        status: 'failed',
        error: 'Agent mobile number is invalid or missing.',
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
      status: agent.isActive ? 1 : 0,
      inTime,
      outTime,
      stickyAgent: 'soft',
      stickyDays: 7,
      agentMasking: agent.agentMasking ? 1 : 0,
      outPermission: agent.agentOutPermission ? 1 : 0,
      scheduleDays,
    };

    const url = `${this.getBaseUrl()}/addAgent`;
    try {
      this.logger.log(`Calling Kommuno addAgent: ${url} for ${agent.email}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status !== 200 && data.status !== '200')) {
        const msg = data.message || `Kommuno status ${res.status}`;
        throw new Error(msg);
      }

      const agentId = String(data?.data?.agentId || data?.data?.agent_id || '').trim();
      if (!agentId) {
        throw new Error('Kommuno addAgent did not return a valid agentId');
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
        error: e.message || 'Unknown integration error',
        syncedAt: new Date(),
      };
    }
  }

  async syncAgentUpdate(agent: CRMUser): Promise<KommunoSyncResult> {
    if (!this.isConfigured()) {
      return {
        status: 'skipped',
        error: 'Kommuno integration is disabled or not configured in environment.',
        syncedAt: new Date(),
      };
    }

    if (!agent.kommunoAgentId) {
      return this.syncAgentCreate(agent);
    }

    const agentMobile = this.normalizePhone(agent.agentMobile);
    if (!agentMobile || agentMobile.length < 8) {
      return {
        status: 'failed',
        error: 'Agent mobile number is invalid or missing.',
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
      agent_id: Number(agent.kommunoAgentId) || agent.kommunoAgentId,
      agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email.split('@')[0],
      agentMobile,
      agentEmail: agent.email,
      status: agent.isActive ? 1 : 0,
      inTime,
      outTime,
      stickyAgent: 'soft',
      stickyDays: 7,
      agentMasking: agent.agentMasking ? 1 : 0,
      outPermission: agent.agentOutPermission ? 1 : 0,
      scheduleDays,
    };

    const url = `${this.getBaseUrl()}/updateAgent`;
    try {
      this.logger.log(`Calling Kommuno updateAgent: ${url} for ${agent.email}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status !== 200 && data.status !== '200')) {
        const msg = data.message || `Kommuno status ${res.status}`;
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
        error: e.message || 'Unknown integration error',
        syncedAt: new Date(),
      };
    }
  }

  async syncAgentDelete(kommunoAgentId: string): Promise<boolean> {
    if (!this.isConfigured() || !kommunoAgentId) {
      return false;
    }

    const payload = {
      agentId: Number(kommunoAgentId) || kommunoAgentId,
      agent_id: Number(kommunoAgentId) || kommunoAgentId,
    };

    const url = `${this.getBaseUrl()}/deleteAgent`;
    try {
      this.logger.log(`Calling Kommuno deleteAgent: ${url} for ${kommunoAgentId}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status !== 200 && data.status !== '200')) {
        const msg = data.message || `Kommuno status ${res.status}`;
        this.logger.error(`Kommuno deleteAgent failed status: ${msg}`);
        return false;
      }

      return true;
    } catch (e: any) {
      this.logger.error(`Kommuno deleteAgent request failed: ${e.message}`);
      return false;
    }
  }
}
