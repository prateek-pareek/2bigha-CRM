/** Extract LinkedIn profile slug from a /in/... URL for Hunter linkedin_handle. */
export function linkedinProfileHandle(url: string): string | null {
  try {
    const normalized = url.trim();
    const parsed = new URL(
      normalized.startsWith('http') ? normalized : `https://${normalized}`,
    );
    const parts = parsed.pathname.split('/').filter(Boolean);
    const inIdx = parts.findIndex((p) => p.toLowerCase() === 'in');
    if (inIdx >= 0 && parts[inIdx + 1]) {
      return decodeURIComponent(parts[inIdx + 1]).replace(/\/$/, '');
    }
    return null;
  } catch {
    return null;
  }
}
