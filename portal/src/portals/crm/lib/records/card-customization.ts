import {
  Briefcase,
  Building2,
  Calendar,
  DollarSign,
  Globe,
  Info,
  Mail,
  Phone,
  Tag,
  Target,
  User,
  type LucideIcon,
} from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { canViewCrmRevenue, getStoredUser } from '@/lib/suite/auth';

export type CrmCardEntityId = 'leads' | 'deals' | 'contacts' | 'clients';

export type CrmCardFieldDef = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Shown in designer only — not rendered on kanban yet */
  previewOnly?: boolean;
};

export const CARD_CUSTOMIZATION_KEY = 'crmCardCustomizations';

/** Fields always shown in the card header — excluded from footer picker */
const HEADER_KEYS = new Set(['name', 'title']);

export const CRM_CARD_ENTITY_META: Record<
  CrmCardEntityId,
  { name: string; customFieldsModule: string; mockData: { primary: string; secondary: string; icon: string } }
> = {
  leads: {
    name: 'Leads',
    customFieldsModule: 'leads',
    mockData: { primary: 'Lead Contact', secondary: 'Example Corporation', icon: 'LC' },
  },
  deals: {
    name: 'Deals',
    customFieldsModule: 'deals',
    mockData: { primary: 'Enterprise Expansion', secondary: 'Sample Company', icon: '$' },
  },
  contacts: {
    name: 'Contacts',
    customFieldsModule: 'contacts',
    mockData: { primary: 'Sample Contact', secondary: 'Example Ltd.', icon: 'SC' },
  },
  clients: {
    name: 'Clients',
    customFieldsModule: 'clients',
    mockData: { primary: 'Example Technologies', secondary: 'Technology', icon: 'ET' },
  },
};

export function getCrmCardEntityMeta(): typeof CRM_CARD_ENTITY_META {
  return CRM_CARD_ENTITY_META;
}

const FIELD_ICONS: Record<string, LucideIcon> = {
  email: Mail,
  phone: Phone,
  mobileNo: Phone,
  organization: Building2,
  account: Building2,
  industry: Building2,
  website: Globe,
  jobTitle: Briefcase,
  closeDate: Calendar,
  expectedClosureDate: Calendar,
  amount: DollarSign,
  dealValue: DollarSign,
  dealValueINR: DollarSign,
  stage: Tag,
  status: Tag,
  source: Globe,
  probability: Info,
  noOfEmployees: User,
  leadScore: Target,
  priority: Tag,
  leadOwner: User,
  contactOwner: User,
  pipeline: Tag,
  createdAt: Calendar,
  lastEmailActivityAt: Calendar,
  territory: Globe,
  annualRevenue: DollarSign,
  address: Building2,
  recordId: Tag,
};

/** Built-in properties available per entity (aligned with list/board columns). */
export const CRM_CARD_BUILTIN_FIELDS: Record<CrmCardEntityId, CrmCardFieldDef[]> = {
  leads: [
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'phone', label: 'Phone', icon: Phone },
    { key: 'organization', label: 'Organization', icon: Building2 },
    { key: 'jobTitle', label: 'Job Title', icon: Briefcase },
    { key: 'source', label: 'Source', icon: Globe },
    { key: 'status', label: 'Status', icon: Tag },
    { key: 'stage', label: 'Stage', icon: Tag },
    { key: 'callStatus', label: 'Call Status', icon: Phone },
    { key: 'priority', label: 'Priority', icon: Tag },
    { key: 'leadOwner', label: 'Lead Owner', icon: User },
    { key: 'leadScore', label: 'Score', icon: Target },
    { key: 'pipeline', label: 'Pipeline', icon: Tag },
    { key: 'createdAt', label: 'Created Date', icon: Calendar },
    { key: 'lastEmailActivityAt', label: 'Last Email Activity', icon: Calendar },
  ],
  deals: [
    { key: 'dealValue', label: 'Amount', icon: DollarSign },
    { key: 'status', label: 'Stage', icon: Tag },
    { key: 'probability', label: 'Probability', icon: Info },
    { key: 'expectedClosureDate', label: 'Close Date', icon: Calendar },
    { key: 'organization', label: 'Organization', icon: Building2 },
    { key: 'priority', label: 'Priority', icon: Tag },
    { key: 'createdAt', label: 'Created', icon: Calendar },
    // Legacy keys saved from older Card Designer builds
    { key: 'amount', label: 'Amount (legacy)', icon: DollarSign },
    { key: 'stage', label: 'Stage (legacy)', icon: Tag },
    { key: 'closeDate', label: 'Close Date (legacy)', icon: Calendar },
    { key: 'account', label: 'Organization (legacy)', icon: Building2 },
  ],
  contacts: [
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'phone', label: 'Phone', icon: Phone },
    { key: 'jobTitle', label: 'Job Title', icon: Briefcase },
    { key: 'organization', label: 'Organization', icon: Building2 },
    { key: 'contactOwner', label: 'Contact Owner', icon: User },
    { key: 'createdAt', label: 'Created', icon: Calendar },
    { key: 'lastEmailActivityAt', label: 'Last Email Activity', icon: Calendar },
  ],
  clients: [
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'phone', label: 'Phone', icon: Phone },
    { key: 'status', label: 'Status', icon: Tag },
    { key: 'organization', label: 'Organization', icon: Building2 },
    { key: 'industry', label: 'Industry', icon: Building2 },
    { key: 'website', label: 'Website', icon: Globe },
    { key: 'noOfEmployees', label: 'Employees', icon: User },
    { key: 'createdAt', label: 'Added Date', icon: Calendar },
  ],
};

export const CRM_CARD_DEFAULT_FIELDS: Record<CrmCardEntityId, string[]> = {
  leads: ['email', 'organization', 'status'],
  deals: ['dealValue', 'status', 'expectedClosureDate'],
  contacts: ['email', 'organization'],
  clients: ['industry', 'website'],
};

export function getCrmCardFieldIcon(key: string): LucideIcon {
  if (key.startsWith('cf_')) return Tag;
  return FIELD_ICONS[key] || Tag;
}

export function formatCrmCardFieldLabel(key: string, label?: string): string {
  if (label) return label;
  if (key.startsWith('cf_')) return key.slice(3).replace(/_/g, ' ');
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

export async function fetchCrmCardCustomFieldDefs(
  entityId: CrmCardEntityId,
  token: string | null,
): Promise<CrmCardFieldDef[]> {
  const module = CRM_CARD_ENTITY_META[entityId].customFieldsModule;
  if (!token) return [];
  try {
    const res = await fetch(`${CRM_API_URL}/custom-fields?module=${module}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const defs = await res.json();
    if (!Array.isArray(defs)) return [];
    return defs.map((f: { key: string; name: string }) => ({
      key: `cf_${f.key}`,
      label: f.name,
      icon: Tag,
    }));
  } catch {
    return [];
  }
}

export function mergeCrmCardAvailableFields(
  entityId: CrmCardEntityId,
  customFields: CrmCardFieldDef[],
): CrmCardFieldDef[] {
  const builtIn = CRM_CARD_BUILTIN_FIELDS[entityId].filter((f) => !HEADER_KEYS.has(f.key));
  const seen = new Set<string>();
  const merged: CrmCardFieldDef[] = [];
  for (const f of [...builtIn, ...customFields]) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    merged.push(f);
  }
  return merged;
}

function formatDate(value: string | Date | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCustomFieldValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Resolve a footer field value for kanban cards (leads & deals). */
export function resolveCrmCardFieldValue(
  entityId: CrmCardEntityId,
  record: Record<string, unknown>,
  fieldKey: string,
): string {
  if (
    fieldKey === 'amount' ||
    fieldKey === 'dealValue' ||
    fieldKey === 'dealValueINR' ||
    fieldKey === 'annualRevenue' ||
    fieldKey === 'expectedDealValue'
  ) {
    if (!canViewCrmRevenue(getStoredUser())) return '';
  }

  if (fieldKey.startsWith('cf_')) {
    const cfKey = fieldKey.slice(3);
    const raw =
      (record.customFields as Record<string, unknown> | undefined)?.[cfKey] ??
      (record.customFields as Record<string, unknown> | undefined)?.[fieldKey];
    return formatCustomFieldValue(raw);
  }

  if (entityId === 'leads') {
    if (fieldKey === 'email') return String(record.email || '');
    if (fieldKey === 'phone') return String(record.mobileNo || record.phone || '');
    if (fieldKey === 'organization') return String(record.organization || '');
    if (fieldKey === 'jobTitle') return String(record.jobTitle || '');
    if (fieldKey === 'source') return String(record.source || '');
    if (fieldKey === 'status') return String(record.status || '');
    if (fieldKey === 'stage') return String(record.stage || record.status || '');
    if (fieldKey === 'callStatus') return String(record.callStatus || '');
    if (fieldKey === 'priority') return String(record.priority || '');
    if (fieldKey === 'leadOwner') return String(record.leadOwner || '');
    if (fieldKey === 'pipeline') {
      const p = record.pipeline;
      if (p && typeof p === 'object' && 'name' in p) return String((p as { name?: string }).name || '');
      return String(p || '');
    }
    if (fieldKey === 'leadScore') {
      const score = record.leadScore;
      if (score != null && !Number.isNaN(Number(score))) return `Score ${score}`;
      return '';
    }
    if (fieldKey === 'createdAt') return formatDate(record.createdAt as string);
    if (fieldKey === 'lastEmailActivityAt') return formatDate(record.lastEmailActivityAt as string);
  }

  if (entityId === 'deals') {
    if (fieldKey === 'amount' || fieldKey === 'dealValue' || fieldKey === 'dealValueINR') {
      const val =
        Number(record.dealValueINR) ||
        Number(record.dealValue) ||
        (fieldKey === 'amount' ? Number(record.amount) : 0) ||
        0;
      return val ? `₹${val.toLocaleString('en-IN')}` : '';
    }
    if (fieldKey === 'stage' || fieldKey === 'status') {
      return String(record.status || record.stage || '');
    }
    if (fieldKey === 'probability') {
      const p = record.probability;
      return p != null && p !== '' ? `${p}%` : '';
    }
    if (fieldKey === 'closeDate' || fieldKey === 'expectedClosureDate') {
      const raw = (record.expectedClosureDate || record.closeDate) as string | undefined;
      return raw ? formatDate(raw) : '';
    }
    if (fieldKey === 'account' || fieldKey === 'organization') {
      const org = record.organization;
      if (typeof org === 'string') return org;
      if (org && typeof org === 'object' && 'name' in org) return String((org as { name?: string }).name || '');
      return '';
    }
    if (fieldKey === 'priority') return String(record.priority || '');
    if (fieldKey === 'createdAt') return formatDate(record.createdAt as string);
  }

  return '';
}

export function loadCrmCardCustomizations(): Record<CrmCardEntityId, string[]> {
  try {
    const saved = localStorage.getItem(CARD_CUSTOMIZATION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Record<CrmCardEntityId, string[]>>;
      return { ...CRM_CARD_DEFAULT_FIELDS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...CRM_CARD_DEFAULT_FIELDS };
}

export function saveCrmCardCustomizations(selected: Record<CrmCardEntityId, string[]>) {
  localStorage.setItem(CARD_CUSTOMIZATION_KEY, JSON.stringify(selected));
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: CARD_CUSTOMIZATION_KEY,
      newValue: JSON.stringify(selected),
      storageArea: localStorage,
    }),
  );
}
