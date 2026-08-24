import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * 2bigha `createLead` — per the Integration Handbook's own worked example:
 * `CreateLeadInput! { clientId, leadSource, note }`. The handbook's fuller
 * Core CRM/Leads section (getAllLead filters, the Lead 360 view, Notes,
 * Groups) wasn't available when this was built — this service intentionally
 * covers only what the intro example documents. Requires a 2bigha
 * platform-user id (`clientId`) already resolved from a synced Client (see
 * TwoBighaClientService) — a Lead with no linked/synced Client is reported
 * as 'skipped', not attempted.
 */

export interface LeadSyncInput {
  _id: string;
  /** 2bigha platform-user id (Client.twobighaUserId) — required by CreateLeadInput.clientId. */
  twobighaClientId?: string;
  leadSource?: string;
  note?: string;
}

export interface TwoBighaLeadSyncResult {
  status: 'synced' | 'mock' | 'failed' | 'skipped';
  twobighaLeadId?: string;
  error?: string;
  syncedAt: Date;
}

const CREATE_LEAD_MUTATION = `
  mutation CreateLead($input: CreateLeadInput!) {
    createLead(input: $input) {
      result {
        Id
      }
      message
      STATUS_CODES
    }
  }
`;

@Injectable()
export class TwoBighaLeadService {
  private readonly logger = new Logger(TwoBighaLeadService.name);

  async syncLeadCreate(lead: LeadSyncInput): Promise<TwoBighaLeadSyncResult> {
    if (!lead.twobighaClientId) {
      return {
        status: 'skipped',
        error: 'No 2bigha-synced client linked to this lead yet — createLead needs a clientId.',
        syncedAt: new Date(),
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return { status: 'mock', twobighaLeadId: `mock-2b-lead-${lead._id}`, syncedAt: new Date() };
    }

    try {
      const data = await twoBighaGraphqlRequest<{
        createLead?: { result?: { Id?: string | number } | null; message?: string };
      }>(config, CREATE_LEAD_MUTATION, {
        input: {
          clientId: lead.twobighaClientId,
          leadSource: lead.leadSource || undefined,
          note: lead.note || undefined,
        },
      });
      const id = data?.createLead?.result?.Id;
      if (id == null) throw new Error(data?.createLead?.message || '2bigha did not return a lead id');
      return { status: 'synced', twobighaLeadId: String(id), syncedAt: new Date() };
    } catch (e: any) {
      this.logger.error(`2bigha createLead failed for lead ${lead._id}: ${e?.message}`);
      return { status: 'failed', error: e?.message || 'Unknown error', syncedAt: new Date() };
    }
  }
}
