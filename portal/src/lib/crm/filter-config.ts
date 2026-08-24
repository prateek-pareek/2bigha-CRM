/**
 * CRM filter configuration - static + dynamic properties per module
 * Used for HubSpot-style filtering on Leads, Contacts, Organizations, Deals
 */

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

const LEAD_PROPERTIES: FilterProperty[] = [
  { key: 'firstName', label: 'First Name', type: 'text' },
  { key: 'lastName', label: 'Last Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'organization', label: 'Company', type: 'text' },
  {
    key: 'leadVertical',
    label: 'Lead Vertical',
    type: 'select',
    options: ['Property Listing', 'Property Management'],
  },
  { key: 'stage', label: 'Stage', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'mobileNo', label: 'Mobile', type: 'text' },
  { key: 'jobTitle', label: 'Job Title', type: 'text' },
  { key: 'source', label: 'Lead Source', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'annualRevenue', label: 'Annual Revenue', type: 'number' },
  { key: 'noOfEmployees', label: 'Employees', type: 'text' },
  { key: 'territory', label: 'Territory', type: 'text' },
  { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'text' },
  { key: 'twitterHandle', label: 'X handle', type: 'text' },
  { key: 'relatedService', label: 'Related service', type: 'text' },
  { key: 'leadScore', label: 'Lead score', type: 'number' },
];

const CONTACT_PROPERTIES: FilterProperty[] = [
  { key: 'firstName', label: 'First Name', type: 'text' },
  { key: 'lastName', label: 'Last Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'mobileNo', label: 'Mobile', type: 'text' },
  { key: 'telegram', label: 'Telegram', type: 'text' },
  { key: 'organization', label: 'Company', type: 'text' },
  { key: 'jobTitle', label: 'Job Title', type: 'text' },
  { key: 'gender', label: 'Gender', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'stage', label: 'Stage', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'source', label: 'Lead Source', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'annualRevenue', label: 'Annual Revenue', type: 'number' },
  { key: 'noOfEmployees', label: 'Employees', type: 'text' },
  { key: 'territory', label: 'Territory', type: 'text' },
  { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'text' },
  { key: 'twitterHandle', label: 'X handle', type: 'text' },
  { key: 'leadOwner', label: 'Owner', type: 'text' },
  { key: 'leadScore', label: 'Lead score', type: 'number' },
];

const ORGANIZATION_PROPERTIES: FilterProperty[] = [
  { key: 'name', label: 'Company Name', type: 'text' },
  { key: 'website', label: 'Website', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'noOfEmployees', label: 'Employees', type: 'text' },
  { key: 'annualRevenue', label: 'Annual Revenue', type: 'number' },
  { key: 'territory', label: 'Territory', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
];

const DEAL_PROPERTIES: FilterProperty[] = [
  { key: 'title', label: 'Deal Name', type: 'text' },
  { key: 'organization', label: 'Company', type: 'text' },
  { key: 'stage', label: 'Stage', type: 'text' },
  { key: 'dealValue', label: 'Deal Value', type: 'number' },
  { key: 'probability', label: 'Probability', type: 'number' },
  { key: 'dealOwner', label: 'Deal Owner', type: 'text' },
  { key: 'contactPerson', label: 'Contact', type: 'text' },
  { key: 'expectedClosureDate', label: 'Expected Close', type: 'date' },
  { key: 'closedDate', label: 'Closed Date', type: 'date' },
  { key: 'currency', label: 'Currency', type: 'text' },
];

const CLIENT_PROPERTIES: FilterProperty[] = [
  { key: 'name', label: 'Client Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
];

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

const PLATFORM_OPPORTUNITY_PROPERTIES: FilterProperty[] = [
  { key: 'title', label: 'Opportunity Title', type: 'text' },
  { key: 'opportunitySourcePlatform', label: 'Source Platform', type: 'text' },
  { key: 'platformClientLabel', label: 'Client Label', type: 'text' },
  { key: 'platformEngagementStatus', label: 'Engagement Status', type: 'text' },
  { key: 'stage', label: 'Stage', type: 'text' },
  { key: 'opportunityListingUrl', label: 'Listing URL', type: 'text' },
  { key: 'ownerLabel', label: 'Owner', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'text' },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'createdAt', label: 'Created Date', type: 'date' },
];

export function getStaticProperties(
  module: string,
  opts?: { canViewCrmRevenue?: boolean },
): FilterProperty[] {
  const canView = opts?.canViewCrmRevenue !== false;
  let props: FilterProperty[];
  switch (module) {
    case 'leads': props = [...LEAD_PROPERTIES]; break;
    case 'contacts': props = [...CONTACT_PROPERTIES]; break;
    case 'organizations': props = [...ORGANIZATION_PROPERTIES]; break;
    case 'deals': props = [...DEAL_PROPERTIES]; break;
    case 'clients': props = [...CLIENT_PROPERTIES]; break;
    case 'activities':
    case 'notes':
    case 'tasks':
    case 'calls': props = [...ACTIVITY_PROPERTIES]; break;
    case 'inbox': props = [...INBOX_PROPERTIES]; break;
    case 'platform-opportunities': props = [...PLATFORM_OPPORTUNITY_PROPERTIES]; break;
    default: props = [];
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

export function customFieldToFilterProperty(cf: { name: string; key: string; type: string; options?: string[] }): FilterProperty {
  const typeMap: Record<string, PropType> = {
    text: 'text', number: 'number', date: 'date', select: 'select', checkbox: 'checkbox',
  };
  return {
    key: `customFields.${cf.key}`,
    label: cf.name,
    type: (typeMap[cf.type] || 'text') as PropType,
    options: cf.options,
  };
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

  const propMeta = new Map(properties.map(p => [p.key, p]));

  return items.filter(item => {
    return filters.every(f => {
      const val = getProp(item, f.property);
      const strVal = String(val ?? '').toLowerCase();
      let filterVal = f.value?.toLowerCase() ?? '';
      // 'Lead Vertical' is stored as a raw enum but the filter dropdown shows human labels —
      // accept either so both the tab toggle (raw value) and manual filter bar (label) match.
      if (f.property === 'leadVertical') {
        if (filterVal === 'property listing') filterVal = 'property_listing';
        else if (filterVal === 'property management') filterVal = 'property_management';
      }

      switch (f.operator) {
        case 'equals':
          if (val instanceof Date || (typeof val === 'string' && /^\d{4}/.test(val))) {
            const d = new Date(val);
            const fd = new Date(f.value);
            return !isNaN(d.getTime()) && !isNaN(fd.getTime()) && d.toDateString() === fd.toDateString();
          }
          return strVal === filterVal;
        case 'not_equals':
          if (val instanceof Date || (typeof val === 'string' && /^\d{4}/.test(val))) {
            const d = new Date(val);
            const fd = new Date(f.value);
            return isNaN(d.getTime()) || isNaN(fd.getTime()) || d.toDateString() !== fd.toDateString();
          }
          return strVal !== filterVal;
        case 'contains': return strVal.includes(filterVal);
        case 'not_contains': return !strVal.includes(filterVal);
        case 'is_empty': return val === '' || val == null || val === undefined;
        case 'is_not_empty': return val !== '' && val != null && val !== undefined;
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
