const EMAIL_RE =
  /[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}/g;

const FALSE_POSITIVE_SUFFIXES = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.css',
  '.js',
]);

const PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.org',
  'domain.com',
  'email.com',
  'yoursite.com',
  'yourdomain.com',
  'sentry.io',
  'wixpress.com',
]);

export type ExtractedEmail = {
  email: string;
  source: 'mailto' | 'text' | 'attribute' | 'json-ld';
};

function normalizeEmail(raw: string): string | null {
  const email = raw
    .trim()
    .replace(/^mailto:/i, '')
    .split('?')[0]
    .toLowerCase();
  if (!email.includes('@')) return null;

  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || !domain.includes('.')) return null;

  for (const suffix of FALSE_POSITIVE_SUFFIXES) {
    if (domain.endsWith(suffix) || email.endsWith(suffix)) return null;
  }

  if (PLACEHOLDER_DOMAINS.has(domain)) return null;
  if (/^(noreply|no-reply|donotreply|do-not-reply)@/.test(email)) return null;

  return email;
}

function deobfuscateText(text: string): string {
  return text
    .replace(/\s*\[?\s*at\s*\]?\s*/gi, '@')
    .replace(/\s*\[?\s*\(\s*at\s*\)\s*\]?\s*/gi, '@')
    .replace(/\s*\[?\s*dot\s*\]?\s*/gi, '.')
    .replace(/\s*\[?\s*\(\s*dot\s*\)\s*\]?\s*/gi, '.');
}

export function extractEmailsFromText(
  text: string,
  source: ExtractedEmail['source'] = 'text',
): ExtractedEmail[] {
  const normalized = deobfuscateText(text);
  const found: ExtractedEmail[] = [];
  const seen = new Set<string>();

  for (const match of normalized.matchAll(EMAIL_RE)) {
    const email = normalizeEmail(match[0]);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    found.push({ email, source });
  }

  return found;
}

export function mergeExtractedEmails(
  batches: ExtractedEmail[][],
): ExtractedEmail[] {
  const seen = new Set<string>();
  const merged: ExtractedEmail[] = [];

  for (const batch of batches) {
    for (const item of batch) {
      if (seen.has(item.email)) continue;
      seen.add(item.email);
      merged.push(item);
    }
  }

  return merged;
}
