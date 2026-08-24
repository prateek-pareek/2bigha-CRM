import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CrmAssociationDocument = CrmAssociation & Document;

/**
 * First-class association edge (HubSpot-style).
 * Legacy `associated*` arrays remain the source of truth for existing UI;
 * this collection is dual-written and becomes the long-term store.
 *
 * Indexed for crore-scale lookups by either endpoint of an edge.
 */
@Schema({ timestamps: true, collection: 'crm_associations' })
export class CrmAssociation {
  @Prop({ required: true })
  fromType: string;

  @Prop({ type: Types.ObjectId, required: true })
  fromId: Types.ObjectId;

  @Prop({ required: true })
  toType: string;

  @Prop({ type: Types.ObjectId, required: true })
  toId: Types.ObjectId;

  /** Stable type key, e.g. contact_company, lead_contact, or custom slug. */
  @Prop({ required: true })
  associationType: string;

  /** Optional display label on the from → to side. */
  @Prop()
  label?: string;

  /** Optional display label on the to → from side. */
  @Prop()
  inverseLabel?: string;

  @Prop({ default: false })
  isPrimary?: boolean;

  /** How this edge was created. */
  @Prop({
    default: 'api',
    enum: ['api', 'legacy_array', 'migration', 'backfill'],
  })
  source?: string;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const CrmAssociationSchema = SchemaFactory.createForClass(CrmAssociation);
applyCrmSoftDeletePlugin(CrmAssociationSchema);
CrmAssociationSchema.index({ isDeleted: 1, deletedAt: -1 });

// Unique among live edges only — soft-deleted rows can be restored/recreated.
CrmAssociationSchema.index(
  { fromType: 1, fromId: 1, toType: 1, toId: 1, associationType: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: { $ne: true } },
  },
);

// Record → associations (outgoing)
CrmAssociationSchema.index({ fromType: 1, fromId: 1, associationType: 1, _id: -1 });
// Record → associations (incoming)
CrmAssociationSchema.index({ toType: 1, toId: 1, associationType: 1, _id: -1 });
// Type scans / admin
CrmAssociationSchema.index({ associationType: 1, _id: -1 });
