/**
 * Turn stored snippet HTML into plain text for pasting into notes, URL fields, chat, etc.
 */
export function snippetHtmlToPlainText(html: string): string {
  const s = html ?? "";
  if (typeof window === "undefined") {
    return s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }
  const d = document.createElement("div");
  d.innerHTML = s;
  const text = d.innerText || d.textContent || "";
  return text.replace(/\r\n/g, "\n").trim();
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
