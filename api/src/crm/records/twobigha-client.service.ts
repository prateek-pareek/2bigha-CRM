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
  /** When re-syncing, the id already stored on the CRM client — used to treat "already exists" as synced. */
  existingTwobighaUserId?: string;
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

/**
 * `getUser` — the fetch counterpart to adminCreateUser (Handbook, "Platform
 * User (Client) — Create & Fetch"). Reads a platform user's live 2bigha
 * profile by id. Fields per the Handbook's manually-built resolver shape.
 */
const GET_USER_QUERY = `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      firstName
      lastName
      role
      isActive
      createdAt
      profile {
        id
        bio
        phone
        avatar
        city
        state
        languages
        experience
        rating
        totalReviews
      }
    }
  }
`;

export interface TwoBighaPlatformUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
  createdAt?: string;
  profile?: {
    id?: string;
    bio?: string;
    phone?: string;
    avatar?: string;
    city?: string;
    state?: string;
    languages?: unknown;
    experience?: number;
    rating?: number;
    totalReviews?: number;
  } | null;
}

export interface TwoBighaClientFetchResult {
  /** 'skipped' = this CRM client has no twobighaUserId yet (never synced). */
  status: 'fetched' | 'mock' | 'failed' | 'skipped';
  user?: TwoBighaPlatformUser | null;
  error?: string;
}

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
      const message = e?.message || 'Unknown error';
      // Email already registered on 2bigha — not a hard failure if we already hold the id.
      if (/already exists/i.test(message)) {
        const existingId = client.existingTwobighaUserId?.trim();
        if (existingId) {
          return { status: 'synced', twobighaUserId: existingId, syncedAt: new Date() };
        }
      }
      this.logger.error(`2bigha adminCreateUser failed for client ${client._id}: ${message}`);
      return { status: 'failed', error: message, syncedAt: new Date() };
    }
  }

  /**
   * Fetch a client's live 2bigha platform-user profile (`getUser`). Requires
   * the client to already carry a `twobighaUserId` (set at create-sync time);
   * returns 'skipped' otherwise. Mock fallback mirrors the create path so the
   * "View 2bigha profile" action works locally.
   */
  async fetchUser(twobighaUserId?: string): Promise<TwoBighaClientFetchResult> {
    const id = twobighaUserId?.trim();
    if (!id) {
      return {
        status: 'skipped',
        error: 'This client has no 2bigha user id yet — create/sync it to 2bigha first.',
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return {
        status: 'mock',
        user: {
          id,
          email: 'mock.client@2bigha.example',
          firstName: 'Mock',
          lastName: 'Client',
          role: 'USER',
          isActive: true,
          createdAt: new Date().toISOString(),
          profile: { phone: '+910000000000', city: 'Mocktown', state: 'MockState' },
        },
      };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getUser?: TwoBighaPlatformUser | null }>(
        config,
        GET_USER_QUERY,
        { id },
      );
      return { status: 'fetched', user: data?.getUser ?? null };
    } catch (e: any) {
      this.logger.error(`2bigha getUser failed for user ${id}: ${e?.message}`);
      return { status: 'failed', error: e?.message || 'Unknown error' };
    }
  }
}
