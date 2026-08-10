/** Escape text for safe inclusion inside HTML email (headers, attribution lines). */
export function escapeHtmlPlainText(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Clean legacy activity.content lines that still contain Outlook cid placeholders. */
export function stripCidNoiseFromPlainText(text: string): string {
  return (text || '')
    .replace(/\[\s*cid:[-a-fA-F0-9]+\s*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function base64UrlDecodeToUtf8(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Restore original destination URLs from CRM click-tracking redirects. */
function unwrapClickTrackingUrl(url: string): string {
  const raw = url.trim();
  if (!/\/crm\/track\/click\//i.test(raw)) return raw;
  try {
    const u = new URL(raw, 'https://crm-preview.local');
    const enc = u.searchParams.get('u');
    if (!enc) return raw;
    const decoded = base64UrlDecodeToUtf8(enc);
    if (decoded && /^https?:\/\//i.test(decoded)) return decoded;
    return raw;
  } catch {
    return raw;
  }
}

function escapeHtmlAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Removes open-tracking pixels and unwraps click-tracking links so viewing email HTML
 * inside the CRM (timeline, inbox, etc.) does not fire recipient tracking or pollute metrics.
 */
export function stripCrmEmailTrackingFromHtmlForPreview(html: string): string {
  let s = String(html || '');

  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    return /\/crm\/track\/open\//i.test(tag) ? '' : tag;
  });

  s = s.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, before: string, url: string, after: string) => {
      if (!url.includes('/crm/track/click/')) return match;
      const dest = unwrapClickTrackingUrl(url);
      if (dest === url) return match;
      return `<a ${before}href="${escapeHtmlAttrValue(dest)}"${after}>`;
    },
  );

  return s;
}

/** Wrap stored email HTML for a sandboxed iframe (timeline / activity views). */
export function buildCrmEmailPreviewSrcDoc(bodyHtml: string): string {
  const stripped = stripCrmEmailTrackingFromHtmlForPreview(bodyHtml);
  const safe = String(stripped).replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><base target="_blank"/><style>body{font-family:system-ui,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.625;padding:20px;margin:0;word-break:break-word;color:var(--text-main);}p{margin:0 0 1em;}a{color:#0369a1;}img{max-width:100%;height:auto;}</style></head><body>${safe}</body></html>`;
}
