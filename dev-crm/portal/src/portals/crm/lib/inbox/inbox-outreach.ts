export type InboxAccountOutreachType = 'agency' | 'freelancer' | 'both';

export const INBOX_OUTREACH_OPTIONS: {
  value: '' | InboxAccountOutreachType;
  label: string;
}[] = [
  { value: '', label: 'Not set' },
  { value: 'agency', label: 'Agency outreach' },
  { value: 'freelancer', label: 'Freelancer outreach' },
  { value: 'both', label: 'Agency & freelancer' },
];

export function inboxOutreachBadgeLabel(
  type?: InboxAccountOutreachType | null,
): string | null {
  if (type === 'agency') return 'Agency';
  if (type === 'freelancer') return 'Freelancer';
  if (type === 'both') return 'Agency & freelancer';
  return null;
}
