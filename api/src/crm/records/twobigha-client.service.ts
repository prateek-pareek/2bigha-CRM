import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * 2bigha "Platform User" sync — `adminCreateUser`, the "sync the
 * client/customer record" side of the Integration Handbook. Called whenever
 * a CRM Client is created, so 2bigha has a matching platform-user record to
 * attach a synced Lead's `clientId` to (see TwoBighaLeadService).
 */

export interface ClientSyncInput {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  address?: string;
  /** Client.role — already 'OWNER' | 'AGENT' | 'USER', matching 2bigha's PlatformUserRole values exactly. */
  role?: string;
}

export interface TwoBighaClientSyncResult {
  /** 'skipped' = no email on file — adminCreateUser requires one (PlatformUserInput.email: String!). */
  status: 'synced' | 'mock' | 'failed' | 'skipped';
  twobighaUserId?: string;
  error?: string;
  syncedAt: Date;
}

const ADMIN_CREATE_USER_MUTATION = `
  mutation AdminCreateUser($input: PlatformUserInput!) {
    adminCreateUser(input: $input) {
      success
      message
      user {
        id
      }
    }
  }
`;

@Injectable()
export class TwoBighaClientService {
  private readonly logger = new Logger(TwoBighaClientService.name);

  /** firstName/lastName aren't separate fields on Client — best-effort split of the single `name` field. */
  private splitName(name: string): { firstName?: string; lastName?: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    const [firstName, ...rest] = parts;
    return { firstName, lastName: rest.join(' ') || undefined };
  }

  async syncClientCreate(client: ClientSyncInput): Promise<TwoBighaClientSyncResult> {
    const email = client.email?.trim();
    if (!email) {
      // Not an error — many CRM clients are created without an email (phone-only contacts).
      return {
        status: 'skipped',
        error: 'No email on file — 2bigha requires an email to create a platform user.',
        syncedAt: new Date(),
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return { status: 'mock', twobighaUserId: `mock-2b-user-${client._id}`, syncedAt: new Date() };
    }

    const { firstName, lastName } = this.splitName(client.name);
    try {
      const data = await twoBighaGraphqlRequest<{
        adminCreateUser?: { success?: boolean; message?: string; user?: { id?: string } | null };
      }>(config, ADMIN_CREATE_USER_MUTATION, {
        input: {
          email,
          firstName,
          lastName,
          role: client.role || undefined, // OWNER | AGENT | USER — Client.role's enum already matches PlatformUserRole
          profile: {
            phone: client.phone || undefined,
            whatsappNumber: client.whatsappNumber || undefined,
            address: client.address || undefined,
          },
        },
      });
      const id = data?.adminCreateUser?.user?.id;
      if (!data?.adminCreateUser?.success || !id) {
        throw new Error(data?.adminCreateUser?.message || '2bigha did not return a platform user id');
      }
      return { status: 'synced', twobighaUserId: String(id), syncedAt: new Date() };
    } catch (e: any) {
      this.logger.error(`2bigha adminCreateUser failed for client ${client._id}: ${e?.message}`);
      return { status: 'failed', error: e?.message || 'Unknown error', syncedAt: new Date() };
    }
  }
}
