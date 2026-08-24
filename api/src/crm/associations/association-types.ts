/** Canonical association type keys for built-in CRM modules. */
export const CRM_ASSOCIATION_TYPES = {
  contact_company: {
    key: 'contact_company',
    fromType: 'contacts',
    toType: 'organizations',
    label: 'Company',
    inverseLabel: 'Contact',
    legacyFromField: 'associatedOrganizations',
    legacyToField: 'associatedContacts',
  },
  contact_contact: {
    key: 'contact_contact',
    fromType: 'contacts',
    toType: 'contacts',
    label: 'Related contact',
    inverseLabel: 'Related contact',
    legacyFromField: 'associatedContacts',
    legacyToField: 'associatedContacts',
  },
  lead_company: {
    key: 'lead_company',
    fromType: 'leads',
    toType: 'organizations',
    label: 'Company',
    inverseLabel: 'Lead',
    legacyFromField: 'associatedOrganizations',
    legacyToField: 'associatedLeads',
  },
  lead_contact: {
    key: 'lead_contact',
    fromType: 'leads',
    toType: 'contacts',
    label: 'Contact',
    inverseLabel: 'Lead',
    legacyFromField: 'associatedContacts',
    legacyToField: 'associatedLeads',
  },
  lead_lead: {
    key: 'lead_lead',
    fromType: 'leads',
    toType: 'leads',
    label: 'Related lead',
    inverseLabel: 'Related lead',
    legacyFromField: 'associatedLeads',
    legacyToField: 'associatedLeads',
  },
  client_company: {
    key: 'client_company',
    fromType: 'clients',
    toType: 'organizations',
    label: 'Company',
    inverseLabel: 'Client',
    legacyFromField: 'associatedOrganizations',
    legacyToField: undefined,
  },
  client_contact: {
    key: 'client_contact',
    fromType: 'clients',
    toType: 'contacts',
    label: 'Contact',
    inverseLabel: 'Client',
    legacyFromField: 'associatedContacts',
    legacyToField: undefined,
  },
  client_lead: {
    key: 'client_lead',
    fromType: 'clients',
    toType: 'leads',
    label: 'Lead',
    inverseLabel: 'Client',
    legacyFromField: 'associatedLeads',
    legacyToField: undefined,
  },
} as const;

export type CrmBuiltinAssociationTypeKey = keyof typeof CRM_ASSOCIATION_TYPES;

export function resolveAssociationTypeKey(
  fromType: string,
  toType: string,
): string {
  const a = String(fromType || '').toLowerCase();
  const b = String(toType || '').toLowerCase();
  const pair = `${a}_${b.replace(/organizations/, 'company').replace(/s$/, '')}`;
  // Prefer known builtins regardless of order.
  for (const def of Object.values(CRM_ASSOCIATION_TYPES)) {
    if (
      (def.fromType === a && def.toType === b) ||
      (def.fromType === b && def.toType === a)
    ) {
      return def.key;
    }
  }
  if (a === b) return `${a.slice(0, -1)}_${a.slice(0, -1)}`;
  return pair || 'custom';
}

/** Normalize edge orientation so unique index stays stable for undirected builtins. */
export function canonicalizeAssociationEndpoints(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationType?: string,
): {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  associationType: string;
  swapped: boolean;
} {
  const typeKey =
    associationType || resolveAssociationTypeKey(fromType, toType);
  const def = (CRM_ASSOCIATION_TYPES as Record<string, (typeof CRM_ASSOCIATION_TYPES)[CrmBuiltinAssociationTypeKey]>)[
    typeKey
  ];

  if (def) {
    // Prefer declared orientation when types match the definition.
    if (fromType === def.fromType && toType === def.toType) {
      return {
        fromType,
        fromId,
        toType,
        toId,
        associationType: typeKey,
        swapped: false,
      };
    }
    if (fromType === def.toType && toType === def.fromType) {
      return {
        fromType: toType,
        fromId: toId,
        toType: fromType,
        toId: fromId,
        associationType: typeKey,
        swapped: true,
      };
    }
  }

  // Undirected fallback: lexicographic order on type+id.
  const left = `${fromType}:${fromId}`;
  const right = `${toType}:${toId}`;
  if (left <= right) {
    return {
      fromType,
      fromId,
      toType,
      toId,
      associationType: typeKey,
      swapped: false,
    };
  }
  return {
    fromType: toType,
    fromId: toId,
    toType: fromType,
    toId: fromId,
    associationType: typeKey,
    swapped: true,
  };
}
