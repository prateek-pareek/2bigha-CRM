/** Shared helpers for CRM CSV exports. */

/**
 * Export permissions accepted per list for client-built exports (`POST /crm/export/log`).
 * Any one of the listed keys (or `admin:manage` / full data access) allows the export.
 */
export const CLIENT_EXPORT_PERMISSIONS: Record<string, string[]> = {
  leads: ['leads:export'],
  'pm-leads': ['pm-leads:export', 'leads:export'],
  segments: ['leads:export'],
  groups: ['leads:export'],
  tasks: ['activities:export'],
  notes: ['activities:export'],
  calls: ['activities:export'],
  'property-listings': ['property-listings:export'],
  'property-approval': ['property-listings:export', 'approval-queue:export'],
  visits: ['visits:export'],
  legal: ['legal:export'],
  services: ['services:export'],
  campaigns: ['outreach:export'],
};

const IST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `YYYY-MM-DD HH:mm` in IST — sorts correctly and Excel reads it as a date. */
export function formatExportDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(IST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}`;
}

/** Plain text for one CSV value (dates, ids, arrays, numbers incl. 0). */
export function exportValueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatExportDate(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(exportValueText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    const v = value as Record<string, unknown> & { toHexString?: () => string };
    if (typeof v.toHexString === 'function') return v.toHexString();
    if (typeof v.name === 'string') return v.name;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Neutralise spreadsheet formulas (CSV injection). Phone numbers like `+91 98765 43210`
 * or `-` placeholders are left alone; anything else starting with = + - @ is prefixed.
 */
export function neutraliseFormula(text: string): string {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[+-][\d\s().-]*$/.test(text)) return `'${text}`;
  return text;
}

/** One quoted CSV cell. */
export function csvCell(value: unknown): string {
  const text = neutraliseFormula(exportValueText(value));
  return `"${text.replace(/"/g, '""')}"`;
}
