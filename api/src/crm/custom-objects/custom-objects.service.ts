import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CrmObjectType,
  CrmObjectTypeDocument,
} from './schemas/crm-object-type.schema';
import {
  CrmObjectRecord,
  CrmObjectRecordDocument,
} from './schemas/crm-object-record.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import {
  buildScalableListResult,
  CRM_LIST_MAX_TIME_MS,
  resolveListPagination,
} from '../../common/lib/pagination/list-pagination';
import { countDocumentsCapped } from '../../common/lib/pagination/capped-count';

const BUILTIN_KEYS = new Set([
  'leads',
  'contacts',
  'organizations',
  'deals',
  'clients',
  'activities',
  'pipelines',
  'segments',
  'associations',
  'object-types',
  'objects',
]);

function slugifyKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

@Injectable()
export class CustomObjectsService {
  constructor(
    @InjectModel(CrmObjectType.name, 'crmConnection')
    private objectTypeModel: Model<CrmObjectTypeDocument>,
    @InjectModel(CrmObjectRecord.name, 'crmConnection')
    private objectRecordModel: Model<CrmObjectRecordDocument>,
  ) {}

  // ── Object types ──────────────────────────────────────────────

  async listObjectTypes(opts?: { includeInactive?: boolean }) {
    const filter: Record<string, unknown> = {};
    if (!opts?.includeInactive) filter.isActive = { $ne: false };
    return this.objectTypeModel.find(filter).sort({ order: 1, name: 1 }).lean().exec();
  }

  async getObjectTypeByKey(key: string) {
    const doc = await this.objectTypeModel.findOne({ key }).lean().exec();
    if (!doc) throw new NotFoundException(`Object type "${key}" not found`);
    return doc;
  }

  async createObjectType(dto: {
    key?: string;
    name: string;
    singularLabel?: string;
    pluralLabel?: string;
    description?: string;
    primaryPropertyKey?: string;
    icon?: string;
    createdBy?: string;
  }) {
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    const key = slugifyKey(dto.key || name);
    if (!key || key.length < 2) {
      throw new BadRequestException('key must be at least 2 characters');
    }
    if (BUILTIN_KEYS.has(key)) {
      throw new BadRequestException(
        `key "${key}" is reserved for a built-in CRM module`,
      );
    }

    const existing = await this.objectTypeModel
      .findOne({ key })
      .setOptions({ includeDeleted: true } as any)
      .exec();
    if (existing && !existing.isDeleted) {
      throw new BadRequestException(`Object type key "${key}" already exists`);
    }

    const count = await this.objectTypeModel.countDocuments({});
    const payload = {
      key,
      name,
      singularLabel: String(dto.singularLabel || name).trim(),
      pluralLabel: String(dto.pluralLabel || `${name}s`).trim(),
      description: dto.description?.trim() || undefined,
      primaryPropertyKey: dto.primaryPropertyKey?.trim() || 'name',
      icon: dto.icon?.trim() || undefined,
      isActive: true,
      order: count,
      createdBy:
        dto.createdBy && Types.ObjectId.isValid(dto.createdBy)
          ? new Types.ObjectId(dto.createdBy)
          : undefined,
    };

    if (existing?.isDeleted) {
      Object.assign(existing, payload, {
        isDeleted: false,
        deletedAt: undefined,
        deletedBy: undefined,
      });
      return existing.save();
    }

    return this.objectTypeModel.create(payload);
  }

  async updateObjectType(
    key: string,
    dto: {
      name?: string;
      singularLabel?: string;
      pluralLabel?: string;
      description?: string;
      primaryPropertyKey?: string;
      icon?: string;
      isActive?: boolean;
      order?: number;
    },
  ) {
    const doc = await this.objectTypeModel.findOne({ key }).exec();
    if (!doc) throw new NotFoundException(`Object type "${key}" not found`);

    if (dto.name !== undefined) doc.name = String(dto.name).trim();
    if (dto.singularLabel !== undefined)
      doc.singularLabel = String(dto.singularLabel).trim();
    if (dto.pluralLabel !== undefined)
      doc.pluralLabel = String(dto.pluralLabel).trim();
    if (dto.description !== undefined)
      doc.description = String(dto.description).trim();
    if (dto.primaryPropertyKey !== undefined)
      doc.primaryPropertyKey = String(dto.primaryPropertyKey).trim() || 'name';
    if (dto.icon !== undefined) doc.icon = String(dto.icon).trim();
    if (dto.isActive !== undefined) doc.isActive = !!dto.isActive;
    if (dto.order !== undefined) doc.order = Number(dto.order) || 0;

    return doc.save();
  }

  async deleteObjectType(key: string, userId?: string) {
    const doc = await this.objectTypeModel.findOne({ key }).exec();
    if (!doc) throw new NotFoundException(`Object type "${key}" not found`);

    const recordCount = await this.objectRecordModel.countDocuments({
      objectTypeKey: key,
    });
    if (recordCount > 0) {
      throw new BadRequestException(
        `Cannot delete object type with ${recordCount} record(s). Soft-delete or move records first.`,
      );
    }

    await this.objectTypeModel
      .findByIdAndUpdate(doc._id, softDeleteUpdate(userId), { new: true })
      .exec();
    return { ok: true };
  }

  // ── Records ───────────────────────────────────────────────────

  async listRecords(
    objectTypeKey: string,
    query: {
      page?: number | string;
      pageSize?: number | string;
      search?: string;
      afterId?: string;
    },
  ) {
    await this.getObjectTypeByKey(objectTypeKey);
    const { page, pageSize } = resolveListPagination({
      page: query.page != null ? String(query.page) : undefined,
      pageSize: query.pageSize != null ? String(query.pageSize) : undefined,
      search: query.search,
    });
    const baseFilter: Record<string, unknown> = { objectTypeKey };
    const search = String(query.search || '').trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseFilter.name =
        search.length >= 2
          ? { $regex: `^${escaped}`, $options: 'i' }
          : { $regex: escaped, $options: 'i' };
    }

    const afterId = String(query.afterId || '').trim();
    const useCursor = afterId.length > 0 && Types.ObjectId.isValid(afterId);
    const filter = { ...baseFilter };
    if (useCursor) {
      filter._id = { $lt: new Types.ObjectId(afterId) };
    }

    let rows: Record<string, any>[];
    if (useCursor) {
      filter._id = { $lt: new Types.ObjectId(afterId) };
      rows = await this.objectRecordModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(pageSize + 1)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec();
    } else {
      const skip = page > 1 ? (page - 1) * pageSize : 0;
      rows = await this.objectRecordModel
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(pageSize + 1)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec();
    }

    const hasMoreFromFetch = rows.length > pageSize;
    const pageRows = hasMoreFromFetch ? rows.slice(0, pageSize) : rows;
    const items = pageRows.map((r) => this.serializeRecord(r));

    const count = await countDocumentsCapped(this.objectRecordModel, baseFilter);
    const scalable = buildScalableListResult(items, {
      page,
      pageSize,
      total: count.total,
      totalIsApproximate: count.approximate,
    });

    return {
      items: scalable.data,
      total: scalable.total,
      page: scalable.page,
      pageSize: scalable.pageSize,
      hasMore: hasMoreFromFetch || scalable.hasMore,
      totalIsApproximate: scalable.totalIsApproximate,
      nextAfterId:
        items.length > 0 ? items[items.length - 1]._id : undefined,
    };
  }

  async getRecord(objectTypeKey: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid record id');
    }
    const doc = await this.objectRecordModel
      .findOne({ _id: id, objectTypeKey })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Record not found');
    return this.serializeRecord(doc);
  }

  async createRecord(
    objectTypeKey: string,
    dto: {
      name?: string;
      properties?: Record<string, unknown>;
      ownerId?: string;
      createdBy?: string;
    },
  ) {
    const objectType = await this.getObjectTypeByKey(objectTypeKey);
    if (objectType.isActive === false) {
      throw new BadRequestException('Object type is inactive');
    }

    const properties =
      dto.properties && typeof dto.properties === 'object'
        ? { ...dto.properties }
        : {};
    const primaryKey = objectType.primaryPropertyKey || 'name';
    const name =
      String(dto.name || properties[primaryKey] || properties.name || '').trim() ||
      `Untitled ${objectType.singularLabel}`;

    if (!properties[primaryKey]) properties[primaryKey] = name;

    const created = await this.objectRecordModel.create({
      objectTypeId: objectType._id,
      objectTypeKey,
      name,
      properties,
      ownerId:
        dto.ownerId && Types.ObjectId.isValid(dto.ownerId)
          ? new Types.ObjectId(dto.ownerId)
          : undefined,
      createdBy:
        dto.createdBy && Types.ObjectId.isValid(dto.createdBy)
          ? new Types.ObjectId(dto.createdBy)
          : undefined,
    });

    return this.serializeRecord(created.toObject());
  }

  async updateRecord(
    objectTypeKey: string,
    id: string,
    dto: {
      name?: string;
      properties?: Record<string, unknown>;
      ownerId?: string | null;
    },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid record id');
    }
    const objectType = await this.getObjectTypeByKey(objectTypeKey);
    const doc = await this.objectRecordModel
      .findOne({ _id: id, objectTypeKey })
      .exec();
    if (!doc) throw new NotFoundException('Record not found');

    if (dto.properties && typeof dto.properties === 'object') {
      doc.properties = { ...(doc.properties || {}), ...dto.properties };
    }
    const primaryKey = objectType.primaryPropertyKey || 'name';
    if (dto.name !== undefined) {
      doc.name = String(dto.name).trim() || doc.name;
      doc.properties = { ...(doc.properties || {}), [primaryKey]: doc.name };
    } else if (dto.properties && dto.properties[primaryKey] != null) {
      doc.name = String(dto.properties[primaryKey]).trim() || doc.name;
    }

    if (dto.ownerId === null) {
      doc.ownerId = undefined;
    } else if (dto.ownerId && Types.ObjectId.isValid(dto.ownerId)) {
      doc.ownerId = new Types.ObjectId(dto.ownerId);
    }

    await doc.save();
    return this.serializeRecord(doc.toObject());
  }

  async deleteRecord(objectTypeKey: string, id: string, userId?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid record id');
    }
    const doc = await this.objectRecordModel
      .findOne({ _id: id, objectTypeKey })
      .exec();
    if (!doc) throw new NotFoundException('Record not found');
    await this.objectRecordModel
      .findByIdAndUpdate(doc._id, softDeleteUpdate(userId), { new: true })
      .exec();
    return { ok: true };
  }

  private serializeRecord(doc: Record<string, any>) {
    return {
      ...doc,
      _id: String(doc._id),
      objectTypeId: String(doc.objectTypeId),
      ownerId: doc.ownerId ? String(doc.ownerId) : undefined,
      createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    };
  }
}
