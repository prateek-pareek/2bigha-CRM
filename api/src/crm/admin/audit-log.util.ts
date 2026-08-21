/** Shared helpers for CRM audit log descriptions and activity stream mapping. */

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'otp',
]);

export function moduleToRelatedType(module: string): string {
  const m = String(module || '').toLowerCase();
  const map: Record<string, string> = {
    leads: 'Lead',
    lead: 'Lead',
    deals: 'Deal',
    deal: 'Deal',
    contacts: 'Contact',
    contact: 'Contact',
    clients: 'Client',
    client: 'Client',
    organizations: 'Organization',
    organization: 'Organization',
    companies: 'Organization',
    workflows: 'Workflow',
    proposals: 'Proposal',
    pipelines: 'Pipeline',
  };
  if (map[m]) return map[m];
  if (m.endsWith('s') && map[m.slice(0, -1)]) return map[m.slice(0, -1)];
  return module.charAt(0).toUpperCase() + module.slice(1);
}

export function formatModuleLabel(module: string): string {
  const map: Record<string, string> = {
    leads: 'lead',
    deals: 'deal',
    contacts: 'contact',
    organizations: 'company',
    clients: 'client',
    users: 'user',
    roles: 'role',
    'audit-logs': 'audit log',
    'crm-users': 'CRM user',
    'custom-fields': 'custom field',
    'email-templates': 'email template',
    workspace: 'workspace',
    pipelines: 'pipeline',
    proposals: 'proposal',
    'service-offerings': 'service offering',
    workflows: 'workflow',
    'inbox-accounts': 'inbox account',
  };
  const key = String(module || '').toLowerCase();
  if (map[key]) return map[key];
  return key.replace(/-/g, ' ');
}

export function actionVerb(action: string): string {
  const a = String(action || '').toLowerCase();
  const map: Record<string, string> = {
    create: 'created',
    update: 'updated',
    delete: 'deleted',
    'bulk-delete': 'bulk-deleted',
    convert: 'converted',
    enroll: 'enrolled',
    cancel: 'cancelled',
    start: 'started',
    action: 'performed an action on',
  };
  return map[a] || a.replace(/-/g, ' ');
}

function truncate(val: unknown, max = 80): string {
  const s =
    val == null
      ? ''
      : typeof val === 'string'
        ? val
        : JSON.stringify(val);
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Human-readable summary of PATCH body or { field: { old, new } } maps. */
export function summarizeAuditChanges(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return '';
  const parts: string[] = [];
  const obj = changes as Record<string, unknown>;

  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      parts.push(`${key}: [redacted]`);
      continue;
    }
    if (val && typeof val === 'object' && 'old' in val && 'new' in val) {
      const v = val as { old?: unknown; new?: unknown };
      parts.push(
        `${key}: ${truncate(v.old, 40)} → ${truncate(v.new, 40)}`,
      );
    } else if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      Object.keys(val as object).length <= 12
    ) {
      continue;
    } else if (Array.isArray(val)) {
      parts.push(`${key}: [${val.length} items]`);
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      parts.push(`${key}: ${truncate(val, 50)}`);
    }
  }

  if (parts.length) return parts.slice(0, 6).join(' · ');

  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = summarizeAuditChanges(val);
      if (nested) parts.push(`${key}: ${nested}`);
    }
  }

  return parts.slice(0, 4).join(' · ');
}

export function buildAuditLogDescription(input: {
  userName: string;
  action: string;
  module: string;
  entityName?: string;
  entityId?: string;
  changes?: unknown;
}): string {
  const label = formatModuleLabel(input.module);
  const verb = actionVerb(input.action);
  let base = `${input.userName} ${verb} ${label}`;
  if (input.entityName?.trim()) {
    base = `${input.userName} ${verb} ${label}: ${input.entityName.trim()}`;
  } else if (input.entityId) {
    base = `${input.userName} ${verb} ${label} (ID ${input.entityId})`;
  }
  const changeSummary = summarizeAuditChanges(input.changes);
  if (changeSummary) {
    return `${base} — ${changeSummary}`;
  }
  return base;
}

export function crmRecordPath(
  relatedType: string | undefined,
  relatedTo: string | undefined,
): string | null {
  const id = String(relatedTo || '').trim();
  if (!id) return null;
  const t = String(relatedType || '').toLowerCase();
  if (t === 'lead' || t === 'leads') return `/crm/leads/${id}`;
  if (t === 'deal' || t === 'deals') return `/crm/deals/${id}`;
  if (t === 'contact' || t === 'contacts') return `/crm/contacts/${id}`;
  if (t === 'client' || t === 'clients') return `/crm/clients/${id}`;
  if (t === 'organization' || t === 'organizations') {
    return `/crm/organizations/${id}`;
  }
  return null;
}
