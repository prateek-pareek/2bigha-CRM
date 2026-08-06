/** Escape user input for safe MongoDB `$regex` / RegExp use. */
export function escapeRegexLiteral(input: string): string {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSearchQuery(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function looksLikeObjectId(q: string): boolean {
  return /^[a-f0-9]{24}$/i.test(q.trim());
}

/** Case-insensitive contains match; returns null if query too short. */
export function buildContainsRegex(query: string): RegExp | null {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return null;
  if (q.length > 120) return null;
  return new RegExp(escapeRegexLiteral(q), 'i');
}

/**
 * Multi-token AND search: every word must appear in at least one of `fields`.
 * More precise and often faster than one giant alternation regex.
 */
export function buildTokenAndFilter(
  fields: string[],
  query: string,
): Record<string, unknown> | null {
  const tokens = normalizeSearchQuery(query).split(' ').filter(Boolean);
  if (!tokens.length || !fields.length) return null;

  const tokenClauses = tokens
    .map((token) => {
      const re = buildContainsRegex(token);
      if (!re) return null;
      return { $or: fields.map((field) => ({ [field]: re })) };
    })
    .filter((c): c is { $or: Record<string, RegExp>[] } => !!c);

  if (!tokenClauses.length) return null;
  if (tokenClauses.length === 1) return tokenClauses[0];
  return { $and: tokenClauses };
}

/** Quote tokens for MongoDB `$text` (emails, hyphens, etc.). */
export function toTextSearchString(query: string): string {
  const tokens = normalizeSearchQuery(query).split(' ').filter(Boolean);
  return tokens
    .map((t) => (t.includes('@') || /[-+]/.test(t) ? `"${t.replace(/"/g, '')}"` : t))
    .join(' ');
}
