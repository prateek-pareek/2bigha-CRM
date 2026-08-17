/**
 * HubSpot-style CRM field visibility + order per module (browser localStorage).
 * Keys for custom fields use `cf:${customFieldKey}`.
 */

export type CrmFieldContext = 'form' | 'record';

export type CrmModuleKey = 'leads' | 'deals' | 'contacts' | 'organizations' | 'clients';

export interface CrmFieldDef {
  key: string;
  label: string;
  /** If true, user cannot hide this field in the customizer */
  pinned?: boolean;
  /** Only shown on record/detail layout, not create/edit forms */
  recordOnly?: boolean;
}

/** Core lead fields aligned with api-hrms lead.schema + forms */
export const LEAD_FIELD_DEFS: CrmFieldDef[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'firstName', label: 'First Name', pinned: true },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email', pinned: true },
  { key: 'additionalEmails', label: 'Additional emails' },
  { key: 'gender', label: 'Gender' },
  { key: 'mobileNo', label: 'Mobile' },
  { key: 'phone', label: 'Phone (alternate)' },
  { key: 'organization', label: 'Company' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'website', label: 'Website' },
  { key: 'linkedinUrl', label: 'LinkedIn URL' },
  { key: 'twitterHandle', label: 'X (Twitter) handle' },
  { key: 'source', label: 'Lead Source' },
  { key: 'industry', label: 'Industry' },
  { key: 'annualRevenue', label: 'Annual Revenue' },
  { key: 'noOfEmployees', label: 'No. of Employees' },
  { key: 'territory', label: 'Territory' },
  { key: 'relatedService', label: 'Related service' },
  /** Shown when editing a lead (create panel omits this field; API sets owner on create). */
  { key: 'leadOwner', label: 'Lead Owner' },
  { key: 'pipeline', label: 'Pipeline', pinned: true },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status (legacy)' },
  { key: 'callStatus', label: 'Call Status' },
  { key: 'nextFollowUpAt', label: 'Next Follow-up' },
  { key: 'leadScore', label: 'Lead score', recordOnly: true },
  { key: 'createdAt', label: 'Created', recordOnly: true },
];

/** Core deal fields aligned with deal.schema + EditModal */
export const DEAL_FIELD_DEFS: CrmFieldDef[] = [
  { key: 'title', label: 'Deal Title', pinned: true },
  { key: 'pricingType', label: 'Pricing type', pinned: true },
  { key: 'dealValue', label: 'Amount', pinned: true },
  { key: 'contractMonths', label: 'Contract months' },
  { key: 'pipeline', label: 'Pipeline', pinned: true },
  { key: 'stage', label: 'Stage', pinned: true },
  /** Derived from pipeline stage — not collected on create/edit forms. */
  { key: 'probability', label: 'Probability (%)', recordOnly: true },
  { key: 'organization', label: 'Organization' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'expectedClosureDate', label: 'Expected Close Date' },
  { key: 'closedDate', label: 'Closed Date' },
  { key: 'nextStep', label: 'Next Step' },
  { key: 'expectedDealValue', label: 'Expected Deal Value' },
  { key: 'dealOwner', label: 'Deal Owner' },
  { key: 'currency', label: 'Currency' },
  { key: 'exchangeRate', label: 'Exchange Rate' },
  { key: 'createdAt', label: 'Created', recordOnly: true },
];

/** contact.schema — superset of lead fields + contact-only (telegram, address, etc.) */
export const CONTACT_FIELD_DEFS: CrmFieldDef[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'firstName', label: 'First Name', pinned: true },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email', pinned: true },
  { key: 'additionalEmails', label: 'Additional emails' },
  { key: 'gender', label: 'Gender' },
  { key: 'mobileNo', label: 'Mobile' },
  { key: 'phone', label: 'Phone (alternate)' },
  { key: 'organization', label: 'Company' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'website', label: 'Website' },
  { key: 'linkedinUrl', label: 'LinkedIn URL' },
  { key: 'twitterHandle', label: 'X (Twitter) handle' },
  { key: 'source', label: 'Lead Source' },
  { key: 'industry', label: 'Industry' },
  { key: 'annualRevenue', label: 'Annual Revenue' },
  { key: 'noOfEmployees', label: 'No. of Employees' },
  { key: 'territory', label: 'Territory' },
  { key: 'leadOwner', label: 'Owner', recordOnly: true },
  { key: 'pipeline', label: 'Pipeline', pinned: true },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status (legacy)' },
  { key: 'converted', label: 'Converted', recordOnly: true },
  { key: 'leadScore', label: 'Lead score', recordOnly: true },
  { key: 'image', label: 'Image URL', recordOnly: true },
  { key: 'telegram', label: 'Telegram' },
  { key: 'address', label: 'Address' },
  { key: 'createdAt', label: 'Created', recordOnly: true },
];

/** organization.schema */
export const ORGANIZATION_FIELD_DEFS: CrmFieldDef[] = [
  { key: 'name', label: 'Organization Name', pinned: true },
  { key: 'website', label: 'Website' },
  { key: 'annualRevenue', label: 'Annual Revenue' },
  { key: 'territory', label: 'Territory' },
  { key: 'noOfEmployees', label: 'No. of Employees' },
  { key: 'industry', label: 'Industry' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'createdAt', label: 'Created', recordOnly: true },
];

/** client.schema */
export const CLIENT_FIELD_DEFS: CrmFieldDef[] = [
  { key: 'name', label: 'Full Name', pinned: true },
  { key: 'email', label: 'Email', pinned: true },
  { key: 'additionalEmails', label: 'Additional emails' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'organization', label: 'Organization' },
  { key: 'createdAt', label: 'Created', recordOnly: true },
];

export function getFieldDefsForModule(module: CrmModuleKey): CrmFieldDef[] {
  switch (module) {
    case 'leads':
      return LEAD_FIELD_DEFS;
    case 'deals':
      return DEAL_FIELD_DEFS;
    case 'contacts':
      return CONTACT_FIELD_DEFS;
    case 'organizations':
      return ORGANIZATION_FIELD_DEFS;
    case 'clients':
      return CLIENT_FIELD_DEFS;
    default:
      return [];
  }
}

export interface FieldLayoutState {
  order: string[];
  hidden: string[];
}

const LEGACY_LEAD_CORE_ORDER = 'lead_core_field_order';

function storageKey(module: CrmModuleKey, context: CrmFieldContext): string {
  return `crm_field_layout_${module}_${context}`;
}

function defaultDefs(module: CrmModuleKey): CrmFieldDef[] {
  return getFieldDefsForModule(module);
}

function getDefaultOrderKeys(module: CrmModuleKey, context: CrmFieldContext): string[] {
  return defaultDefs(module)
    .filter((d) => context !== 'form' || !d.recordOnly)
    .map((d) => d.key);
}

function defaultState(module: CrmModuleKey, context: CrmFieldContext): FieldLayoutState {
  return { order: getDefaultOrderKeys(module, context), hidden: [] };
}

export function loadFieldLayout(module: CrmModuleKey, context: CrmFieldContext): FieldLayoutState {
  const defs = defaultDefs(module);
  const defaultOrder = getDefaultOrderKeys(module, context);
  const pinned = new Set(defs.filter((d) => d.pinned).map((d) => d.key));

  try {
    const raw = localStorage.getItem(storageKey(module, context));
    if (raw) {
      const parsed = JSON.parse(raw) as FieldLayoutState;
      const order = Array.isArray(parsed.order) ? [...parsed.order] : [...defaultOrder];
      const hidden = Array.isArray(parsed.hidden) ? [...parsed.hidden] : [];

      defaultOrder.forEach((k) => {
        if (!order.includes(k)) order.push(k);
      });
      const hiddenFiltered = hidden.filter((k) => !pinned.has(k));

      return { order, hidden: hiddenFiltered };
    }
  } catch {
    /* ignore */
  }

  if (module === 'leads' && context === 'form') {
    try {
      const legacy = localStorage.getItem(LEGACY_LEAD_CORE_ORDER);
      if (legacy) {
        const keys: string[] = JSON.parse(legacy);
        const mapLegacy: Record<string, string> = {
          name: 'firstName',
          email: 'email',
          mobileNo: 'mobileNo',
          pipeline: 'pipeline',
        };
        const mapped = keys.map((k) => mapLegacy[k] || k).filter((k) => defaultOrder.includes(k));
        const rest = defaultOrder.filter((k) => !mapped.includes(k));
        const merged = [...mapped, ...rest];
        localStorage.removeItem(LEGACY_LEAD_CORE_ORDER);
        const state: FieldLayoutState = { order: merged, hidden: [] };
        saveFieldLayout(module, context, state);
        return state;
      }
    } catch {
      /* ignore */
    }
  }

  return defaultState(module, context);
}

export function saveFieldLayout(module: CrmModuleKey, context: CrmFieldContext, state: FieldLayoutState): void {
  try {
    localStorage.setItem(storageKey(module, context), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function mergeOrderWithCustomFields(
  module: CrmModuleKey,
  context: CrmFieldContext,
  customFieldKeys: string[]
): FieldLayoutState {
  const base = loadFieldLayout(module, context);
  const cfKeys = customFieldKeys.map((k) => `cf:${k}`);
  const order = [...base.order];
  cfKeys.forEach((k) => {
    if (!order.includes(k)) order.push(k);
  });
  const validCore = new Set(getDefaultOrderKeys(module, context));
  const filteredOrder = order.filter((k) => {
    if (k.startsWith('cf:')) return cfKeys.includes(k);
    return validCore.has(k);
  });
  return { order: filteredOrder, hidden: base.hidden };
}

export function isFieldVisible(layout: FieldLayoutState, key: string): boolean {
  if (layout.hidden.includes(key)) return false;
  return true;
}

export function getVisibleFieldKeysOrdered(
  module: CrmModuleKey,
  context: CrmFieldContext,
  customFieldKeys: string[]
): string[] {
  const layout = mergeOrderWithCustomFields(module, context, customFieldKeys);
  const defs = defaultDefs(module);
  const pinned = new Set(defs.filter((d) => d.pinned).map((d) => d.key));

  return layout.order.filter((key) => {
    if (
      module === 'leads' &&
      context === 'form' &&
      (key === 'cf:RELATED_SERVICE' || key === 'cf:related_service')
    ) {
      return false;
    }
    if (pinned.has(key)) return true;
    return isFieldVisible(layout, key);
  });
}

export function toggleFieldVisibility(
  module: CrmModuleKey,
  context: CrmFieldContext,
  key: string,
  visible: boolean,
  customFieldKeys: string[]
): void {
  const defs = defaultDefs(module);
  const pinned = new Set(defs.filter((d) => d.pinned).map((d) => d.key));
  if (pinned.has(key) && !visible) return;

  let layout = mergeOrderWithCustomFields(module, context, customFieldKeys);
  const hidden = new Set(layout.hidden);
  if (visible) hidden.delete(key);
  else hidden.add(key);
  layout = { ...layout, hidden: [...hidden] };
  saveFieldLayout(module, context, layout);
}

export function reorderFields(
  module: CrmModuleKey,
  context: CrmFieldContext,
  newOrder: string[],
  customFieldKeys: string[]
): void {
  const layout = mergeOrderWithCustomFields(module, context, customFieldKeys);
  const valid = new Set([
    ...getDefaultOrderKeys(module, context),
    ...customFieldKeys.map((k) => `cf:${k}`),
  ]);
  const filtered = newOrder.filter((k) => valid.has(k));
  valid.forEach((k) => {
    if (!filtered.includes(k)) filtered.push(k);
  });
  saveFieldLayout(module, context, { ...layout, order: filtered });
}

export function fieldLabel(module: CrmModuleKey, key: string, customLabels: Record<string, string>): string {
  if (key.startsWith('cf:')) {
    const k = key.slice(3);
    return customLabels[k] || k.replace(/_/g, ' ');
  }
  const def = defaultDefs(module).find((d) => d.key === key);
  return def?.label || key;
}
