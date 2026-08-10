/**
 * Replace `{{field}}` and `{{field|fallback if empty}}` in HTML/text templates.
 * Keys are alphanumeric + underscores + dots (e.g. custom.foo if present in data).
 */
export function fillEmailTemplateVariables(
  template: string,
  data: Record<string, string>,
): string {
  if (!template) return template;
  return template.replace(
    /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g,
    (_match, rawKey: string, rawDefault?: string) => {
      const key = String(rawKey || '').trim();
      const fallback =
        rawDefault != null ? String(rawDefault).trim() : '';
      const raw = data[key];
      const trimmed = raw != null ? String(raw).trim() : '';
      if (trimmed) return trimmed;
      if (fallback) return fallback;
      return _match;
    },
  );
}
