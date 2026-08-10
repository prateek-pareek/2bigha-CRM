/** Built-in marketplace / job-board options (team custom names stored in CRM global settings). */
export const CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS = [
  'Upwork',
  'Fiverr',
  'Freelancer.com',
  'LinkedIn Jobs',
  'Indeed',
  'Glassdoor',
  'AngelList / Wellfound',
  'Naukri',
  'Foundit (Monster India)',
  'PeoplePerHour',
  'Guru',
  'Toptal',
] as const;

export const CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION = 'Other / custom';

export function normalizeOpportunityPlatformName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function sanitizeCustomOpportunityPlatforms(
  input: unknown,
): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const name = normalizeOpportunityPlatformName(item);
    if (name.length < 2 || name.length > 80) continue;
    if (name === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (
      CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS.some(
        (b) => b.toLowerCase() === key,
      )
    ) {
      continue;
    }
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function mergeOpportunitySourcePlatforms(
  custom: string[] = [],
  extra: string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const name = normalizeOpportunityPlatformName(raw);
    if (!name || name === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const p of CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS) push(p);
  for (const p of custom) push(p);
  for (const p of extra) push(p);
  out.push(CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION);
  return out;
}
