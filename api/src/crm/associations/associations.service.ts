import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CrmAssociation,
  CrmAssociationDocument,
} from './schemas/crm-association.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { Contact, ContactDocument } from '../records/schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../records/schemas/organization.schema';
import { Deal, DealDocument } from '../records/schemas/deal.schema';
import { Client, ClientDocument } from '../records/schemas/client.schema';
import {
  CrmObjectRecord,
  CrmObjectRecordDocument,
} from '../custom-objects/schemas/crm-object-record.schema';
import {
  CRM_ASSOCIATION_TYPES,
  canonicalizeAssociationEndpoints,
  resolveAssociationTypeKey,
} from './association-types';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import {
  CRM_LIST_MAX_TIME_MS,
  CRM_MAX_PAGE_SIZE,
} from '../../common/lib/pagination/list-pagination';

export type AssociationEdgeInput = {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  associationType?: string;
  label?: string;
  inverseLabel?: string;
  isPrimary?: boolean;
  source?: string;
  createdBy?: string;
  /** When true (default), also update legacy associated* arrays. */
  syncLegacyArrays?: boolean;
};

@Injectable()
export class AssociationsService {
  private readonly logger = new Logger(AssociationsService.name);

  constructor(
    @InjectModel(CrmAssociation.name, 'crmConnection')
    private associationModel: Model<CrmAssociationDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(CrmObjectRecord.name, 'crmConnection')
    private objectRecordModel: Model<CrmObjectRecordDocument>,
  ) {}

  listAssociationTypes() {
    return Object.values(CRM_ASSOCIATION_TYPES).map((d) => ({
      key: d.key,
      fromType: d.fromType,
      toType: d.toType,
      label: d.label,
      inverseLabel: d.inverseLabel,
      legacyFromField: d.legacyFromField,
      legacyToField: d.legacyToField ?? null,
    }));
  }

  async listForRecord(
    objectType: string,
    objectId: string,
    opts?: { associationType?: string; limit?: number; afterId?: string },
  ) {
    if (!Types.ObjectId.isValid(objectId)) {
      throw new BadRequestException('Invalid objectId');
    }
    const oid = new Types.ObjectId(objectId);
    const pageSize = Math.min(
      Math.max(opts?.limit ?? 100, 1),
      CRM_MAX_PAGE_SIZE,
    );
    const cursorFilter: Record<string, unknown> = {};
    if (opts?.afterId) {
      if (!Types.ObjectId.isValid(opts.afterId)) {
        throw new BadRequestException('Invalid afterId');
      }
      cursorFilter._id = { $lt: new Types.ObjectId(opts.afterId) };
    }

    const outgoingFilter: Record<string, unknown> = {
      fromType: objectType,
      fromId: oid,
      ...cursorFilter,
    };
    const incomingFilter: Record<string, unknown> = {
      toType: objectType,
      toId: oid,
      ...cursorFilter,
    };
    if (opts?.associationType) {
      outgoingFilter.associationType = opts.associationType;
      incomingFilter.associationType = opts.associationType;
    }

    const fetchLimit = pageSize + 1;
    const [outgoing, incoming] = await Promise.all([
      this.associationModel
        .find(outgoingFilter)
        .sort({ _id: -1 })
        .limit(fetchLimit)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
      this.associationModel
        .find(incomingFilter)
        .sort({ _id: -1 })
        .limit(fetchLimit)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
    ]);

    const merged = [...outgoing, ...incoming].sort((a, b) =>
      String(b._id).localeCompare(String(a._id)),
    );
    const slice = merged.slice(0, pageSize);
    const items = slice.map((row: any) =>
      this.mapListRow(row, objectType, objectId),
    );
    const hasMore = merged.length > pageSize;
    const nextAfterId =
      items.length > 0 ? items[items.length - 1]._id : undefined;

    return { items, hasMore, nextAfterId, pageSize };
  }

  async createEdge(input: AssociationEdgeInput) {
    const edge = this.validateAndCanonicalize(input);
    const nowSource = input.source || 'api';

    const existing = await this.associationModel
      .findOne({
        fromType: edge.fromType,
        fromId: edge.fromId,
        toType: edge.toType,
        toId: edge.toId,
        associationType: edge.associationType,
      })
      .setOptions({ includeDeleted: true } as any)
      .maxTimeMS(CRM_LIST_MAX_TIME_MS)
      .exec();

    let doc: CrmAssociationDocument;
    if (existing) {
      if (existing.isDeleted) {
        existing.isDeleted = false;
        existing.deletedAt = undefined;
        existing.deletedBy = undefined;
      }
      if (input.label !== undefined) existing.label = input.label;
      if (input.inverseLabel !== undefined)
        existing.inverseLabel = input.inverseLabel;
      if (input.isPrimary !== undefined) existing.isPrimary = input.isPrimary;
      existing.source = nowSource;
      doc = await existing.save();
    } else {
      doc = await this.associationModel.create({
        fromType: edge.fromType,
        fromId: edge.fromId,
        toType: edge.toType,
        toId: edge.toId,
        associationType: edge.associationType,
        label: input.label,
        inverseLabel: input.inverseLabel,
        isPrimary: input.isPrimary ?? false,
        source: nowSource,
        createdBy:
          input.createdBy && Types.ObjectId.isValid(input.createdBy)
            ? new Types.ObjectId(input.createdBy)
            : undefined,
      });
    }

    if (input.syncLegacyArrays !== false) {
      await this.applyLegacyArrayMutation(edge, 'add').catch((err) => {
        this.logger.warn(
          `Legacy array dual-write (add) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return this.serialize(doc);
  }

  async removeEdge(
    input: Omit<AssociationEdgeInput, 'label' | 'inverseLabel' | 'isPrimary'> & {
      userId?: string;
    },
  ) {
    const edge = this.validateAndCanonicalize(input);
    const existing = await this.associationModel
      .findOne({
        fromType: edge.fromType,
        fromId: edge.fromId,
        toType: edge.toType,
        toId: edge.toId,
        associationType: edge.associationType,
      })
      .maxTimeMS(CRM_LIST_MAX_TIME_MS)
      .exec();

    if (!existing) {
      // Still try legacy pull for consistency when called from API.
      if (input.syncLegacyArrays !== false) {
        await this.applyLegacyArrayMutation(edge, 'remove').catch(() => undefined);
      }
      throw new NotFoundException('Association not found');
    }

    await this.associationModel
      .findByIdAndUpdate(existing._id, softDeleteUpdate(input.userId), {
        new: true,
      })
      .exec();

    if (input.syncLegacyArrays !== false) {
      await this.applyLegacyArrayMutation(edge, 'remove').catch((err) => {
        this.logger.warn(
          `Legacy array dual-write (remove) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return { ok: true };
  }

  /**
   * Dual-write helper for CRMService mirror methods.
   * Does NOT write legacy arrays (caller already did).
   * Never throws — association-collection failures must not break production CRM writes.
   */
  async mirrorArrayDiff(opts: {
    fromType: string;
    fromId: string;
    toType: string;
    associationType?: string;
    added: Array<string | Types.ObjectId>;
    removed: Array<string | Types.ObjectId>;
    label?: string;
    inverseLabel?: string;
  }): Promise<void> {
    try {
      await this.mirrorArrayDiffInner(opts);
    } catch (err) {
      this.logger.warn(
        `mirrorArrayDiff aborted (legacy arrays already saved): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async mirrorArrayDiffInner(opts: {
    fromType: string;
    fromId: string;
    toType: string;
    associationType?: string;
    added: Array<string | Types.ObjectId>;
    removed: Array<string | Types.ObjectId>;
    label?: string;
    inverseLabel?: string;
  }): Promise<void> {
    const associationType =
      opts.associationType ||
      resolveAssociationTypeKey(opts.fromType, opts.toType);

    const upsertOps: Array<Record<string, unknown>> = [];
    for (const id of opts.added) {
      const toId = String(id);
      if (!Types.ObjectId.isValid(toId)) continue;
      const edge = canonicalizeAssociationEndpoints(
        opts.fromType,
        opts.fromId,
        opts.toType,
        toId,
        associationType,
      );
      upsertOps.push({
        updateOne: {
          filter: {
            fromType: edge.fromType,
            fromId: new Types.ObjectId(edge.fromId),
            toType: edge.toType,
            toId: new Types.ObjectId(edge.toId),
            associationType: edge.associationType,
          },
          update: {
            $set: {
              isDeleted: false,
              deletedAt: undefined,
              deletedBy: undefined,
              source: 'legacy_array',
              ...(opts.label !== undefined ? { label: opts.label } : {}),
              ...(opts.inverseLabel !== undefined
                ? { inverseLabel: opts.inverseLabel }
                : {}),
            },
            $setOnInsert: {
              fromType: edge.fromType,
              fromId: new Types.ObjectId(edge.fromId),
              toType: edge.toType,
              toId: new Types.ObjectId(edge.toId),
              associationType: edge.associationType,
              isPrimary: false,
            },
          },
          upsert: true,
        },
      });
    }

    if (upsertOps.length) {
      try {
        await this.associationModel.bulkWrite(upsertOps as any, {
          ordered: false,
        });
      } catch (err) {
        this.logger.warn(
          `mirrorArrayDiff bulk upsert failed (${opts.fromType}/${opts.fromId}→${opts.toType}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    for (const id of opts.removed) {
      const toId = String(id);
      if (!Types.ObjectId.isValid(toId)) continue;
      try {
        const edge = canonicalizeAssociationEndpoints(
          opts.fromType,
          opts.fromId,
          opts.toType,
          toId,
          associationType,
        );
        await this.associationModel
          .findOneAndUpdate(
            {
              fromType: edge.fromType,
              fromId: new Types.ObjectId(edge.fromId),
              toType: edge.toType,
              toId: new Types.ObjectId(edge.toId),
              associationType: edge.associationType,
            },
            softDeleteUpdate(),
          )
          .exec();
      } catch (err) {
        this.logger.warn(
          `mirrorArrayDiff remove failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /** Resumable backfill from legacy associated* arrays into crm_associations. */
  async backfillFromLegacyArrays(opts?: {
    modules?: string[];
    afterId?: string;
    module?: string;
    batchSize?: number;
    maxBatches?: number;
  }): Promise<{
    scanned: number;
    upserted: number;
    errors: number;
    done: boolean;
    hasMore: boolean;
    module?: string;
    nextAfterId?: string;
    nextModule?: string;
  }> {
    const allModules = opts?.modules?.length
      ? opts.modules
      : ['contacts', 'leads', 'deals', 'organizations', 'clients'];
    const batchSize = Math.min(
      Math.max(opts?.batchSize ?? 500, 50),
      2000,
    );
    const maxBatches = Math.min(Math.max(opts?.maxBatches ?? 40, 1), 100);

    let moduleIndex = opts?.module
      ? Math.max(0, allModules.indexOf(opts.module))
      : 0;
    if (opts?.module && allModules.indexOf(opts.module) < 0) {
      moduleIndex = 0;
    }

    let afterId = opts?.afterId;
    let scanned = 0;
    let upserted = 0;
    let errors = 0;
    let batchesRun = 0;
    let currentModule: string | undefined = allModules[moduleIndex];

    while (batchesRun < maxBatches && moduleIndex < allModules.length) {
      currentModule = allModules[moduleIndex];
      const plan = this.backfillPlan(currentModule);
      if (!plan) {
        moduleIndex += 1;
        afterId = undefined;
        continue;
      }

      const filter: Record<string, unknown> = {};
      if (afterId && Types.ObjectId.isValid(afterId)) {
        filter._id = { $gt: new Types.ObjectId(afterId) };
      }

      const docs = await plan.model
        .find(filter)
        .select(
          Object.fromEntries([
            ...plan.fields.map((f) => [f.field, 1]),
            ['_id', 1],
          ]),
        )
        .sort({ _id: 1 })
        .limit(batchSize)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec();

      if (docs.length === 0) {
        moduleIndex += 1;
        afterId = undefined;
        continue;
      }

      scanned += docs.length;
      const upsertOps: Array<Record<string, unknown>> = [];

      for (const doc of docs) {
        for (const f of plan.fields) {
          const list = Array.isArray(doc[f.field]) ? doc[f.field] : [];
          for (const raw of list) {
            const toId = String(raw?._id ?? raw ?? '');
            if (!Types.ObjectId.isValid(toId)) continue;
            const edge = canonicalizeAssociationEndpoints(
              currentModule,
              String(doc._id),
              f.toType,
              toId,
              f.associationType,
            );
            upsertOps.push({
              updateOne: {
                filter: {
                  fromType: edge.fromType,
                  fromId: new Types.ObjectId(edge.fromId),
                  toType: edge.toType,
                  toId: new Types.ObjectId(edge.toId),
                  associationType: edge.associationType,
                },
                update: {
                  $set: {
                    isDeleted: false,
                    deletedAt: undefined,
                    deletedBy: undefined,
                    source: 'backfill',
                  },
                  $setOnInsert: {
                    fromType: edge.fromType,
                    fromId: new Types.ObjectId(edge.fromId),
                    toType: edge.toType,
                    toId: new Types.ObjectId(edge.toId),
                    associationType: edge.associationType,
                    isPrimary: false,
                  },
                },
                upsert: true,
              },
            });
          }
        }
      }

      for (let i = 0; i < upsertOps.length; i += 250) {
        const chunk = upsertOps.slice(i, i + 250);
        try {
          const result = await this.associationModel.bulkWrite(chunk as any, {
            ordered: false,
          });
          upserted +=
            (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
        } catch {
          errors += chunk.length;
        }
      }

      afterId = String(docs[docs.length - 1]._id);
      batchesRun += 1;

      if (docs.length < batchSize) {
        moduleIndex += 1;
        afterId = undefined;
      } else {
        break;
      }
    }

    const done = moduleIndex >= allModules.length;
    const hasMore = !done;
    const nextModule = hasMore ? allModules[moduleIndex] : undefined;

    return {
      scanned,
      upserted,
      errors,
      done,
      hasMore,
      module: currentModule,
      nextAfterId: afterId,
      nextModule,
    };
  }

  private backfillPlan(module: string): {
    model: Model<any>;
    fields: Array<{ field: string; toType: string; associationType: string }>;
  } | null {
    switch (module) {
      case 'contacts':
        return {
          model: this.contactModel,
          fields: [
            {
              field: 'associatedOrganizations',
              toType: 'organizations',
              associationType: 'contact_company',
            },
            {
              field: 'associatedDeals',
              toType: 'deals',
              associationType: 'contact_deal',
            },
            {
              field: 'associatedContacts',
              toType: 'contacts',
              associationType: 'contact_contact',
            },
          ],
        };
      case 'leads':
        return {
          model: this.leadModel,
          fields: [
            {
              field: 'associatedOrganizations',
              toType: 'organizations',
              associationType: 'lead_company',
            },
            {
              field: 'associatedContacts',
              toType: 'contacts',
              associationType: 'lead_contact',
            },
            {
              field: 'associatedDeals',
              toType: 'deals',
              associationType: 'lead_deal',
            },
            {
              field: 'associatedLeads',
              toType: 'leads',
              associationType: 'lead_lead',
            },
          ],
        };
      case 'deals':
        return {
          model: this.dealModel,
          fields: [
            {
              field: 'associatedContacts',
              toType: 'contacts',
              associationType: 'contact_deal',
            },
            {
              field: 'associatedCompanies',
              toType: 'organizations',
              associationType: 'deal_company',
            },
          ],
        };
      case 'organizations':
        return {
          model: this.organizationModel,
          fields: [
            {
              field: 'associatedContacts',
              toType: 'contacts',
              associationType: 'contact_company',
            },
            {
              field: 'associatedLeads',
              toType: 'leads',
              associationType: 'lead_company',
            },
            {
              field: 'associatedDeals',
              toType: 'deals',
              associationType: 'deal_company',
            },
          ],
        };
      case 'clients':
        return {
          model: this.clientModel,
          fields: [
            {
              field: 'associatedOrganizations',
              toType: 'organizations',
              associationType: 'client_company',
            },
            {
              field: 'associatedContacts',
              toType: 'contacts',
              associationType: 'client_contact',
            },
            {
              field: 'associatedDeals',
              toType: 'deals',
              associationType: 'client_deal',
            },
            {
              field: 'associatedLeads',
              toType: 'leads',
              associationType: 'client_lead',
            },
          ],
        };
      default:
        return null;
    }
  }

  private mapListRow(row: any, objectType: string, objectId: string) {
    const isFrom =
      String(row.fromType) === objectType && String(row.fromId) === objectId;
    return {
      ...row,
      _id: String(row._id),
      fromId: String(row.fromId),
      toId: String(row.toId),
      otherType: isFrom ? row.toType : row.fromType,
      otherId: isFrom ? String(row.toId) : String(row.fromId),
      direction: isFrom ? 'outgoing' : 'incoming',
      displayLabel: isFrom
        ? row.label || undefined
        : row.inverseLabel || row.label || undefined,
    };
  }

  private validateAndCanonicalize(input: AssociationEdgeInput) {
    const fromType = String(input.fromType || '').trim();
    const toType = String(input.toType || '').trim();
    const fromId = String(input.fromId || '').trim();
    const toId = String(input.toId || '').trim();
    if (!fromType || !toType) {
      throw new BadRequestException('fromType and toType are required');
    }
    if (!Types.ObjectId.isValid(fromId) || !Types.ObjectId.isValid(toId)) {
      throw new BadRequestException('fromId and toId must be valid ObjectIds');
    }
    if (fromType === toType && fromId === toId) {
      throw new BadRequestException('Cannot associate a record to itself');
    }

    const canon = canonicalizeAssociationEndpoints(
      fromType,
      fromId,
      toType,
      toId,
      input.associationType,
    );

    return {
      fromType: canon.fromType,
      fromId: new Types.ObjectId(canon.fromId),
      toType: canon.toType,
      toId: new Types.ObjectId(canon.toId),
      associationType: canon.associationType,
      swapped: canon.swapped,
    };
  }

  private serialize(doc: CrmAssociationDocument | Record<string, any>) {
    const o = typeof (doc as any).toObject === 'function' ? (doc as any).toObject() : doc;
    return {
      ...o,
      _id: String(o._id),
      fromId: String(o.fromId),
      toId: String(o.toId),
      createdBy: o.createdBy ? String(o.createdBy) : undefined,
    };
  }

  private getModelForType(type: string): Model<any> | null {
    switch (type) {
      case 'leads':
        return this.leadModel;
      case 'contacts':
        return this.contactModel;
      case 'organizations':
        return this.organizationModel;
      case 'deals':
        return this.dealModel;
      case 'clients':
        return this.clientModel;
      default:
        // Custom object records share one collection keyed by objectTypeKey.
        return this.objectRecordModel;
    }
  }

  private legacyFieldFor(
    ownerType: string,
    otherType: string,
  ): string | null {
    for (const def of Object.values(CRM_ASSOCIATION_TYPES)) {
      if (def.fromType === ownerType && def.toType === otherType) {
        return def.legacyFromField;
      }
      if (def.toType === ownerType && def.fromType === otherType) {
        return def.legacyToField ?? null;
      }
    }
    // Generic fallbacks for custom object links — no legacy arrays.
    return null;
  }

  private async applyLegacyArrayMutation(
    edge: {
      fromType: string;
      fromId: Types.ObjectId;
      toType: string;
      toId: Types.ObjectId;
    },
    op: 'add' | 'remove',
  ) {
    const sides: Array<{
      ownerType: string;
      ownerId: Types.ObjectId;
      otherId: Types.ObjectId;
      otherType: string;
    }> = [
      {
        ownerType: edge.fromType,
        ownerId: edge.fromId,
        otherId: edge.toId,
        otherType: edge.toType,
      },
      {
        ownerType: edge.toType,
        ownerId: edge.toId,
        otherId: edge.fromId,
        otherType: edge.fromType,
      },
    ];

    for (const side of sides) {
      const field = this.legacyFieldFor(side.ownerType, side.otherType);
      if (!field) continue;
      const model = this.getModelForType(side.ownerType);
      if (!model || model === this.objectRecordModel) continue;

      if (op === 'add') {
        await model
          .updateOne(
            { _id: side.ownerId },
            { $addToSet: { [field]: side.otherId } },
          )
          .exec();
      } else {
        await model
          .updateOne(
            { _id: side.ownerId },
            { $pull: { [field]: side.otherId } },
          )
          .exec();
      }
    }
  }
}
