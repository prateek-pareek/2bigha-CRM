import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * 2bigha "Admin" (agent/staff) sync — `createAdmin`, so 2bigha and the CRM
 * agree on who the agents are. Requires a 2bigha-issued `roleId` per the
 * handbook ("the CRM only needs to pass a role id 2bigha has told it to use
 * for synced agents") — configured via TWOBIGHA_DEFAULT_AGENT_ROLE_ID; a
 * CRM agent has no reason to log into 2bigha directly, so a random,
 * never-surfaced password is generated for the account createAdmin requires.
 */

export interface AgentSyncInput {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface TwoBighaAgentSyncResult {
  /** 'skipped' = TWOBIGHA_DEFAULT_AGENT_ROLE_ID not configured — createAdmin's roleId is required. */
  status: 'synced' | 'mock' | 'failed' | 'skipped';
  twobighaAdminId?: string;
  error?: string;
  syncedAt: Date;
}

const CREATE_ADMIN_MUTATION = `
  mutation CreateAdmin($input: CreateAdminInput!) {
    createAdmin(input: $input) {
      id
    }
  }
`;

@Injectable()
export class TwoBighaAgentService {
  private readonly logger = new Logger(TwoBighaAgentService.name);

  async syncAgentCreate(agent: AgentSyncInput): Promise<TwoBighaAgentSyncResult> {
    const roleId = process.env.TWOBIGHA_DEFAULT_AGENT_ROLE_ID;
    if (!roleId) {
      return {
        status: 'skipped',
        error: 'TWOBIGHA_DEFAULT_AGENT_ROLE_ID is not set — createAdmin requires a 2bigha roleId.',
        syncedAt: new Date(),
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return { status: 'mock', twobighaAdminId: `mock-2b-admin-${agent._id}`, syncedAt: new Date() };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ createAdmin?: { id?: string } }>(
        config,
        CREATE_ADMIN_MUTATION,
        {
          input: {
            email: agent.email,
            firstName: agent.firstName || agent.email.split('@')[0],
            lastName: agent.lastName || '—',
            // Never used to log in — the CRM is this identity's only auth surface. Long/random so it's not guessable.
            password: randomBytes(24).toString('base64url'),
            roleId,
          },
        },
      );
      const id = data?.createAdmin?.id;
      if (!id) throw new Error('2bigha did not return an admin id');
      return { status: 'synced', twobighaAdminId: String(id), syncedAt: new Date() };
    } catch (e: any) {
      this.logger.error(`2bigha createAdmin failed for agent ${agent._id}: ${e?.message}`);
      return { status: 'failed', error: e?.message || 'Unknown error', syncedAt: new Date() };
    }
  }
}
