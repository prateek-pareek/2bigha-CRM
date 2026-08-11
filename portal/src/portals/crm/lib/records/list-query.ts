import type { FilterCriteria } from '@/lib/crm/filter-config';

/** Board/calendar window size — must stay within API CRM_MAX_BOARD_PAGE_SIZE (500). */
export const CRM_BOARD_PAGE_SIZE = 500;

export type CrmEmailEngagementQueryOpts = {
  lastActivity?: string;
  emailOpenMode?: string;
  emailOpenDays?: number;
  emailReply?: string;
  emailSent?: string;
};

export function buildCrmListSearchParams(opts: {
  page?: number;
  pageSize?: number;
  search?: string;
  filters?: FilterCriteria[];
  emailEngagement?: CrmEmailEngagementQueryOpts;
  extra?: Record<string, string | undefined>;
}): URLSearchParams {
  const params = new URLSearchParams();
  // Always send pagination so the API never falls back to an unbounded dump.
  params.set('page', String(opts.page != null && opts.page > 0 ? opts.page : 1));
  params.set(
    'pageSize',
    String(
      opts.pageSize != null && opts.pageSize > 0
        ? Math.min(opts.pageSize, CRM_BOARD_PAGE_SIZE)
        : 50,
    ),
  );
  const q = opts.search?.trim();
  if (q) params.set('search', q);
  if (opts.filters?.length) {
    params.set('filters', JSON.stringify(opts.filters));
  }
  if (opts.emailEngagement) {
    const e = opts.emailEngagement;
    if (e.lastActivity && e.lastActivity !== 'all') {
      params.set('lastActivity', e.lastActivity);
    }
    if (e.emailOpenMode && e.emailOpenMode !== 'all') {
      params.set('emailOpenMode', e.emailOpenMode);
    }
    if (e.emailOpenDays != null) {
      params.set('emailOpenDays', String(e.emailOpenDays));
    }
    if (e.emailReply && e.emailReply !== 'all') {
      params.set('emailReply', e.emailReply);
    }
    if (e.emailSent && e.emailSent !== 'all') {
      params.set('emailSent', e.emailSent);
    }
  }
  if (opts.extra) {
    for (const [key, value] of Object.entries(opts.extra)) {
      if (value != null && value !== '') params.set(key, value);
    }
  }
  return params;
}

export function mergeDateRangeFilter(
  filters: FilterCriteria[],
  dateRange: { from: string; to: string } | null,
): FilterCriteria[] {
  if (!dateRange) return filters;
  return [
    ...filters,
    {
      property: 'createdAt',
      operator: 'between',
      value: `${dateRange.from},${dateRange.to}`,
    },
  ];
}

/** Lead-type tab bar (All Leads / Reference / Investor / Lead / Buyer lead, etc.) — empty label = "All". */
export function mergeLeadCategoryFilter(
  filters: FilterCriteria[],
  leadCategory: string,
): FilterCriteria[] {
  if (!leadCategory) return filters;
  return [...filters, { property: 'leadCategory', operator: 'equals', value: leadCategory }];
}

/** Normalize list API payloads that always return `{ data, total }` after scale hardening. */
export function unwrapCrmListPayload<T>(payload: unknown): {
  data: T[];
  total: number;
  hasMore?: boolean;
  totalIsApproximate?: boolean;
} {
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    const p = payload as {
      data: T[];
      total?: number;
      hasMore?: boolean;
      totalIsApproximate?: boolean;
    };
    return {
      data: p.data,
      total: typeof p.total === 'number' ? p.total : p.data.length,
      hasMore: p.hasMore,
      totalIsApproximate: p.totalIsApproximate,
    };
  }
  if (Array.isArray(payload)) {
    return { data: payload as T[], total: payload.length };
  }
  return { data: [], total: 0 };
}
