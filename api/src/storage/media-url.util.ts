/** Public API base used to absolutize `/uploads/...` paths for external consumers. */
export function publicApiBaseUrl(): string {
  return (
    process.env.PUBLIC_API_URL ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000'
  )
    .trim()
    .replace(/\/$/, '');
}

/**
 * Turn relative upload paths into absolute URLs for blog syndication, OG tags, and public CMS.
 * Already-absolute URLs are returned unchanged.
 */
export function resolvePublicMediaUrl(
  url: string | undefined | null,
): string | undefined {
  const u = String(url ?? '').trim();
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) {
    return u;
  }
  if (u.startsWith('//')) return `https:${u}`;
  const base = publicApiBaseUrl();
  if (!base) return u;
  if (u.startsWith('/')) return `${base}${u}`;
  return u;
}

/** Absolutize `<img src="…">` (and srcset entries) in blog HTML for external websites. */
export function resolvePublicMediaUrlsInHtml(html: string | undefined | null): string {
  const raw = String(html ?? '');
  if (!raw.trim()) return raw;

  const resolvedSrc = raw.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (_match, prefix: string, src: string, suffix: string) => {
      const next = resolvePublicMediaUrl(src);
      return next ? `${prefix}${next}${suffix}` : `${prefix}${src}${suffix}`;
    },
  );

  return resolvedSrc.replace(
    /(<img\b[^>]*\bsrcset=["'])([^"']+)(["'][^>]*>)/gi,
    (_match, prefix: string, srcset: string, suffix: string) => {
      const nextSrcset = srcset
        .split(',')
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) return trimmed;
          const [url, ...rest] = trimmed.split(/\s+/);
          const resolved = resolvePublicMediaUrl(url);
          return resolved ? [resolved, ...rest].join(' ') : trimmed;
        })
        .join(', ');
      return `${prefix}${nextSrcset}${suffix}`;
    },
  );
}
