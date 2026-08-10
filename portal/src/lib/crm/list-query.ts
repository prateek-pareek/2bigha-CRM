import type { FilterCriteria } from '@/lib/crm/filter-config';

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
  if (opts.page != null) params.set('page', String(opts.page));
  if (opts.pageSize != null) params.set('pageSize', String(opts.pageSize));
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
