import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../crm/shared/twobigha-graphql.util';

/**
 * Duplicate of api/src/crm/crm-users/twobigha-agent.service.ts — see that
 * file for the full rationale. This copy exists only because app.module.ts
 * currently wires THIS directory's CRMUsersModule (the top-level
 * api/src/crm-users/), a separate duplicate of api/src/crm/crm-users/ left
 * over from the CRM-extraction migration (see _from-internal/CRM-SEPARATION.md).
 * Both copies are patched identically so agent sync fires regardless of
 * which duplicate module actually serves POST /crm-users at runtime — that
 * duplication itself is a pre-existing issue worth the team deduplicating
 * deliberately, not something this change attempts to resolve.
 */

export interface AgentSyncInput {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface TwoBighaAgentSyncResult {
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
