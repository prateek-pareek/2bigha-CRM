/** Normalize X/Twitter @handle or profile URL to bare handle (no @). */
export function normalizeTwitterHandle(raw: unknown): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';

  let s = t.replace(/^@+/, '').trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./i, '').toLowerCase();
      if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] && !['home', 'i', 'intent', 'messages', 'search'].includes(parts[0])) {
          s = parts[0];
        }
      }
    }
  } catch {
    /* keep s */
  }

  s = s.replace(/^@+/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(s)) return '';
  return s;
}

export function xProfileUrlFromHandle(handle: unknown): string | null {
  const h = normalizeTwitterHandle(handle);
  if (!h) return null;
  return `https://x.com/${h}`;
}
