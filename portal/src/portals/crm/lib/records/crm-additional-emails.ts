/** Parse repeated `additionalEmails` form fields; dedupe and drop primary + invalid. */
export function parseAdditionalEmailsFromForm(
  formData: FormData,
  primaryEmail: string | undefined,
): string[] {
  const raw = formData.getAll('additionalEmails') as string[];
  const primary = String(primaryEmail ?? '')
    .trim()
    .toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const trimmed = String(x ?? '').trim();
    if (!trimmed || !trimmed.includes('@')) continue;
    const lower = trimmed.toLowerCase();
    if (primary && lower === primary) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}
