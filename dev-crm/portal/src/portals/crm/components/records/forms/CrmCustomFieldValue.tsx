'use client';

import { ExternalLink } from 'lucide-react';
import { normalizeCrmUrl } from '@/lib/crm/crm-custom-field-utils';

export type CrmCustomFieldDefLite = { key: string; name: string; type?: string; options?: string[] };

/** Renders a stored custom field value (list / record / detail) with URL and multi-select support. */
export function CrmCustomFieldValue({
  value,
  type,
  className = '',
}: {
  value: unknown;
  type?: string;
  className?: string;
}) {
  if (value == null || value === '') {
    return <span className={`text-text-muted ${className}`.trim()}>—</span>;
  }
  if (type === 'url' && typeof value === 'string') {
    return (
      <a
        href={normalizeCrmUrl(value)}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-primary font-medium hover:underline inline-flex items-center gap-1.5 max-w-full min-w-0 ${className}`.trim()}
      >
        <ExternalLink size={14} className="shrink-0" />
        <span className="truncate">{value}</span>
      </a>
    );
  }
  if (type === 'multiselect' && Array.isArray(value)) {
    return (
      <span className={`flex flex-wrap gap-1 ${className}`.trim()}>
        {value.map((t) => (
          <span
            key={String(t)}
            className="inline-flex px-2 py-0.5 rounded-md bg-primary/10 text-xs font-semibold text-text-main"
          >
            {t}
          </span>
        ))}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className={`text-text-muted font-medium text-sm ${className}`.trim()}>{value.join(', ')}</span>
    );
  }
  return <span className={`text-text-muted font-medium text-sm ${className}`.trim()}>{String(value)}</span>;
}
