/**
 * Shared copy helpers for follow-up & email notifications (§11 / follow-up sequences).
 */

export function formatFollowUpRelativeWhen(
  when: Date | string | null | undefined,
  now = new Date(),
): string {
  if (!when) return '';
  const at = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(at.getTime())) return '';
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  if (mins < 90) {
    return mins <= 1 ? 'in 1 minute' : `in ${mins} minutes`;
  }
  const hours = Math.round(ms / 3_600_000);
  if (hours < 36) {
    return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
  }
  const days = Math.round(ms / 86_400_000);
  if (days < 14) {
    return days === 1 ? 'in 1 day' : `in ${days} days`;
  }
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'in 1 week' : `in ${weeks} weeks`;
}

export function formatFollowUpAbsoluteWhen(when: Date | string | null | undefined): string {
  if (!when) return '';
  const at = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(at.getTime())) return '';
  const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
  return at.toLocaleString('en-US', {
    timeZone: tz,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function describeNextFollowUpSend(
  nextAt: Date | string | null | undefined,
  now = new Date(),
): string {
  if (!nextAt) return 'No further follow-up emails are scheduled.';
  const relative = formatFollowUpRelativeWhen(nextAt, now);
  const absolute = formatFollowUpAbsoluteWhen(nextAt);
  if (!relative || !absolute) return 'No further follow-up emails are scheduled.';
  return `Next follow-up email: ${relative} (${absolute}).`;
}
