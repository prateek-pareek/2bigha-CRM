/**
 * Heuristics for CRM email open/click tracking.
 * Mail scanners, Secure Email Gateways, and privacy proxies often hit the
 * tracking pixel / wrapped links without a human reading the message.
 */

/** Ignore pixel opens in this window after send — most ATP/SEG scanners hit immediately. */
export const EMAIL_OPEN_GRACE_MS = 90_000;

/** Collapse duplicate pixel fetches from the same proxy burst. */
export const EMAIL_OPEN_DEBOUNCE_MS = 8_000;

/**
 * Returns true when the request is unlikely to be a real human open/click.
 * GoogleImageProxy is intentionally allowed — Gmail loads images through it when
 * the recipient actually views the message (with images enabled).
 */
export function isLikelyEmailTrackingBot(userAgent: string | undefined | null): boolean {
  const ua = String(userAgent || '')
    .trim()
    .toLowerCase();
  if (!ua) return true;

  // Real Gmail opens use Google's image proxy — do not treat as a bot.
  if (ua.includes('googleimageproxy') || ua.includes('ggpht.com')) {
    return false;
  }

  return (
    /bot|spider|crawl|slurp|crawler|ahrefs|semrush|dataprovider|ptst|scrapy|phantom|headless|puppeteer|playwright/i.test(
      ua,
    ) ||
    /python-requests|python\/|curl\/|wget|axios\/|go-http|httpclient|java\/|okhttp|libwww|node-fetch|undici/i.test(
      ua,
    ) ||
    /safelinks|proofpoint|barracuda|mimecast|messagelabs|symantec|forcepoint|virustotal|spamassassin|mailscanner|url.?expan|urldefense|fireeye|crowdstrike/i.test(
      ua,
    ) ||
    /microsoft office|ms-office|msoffice|outlook-https|lync|skypeuripreview|teams.?bot/i.test(
      ua,
    ) ||
    /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|applebot|bingbot|yandex|baidu|duckduck/i.test(
      ua,
    ) ||
    /preview|pre-?fetch|link.?check|link.?scanner|security.?scanner|threat.?scan/i.test(
      ua,
    )
  );
}

export function isWithinEmailOpenGracePeriod(
  createdAt: Date | string | undefined | null,
  nowMs = Date.now(),
  graceMs = EMAIL_OPEN_GRACE_MS,
): boolean {
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs < graceMs;
}

export function isDuplicateOpenBurst(
  lastOpenedAt: Date | string | undefined | null,
  nowMs = Date.now(),
  debounceMs = EMAIL_OPEN_DEBOUNCE_MS,
): boolean {
  if (!lastOpenedAt) return false;
  const lastMs = new Date(lastOpenedAt).getTime();
  if (Number.isNaN(lastMs)) return false;
  return nowMs - lastMs < debounceMs;
}
