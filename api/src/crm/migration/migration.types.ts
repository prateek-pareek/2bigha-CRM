/**
 * Canonical CRM migration types.
 * Any source platform (HubSpot, Salesforce, Zoho, Pipedrive, custom) maps into these shapes.
 * Relationships are preserved via source external IDs + an optional associations edge list.
 */

export type CrmMigrationPlatform =
  | 'hubspot'
  | 'salesforce'
  | 'zoho'
  | 'pipedrive'
  | 'custom';

export type CrmMigrationEntityType =
  | 'organizations'
  | 'contacts'
  | 'leads'
  | 'notes'
  | 'calls'
  | 'meetings'
  | 'emails'
  | 'tasks'
  | 'activities'
  | 'associations';

/** Record types that can participate in association edges. */
export type CrmAssociationObjectType =
  | 'organizations'
  | 'contacts'
  | 'leads';

export type CrmMigrationDuplicateStrategy =
  | 'merge'
  | 'replace'
  | 'skip'
  | 'create';

/** Stable identity from the source system — used for dedupe + relationship linking. */
export type ExternalRef = {
  platform: CrmMigrationPlatform;
  id: string;
};

export type CanonicalOrganization = {
  externalId?: string;
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  industry?: string;
  territory?: string;
  noOfEmployees?: string;
  annualRevenue?: number | string;
  address?: string;
  ownerLabel?: string;
  /** Extra company source ids also linked as contacts later. */
  relatedContactExternalIds?: string[];
  customFields?: Record<string, unknown>;
  /** Full original row preserved as-is under customFields._sourcePayload */
  sourcePayload?: Record<string, unknown>;
};

export type CanonicalPerson = {
  externalId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  additionalEmails?: string[];
  mobileNo?: string;
  phone?: string;
  jobTitle?: string;
  organizationName?: string;
  /** Primary company from source CRM. */
  organizationExternalId?: string;
  /** All company links from source (many-to-many). */
  organizationExternalIds?: string[];
  /** Peer contacts linked in source. */
  relatedContactExternalIds?: string[];
  relatedLeadExternalIds?: string[];
  website?: string;
  linkedinUrl?: string;
  industry?: string;
  territory?: string;
  source?: string;
  status?: string;
  stage?: string;
  ownerLabel?: string;
  annualRevenue?: number | string;
  noOfEmployees?: string;
  customFields?: Record<string, unknown>;
  sourcePayload?: Record<string, unknown>;
};

/**
 * Notes, calls, meetings, emails, tasks — stored as Activity with type preserved.
 * Multiple related records from source are kept via relatedLinks[].
 */
export type CanonicalActivity = {
  externalId?: string;
  /** Note | Call | Meeting | Task | Email | Activity | Comment */
  activityType?: string;
  title?: string;
  content: string;
  relatedEntityType?: CrmAssociationObjectType;
  relatedExternalId?: string;
  relatedEmail?: string;
  relatedName?: string;
  /** Multi-link: same engagement attached to several source records. */
  relatedLinks?: Array<{
    entityType: CrmAssociationObjectType;
    externalId: string;
  }>;
  authorLabel?: string;
  assigneeLabel?: string;
  status?: string;
  createdAt?: string;
  /** Call / meeting specifics preserved in metadata. */
  durationSeconds?: number | string;
  direction?: string;
  outcome?: string;
  disposition?: string;
  scheduledAt?: string;
  completedAt?: string;
  phoneNumber?: string;
  meetingUrl?: string;
  customFields?: Record<string, unknown>;
  sourcePayload?: Record<string, unknown>;
};

/** Explicit relationship edge — mirrors association tables in custom CRMs. */
export type CanonicalAssociation = {
  externalId?: string;
  fromEntityType: CrmAssociationObjectType;
  fromExternalId: string;
  toEntityType: CrmAssociationObjectType;
  toExternalId: string;
  /** Optional label from source (e.g. "Primary", "Billing contact", "Decision maker"). */
  label?: string;
  isPrimary?: boolean;
  sourcePayload?: Record<string, unknown>;
};

/** @deprecated Use CanonicalActivity */
export type CanonicalNote = CanonicalActivity;

export type CanonicalRecord =
  | CanonicalOrganization
  | CanonicalPerson
  | CanonicalActivity
  | CanonicalAssociation;

export type FieldMapping = Record<string, string>;

export type MigrationJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'reverted';

export const MIGRATION_BATCH_SIZE = 500;
export const MIGRATION_MAX_BATCH_PAYLOAD = 2_000;
export const MIGRATION_JOB_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Suggested import order so relationships resolve.
 * Associations last — after all records exist.
 */
export const MIGRATION_ENTITY_ORDER: CrmMigrationEntityType[] = [
  'organizations',
  'contacts',
  'leads',
  'notes',
  'calls',
  'meetings',
  'emails',
  'tasks',
  'activities',
  'associations',
];

export const ACTIVITY_ENTITY_TYPES: CrmMigrationEntityType[] = [
  'notes',
  'calls',
  'meetings',
  'emails',
  'tasks',
  'activities',
];

export function isActivityEntityType(
  entity: CrmMigrationEntityType,
): boolean {
  return ACTIVITY_ENTITY_TYPES.includes(entity);
}

export function defaultActivityTypeForEntity(
  entity: CrmMigrationEntityType,
): string {
  switch (entity) {
    case 'calls':
      return 'Call';
    case 'meetings':
      return 'Meeting';
    case 'emails':
      return 'Email';
    case 'tasks':
      return 'Task';
    case 'notes':
      return 'Note';
    default:
      return 'Activity';
  }
}

export const ASSOCIATION_OBJECT_TYPES: CrmAssociationObjectType[] = [
  'organizations',
  'contacts',
  'leads',
];
