/** Ensure external links open safely (add https if scheme missing). */
export function normalizeCrmUrl(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
