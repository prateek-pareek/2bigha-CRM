import {
  CanonicalActivity,
  CanonicalAssociation,
  CanonicalDeal,
  CanonicalOrganization,
  CanonicalPerson,
  CanonicalRecord,
  CrmAssociationObjectType,
  CrmMigrationEntityType,
  CrmMigrationPlatform,
  FieldMapping,
  ASSOCIATION_OBJECT_TYPES,
  defaultActivityTypeForEntity,
  isActivityEntityType,
} from './migration.types';

type Row = Record<string, unknown>;

function pick(row: Row, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  const lower = new Map(
    Object.keys(row).map((k) => [k.toLowerCase().replace(/[\s_]+/g, ''), k]),
  );
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/[\s_]+/g, '');
    const real = lower.get(norm);
    if (real != null && row[real] != null && String(row[real]).trim() !== '') {
      return String(row[real]).trim();
    }
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(/[,₹$€£]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Split comma / semicolon / pipe lists of source IDs. */
export function splitIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truthy(v?: string): boolean {
  if (!v) return false;
  return /^(1|true|yes|y|primary)$/i.test(v.trim());
}

function normalizeObjectType(
  raw?: string,
): CrmAssociationObjectType | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/compan|org|account/.test(s)) return 'organizations';
  if (/deal|opportunit/.test(s)) return 'deals';
  if (/lead/.test(s)) return 'leads';
  if (/contact|person|people/.test(s)) return 'contacts';
  if (ASSOCIATION_OBJECT_TYPES.includes(raw as CrmAssociationObjectType)) {
    return raw as CrmAssociationObjectType;
  }
  return undefined;
}

/** Apply explicit column mapping first, then platform heuristics. */
export function applyFieldMapping(
  row: Row,
  mapping?: FieldMapping,
): Row {
  if (!mapping || !Object.keys(mapping).length) return row;
  const out: Row = { ...row };
  for (const [target, sourceCol] of Object.entries(mapping)) {
    if (!sourceCol) continue;
    if (row[sourceCol] !== undefined) out[target] = row[sourceCol];
  }
  return out;
}

/** Keep the original source row so nothing is lost from a custom CRM. */
export function attachSourcePayload<T extends { sourcePayload?: Row; customFields?: Record<string, unknown> }>(
  mapped: T,
  originalRow: Row,
): T {
  mapped.sourcePayload = originalRow;
  mapped.customFields = {
    ...(mapped.customFields || {}),
    _sourcePayload: originalRow,
  };
  return mapped;
}

export function mapOrganization(
  row: Row,
  platform: CrmMigrationPlatform,
): CanonicalOrganization | null {
  const name =
    pick(
      row,
      'name',
      'Name',
      'Company name',
      'Company Name',
      'company',
      'Company',
      'Account Name',
      'AccountName',
      'Organisation',
      'Organization',
    ) || '';
  if (!name) return null;

  const externalId = pick(
    row,
    'externalId',
    'recordId',
    'hubspotCompanyId',
    'Record ID',
    'Company ID',
    'Account ID',
    'AccountId',
    'Id',
    'id',
    'Company Id',
  );

  const org: CanonicalOrganization = {
    externalId,
    name,
    website: pick(row, 'website', 'Website', 'Website URL', 'Company Domain Name'),
    phone: pick(row, 'phone', 'Phone', 'Phone Number', 'Company Phone Number'),
    email: pick(row, 'email', 'Email', 'Company Email'),
    industry: pick(row, 'industry', 'Industry'),
    territory: pick(row, 'territory', 'Territory', 'Country', 'Billing Country'),
    noOfEmployees: pick(
      row,
      'noOfEmployees',
      'Number of Employees',
      'Employees',
      'Employee Count',
    ),
    annualRevenue: num(
      pick(row, 'annualRevenue', 'Annual Revenue', 'Revenue', 'Amount'),
    ),
    address: pick(
      row,
      'address',
      'Address',
      'Street Address',
      'Billing Street',
      'City',
    ),
    ownerLabel: pick(
      row,
      'ownerLabel',
      'Owner',
      'Company owner',
      'Account Owner',
      'Owner Name',
    ),
    relatedContactExternalIds: splitIds(
      pick(
        row,
        'relatedContactExternalIds',
        'Associated Contact IDs',
        'Contact IDs',
        'Associated Contacts',
      ),
    ),
    relatedDealExternalIds: splitIds(
      pick(
        row,
        'relatedDealExternalIds',
        'Associated Deal IDs',
        'Deal IDs',
        'Opportunity IDs',
      ),
    ),
  };

  if (platform === 'hubspot' && externalId) {
    org.customFields = { hubspot_company_id: externalId };
  } else if (platform === 'salesforce' && externalId) {
    org.customFields = { salesforce_account_id: externalId };
  } else if (platform === 'zoho' && externalId) {
    org.customFields = { zoho_account_id: externalId };
  } else if (externalId) {
    org.customFields = { [`${platform}_company_id`]: externalId };
  }

  return org;
}

export function mapPerson(
  row: Row,
  platform: CrmMigrationPlatform,
  entity: 'contacts' | 'leads',
): CanonicalPerson | null {
  const fullName = pick(row, 'Name', 'name', 'Full Name', 'FullName', 'Contact Name');
  let firstName = pick(
    row,
    'firstName',
    'First Name',
    'FirstName',
    'Given Name',
  );
  let lastName = pick(
    row,
    'lastName',
    'Last Name',
    'LastName',
    'Surname',
    'Family Name',
  );
  if ((!firstName || !lastName) && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = firstName || parts[0] || 'Unknown';
    lastName =
      lastName ||
      parts.slice(1).join(' ') ||
      (entity === 'leads' ? 'Lead' : 'Contact');
  }
  if (!firstName && !lastName && !pick(row, 'email', 'Email')) return null;
  firstName = firstName || 'Unknown';
  lastName = lastName || (entity === 'leads' ? 'Lead' : 'Contact');

  const externalId = pick(
    row,
    'externalId',
    'recordId',
    'hubspotContactId',
    'Record ID',
    'Contact ID',
    'ContactId',
    'Lead ID',
    'LeadId',
    'Id',
    'id',
  );

  const primaryOrgId = pick(
    row,
    'organizationExternalId',
    'hubspotCompanyId',
    'Associated Company ID',
    'Company ID',
    'AccountId',
    'Account ID',
    'Primary Company ID',
  );
  const orgIds = [
    ...new Set([
      ...(primaryOrgId ? [primaryOrgId] : []),
      ...splitIds(
        pick(
          row,
          'organizationExternalIds',
          'Associated Company IDs',
          'Company IDs',
          'Account IDs',
        ),
      ),
    ]),
  ];

  const person: CanonicalPerson = {
    externalId,
    firstName,
    lastName,
    email: pick(row, 'email', 'Email', 'Email Address', 'Work Email'),
    additionalEmails: splitIds(
      pick(row, 'additionalEmails', 'Additional Emails', 'Other Emails'),
    ),
    mobileNo: pick(
      row,
      'mobileNo',
      'Mobile',
      'Mobile Phone',
      'Mobile Phone Number',
      'MobileNo',
    ),
    phone: pick(row, 'phone', 'Phone', 'Phone Number', 'Work Phone'),
    jobTitle: pick(row, 'jobTitle', 'Job Title', 'Title', 'Designation'),
    organizationName: pick(
      row,
      'organization',
      'organizationName',
      'Company',
      'Company Name',
      'Account Name',
      'Organisation',
    ),
    organizationExternalId: primaryOrgId || orgIds[0],
    organizationExternalIds: orgIds,
    relatedContactExternalIds: splitIds(
      pick(
        row,
        'relatedContactExternalIds',
        'Associated Contact IDs',
        'Related Contact IDs',
      ),
    ),
    relatedDealExternalIds: splitIds(
      pick(
        row,
        'relatedDealExternalIds',
        'Associated Deal IDs',
        'Deal IDs',
        'Opportunity IDs',
      ),
    ),
    relatedLeadExternalIds: splitIds(
      pick(row, 'relatedLeadExternalIds', 'Associated Lead IDs', 'Lead IDs'),
    ),
    website: pick(row, 'website', 'Website'),
    linkedinUrl: pick(row, 'linkedinUrl', 'LinkedIn', 'LinkedIn URL'),
    industry: pick(row, 'industry', 'Industry'),
    territory: pick(row, 'territory', 'Territory', 'Country'),
    source: pick(row, 'source', 'Lead Source', 'Source', 'Original Source'),
    status: pick(row, 'status', 'Status', 'Lead Status', 'Lifecycle Stage'),
    stage: pick(row, 'stage', 'Stage', 'Lead Status'),
    ownerLabel: pick(
      row,
      'ownerLabel',
      'leadOwner',
      'Owner',
      'Contact owner',
      'Lead Owner',
      'Owner Name',
    ),
    annualRevenue: num(pick(row, 'annualRevenue', 'Annual Revenue')),
    noOfEmployees: pick(row, 'noOfEmployees', 'Number of Employees'),
  };

  const cfKey =
    entity === 'leads'
      ? `${platform === 'custom' ? 'source' : platform}_lead_id`
      : platform === 'hubspot'
        ? 'hubspot_contact_id'
        : `${platform}_contact_id`;
  if (externalId) {
    person.customFields = { [cfKey]: externalId };
    if (platform === 'hubspot' && entity === 'contacts') {
      person.customFields.hubspot_contact_id = externalId;
    }
  }
  if (person.organizationExternalId && platform === 'hubspot') {
    person.customFields = {
      ...(person.customFields || {}),
      hubspot_company_id: person.organizationExternalId,
    };
  }

  return person;
}

export function mapDeal(
  row: Row,
  platform: CrmMigrationPlatform,
): CanonicalDeal | null {
  const title =
    pick(
      row,
      'title',
      'Deal Name',
      'Deal name',
      'Opportunity Name',
      'Name',
      'name',
      'Subject',
    ) || '';
  if (!title) return null;

  const externalId = pick(
    row,
    'externalId',
    'recordId',
    'Deal ID',
    'Opportunity ID',
    'OpportunityId',
    'Id',
    'id',
    'Record ID',
  );

  const primaryOrg = pick(
    row,
    'organizationExternalId',
    'hubspotCompanyId',
    'Associated Company ID',
    'AccountId',
    'Account ID',
    'Company ID',
  );
  const orgIds = [
    ...new Set([
      ...(primaryOrg ? [primaryOrg] : []),
      ...splitIds(
        pick(
          row,
          'organizationExternalIds',
          'Associated Company IDs',
          'Company IDs',
        ),
      ),
    ]),
  ];
  const primaryContact = pick(
    row,
    'contactExternalId',
    'hubspotContactId',
    'Associated Contact ID',
    'ContactId',
    'Contact ID',
    'Primary Contact ID',
  );
  const contactIds = [
    ...new Set([
      ...(primaryContact ? [primaryContact] : []),
      ...splitIds(
        pick(
          row,
          'contactExternalIds',
          'Associated Contact IDs',
          'Contact IDs',
        ),
      ),
    ]),
  ];

  const deal: CanonicalDeal = {
    externalId,
    title,
    dealValue: num(
      pick(
        row,
        'dealValue',
        'Amount',
        'Deal Amount',
        'Value',
        'Opportunity Amount',
      ),
    ),
    stage: pick(
      row,
      'stage',
      'Stage',
      'Deal Stage',
      'Pipeline Stage',
      'Status',
    ),
    probability: num(pick(row, 'probability', 'Probability', 'Win Probability')),
    organizationName: pick(
      row,
      'organization',
      'organizationName',
      'Company',
      'Company Name',
      'Account Name',
      'Associated Company',
    ),
    organizationExternalId: primaryOrg || orgIds[0],
    organizationExternalIds: orgIds,
    contactEmail: pick(
      row,
      'contactEmail',
      'Contact Email',
      'Associated Contact Email',
      'Email',
    ),
    contactExternalId: primaryContact || contactIds[0],
    contactExternalIds: contactIds,
    leadExternalId: pick(row, 'leadExternalId', 'Lead ID', 'LeadId'),
    ownerLabel: pick(
      row,
      'ownerLabel',
      'dealOwner',
      'Owner',
      'Deal owner',
      'Opportunity Owner',
    ),
    expectedClosureDate: pick(
      row,
      'expectedClosureDate',
      'Close Date',
      'Closing Date',
      'Expected Close Date',
    ),
    closedDate: pick(row, 'closedDate', 'Closed Date', 'Actual Close Date'),
    currency: pick(row, 'currency', 'Currency', 'Deal Currency'),
    nextStep: pick(row, 'nextStep', 'Next Step', 'Next Steps'),
  };

  if (externalId) {
    const key =
      platform === 'hubspot'
        ? 'hubspot_deal_id'
        : platform === 'salesforce'
          ? 'salesforce_opportunity_id'
          : `${platform}_deal_id`;
    deal.customFields = { [key]: externalId };
  }

  return deal;
}

export function mapActivity(
  row: Row,
  platform: CrmMigrationPlatform,
  entity: CrmMigrationEntityType,
): CanonicalActivity | null {
  const content =
    pick(
      row,
      'content',
      'Body',
      'Note',
      'Notes',
      'Description',
      'Comment',
      'Engagement',
      'Activity body',
      'Call notes',
      'Call Notes',
      'Meeting Notes',
      'Email Body',
      'Task Body',
    ) ||
    pick(row, 'title', 'Subject', 'Title') ||
    '';
  if (!content) return null;

  const relatedEntityRaw = pick(
    row,
    'relatedEntityType',
    'Associated Object Type',
    'Object Type',
    'Entity Type',
    'Record Type',
  );
  let relatedEntityType =
    normalizeObjectType(relatedEntityRaw) || ('contacts' as const);

  const activityRaw = (
    pick(row, 'activityType', 'type', 'Engagement Type', 'Activity Type') ||
    defaultActivityTypeForEntity(entity)
  ).toLowerCase();
  let activityType = defaultActivityTypeForEntity(entity);
  if (activityRaw.includes('call')) activityType = 'Call';
  else if (activityRaw.includes('meet')) activityType = 'Meeting';
  else if (activityRaw.includes('task')) activityType = 'Task';
  else if (activityRaw.includes('email') || activityRaw.includes('mail')) {
    activityType = 'Email';
  } else if (activityRaw.includes('note') || activityRaw.includes('comment')) {
    activityType = 'Note';
  }

  const primaryRelatedId = pick(
    row,
    'relatedExternalId',
    'Associated Record ID',
    'Record ID (associated)',
    'Contact ID',
    'Company ID',
    'Deal ID',
    'Lead ID',
    'Associated Contact ID',
    'Associated Company ID',
    'Associated Deal ID',
  );

  const relatedLinks: CanonicalActivity['relatedLinks'] = [];
  if (primaryRelatedId) {
    relatedLinks.push({
      entityType: relatedEntityType,
      externalId: primaryRelatedId,
    });
  }
  for (const [field, type] of [
    ['relatedContactExternalIds', 'contacts'],
    ['relatedOrganizationExternalIds', 'organizations'],
    ['relatedDealExternalIds', 'deals'],
    ['relatedLeadExternalIds', 'leads'],
    ['Associated Contact IDs', 'contacts'],
    ['Associated Company IDs', 'organizations'],
    ['Associated Deal IDs', 'deals'],
  ] as const) {
    for (const id of splitIds(pick(row, field))) {
      if (!relatedLinks.some((l) => l.externalId === id)) {
        relatedLinks.push({
          entityType: type as CrmAssociationObjectType,
          externalId: id,
        });
      }
    }
  }

  return {
    externalId: pick(
      row,
      'externalId',
      'Record ID',
      'Note ID',
      'Call ID',
      'Engagement ID',
      'Activity ID',
      'Id',
      'id',
    ),
    activityType,
    title: pick(row, 'title', 'Subject', 'Title', 'Activity title', 'Call Title'),
    content,
    relatedEntityType,
    relatedExternalId: primaryRelatedId,
    relatedEmail: pick(row, 'relatedEmail', 'Contact Email', 'Email'),
    relatedName: pick(
      row,
      'relatedName',
      'Associated Name',
      'Contact Name',
      'Company Name',
      'Deal Name',
    ),
    relatedLinks,
    authorLabel: pick(row, 'authorLabel', 'Created By', 'Owner', 'Author'),
    assigneeLabel: pick(row, 'assigneeLabel', 'Assignee', 'Assigned To'),
    status: pick(row, 'status', 'Status', 'Task Status', 'Call Status'),
    createdAt: pick(
      row,
      'createdAt',
      'Create Date',
      'Created Date',
      'Activity Date',
      'Timestamp',
      'Call Date',
      'Meeting Date',
    ),
    durationSeconds: num(
      pick(
        row,
        'durationSeconds',
        'Duration',
        'Call Duration',
        'Duration (seconds)',
        'Duration Seconds',
      ),
    ),
    direction: pick(row, 'direction', 'Call Direction', 'Direction'),
    outcome: pick(row, 'outcome', 'Call Outcome', 'Outcome', 'Result'),
    disposition: pick(row, 'disposition', 'Disposition', 'Call Disposition'),
    scheduledAt: pick(
      row,
      'scheduledAt',
      'Scheduled At',
      'Start Time',
      'Meeting Start',
    ),
    completedAt: pick(row, 'completedAt', 'Completed At', 'End Time'),
    phoneNumber: pick(row, 'phoneNumber', 'Phone Number', 'To Number', 'From Number'),
    meetingUrl: pick(row, 'meetingUrl', 'Meeting URL', 'Conference URL', 'Zoom URL'),
    customFields: {
      _platform: platform,
    },
  };
}

export function mapAssociation(
  row: Row,
  _platform: CrmMigrationPlatform,
): CanonicalAssociation | null {
  const fromExternalId = pick(
    row,
    'fromExternalId',
    'From ID',
    'From Record ID',
    'Source ID',
    'Object ID',
    'FromObjectId',
  );
  const toExternalId = pick(
    row,
    'toExternalId',
    'To ID',
    'To Record ID',
    'Target ID',
    'Associated Object ID',
    'ToObjectId',
  );
  const fromEntityType = normalizeObjectType(
    pick(
      row,
      'fromEntityType',
      'From Type',
      'From Object Type',
      'Source Type',
      'Object Type',
    ),
  );
  const toEntityType = normalizeObjectType(
    pick(
      row,
      'toEntityType',
      'To Type',
      'To Object Type',
      'Target Type',
      'Associated Object Type',
    ),
  );
  if (!fromExternalId || !toExternalId || !fromEntityType || !toEntityType) {
    return null;
  }

  return {
    externalId: pick(row, 'externalId', 'Association ID', 'Id', 'id'),
    fromEntityType,
    fromExternalId,
    toEntityType,
    toExternalId,
    label: pick(
      row,
      'label',
      'Association Label',
      'Label',
      'Role',
      'Relationship Type',
      'Type',
    ),
    isPrimary: truthy(
      pick(row, 'isPrimary', 'Primary', 'Is Primary', 'IsPrimary'),
    ),
  };
}

export function mapRowToCanonical(
  row: Row,
  platform: CrmMigrationPlatform,
  entity: CrmMigrationEntityType,
  mapping?: FieldMapping,
): CanonicalRecord | null {
  const mapped = applyFieldMapping(row, mapping);
  let canonical: CanonicalRecord | null = null;
  switch (entity) {
    case 'organizations':
      canonical = mapOrganization(mapped, platform);
      break;
    case 'contacts':
      canonical = mapPerson(mapped, platform, 'contacts');
      break;
    case 'leads':
      canonical = mapPerson(mapped, platform, 'leads');
      break;
    case 'deals':
      canonical = mapDeal(mapped, platform);
      break;
    case 'associations':
      canonical = mapAssociation(mapped, platform);
      break;
    default:
      if (isActivityEntityType(entity)) {
        canonical = mapActivity(mapped, platform, entity);
      }
      break;
  }
  if (!canonical) return null;
  return attachSourcePayload(canonical as any, row);
}

export function targetFieldsForEntity(
  entity: CrmMigrationEntityType,
): { key: string; label: string }[] {
  if (isActivityEntityType(entity)) {
    return [
      { key: 'content', label: 'Body / notes' },
      { key: 'title', label: 'Title / subject' },
      { key: 'activityType', label: 'Type (Note/Call/Meeting/Email/Task)' },
      { key: 'relatedEntityType', label: 'Primary related entity type' },
      { key: 'relatedExternalId', label: 'Primary related source ID' },
      { key: 'relatedContactExternalIds', label: 'Related contact IDs (list)' },
      {
        key: 'relatedOrganizationExternalIds',
        label: 'Related company IDs (list)',
      },
      { key: 'relatedDealExternalIds', label: 'Related deal IDs (list)' },
      { key: 'relatedEmail', label: 'Related contact email' },
      { key: 'durationSeconds', label: 'Duration (seconds)' },
      { key: 'direction', label: 'Call direction' },
      { key: 'outcome', label: 'Outcome / result' },
      { key: 'phoneNumber', label: 'Phone number' },
      { key: 'meetingUrl', label: 'Meeting URL' },
      { key: 'scheduledAt', label: 'Scheduled at' },
      { key: 'authorLabel', label: 'Author' },
      { key: 'createdAt', label: 'Created at' },
      { key: 'externalId', label: 'Source activity ID' },
    ];
  }
  switch (entity) {
    case 'organizations':
      return [
        { key: 'name', label: 'Company name' },
        { key: 'externalId', label: 'Source company ID' },
        { key: 'website', label: 'Website' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'industry', label: 'Industry' },
        { key: 'territory', label: 'Territory / Country' },
        { key: 'relatedContactExternalIds', label: 'Related contact IDs' },
        { key: 'relatedDealExternalIds', label: 'Related deal IDs' },
        { key: 'ownerLabel', label: 'Owner' },
      ];
    case 'contacts':
      return [
        { key: 'firstName', label: 'First name' },
        { key: 'lastName', label: 'Last name' },
        { key: 'email', label: 'Email' },
        { key: 'mobileNo', label: 'Mobile' },
        { key: 'phone', label: 'Phone' },
        { key: 'jobTitle', label: 'Job title' },
        { key: 'organization', label: 'Company name' },
        { key: 'organizationExternalId', label: 'Primary source company ID' },
        {
          key: 'organizationExternalIds',
          label: 'All source company IDs (list)',
        },
        { key: 'relatedContactExternalIds', label: 'Related contact IDs' },
        { key: 'relatedDealExternalIds', label: 'Related deal IDs' },
        { key: 'externalId', label: 'Source contact/lead ID' },
        { key: 'linkedinUrl', label: 'LinkedIn URL' },
        { key: 'source', label: 'Lead source' },
        { key: 'status', label: 'Status' },
        { key: 'stage', label: 'Stage' },
        { key: 'ownerLabel', label: 'Owner' },
      ];
    case 'leads':
      return [
        { key: 'firstName', label: 'First name' },
        { key: 'lastName', label: 'Last name' },
        { key: 'email', label: 'Email' },
        { key: 'mobileNo', label: 'Mobile' },
        { key: 'phone', label: 'Phone' },
        { key: 'jobTitle', label: 'Job title' },
        { key: 'organization', label: 'Company name' },
        { key: 'organizationExternalId', label: 'Primary source company ID' },
        {
          key: 'organizationExternalIds',
          label: 'All source company IDs (list)',
        },
        { key: 'relatedContactExternalIds', label: 'Related contact IDs' },
        { key: 'relatedDealExternalIds', label: 'Related deal IDs' },
        { key: 'externalId', label: 'Source contact/lead ID' },
        { key: 'status', label: 'Status' },
        { key: 'stage', label: 'Stage' },
        { key: 'ownerLabel', label: 'Owner' },
      ];
    case 'deals':
      return [
        { key: 'title', label: 'Deal title' },
        { key: 'externalId', label: 'Source deal ID' },
        { key: 'dealValue', label: 'Value' },
        { key: 'stage', label: 'Stage' },
        { key: 'organization', label: 'Company name' },
        { key: 'organizationExternalId', label: 'Primary source company ID' },
        {
          key: 'organizationExternalIds',
          label: 'All source company IDs (list)',
        },
        { key: 'contactEmail', label: 'Primary contact email' },
        { key: 'contactExternalId', label: 'Primary source contact ID' },
        { key: 'contactExternalIds', label: 'All source contact IDs (list)' },
        { key: 'leadExternalId', label: 'Source lead ID' },
        { key: 'ownerLabel', label: 'Owner' },
        { key: 'expectedClosureDate', label: 'Close date' },
        { key: 'currency', label: 'Currency' },
      ];
    case 'associations':
      return [
        { key: 'fromEntityType', label: 'From entity type' },
        { key: 'fromExternalId', label: 'From source ID' },
        { key: 'toEntityType', label: 'To entity type' },
        { key: 'toExternalId', label: 'To source ID' },
        { key: 'label', label: 'Relationship label / role' },
        { key: 'isPrimary', label: 'Is primary (true/false)' },
        { key: 'externalId', label: 'Source association ID' },
      ];
    default:
      return [];
  }
}

export function suggestMapping(
  headers: string[],
  entity: CrmMigrationEntityType,
  platform: CrmMigrationPlatform,
): FieldMapping {
  const targets = targetFieldsForEntity(entity);
  const mapping: FieldMapping = {};
  const headerLower = headers.map((h) => ({
    raw: h,
    norm: h.toLowerCase().replace(/[\s_\-]+/g, ''),
  }));

  const aliases: Record<string, string[]> = {
    name: ['name', 'companyname', 'accountname', 'company', 'organisation'],
    firstName: ['firstname', 'givenname', 'first'],
    lastName: ['lastname', 'surname', 'familyname', 'last'],
    email: ['email', 'emailaddress', 'workemail'],
    mobileNo: ['mobile', 'mobileno', 'mobilephone', 'mobilephonenumber'],
    phone: ['phone', 'phonenumber', 'workphone', 'companyphonenumber'],
    jobTitle: ['jobtitle', 'title', 'designation'],
    organization: [
      'company',
      'companyname',
      'organization',
      'accountname',
      'organisation',
    ],
    organizationExternalId: [
      'associatedcompanyid',
      'companyid',
      'accountid',
      'hubspotcompanyid',
      'primarycompanyid',
    ],
    organizationExternalIds: [
      'organizationexternalids',
      'associatedcompanyids',
      'companyids',
      'accountids',
    ],
    externalId: [
      'recordid',
      'id',
      'contactid',
      'leadid',
      'dealid',
      'opportunityid',
      'accountid',
      'companyid',
      'noteid',
      'callid',
      'engagementid',
      'activityid',
      'associationid',
    ],
    website: ['website', 'websiteurl', 'companydomainname'],
    linkedinUrl: ['linkedin', 'linkedinurl'],
    industry: ['industry'],
    territory: ['territory', 'country', 'billingcountry'],
    source: ['source', 'leadsource', 'originalsource'],
    status: ['status', 'leadstatus', 'lifecyclestage', 'taskstatus', 'callstatus'],
    stage: ['stage', 'dealstage', 'pipelinestage'],
    ownerLabel: [
      'owner',
      'ownername',
      'contactowner',
      'dealowner',
      'companyowner',
    ],
    title: ['title', 'dealname', 'opportunityname', 'name', 'subject', 'calltitle'],
    dealValue: ['dealvalue', 'amount', 'value', 'opportunityamount'],
    probability: ['probability', 'winprobability'],
    contactEmail: ['contactemail', 'associatedcontactemail', 'email'],
    contactExternalId: [
      'associatedcontactid',
      'contactid',
      'hubspotcontactid',
      'primarycontactid',
    ],
    contactExternalIds: [
      'contactexternalids',
      'associatedcontactids',
      'contactids',
    ],
    expectedClosureDate: ['closedate', 'closingdate', 'expectedclosedate'],
    currency: ['currency', 'dealcurrency'],
    content: [
      'content',
      'body',
      'note',
      'notes',
      'description',
      'comment',
      'callnotes',
      'emailbody',
    ],
    activityType: ['activitytype', 'engagementtype', 'type'],
    relatedEntityType: [
      'relatedentitytype',
      'objecttype',
      'entitytype',
      'recordtype',
      'associatedobjecttype',
    ],
    relatedExternalId: [
      'relatedexternalid',
      'associatedrecordid',
      'contactid',
      'companyid',
      'dealid',
    ],
    relatedEmail: ['relatedemail', 'contactemail', 'email'],
    relatedName: ['relatedname', 'associatedname', 'contactname'],
    authorLabel: ['author', 'createdby', 'owner'],
    createdAt: [
      'createdat',
      'createdate',
      'createddate',
      'activitydate',
      'timestamp',
      'calldate',
    ],
    durationSeconds: ['durationseconds', 'duration', 'callduration'],
    direction: ['direction', 'calldirection'],
    outcome: ['outcome', 'calloutcome', 'result'],
    phoneNumber: ['phonenumber', 'tonumber', 'fromnumber'],
    meetingUrl: ['meetingurl', 'conferenceurl', 'zoomurl'],
    fromEntityType: ['fromentitytype', 'fromtype', 'fromobjecttype', 'sourcetype'],
    fromExternalId: [
      'fromexternalid',
      'fromid',
      'fromrecordid',
      'sourceid',
      'objectid',
    ],
    toEntityType: [
      'toentitytype',
      'totype',
      'toobjecttype',
      'targettype',
      'associatedobjecttype',
    ],
    toExternalId: [
      'toexternalid',
      'toid',
      'torecordid',
      'targetid',
      'associatedobjectid',
    ],
    label: ['label', 'associationlabel', 'role', 'relationshiptype'],
    isPrimary: ['isprimary', 'primary'],
    relatedContactExternalIds: [
      'relatedcontactexternalids',
      'associatedcontactids',
      'contactids',
    ],
    relatedDealExternalIds: [
      'relateddealexternalids',
      'associateddealids',
      'dealids',
      'opportunityids',
    ],
    relatedOrganizationExternalIds: [
      'relatedorganizationexternalids',
      'associatedcompanyids',
      'companyids',
    ],
  };

  if (platform === 'hubspot') {
    aliases.externalId = [
      'recordid',
      ...aliases.externalId.filter((a) => a !== 'recordid'),
    ];
  }

  for (const t of targets) {
    const alist = aliases[t.key] || [t.key.toLowerCase()];
    const hit = headerLower.find((h) => alist.includes(h.norm));
    if (hit) mapping[t.key] = hit.raw;
  }
  return mapping;
}

export const PLATFORM_META: Record<
  CrmMigrationPlatform,
  { label: string; description: string; recommendedOrder: string }
> = {
  hubspot: {
    label: 'HubSpot',
    description:
      'Import companies, contacts, deals, notes/calls/emails, plus association exports so links match HubSpot.',
    recommendedOrder:
      'Companies → Contacts → Leads → Deals → Notes/Calls/Emails → Associations',
  },
  salesforce: {
    label: 'Salesforce',
    description:
      'Import Accounts, Contacts, Leads, Opportunities, Tasks/Events, and relationship edges.',
    recommendedOrder:
      'Accounts → Contacts → Leads → Opportunities → Activities → Associations',
  },
  zoho: {
    label: 'Zoho CRM',
    description:
      'Import Accounts, Contacts, Leads, Deals, Notes/Calls, and related lists.',
    recommendedOrder:
      'Accounts → Contacts → Leads → Deals → Notes/Calls → Associations',
  },
  pipedrive: {
    label: 'Pipedrive',
    description:
      'Import Organizations, Persons, Deals, Activities, and participant links.',
    recommendedOrder:
      'Organizations → Persons → Deals → Activities → Associations',
  },
  custom: {
    label: 'Custom / Other CRM',
    description:
      'Map any CRM/database export. Preserve every source field as-is and recreate relationships via source IDs or an associations file.',
    recommendedOrder:
      'Organizations → Contacts → Leads → Deals → Notes/Calls/Meetings/Emails → Associations',
  },
};
