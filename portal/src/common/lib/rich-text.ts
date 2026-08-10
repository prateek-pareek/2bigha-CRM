/** Shared TipTap/HTML helpers — used by CRM, PM, and suite editors. */

/** True when TipTap/HTML body has no visible text. */
export function isRichTextEmpty(html: string | undefined | null): boolean {
  if (!html) return true;
  const t = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .trim();
  return !t;
}

export function looksLikeStoredHtml(s: string | undefined | null): boolean {
  const t = (s || "").trim();
  return /^<\w+/i.test(t);
}
