/**
 * CRM filter configuration - static + dynamic properties per module
 * Used for HubSpot-style filtering on Leads, Contacts, Organizations, Deals
 */

import {
  getFieldDefsForModule,
  type CrmModuleKey,
} from '@/lib/crm/crm-field-layout';

export type PropType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export interface FilterProperty {
  key: string;
  label: string;
  type: PropType;
  options?: string[]; // for select
}

export const OPERATORS: Record<PropType, { value: string; label: string }[]> = {
  text: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: 'equals', label: 'is' },
    { value: 'before', label: 'is before' },
    { value: 'after', label: 'is after' },
    { value: 'between', label: 'is between' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  select: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  checkbox: [
    { value: 'is_checked', label: 'is checked' },
    { value: 'is_not_checked', label: 'is not checked' },
  ],
};

export interface FilterCriteria {
  property: string;
  operator: string;
  value: string;
}

/** Known dropdown catalogs — shown even when unused on current records. */
export const BUILTIN_FILTER_OPTIONS: Record<string, string[]> = {
  status: ['New', 'Open', 'Qualified', 'Unqualified', 'Won', 'Lost', 'Active', 'Inactive'],
  source: ['Website', 'Referral', 'Email', 'Call', 'LinkedIn', 'Campaign', 'Manual'],
  gender: ['Male', 'Female', 'Other'],
  territory: ['North', 'South', 'East', 'West'],
  currency: ['USD', 'EUR', 'INR', 'GBP', 'AED'],
  salutation: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'],
  pricingType: ['fixed', 'retainer', 'hourly', 'subscription'],
  platformEngagementStatus: ['New', 'Engaged', 'Won', 'Lost', 'Archived'],
  callStatus: ['Not Called', 'Completed', 'Missed', 'Busy', 'Failed'],
  caseType: ['contract_review', 'dispute', 'compliance', 'nda', 'other'],
  priority: ['low', 'medium', 'high', 'urgent'],
};

/**
 * `leadCategory` ("Lead Type") and `group` are admin-configurable (see
 * /crm/settings/lead-picklists), so they're intentionally left out of
 * BUILTIN_FILTER_OPTIONS above — FilterValueSelector already falls back to
 * `/crm/distinct-values` for select-type properties with no builtin list,
 * which picks up whatever labels are actually in use.
 */

const DATE_KEYS = new Set([
  'createdAt',
  'expectedClosureDate',
  'closedDate',
  'startDate',
  'expiryDate',
]);

const NUMBER_KEYS = new Set([
  'annualRevenue',
  'dealValue',
  'probability',
  'expectedDealValue',
  'exchangeRate',
  'contractMonths',
  'contractValue',
]);

const CHECKBOX_KEYS = new Set(['converted']);

/** Prefer select operators — options come from pipelines / builtins / distinct API. */
const SELECT_KEYS = new Set([
  'stage',
  'status',
  'source',
  'gender',
  'territory',
  'currency',
  'salutation',
  'pricingType',
  'platformEngagementStatus',
  'callStatus',
  'leadCategory',
  'group',
  'caseType',
  'priority',
]);

/** ObjectId / array / non-filterable layout keys */
const SKIP_FILTER_KEYS = new Set([
  'pipeline', // ObjectId — filtered via board pipeline picker
  'additionalEmails',
  'image',
]);

const ACTIVITY_PROPERTIES: FilterProperty[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'content', label: 'Content', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'type', label: 'Type', type: 'text' },
  { key: 'createdAt', label: 'Created Date', type: 'date' },
];

const INBOX_PROPERTIES: FilterProperty[] = [
  { key: 'subject', label: 'Subject', type: 'text' },
  { key: 'from', label: 'From', type: 'text' },
  { key: 'to', label: 'To', type: 'text' },
  { key: 'createdAt', label: 'Received Date', type: 'date' },
];

function inferPropType(key: string): PropType {
  if (DATE_KEYS.has(key)) return 'date';
  if (NUMBER_KEYS.has(key)) return 'number';
  if (CHECKBOX_KEYS.has(key)) return 'checkbox';
  if (SELECT_KEYS.has(key) || BUILTIN_FILTER_OPTIONS[key]?.length) return 'select';
  return 'text';
}

function fieldDefsToFilterProperties(module: CrmModuleKey): FilterProperty[] {
  return getFieldDefsForModule(module)
    .filter((d) => !SKIP_FILTER_KEYS.has(d.key))
    .map((d) => {
      const type = inferPropType(d.key);
      return {
        key: d.key,
        label: d.label,
        type,
        ...(type === 'select' && BUILTIN_FILTER_OPTIONS[d.key]
          ? { options: BUILTIN_FILTER_OPTIONS[d.key] }
          : {}),
      };
    });
}

export function getStaticProperties(
  module: string,
  opts?: { canViewCrmRevenue?: boolean },
): FilterProperty[] {
  const canView = opts?.canViewCrmRevenue !== false;
  let props: FilterProperty[];
  switch (module) {
    case 'leads':
    case 'contacts':
    case 'organizations':
    case 'deals':
    case 'clients':
    case 'legal':
      props = fieldDefsToFilterProperties(module);
      break;
    case 'activities':
    case 'notes':
    case 'tasks':
    case 'calls':
      props = [...ACTIVITY_PROPERTIES];
      break;
    case 'inbox':
      props = [...INBOX_PROPERTIES];
      break;
    default:
      props = [];
  }
  if (canView) return props;
  const moneyKeys = new Set([
    'dealValue',
    'expectedDealValue',
    'annualRevenue',
    'currency',
    'exchangeRate',
  ]);
  return props.filter((p) => !moneyKeys.has(p.key));
}

export function customFieldToFilterProperty(cf: {
  name: string;
  key: string;
  type: string;
  options?: string[];
}): FilterProperty {
  const t = (cf.type || 'text').toLowerCase();
  let type: PropType = 'text';
  if (t === 'number') type = 'number';
  else if (t === 'date') type = 'date';
  else if (t === 'select' || t === 'multiselect') type = 'select';
  else if (t === 'checkbox') type = 'checkbox';
  // url / text / unknown → text

  const options =
    Array.isArray(cf.options) && cf.options.length
      ? cf.options.map((o) => String(o).trim()).filter(Boolean)
      : undefined;

  return {
    key: `customFields.${cf.key}`,
    label: cf.name,
    type,
    options,
  };
}

/** Merge catalog options with values discovered on records (case-preserving unique). */
export function mergeFilterValueOptions(
  ...lists: Array<string[] | undefined | null>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list?.length) continue;
    for (const raw of list) {
      const v = String(raw ?? '').trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function applyFilters<T extends Record<string, any>>(
  items: T[],
  filters: FilterCriteria[],
  properties: FilterProperty[]
): T[] {
  if (filters.length === 0) return items;

  const getProp = (item: T, key: string): any => {
    if (key.startsWith('customFields.')) {
      const cfKey = key.replace('customFields.', '');
      return item.customFields?.[cfKey];
    }
    if (key === 'name') {
      return item.firstName || item.lastName
        ? `${item.firstName || ''} ${item.lastName || ''}`.trim()
        : item.name;
    }
    if (key === 'from') {
      return item.from || item.sender?.email || (item.sender && typeof item.sender === 'object' ? `${item.sender.firstName || ''} ${item.sender.lastName || ''}`.trim() : '');
    }
    if (key === 'to') {
      return item.to || item.recipient || '';
    }
    let v = item[key];
    if (key === 'stage') v = item.status ?? item.stage; // deals use status, leads use stage
    if (key === 'organization' && v && typeof v === 'object' && 'name' in v) v = (v as any).name;
    if (key === 'relatedService') {
      const rs = item.relatedService as { name?: string; _id?: string } | string | undefined;
      if (rs && typeof rs === 'object' && 'name' in rs) v = (rs as any).name;
      else v = rs != null && rs !== '' ? String(rs) : '';
    }
    if (key === 'createdAt') {
      v = v || item.date; // Inbox emails use .date, CRM logs use .createdAt
      if (v) return new Date(v);
    }
    if (key === 'expectedClosureDate' && v) return new Date(v);
    if (key === 'closedDate' && v) return new Date(v);
    if (key === 'subject' && !v) v = item.title;
    return v;
  };

  return items.filter(item => {
    return filters.every(f => {
      const val = getProp(item, f.property);
      const strVal = String(val ?? '').toLowerCase();
      const filterVal = f.value?.toLowerCase() ?? '';

      // Multiselect custom fields store string[]; treat as joined for contains/equals.
      const multiStr =
        Array.isArray(val)
          ? val.map((x) => String(x ?? '').toLowerCase()).filter(Boolean)
          : null;

      switch (f.operator) {
        case 'equals':
          if (multiStr) {
            const wanted = f.value.split('||').map((v) => v.trim().toLowerCase()).filter(Boolean);
            if (wanted.length > 1) return wanted.some((w) => multiStr.includes(w));
            return multiStr.includes(filterVal);
          }
          if (val instanceof Date || (typeof val === 'string' && /^\d{4}/.test(val))) {
            const d = new Date(val);
            const fd = new Date(f.value);
            return !isNaN(d.getTime()) && !isNaN(fd.getTime()) && d.toDateString() === fd.toDateString();
          }
          if (f.value.includes('||')) {
            const wanted = f.value.split('||').map((v) => v.trim().toLowerCase()).filter(Boolean);
            return wanted.includes(strVal);
          }
          return strVal === filterVal;
        case 'not_equals':
          if (multiStr) {
            const wanted = f.value.split('||').map((v) => v.trim().toLowerCase()).filter(Boolean);
            if (wanted.length > 1) return wanted.every((w) => !multiStr.includes(w));
            return !multiStr.includes(filterVal);
          }
          if (val instanceof Date || (typeof val === 'string' && /^\d{4}/.test(val))) {
            const d = new Date(val);
            const fd = new Date(f.value);
            return isNaN(d.getTime()) || isNaN(fd.getTime()) || d.toDateString() !== fd.toDateString();
          }
          if (f.value.includes('||')) {
            const wanted = f.value.split('||').map((v) => v.trim().toLowerCase()).filter(Boolean);
            return !wanted.includes(strVal);
          }
          return strVal !== filterVal;
        case 'contains':
          if (multiStr) return multiStr.some((s) => s.includes(filterVal));
          return strVal.includes(filterVal);
        case 'not_contains':
          if (multiStr) return multiStr.every((s) => !s.includes(filterVal));
          return !strVal.includes(filterVal);
        case 'is_empty':
          if (Array.isArray(val)) return val.length === 0;
          return val === '' || val == null || val === undefined;
        case 'is_not_empty':
          if (Array.isArray(val)) return val.length > 0;
          return val !== '' && val != null && val !== undefined;
        case 'greater_than':
          const n = parseFloat(String(val));
          const fn = parseFloat(f.value);
          return !isNaN(n) && !isNaN(fn) && n > fn;
        case 'less_than':
          const n2 = parseFloat(String(val));
          const fn2 = parseFloat(f.value);
          return !isNaN(n2) && !isNaN(fn2) && n2 < fn2;
        case 'before':
          const d = val instanceof Date ? val : new Date(val);
          const fd = new Date(f.value);
          return !isNaN(d.getTime()) && !isNaN(fd.getTime()) && d < fd;
        case 'after':
          const d2 = val instanceof Date ? val : new Date(val);
          const fd2 = new Date(f.value);
          return !isNaN(d2.getTime()) && !isNaN(fd2.getTime()) && d2 > fd2;
        case 'between':
          const db = val instanceof Date ? val : new Date(val);
          if (isNaN(db.getTime())) return false;
          const [start, end] = f.value.split(',');
          
          const parseLocal = (s: string, endOfDay = false) => {
            const parts = s.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            if (endOfDay) d.setHours(23, 59, 59, 999);
            else d.setHours(0, 0, 0, 0);
            return d;
          };

          const ds = parseLocal(start);
          const de = parseLocal(end, true);
          
          if (isNaN(ds.getTime()) || isNaN(de.getTime())) return false;
          return db >= ds && db <= de;
        case 'is_checked': return val === true || strVal === 'true' || strVal === 'yes' || strVal === '1';
        case 'is_not_checked': return val !== true && strVal !== 'true' && strVal !== 'yes' && strVal !== '1';
        default: return true;
      }
    });
  });
}
