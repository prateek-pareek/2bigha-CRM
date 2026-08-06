export type ParsedListPagination = {
  page: number;
  pageSize: number;
  search?: string;
};

/** Parse `page` + `pageSize` (or legacy `limit`) from query strings. Returns null if not a valid paged request. */
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
    ps <= 200
  ) {
    return {
      page: p,
      pageSize: Math.min(ps, 200),
      search: query.search?.trim() || undefined,
    };
  }
  return null;
}
