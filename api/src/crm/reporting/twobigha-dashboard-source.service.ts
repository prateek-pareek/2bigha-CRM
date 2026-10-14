import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  getTwoBighaConfig,
  twoBighaGraphqlRequest,
} from '../shared/twobigha-graphql.util';

/**
 * Live 2bigha marketplace data for the role dashboards.
 *
 * Properties / farms: built from the three approval queues, which are disjoint
 * (`getApprovedProperties` = approved only, `getPendingApprovalProperties`,
 * `getRejectedProperties`; same for farms). The generic `properties` query is far
 * slower with these fields and can time out, so it is not used here.
 *
 * Subscribers: `adminAllSubscribers` (each row carries `soldByAdminId` /
 * `soldByAdminEmail`, which links a sale to a CRM user's `twobighaAdminId` / email).
 *
 * 2bigha staging is slow and drops parallel bursts with 504s, so pages are small,
 * fetched two at a time with a per-request timeout and one retry. Both datasets are
 * kept warm in the background (boot + every few minutes) and served from memory;
 * a dashboard never waits more than `waitMs` for them. `null` = not available yet
 * (mock mode, still warming, or 2bigha down with no earlier copy).
 */

export interface TwoBighaListingRow {
  id: string;
  kind: 'property' | 'farm';
  status: 'Approved' | 'Pending' | 'Rejected';
  createdAt: number | null;
  approvedAt: number | null;
  rejectedAt: number | null;
  createdByAdminId: string | null;
}

/** Index rows + each queue's authoritative total (2bigha paging can skip rows). */
export interface TwoBighaListingIndex {
  rows: TwoBighaListingRow[];
  shortfall: Array<{ kind: TwoBighaListingRow['kind']; status: TwoBighaListingRow['status']; missing: number }>;
}

export interface TwoBighaSubscriberRow {
  status: string;
  planName: string;
  isBase: boolean;
  startsAt: number | null;
  soldByAdminId: string | null;
  soldByAdminEmail: string | null;
  /** The subscribing 2bigha user — matched to CRM Client.twobighaUserId. */
  userId: string | null;
  userEmail: string | null;
  userPhone: string | null;
}

interface CacheEntry<T> {
  value: T | null;
  fetchedAt: number;
  failedAt: number;
  inflight?: Promise<T | null>;
}

const REFRESH_MS = 5 * 60_000;
const FAILURE_BACKOFF_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const CONCURRENCY = 2;
const LISTING_PAGE = 250;
const SUBSCRIBER_PAGE = 100; // 2bigha caps adminAllSubscribers at 100 rows/page
const MAX_PAGES = 80;

const LISTING_QUEUES: Array<{
  field: string;
  input: 'GetPropertiesInput' | 'GetFarmsInput';
  kind: TwoBighaListingRow['kind'];
  status: TwoBighaListingRow['status'];
}> = [
  { field: 'getApprovedProperties', input: 'GetPropertiesInput', kind: 'property', status: 'Approved' },
  { field: 'getPendingApprovalProperties', input: 'GetPropertiesInput', kind: 'property', status: 'Pending' },
  { field: 'getRejectedProperties', input: 'GetPropertiesInput', kind: 'property', status: 'Rejected' },
  { field: 'getApprovedFarms', input: 'GetFarmsInput', kind: 'farm', status: 'Approved' },
  { field: 'getPendingApprovalFarms', input: 'GetFarmsInput', kind: 'farm', status: 'Pending' },
  { field: 'getRejectedFarms', input: 'GetFarmsInput', kind: 'farm', status: 'Rejected' },
];

@Injectable()
export class TwoBighaDashboardSourceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TwoBighaDashboardSourceService.name);
  private listings: CacheEntry<TwoBighaListingIndex> = { value: null, fetchedAt: 0, failedAt: 0 };
  private subscribers: CacheEntry<TwoBighaSubscriberRow[]> = { value: null, fetchedAt: 0, failedAt: 0 };
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap() {
    if (!this.isEnabled() || process.env.TWOBIGHA_DASHBOARD_PREFETCH === 'false') return;
    const warm = () => {
      void this.refresh(this.subscribers, () => this.fetchSubscribers());
      void this.refresh(this.listings, () => this.fetchListings());
    };
    setTimeout(warm, 5_000).unref?.();
    this.timer = setInterval(warm, REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isEnabled(): boolean {
    return !!getTwoBighaConfig();
  }

  getListings(waitMs = 5_000): Promise<TwoBighaListingIndex | null> {
    return this.read(this.listings, () => this.fetchListings(), waitMs);
  }

  getSubscribers(waitMs = 5_000): Promise<TwoBighaSubscriberRow[] | null> {
    return this.read(this.subscribers, () => this.fetchSubscribers(), waitMs);
  }

  /** Cached value now (refreshing in the background when stale); else wait ≤ waitMs. */
  private async read<T>(
    entry: CacheEntry<T>,
    load: () => Promise<T | null>,
    waitMs: number,
  ): Promise<T | null> {
    if (!this.isEnabled()) return null;
    if (Date.now() - entry.fetchedAt >= REFRESH_MS) void this.refresh(entry, load);
    if (entry.value) return entry.value;
    if (!entry.inflight) return null; // backing off after a failure
    return Promise.race([
      entry.inflight,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs).unref?.()),
    ]);
  }

  private refresh<T>(entry: CacheEntry<T>, load: () => Promise<T | null>): Promise<T | null> {
    if (entry.inflight) return entry.inflight;
    if (Date.now() - entry.failedAt < FAILURE_BACKOFF_MS) return Promise.resolve(entry.value);
    entry.inflight = load()
      .then((v) => {
        if (v) {
          entry.value = v;
          entry.fetchedAt = Date.now();
        }
        return entry.value;
      })
      .catch((e) => {
        entry.failedAt = Date.now();
        this.logger.warn(`2bigha dashboard fetch failed: ${e instanceof Error ? e.message : e}`);
        return entry.value; // keep the last good copy
      })
      .finally(() => {
        entry.inflight = undefined;
      });
    return entry.inflight;
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const config = getTwoBighaConfig();
    if (!config) throw new Error('2bigha disabled');
    try {
      return await twoBighaGraphqlRequest<T>(config, query, variables, { timeoutMs: REQUEST_TIMEOUT_MS });
    } catch {
      return twoBighaGraphqlRequest<T>(config, query, variables, { timeoutMs: REQUEST_TIMEOUT_MS });
    }
  }

  /** Page 1 tells how many pages there are; the rest are fetched CONCURRENCY at a time. */
  private async fetchAllPages<R>(
    fetchPage: (page: number) => Promise<{ rows: R[]; totalPages: number }>,
  ): Promise<R[]> {
    const first = await fetchPage(1);
    const totalPages = Math.min(first.totalPages || 1, MAX_PAGES);
    const pages: R[][] = [first.rows];
    let next = 2;
    const worker = async () => {
      while (next <= totalPages) {
        const page = next++;
        pages[page - 1] = (await fetchPage(page)).rows;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return pages.flat();
  }

  private async fetchListings(): Promise<TwoBighaListingIndex | null> {
    if (!this.isEnabled()) return null;
    const started = Date.now();
    const out = new Map<string, TwoBighaListingRow>();
    const shortfall: TwoBighaListingIndex['shortfall'] = [];
    // Queues one after another — never more than CONCURRENCY requests in flight.
    for (const q of LISTING_QUEUES) {
      const query = `
        query DashboardListingIndex($input: ${q.input}!) {
          ${q.field}(input: $input) {
            data { property { id approvalStatus createdAt approvedAt rejectedAt createdByAdminId } }
            meta { totalPages total }
          }
        }
      `;
      let reported = 0;
      const rows = await this.fetchAllPages(async (page) => {
        const data = await this.request<Record<string, { data?: any[]; meta?: any } | null>>(query, {
          input: { page, limit: LISTING_PAGE },
        });
        const r = data?.[q.field];
        if (page === 1) reported = Number(r?.meta?.total) || 0;
        return { rows: r?.data || [], totalPages: Number(r?.meta?.totalPages) || 1 };
      });
      const before = out.size;
      for (const row of rows) {
        const p = row?.property;
        if (!p?.id) continue;
        out.set(`${q.kind}:${p.id}`, {
          id: String(p.id),
          kind: q.kind,
          status: normalizeApproval(p.approvalStatus) || q.status,
          createdAt: toMs(p.createdAt),
          approvedAt: toMs(p.approvedAt),
          rejectedAt: toMs(p.rejectedAt),
          createdByAdminId: p.createdByAdminId ? String(p.createdByAdminId) : null,
        });
      }
      // 2bigha's page ordering isn't stable, so a scan can repeat some rows and skip
      // others. Its meta.total is authoritative — record the gap so totals stay exact.
      const missing = reported - (out.size - before);
      if (missing > 0) shortfall.push({ kind: q.kind, status: q.status, missing });
    }
    const skipped = shortfall.reduce((a, x) => a + x.missing, 0);
    this.logger.log(
      `2bigha listing index: ${out.size} rows in ${Date.now() - started}ms` +
        (skipped ? ` (${skipped} skipped by 2bigha paging, counted as unattributed)` : ''),
    );
    return { rows: [...out.values()], shortfall };
  }

  private async fetchSubscribers(): Promise<TwoBighaSubscriberRow[] | null> {
    if (!this.isEnabled()) return null;
    const started = Date.now();
    const query = `
      query DashboardSubscribers($input: AdminSubscriberFilterInput!) {
        adminAllSubscribers(input: $input) {
          totalPages
          items { status planName isBase startsAt soldByAdminId soldByAdminEmail userId userEmail userPhone }
        }
      }
    `;
    const items = await this.fetchAllPages(async (page) => {
      const data = await this.request<{ adminAllSubscribers?: any }>(query, {
        input: { page, limit: SUBSCRIBER_PAGE },
      });
      const r = data?.adminAllSubscribers;
      return { rows: r?.items || [], totalPages: Number(r?.totalPages) || 1 };
    });
    this.logger.log(`2bigha subscribers: ${items.length} rows in ${Date.now() - started}ms`);
    return items.map(
      (s: any): TwoBighaSubscriberRow => ({
        status: String(s?.status || '').toLowerCase(),
        planName: String(s?.planName || 'Unknown'),
        isBase: s?.isBase === true,
        startsAt: toMs(s?.startsAt),
        soldByAdminId: s?.soldByAdminId ? String(s.soldByAdminId) : null,
        soldByAdminEmail: s?.soldByAdminEmail ? String(s.soldByAdminEmail).trim().toLowerCase() : null,
        userId: s?.userId ? String(s.userId) : null,
        userEmail: s?.userEmail ? String(s.userEmail).trim().toLowerCase() : null,
        userPhone: s?.userPhone ? String(s.userPhone) : null,
      }),
    );
  }
}

function toMs(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function normalizeApproval(v: unknown): TwoBighaListingRow['status'] | null {
  const s = String(v || '').toUpperCase();
  if (s === 'APPROVED') return 'Approved';
  if (s === 'PENDING' || s === 'PENDING_REVIEW') return 'Pending';
  if (s === 'REJECTED') return 'Rejected';
  return null;
}
