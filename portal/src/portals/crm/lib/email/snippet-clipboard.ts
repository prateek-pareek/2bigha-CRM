/**
 * Turn stored snippet HTML into plain text for pasting into notes, URL fields, chat, etc.
 * Also used for inbox previews so entities like &nbsp; / &lt; never show as raw coding.
 */
export function snippetHtmlToPlainText(html: string): string {
  const s = html ?? "";
  if (typeof window === "undefined") {
    return decodeBasicHtmlEntities(
      s
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }
  const d = document.createElement("div");
  d.innerHTML = s;
  let text = (d.innerText || d.textContent || "").replace(/\r\n/g, "\n").trim();
  // Double-encoded bodies (e.g. &amp;nbsp;) still show entities after one pass.
  if (/&(?:nbsp|lt|gt|amp|quot|#\d+|#x[\da-f]+);/i.test(text)) {
    d.innerHTML = text;
    text = (d.innerText || d.textContent || "").replace(/\r\n/g, "\n").trim();
  }
  return text;
}

function decodeBasicHtmlEntities(text: string): string {
  let out = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
  // Second pass for double-encoded sequences (&amp;nbsp; → &nbsp; → space).
  if (/&(?:nbsp|lt|gt|amp|quot|#\d+|#x[\da-f]+);/i.test(out)) {
    out = out
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  }
  return out;
}

export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
