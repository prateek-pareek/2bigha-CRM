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

/** Normalize Content-ID / cid: values for attachment matching. */
export function normalizeEmailCid(value: string): string {
  return String(value || "")
    .replace(/^cid:/i, "")
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Content-IDs the HTML expects to be filled in: raw `cid:` sources plus the
 * `data-crm-cid` markers the API leaves behind when sanitizing inbound mail.
 */
export function collectEmailCidRefsFromHtml(html: string): string[] {
  const s = String(html || "");
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const cid = normalizeEmailCid(raw);
    if (!cid || seen.has(cid)) return;
    seen.add(cid);
    out.push(cid);
  };

  for (const m of s.matchAll(/\ssrc=["']cid:([^"']+)["']/gi)) push(m[1]);
  for (const m of s.matchAll(/\sdata-crm-cid=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of s.matchAll(/url\(\s*["']?cid:([^)"']+)["']?\s*\)/gi)) push(m[1]);
  for (const m of s.matchAll(/\/\*crm-cid:([^*]+)\*\//gi)) push(m[1]);

  return out;
}

/**
 * Replace empty `data-crm-cid` / leftover `cid:` image sources with resolved blob/object URLs.
 */
export function rewriteCrmCidImagesInHtml(
  html: string,
  cidToUrl: Record<string, string>,
): string {
  if (!html || !cidToUrl || Object.keys(cidToUrl).length === 0) return html;
  let s = String(html);

  s = s.replace(
    /(<img\b[^>]*?\s)src=(["'])cid:([^"']+)\2([^>]*>)/gi,
    (full, before: string, quote: string, cid: string, after: string) => {
      const url = cidToUrl[normalizeEmailCid(cid)];
      if (!url) return full;
      return `${before}src=${quote}${url}${quote}${after}`;
    },
  );

  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const cidMatch = tag.match(/\sdata-crm-cid=["']([^"']+)["']/i);
    if (!cidMatch?.[1]) return tag;
    const url = cidToUrl[normalizeEmailCid(cidMatch[1])];
    if (!url) return tag;
    if (/\ssrc=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\ssrc=["'][^"']*["']/i, ` src="${escapeHtmlAttrValue(url)}"`);
    }
    return tag.replace(/^<img\b/i, `<img src="${escapeHtmlAttrValue(url)}"`);
  });

  s = s.replace(
    /url\(\s*["']?cid:([^)"']+)["']?\s*\)/gi,
    (full, cid: string) => {
      const url = cidToUrl[normalizeEmailCid(cid)];
      return url ? `url("${escapeHtmlAttrValue(url)}")` : full;
    },
  );

  s = s.replace(
    /url\(\s*\)\s*\/\*crm-cid:([^*]+)\*\//gi,
    (full, cid: string) => {
      const url = cidToUrl[normalizeEmailCid(cid)];
      return url ? `url("${escapeHtmlAttrValue(url)}")` : full;
    },
  );

  return s;
}

/**
 * Drop inline images we could not resolve (unknown cid, or a src the API blanked out)
 * so the preview shows no broken-image placeholders. Remote images are kept.
 */
export function dropUnresolvedInlineImagesInHtml(html: string): string {
  let s = String(html || "");
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\ssrc=["']cid:/i.test(tag)) return "";
    const src = tag.match(/\ssrc=["']([^"']*)["']/i);
    if (src && !src[1].trim()) return "";
    if (!src && /\sdata-crm-cid=/i.test(tag)) return "";
    return tag;
  });
  s = s.replace(/<figure\b[^>]*>\s*<\/figure>/gi, "");
  s = s.replace(/<picture\b[^>]*>\s*<\/picture>/gi, "");
  return s;
}

/**
 * Remove embedded images from activity email HTML so the timeline stays compact;
 * images are opened on demand from the attachment chips (same pattern as PDFs).
 */
export function collapseEmbeddedImagesInHtml(html: string): string {
  let s = String(html || "");
  s = s.replace(/<img\b[^>]*>/gi, "");
  // Empty figure/picture wrappers left after stripping imgs
  s = s.replace(/<figure\b[^>]*>\s*<\/figure>/gi, "");
  s = s.replace(/<picture\b[^>]*>\s*<\/picture>/gi, "");
  return s;
}

/** Wrap stored email HTML for a sandboxed iframe (timeline / activity views). */
export function buildCrmEmailPreviewSrcDoc(
  bodyHtml: string,
  cidToUrl?: Record<string, string>,
  options?: { collapseImages?: boolean; dropUnresolvedImages?: boolean },
): string {
  const withCids = cidToUrl
    ? rewriteCrmCidImagesInHtml(bodyHtml, cidToUrl)
    : bodyHtml;
  const collapsed = options?.collapseImages
    ? collapseEmbeddedImagesInHtml(withCids)
    : options?.dropUnresolvedImages
      ? dropUnresolvedInlineImagesInHtml(withCids)
      : withCids;
  const stripped = stripCrmEmailTrackingFromHtmlForPreview(collapsed);
  const safe = String(stripped).replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><base target="_blank"/><style>body{font-family:system-ui,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.625;padding:20px;margin:0;word-break:break-word;color:var(--text-main);}p{margin:0 0 1em;}a{color:#0369a1;}img{max-width:100%;height:auto;border-radius:6px;}</style></head><body>${safe}</body></html>`;
}
