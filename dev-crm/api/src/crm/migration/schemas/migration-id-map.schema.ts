import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  CrmAssociationObjectType,
  CrmMigrationPlatform,
} from '../migration.types';

export type CrmMigrationIdMapDocument = CrmMigrationIdMap & Document;

/**
 * Durable externalId → Mongo _id map so associations / notes / multi-job
 * migrations resolve relationships exactly as in the source CRM.
 */
@Schema({ timestamps: true, collection: 'crm_migration_id_map' })
export class CrmMigrationIdMap {
  @Prop({ required: true, index: true })
  platform: CrmMigrationPlatform;

  @Prop({ required: true, index: true })
  entityType: CrmAssociationObjectType;

  @Prop({ required: true, index: true })
  externalId: string;

  @Prop({ required: true, index: true })
  mongoId: string;

  @Prop()
  recordId?: string;

  @Prop()
  displayName?: string;
}

export const CrmMigrationIdMapSchema =
  SchemaFactory.createForClass(CrmMigrationIdMap);
CrmMigrationIdMapSchema.index(
  { platform: 1, entityType: 1, externalId: 1 },
  { unique: true },
);
CrmMigrationIdMapSchema.index({ platform: 1, mongoId: 1 });
