/** Plain-text or legacy templates → HTML TipTap can load without losing line breaks. */
export function emailTemplateBodyToEditorHtml(body: string): string {
  const s = body ?? "";
  if (!s.trim()) return "";
  if (/<\s*[a-z][\s\S]*?>/i.test(s)) return s;
  const escape = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s
    .split(/\n\n+/)
    .map((p) => {
      const inner = escape(p).replace(/\n/g, "<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

/** Match backend `fillEmailTemplateVariables` (api-hrms `email-template-fill.util.ts`). */
export function fillEmailTemplateVariables(
  template: string,
  data: Record<string, string>,
): string {
  if (!template) return template;
  return template.replace(
    /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g,
    (_match, rawKey: string, rawDefault?: string) => {
      const key = String(rawKey || "").trim();
      const fallback =
        rawDefault != null ? String(rawDefault).trim() : "";
      const raw = data[key];
      const trimmed = raw != null ? String(raw).trim() : "";
      if (trimmed) return trimmed;
      if (fallback) return fallback;
      return _match;
    },
  );
}
