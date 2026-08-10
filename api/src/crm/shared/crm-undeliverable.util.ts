/** Detect permanent recipient failures from SMTP/Graph error text. */
export function isPermanentRecipientFailure(message: string): boolean {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  return (
    /\b550[\s-]?5\.1\.1\b/.test(m) ||
    /\b551[\s-]?5\.1\.1\b/.test(m) ||
    /\b553[\s-]?5\.1\.1\b/.test(m) ||
    m.includes('user unknown') ||
    m.includes('unknown user') ||
    m.includes('does not exist') ||
    m.includes('address not found') ||
    m.includes('mailbox not found') ||
    m.includes('recipient address rejected') ||
    m.includes('recipient not found') ||
    m.includes('no such user') ||
    m.includes('invalid recipient') ||
    m.includes('undeliverable') ||
    m.includes('account disabled') ||
    m.includes('email address you entered could not be found')
  );
}

export function parseInvalidEmailLog(
  customFields: Record<string, unknown> | undefined,
  email: string,
): { reason: string | null; flaggedAt: string | null } {
  const target = email.toLowerCase();
  const raw = customFields?.__emailInvalidLog;
  const lines = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  for (const line of lines) {
    const s = String(line).trim();
    if (!s.toLowerCase().startsWith(target)) continue;
    const parts = s.split('|').map((p) => p.trim());
    return {
      reason: parts[1] || null,
      flaggedAt: parts[2] || null,
    };
  }
  return { reason: null, flaggedAt: null };
}
