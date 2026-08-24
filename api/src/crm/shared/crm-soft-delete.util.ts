import { Prop } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

/** Mixin fields for LMS-style in-document soft delete. */
export class CrmSoftDeleteFields {
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export function notDeletedFilter(): { isDeleted: { $ne: true } } {
  return { isDeleted: { $ne: true } };
}

export function onlyDeletedFilter(): { isDeleted: true } {
  return { isDeleted: true };
}

export function softDeleteUpdate(userId?: string): {
  $set: {
    isDeleted: true;
    deletedAt: Date;
    deletedBy?: Types.ObjectId;
  };
} {
  const $set: {
    isDeleted: true;
    deletedAt: Date;
    deletedBy?: Types.ObjectId;
  } = {
    isDeleted: true,
    deletedAt: new Date(),
  };
  if (userId && Types.ObjectId.isValid(String(userId))) {
    $set.deletedBy = new Types.ObjectId(String(userId));
  }
  return { $set };
}

export function restoreUpdate(): {
  $set: { isDeleted: false };
  $unset: { deletedAt: 1; deletedBy: 1 };
} {
  return {
    $set: { isDeleted: false },
    $unset: { deletedAt: 1, deletedBy: 1 },
  };
}

/**
 * Auto-exclude soft-deleted docs from find/count unless:
 * - query already sets `isDeleted`, or
 * - options.includeDeleted === true (admin trash / purge paths).
 */
export function applyCrmSoftDeletePlugin(schema: MongooseSchema): void {
  const excludeDeleted = function (this: {
    getOptions: () => { includeDeleted?: boolean };
    getQuery: () => Record<string, unknown>;
    where: (q: Record<string, unknown>) => unknown;
  }) {
    if (this.getOptions()?.includeDeleted) return;
    const q = this.getQuery();
    if (q && Object.prototype.hasOwnProperty.call(q, 'isDeleted')) return;
    this.where({ isDeleted: { $ne: true } });
  };

  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);
  // findOneAndUpdate / findOneAndDelete inherit findOne filter when used without includeDeleted
  schema.pre('findOneAndUpdate', excludeDeleted);
  schema.pre('findOneAndDelete', excludeDeleted);
}

/** Canonical trash entity types (API + UI). */
export const CRM_TRASH_ENTITY_TYPES = [
  'leads',
  'contacts',
  'clients',
  'organizations',
  'activities',
  'workflows',
  'segments',
  'email-templates',
  'email-campaigns',
  'pipelines',
  'proposals',
  'proposal-blocks',
  'snippets',
  'custom-fields',
  'saved-views',
  'service-offerings',
  'engagement-templates',
] as const;

export type CrmTrashEntityType = (typeof CRM_TRASH_ENTITY_TYPES)[number];

export const CRM_TRASH_ENTITY_LABELS: Record<CrmTrashEntityType, string> = {
  leads: 'Leads',
  contacts: 'Contacts',
  clients: 'Clients',
  organizations: 'Organizations',
  activities: 'Activities',
  workflows: 'Workflows',
  segments: 'Segments',
  'email-templates': 'Email templates',
  'email-campaigns': 'Email campaigns',
  pipelines: 'Pipelines',
  proposals: 'Proposals',
  'proposal-blocks': 'Proposal blocks',
  snippets: 'Snippets',
  'custom-fields': 'Custom fields',
  'saved-views': 'Saved views',
  'service-offerings': 'Service offerings',
  'engagement-templates': 'Engagement templates',
};

export function isCrmTrashEntityType(v: string): v is CrmTrashEntityType {
  return (CRM_TRASH_ENTITY_TYPES as readonly string[]).includes(v);
}

/** Best-effort display title for trash list rows. */
export function trashItemTitle(
  entityType: CrmTrashEntityType,
  doc: Record<string, unknown>,
): string {
  const str = (k: string) => String(doc[k] ?? '').trim();
  switch (entityType) {
    case 'leads':
    case 'contacts':
      return (
        [str('firstName'), str('lastName')].filter(Boolean).join(' ') ||
        str('email') ||
        'Untitled'
      );
    case 'clients':
    case 'organizations':
      return str('name') || str('email') || 'Untitled';
    case 'activities':
      return str('title') || str('content') || 'Activity';
    case 'email-templates':
    case 'email-campaigns':
    case 'workflows':
    case 'pipelines':
    case 'proposals':
    case 'snippets':
    case 'segments':
    case 'saved-views':
    case 'service-offerings':
    case 'custom-fields':
    case 'proposal-blocks':
    case 'engagement-templates':
      return str('name') || str('title') || str('label') || 'Untitled';
    default:
      return 'Untitled';
  }
}
