import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PropertyHistoryDocument = PropertyHistory & Document;

export type PropertyHistorySource = 'crm' | 'twobigha' | 'manual';

/**
 * Per-property status / history log for Property Management.
 *
 * PM property data lives in 2bigha (live GraphQL) and is never stored in the CRM, so this
 * collection only keeps the *events* — keyed by the same id the property detail page uses
 * (`pm_<userPropertyId>`, a 2bigha slug, or a CRM listing ObjectId).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'property_history' })
export class PropertyHistory {
  /** Property id exactly as used in `/crm/property-listings/:id`. */
  @Prop({ required: true, index: true })
  propertyKey: string;

  @Prop()
  propertyTitle?: string;

  /** Machine code, e.g. `pm_legal_started`, `stage_synced`, `note`. */
  @Prop({ required: true })
  action: string;

  /** Human-readable summary shown in the timeline. */
  @Prop({ required: true })
  label: string;

  @Prop()
  detail?: string;

  @Prop()
  fromStage?: string;

  @Prop()
  toStage?: string;

  @Prop({ required: true, enum: ['crm', 'twobigha', 'manual'], default: 'crm' })
  source: PropertyHistorySource;

  @Prop({ type: Types.ObjectId })
  actorId?: Types.ObjectId;

  @Prop()
  actorName?: string;

  /** Extra structured context (role, decision, scheduledAt, …). */
  @Prop({ type: Object })
  meta?: Record<string, unknown>;

  createdAt?: Date;
}

export const PropertyHistorySchema = SchemaFactory.createForClass(PropertyHistory);
PropertyHistorySchema.index({ propertyKey: 1, createdAt: -1 });
