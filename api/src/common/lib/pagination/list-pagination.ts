export type ParsedListPagination = {
  page: number;
  pageSize: number;
  search?: string;
};

/** Standard list page (tables, API clients). */
export const CRM_DEFAULT_PAGE = 1;
export const CRM_DEFAULT_PAGE_SIZE = 50;
/** Hard cap for normal list requests. */
export const CRM_MAX_PAGE_SIZE = 200;
/**
 * Hard cap for board/calendar “window” fetches.
 * Boards must never load an unbounded collection at crore scale.
 */
export const CRM_MAX_BOARD_PAGE_SIZE = 500;
/** Typeahead / picker endpoints. */
export const CRM_MAX_PICKER_LIMIT = 100;
/** CSV / bulk export hard stop. */
export const CRM_MAX_EXPORT_ROWS = 50_000;
/**
 * Cap exact counts: if match set reaches this, total is reported as approximate.
 * Avoids full collection scans on every list request at 10M+ rows.
 */
export const CRM_COUNT_SCAN_CAP = 10_001;
/** Abort slow list queries rather than hanging the API. */
export const CRM_LIST_MAX_TIME_MS = 8_000;

export type ScalableListResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** True when `total` stopped at CRM_COUNT_SCAN_CAP (or estimated). */
  totalIsApproximate?: boolean;
};

export function clampPageSize(
  pageSize: number,
  max: number = CRM_MAX_PAGE_SIZE,
): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return CRM_DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(pageSize)), max);
}

/**
 * Parse `page` + `pageSize` (or legacy `limit`) from query strings.
 * Returns null if not a valid paged request (legacy callers).
 */
export function parseListPaginationQuery(query: {
  page?: string;
  pageSize?: string;
  limit?: string;
  search?: string;
}): ParsedListPagination | null {
  const p =
    query.page !== undefined && query.page !== ''
      ? parseInt(query.page, 10)
      : NaN;
  const psRaw = query.pageSize ?? query.limit;
  const ps =
    psRaw !== undefined && psRaw !== ''
      ? parseInt(String(psRaw), 10)
      : NaN;
  if (
    Number.isFinite(p) &&
    Number.isFinite(ps) &&
    p > 0 &&
    ps > 0 &&
    ps <= CRM_MAX_PAGE_SIZE
  ) {
    return {
      page: p,
      pageSize: Math.min(ps, CRM_MAX_PAGE_SIZE),
      search: query.search?.trim() || undefined,
    };
  }
  return null;
}

/**
 * Always returns pagination — defaults when query params are missing.
 * Use this for crore-scale safety so list endpoints never dump full collections.
 */
export function resolveListPagination(
  query: {
    page?: string;
    pageSize?: string;
    limit?: string;
    search?: string;
  },
  opts?: {
    defaultPageSize?: number;
    maxPageSize?: number;
  },
): ParsedListPagination {
  const max = opts?.maxPageSize ?? CRM_MAX_PAGE_SIZE;
  const defaultPs = opts?.defaultPageSize ?? CRM_DEFAULT_PAGE_SIZE;
  const p =
    query.page !== undefined && query.page !== ''
      ? parseInt(query.page, 10)
      : CRM_DEFAULT_PAGE;
  const psRaw = query.pageSize ?? query.limit;
  const ps =
    psRaw !== undefined && psRaw !== ''
      ? parseInt(String(psRaw), 10)
      : defaultPs;
  return {
    page: Number.isFinite(p) && p > 0 ? Math.floor(p) : CRM_DEFAULT_PAGE,
    pageSize: clampPageSize(
      Number.isFinite(ps) ? ps : defaultPs,
      max,
    ),
    search: query.search?.trim() || undefined,
  };
}

export function buildScalableListResult<T>(
  rows: T[],
  opts: {
    page: number;
    pageSize: number;
    total: number;
    totalIsApproximate?: boolean;
  },
): ScalableListResult<T> {
  const { page, pageSize, total, totalIsApproximate } = opts;
  const hasMore =
    totalIsApproximate === true
      ? rows.length >= pageSize || page * pageSize < total
      : page * pageSize < total;
  return {
    data: rows,
    total,
    page,
    pageSize,
    hasMore,
    ...(totalIsApproximate ? { totalIsApproximate: true } : {}),
  };
}
