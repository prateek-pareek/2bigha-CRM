import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { getTwoBighaConfig, twoBighaGraphqlRequest, type TwoBighaConfig } from '../crm/shared/twobigha-graphql.util';

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
  twobighaAdminId?: string;
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

const GET_ALL_ROLES_QUERY = `
  query GetAllRoles {
    getAllRoles {
      roles {
        id
        name
        slug
      }
    }
  }
`;

/**
 * `getAllAdmins` — the "read 2bigha's agent list back" query (Handbook,
 * "Agent Create & Fetch"). Used by the CRM to reconcile its own CRMUser
 * list against 2bigha's copy. Note the Handbook flags this query as
 * currently unauthenticated on 2bigha's side; we still send our creds.
 */
const GET_ALL_ADMINS_QUERY = `
  query GetAllAdmins($filter: AdminFilterInput, $sort: SortInput, $limit: Int, $offset: Int) {
    getAllAdmins(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      admins {
        id
        email
        firstName
        lastName
        department
        employeeId
        phone
        isActive
        isVerified
        createdAt
      }
      total
      hasMore
    }
  }
`;

export interface TwoBighaAdmin {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  employeeId?: string;
  phone?: string;
  isActive?: boolean;
  isVerified?: boolean;
  createdAt?: string;
}

export interface AgentFetchFilter {
  search?: string;
  isActive?: boolean;
  department?: string;
  roleSlug?: string;
  limit?: number;
  offset?: number;
  /** When true, paginate through every page until hasMore is false. */
  fetchAll?: boolean;
}

export interface TwoBighaAgentFetchResult {
  status: 'fetched' | 'mock' | 'failed';
  admins: TwoBighaAdmin[];
  total: number;
  hasMore: boolean;
  error?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isDuplicateAdminError(message: string): boolean {
  return /already exists|duplicate|email.*(taken|registered|in use)/i.test(message);
}

@Injectable()
export class TwoBighaAgentService {
  private readonly logger = new Logger(TwoBighaAgentService.name);
  private resolvedRoleIdCache: string | null | undefined;

  /** Resolve roleId from TWOBIGHA_DEFAULT_AGENT_ROLE_ID or TWOBIGHA_DEFAULT_AGENT_ROLE_SLUG (default: bdm). */
  private async resolveDefaultAgentRoleId(config: TwoBighaConfig): Promise<string | null> {
    const direct = process.env.TWOBIGHA_DEFAULT_AGENT_ROLE_ID?.trim();
    if (direct) return direct;

    if (this.resolvedRoleIdCache !== undefined) {
      return this.resolvedRoleIdCache;
    }

    const slug = (process.env.TWOBIGHA_DEFAULT_AGENT_ROLE_SLUG || 'bdm').trim().toLowerCase();
    try {
      const data = await twoBighaGraphqlRequest<{
        getAllRoles?: { roles?: Array<{ id: string; name?: string; slug?: string }> };
      }>(config, GET_ALL_ROLES_QUERY, {});
      const roles = data?.getAllRoles?.roles ?? [];
      const match =
        roles.find((r) => (r.slug || '').trim().toLowerCase() === slug) ||
        roles.find((r) => (r.slug || '').trim().toLowerCase().replace(/\s+/g, '_') === slug);
      this.resolvedRoleIdCache = match?.id ? String(match.id) : null;
      if (!this.resolvedRoleIdCache) {
        this.logger.warn(
          `No 2bigha role matched slug "${slug}". Set TWOBIGHA_DEFAULT_AGENT_ROLE_ID in .env.`,
        );
      }
      return this.resolvedRoleIdCache;
    } catch (e: any) {
      this.logger.error(`2bigha getAllRoles failed while resolving agent role: ${e?.message}`);
      this.resolvedRoleIdCache = null;
      return null;
    }
  }

  private async findAdminIdByEmail(config: TwoBighaConfig, email: string): Promise<string | null> {
    const needle = normalizeEmail(email);
    if (!needle) return null;

    try {
      const data = await twoBighaGraphqlRequest<{
        getAllAdmins?: { admins?: TwoBighaAdmin[] };
      }>(config, GET_ALL_ADMINS_QUERY, {
        filter: { search: email.trim() },
        sort: { field: 'createdAt', direction: 'DESC' },
        limit: 25,
        offset: 0,
      });
      const admins = data?.getAllAdmins?.admins ?? [];
      const hit = admins.find((a) => normalizeEmail(a.email || '') === needle);
      return hit?.id ? String(hit.id) : null;
    } catch (e: any) {
      this.logger.warn(`2bigha getAllAdmins lookup failed for ${email}: ${e?.message}`);
      return null;
    }
  }

  async syncAgentCreate(agent: AgentSyncInput): Promise<TwoBighaAgentSyncResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { status: 'mock', twobighaAdminId: `mock-2b-admin-${agent._id}`, syncedAt: new Date() };
    }

    const roleId = await this.resolveDefaultAgentRoleId(config);
    if (!roleId) {
      return {
        status: 'skipped',
        error:
          'TWOBIGHA_DEFAULT_AGENT_ROLE_ID is not set and no matching TWOBIGHA_DEFAULT_AGENT_ROLE_SLUG was found — createAdmin requires a 2bigha roleId.',
        syncedAt: new Date(),
      };
    }

    if (agent.twobighaAdminId) {
      const existingId = await this.findAdminIdByEmail(config, agent.email);
      if (existingId && String(existingId) === String(agent.twobighaAdminId)) {
        return { status: 'synced', twobighaAdminId: String(existingId), syncedAt: new Date() };
      }
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
      const message = e?.message || 'Unknown error';
      const existingId = await this.findAdminIdByEmail(config, agent.email);
      if (existingId) {
        return { status: 'synced', twobighaAdminId: existingId, syncedAt: new Date() };
      }
      if (isDuplicateAdminError(message)) {
        return { status: 'failed', error: `${message} (admin may exist on 2bigha but could not be matched by email)`, syncedAt: new Date() };
      }
      this.logger.error(`2bigha createAdmin failed for agent ${agent._id}: ${message}`);
      return { status: 'failed', error: message, syncedAt: new Date() };
    }
  }

  private buildAdminFilter(filter: AgentFetchFilter) {
    return {
      search: filter.search || undefined,
      isActive: typeof filter.isActive === 'boolean' ? filter.isActive : undefined,
      department: filter.department || undefined,
      roleSlug: filter.roleSlug || undefined,
    };
  }

  private async fetchAgentsPage(
    config: TwoBighaConfig,
    filter: AgentFetchFilter,
    limit: number,
    offset: number,
  ): Promise<TwoBighaAgentFetchResult> {
    const data = await twoBighaGraphqlRequest<{
      getAllAdmins?: { admins?: TwoBighaAdmin[]; total?: number; hasMore?: boolean };
    }>(config, GET_ALL_ADMINS_QUERY, {
      filter: this.buildAdminFilter(filter),
      sort: { field: 'createdAt', direction: 'DESC' },
      limit,
      offset,
    });
    const res = data?.getAllAdmins;
    return {
      status: 'fetched',
      admins: res?.admins ?? [],
      total: res?.total ?? res?.admins?.length ?? 0,
      hasMore: Boolean(res?.hasMore),
    };
  }

  /**
   * Fetch 2bigha's agent/staff list (`getAllAdmins`) for reconciliation
   * against the CRM's own CRMUser list. Falls back to a small mock set when
   * 2bigha creds are absent / TWOBIGHA_USE_MOCK is on — same convention as
   * every other read here, so the reconcile UI works locally.
   */
  async fetchAgents(filter: AgentFetchFilter = {}): Promise<TwoBighaAgentFetchResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      const admins: TwoBighaAdmin[] = [
        {
          id: 'mock-2b-admin-1',
          email: 'agent.one@2bigha.example',
          firstName: 'Mock',
          lastName: 'Agent One',
          department: 'Sales',
          phone: '+910000000001',
          isActive: true,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'mock-2b-admin-2',
          email: 'agent.two@2bigha.example',
          firstName: 'Mock',
          lastName: 'Agent Two',
          department: 'Legal',
          phone: '+910000000002',
          isActive: false,
          isVerified: true,
          createdAt: new Date().toISOString(),
        },
      ];
      return { status: 'mock', admins, total: admins.length, hasMore: false };
    }

    try {
      if (filter.fetchAll) {
        const pageSize = Math.min(Math.max(filter.limit ?? 100, 1), 100);
        let offset = filter.offset ?? 0;
        const allAdmins: TwoBighaAdmin[] = [];
        let total = 0;
        let hasMore = true;

        while (hasMore) {
          const page = await this.fetchAgentsPage(config, filter, pageSize, offset);
          allAdmins.push(...page.admins);
          total = page.total;
          hasMore = page.hasMore;
          offset += pageSize;
          if (page.admins.length === 0) break;
        }

        return { status: 'fetched', admins: allAdmins, total, hasMore: false };
      }

      return await this.fetchAgentsPage(config, filter, filter.limit ?? 20, filter.offset ?? 0);
    } catch (e: any) {
      this.logger.error(`2bigha getAllAdmins failed: ${e?.message}`);
      return { status: 'failed', admins: [], total: 0, hasMore: false, error: e?.message || 'Unknown error' };
    }
  }
}
