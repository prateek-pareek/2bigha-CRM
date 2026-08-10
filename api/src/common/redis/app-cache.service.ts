import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { OptionalRedisService } from './optional-redis.service';
import { redisGetOrSet } from './redis-cache.util';

export type CrmCacheEntity =
  | 'leads'
  | 'contacts'
  | 'organizations'
  | 'deals';

@Injectable()
export class AppCacheService {
  constructor(private readonly redis: OptionalRedisService) {}

  digest(payload: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 24);
  }

  crmListTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_CRM_LIST_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
  }

  crmDetailTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_CRM_DETAIL_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 120;
  }

  crmPickerTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_CRM_PICKER_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300;
  }

  wikiTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_WIKI_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
  }

  /** Published blog / case-study JSON for marketing site + desk list. */
  socialPublicTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_SOCIAL_PUBLIC_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300;
  }

  searchTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_SEARCH_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 45;
  }

  crmReportingTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_CRM_REPORTING_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
  }

  crmBoardTtl(): number {
    const raw = Number(process.env.REDIS_CACHE_TTL_CRM_BOARD_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
  }

  /** Serialize HRMS author scope for reporting cache keys. */
  reportingAuthorScope(
    scopedAuthorId?: Types.ObjectId | Types.ObjectId[] | null,
  ): string {
    if (!scopedAuthorId) return 'all';
    const ids = (
      Array.isArray(scopedAuthorId) ? scopedAuthorId : [scopedAuthorId]
    )
      .map((id) => String(id))
      .sort();
    return ids.join(',') || 'all';
  }

  reportingBoardKey(days: number | string, ownerKey: string): string {
    // v8: day × platform × employee intake detail for leads & deals
    return `crm:reporting:board:v8:${days}:${ownerKey}`;
  }

  reportingLeadsDashboardKey(
    days: number | string,
    ownerKey: string,
    compareKey = 'previous',
  ): string {
    return `crm:reporting:leads-dashboard:v2:${days}:${compareKey}:${ownerKey}`;
  }

  reportingAttentionKey(params: {
    owner?: string;
    ownerMatchExtras?: string[];
    window?: string;
    scopedAuthorId?: Types.ObjectId | Types.ObjectId[] | null;
  }): string {
    const extras = [...(params.ownerMatchExtras || [])]
      .map((s) => String(s).trim())
      .filter(Boolean)
      .sort();
    const hash = this.digest({
      owner: params.owner?.trim() || 'all',
      extras,
      window: params.window?.trim() || 'default',
      authors: this.reportingAuthorScope(params.scopedAuthorId),
    });
    return `crm:reporting:attention:v5:${hash}`;
  }

  reportingWorkspaceKey(params: {
    owner: string;
    ownerMatchExtras?: string[];
    window?: string;
    sections?: string;
    scopedAuthorId?: Types.ObjectId | Types.ObjectId[] | null;
    dealAccessFilter?: Record<string, unknown> | null;
  }): string {
    const extras = [...(params.ownerMatchExtras || [])]
      .map((s) => String(s).trim())
      .filter(Boolean)
      .sort();
    const hash = this.digest({
      owner: params.owner.trim(),
      extras,
      window: params.window?.trim() || 'default',
      sections: params.sections?.trim() || '',
      authors: this.reportingAuthorScope(params.scopedAuthorId),
      dealAccess: params.dealAccessFilter
        ? this.digest(params.dealAccessFilter)
        : 'all',
    });
    // v11: never-contacted attention respects workspace date window
    return `crm:reporting:workspace:v11:${hash}`;
  }

  /** Stable scope for CRM list/detail cache keys (permissions + pipeline restrictions). */
  crmUserScope(user?: any): string {
    if (!user) return 'anon';
    const uid = String(user.userId || user.id || user._id || '');
    const role = String(user.role || '').toUpperCase();
    const leadsPipe = user.assignedLeadsPipeline
      ? String(user.assignedLeadsPipeline)
      : '';
    const dealsPipe = user.assignedDealsPipeline
      ? String(user.assignedDealsPipeline)
      : '';
    const canClients = user.permittedTools || user.permissions ? 'p' : '';
    return this.digest({
      uid,
      role,
      leadsPipe,
      dealsPipe,
      canClients,
    });
  }

  wikiUserScope(user: {
    role?: string;
    email?: string;
    userId?: string;
  }): string {
    return this.digest({
      role: String(user?.role || '').toUpperCase(),
      email: String(user?.email || '').toLowerCase(),
      userId: String(user?.userId || ''),
    });
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    return redisGetOrSet(this.redis, key, ttlSeconds, factory);
  }

  /**
   * Cache key for paged CRM list APIs, or null when not cacheable (unpaged full dumps).
   */
  crmListKey(
    entity: CrmCacheEntity,
    user: any | undefined,
    params: Record<string, unknown>,
  ): string | null {
    const listOpts = params.listOpts as
      | {
          page?: number;
          pageSize?: number;
          search?: string;
          mine?: boolean;
          leadType?: string;
          filters?: unknown[];
          emailEngagement?: unknown;
        }
      | undefined;
    const isPaged =
      listOpts &&
      Number.isFinite(listOpts.page) &&
      Number.isFinite(listOpts.pageSize) &&
      (listOpts.page ?? 0) > 0 &&
      (listOpts.pageSize ?? 0) > 0;
    if (!isPaged) return null;

    const scope =
      entity === 'organizations' ? 'global' : this.crmUserScope(user);
    const hash = this.digest({ entity, scope, ...params, listOpts });
    return `crm:${entity}:list:v2:${hash}`;
  }

  /**
   * Kanban / board full-list fetch (unpaged, pipeline-scoped, no search or advanced filters).
   */
  crmBoardListKey(
    entity: 'leads' | 'deals',
    user: any | undefined,
    params: Record<string, unknown>,
  ): string | null {
    if (entity !== 'leads' && entity !== 'deals') return null;
    const pipelineId = params.pipelineId;
    if (!pipelineId || typeof pipelineId !== 'string' || !pipelineId.trim()) {
      return null;
    }
    const listOpts = params.listOpts as
      | {
          search?: string;
          mine?: boolean;
          filters?: unknown[];
          emailEngagement?: unknown;
        }
      | undefined;
    if (listOpts?.search?.trim()) return null;
    if (listOpts?.mine) return null;
    if (listOpts?.filters?.length) return null;
    if (listOpts?.emailEngagement) return null;

    const scope = this.crmUserScope(user);
    const hash = this.digest({
      entity,
      scope,
      pipelineId: pipelineId.trim(),
      includeUnassigned: !!params.includeUnassignedForDefaultPipeline,
    });
    return `crm:${entity}:board:v1:${hash}`;
  }

  /** Paged list key, or short-TTL board key when applicable. */
  resolveCrmListCache(
    entity: CrmCacheEntity,
    user: any | undefined,
    params: Record<string, unknown>,
  ): { key: string; ttl: number } | null {
    const listKey = this.crmListKey(entity, user, params);
    if (listKey) return { key: listKey, ttl: this.crmListTtl() };
    if (entity === 'leads' || entity === 'deals') {
      const boardKey = this.crmBoardListKey(entity, user, params);
      if (boardKey) return { key: boardKey, ttl: this.crmBoardTtl() };
    }
    return null;
  }

  crmDetailKey(entity: CrmCacheEntity, id: string, user?: any): string {
    const scope = this.crmUserScope(user);
    return `crm:${entity}:one:v1:${id}:${scope}`;
  }

  async invalidateReporting(): Promise<void> {
    await this.redis.delByPrefix('crm:reporting:');
  }

  /** Await this after CRM writes so list/board cache cannot be read before prefix deletes finish. */
  async invalidateCrm(entity: CrmCacheEntity, recordId?: string): Promise<void> {
    await this.redis.delByPrefix(`crm:${entity}:list:v2:`);
    // Legacy prefix (pre-scale key bump) — safe no-op if empty.
    await this.redis.delByPrefix(`crm:${entity}:list:v1:`);
    if (entity === 'leads' || entity === 'deals') {
      await this.redis.delByPrefix(`crm:${entity}:board:v1:`);
    }
    if (recordId) {
      await this.redis.delByPrefix(`crm:${entity}:one:v1:${recordId}:`);
    } else {
      await this.redis.delByPrefix(`crm:${entity}:one:v1:`);
    }
    if (entity === 'organizations') {
      await this.redis.del('crm:orgs:picker:v1');
    }
    if (entity === 'contacts') {
      await this.redis.delByPrefix('crm:contacts:picker:v1:');
    }
    await this.redis.delByPrefix('crm:search:v1:');
    await this.redis.delByPrefix('crm:search:');
    await this.invalidateReporting();
  }

  invalidateWikiSpacesList(): void {
    void this.redis.delByPrefix('wiki:spaces:v1:');
  }

  invalidateWikiSpace(spaceId: string): void {
    this.invalidateWikiSpacesList();
    void this.redis.delByPrefix(`wiki:space-pages:v1:${spaceId}:`);
    void this.redis.delByPrefix(`wiki:tree:v1:${spaceId}:`);
  }

  invalidateWikiPage(pageId: string, spaceId?: string): void {
    void this.redis.delByPrefix(`wiki:page:v1:${pageId}:`);
    if (spaceId) this.invalidateWikiSpace(spaceId);
    else void this.redis.delByPrefix('wiki:space-pages:v1:');
  }

  socialPublicListKey(
    kind: 'blog' | 'case-study',
    market?: 'freelancer' | 'agency',
    query?: {
      limit?: number;
      page?: number;
      category?: string;
      website?: string;
    },
  ): string {
    const q = query || {};
    const extra =
      q.limit || q.page || q.category || q.website
        ? `:${this.digest({
            limit: q.limit,
            page: q.page,
            category: q.category,
            website: q.website,
          })}`
        : '';
    return `social:public:${kind}:list:v1:${market || 'all'}${extra}`;
  }

  socialPublicSlugKey(
    kind: 'blog' | 'case-study',
    slug: string,
    market?: 'freelancer' | 'agency',
    websiteId?: string,
  ): string {
    const s = String(slug || '')
      .trim()
      .toLowerCase();
    const w = String(websiteId || '').trim() || 'all';
    return `social:public:${kind}:slug:v1:${s}:${market || 'all'}:${w}`;
  }

  socialBlogDeskListKey(params: Record<string, unknown>): string {
    const hash = this.digest(params);
    return `social:blog:desk-list:v1:${hash}`;
  }

  invalidateSocialBlog(): void {
    void this.redis.delByPrefix('social:public:');
    void this.redis.delByPrefix('social:blog:desk-list:v1:');
  }
}
