import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CustomField,
  CustomFieldDocument,
} from '../schemas/custom-field.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import { CUSTOM_FIELD_MERGEABLE_CORE } from '../shared/custom-field-merge.constants';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

function isEmptyMergeTarget(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function coerceToCoreString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join(', ');
  return String(v);
}

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectModel(CustomField.name, 'crmConnection')
    private customFieldModel: Model<CustomFieldDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
  ) {}

  async create(createDto: any): Promise<CustomField> {
    const count = await this.customFieldModel.countDocuments({
      module: createDto.module,
    });
    const created = new this.customFieldModel({ ...createDto, order: count });
    return created.save();
  }

  async findAll(module?: string): Promise<CustomField[]> {
    const query = module ? { module, isActive: true } : { isActive: true };
    return this.customFieldModel.find(query).sort({ order: 1 }).exec();
  }

  async findOne(id: string): Promise<CustomField> {
    const field = await this.customFieldModel.findById(id).exec();
    if (!field) throw new NotFoundException('Custom field not found');
    return field;
  }

  async update(id: string, updateDto: any): Promise<CustomField> {
    const updated = await this.customFieldModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Custom field not found');
    return updated;
  }

  async remove(
    id: string,
    mergeInto?: string,
  ): Promise<{ mergedRecords: number }> {
    const field = await this.customFieldModel.findById(id).exec();
    if (!field) throw new NotFoundException('Custom field not found');

    const fromKey = field.key;
    const moduleName = field.module;
    let mergedRecords = 0;

    const mergeTarget = mergeInto?.trim();
    if (mergeTarget) {
      if (mergeTarget === fromKey) {
        throw new BadRequestException('Cannot merge a field into itself');
      }

      const siblingCustom = await this.customFieldModel
        .findOne({
          module: moduleName,
          key: mergeTarget,
          isActive: true,
          _id: { $ne: field._id },
        })
        .exec();

      const allowCore =
        CUSTOM_FIELD_MERGEABLE_CORE[moduleName]?.has(mergeTarget);
      if (!siblingCustom && !allowCore) {
        throw new BadRequestException(
          'Invalid merge target: must be another custom property on this module or an allowed standard field',
        );
      }

      const mergeIntoCustom = !!siblingCustom;
      mergedRecords = await this.mergeFieldValuesForModule(
        moduleName,
        fromKey,
        mergeTarget,
        mergeIntoCustom,
      );
    }

    await this.customFieldModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
    return { mergedRecords };
  }

  private async mergeFieldValuesForModule(
    moduleName: string,
    fromKey: string,
    mergeInto: string,
    mergeIntoCustom: boolean,
  ): Promise<number> {
    const model = this.getModelForModule(moduleName);
    let count = 0;
    const batch: {
      filter: { _id: unknown };
      update: Record<string, unknown>;
    }[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await model.bulkWrite(
        batch.map((b) => ({
          updateOne: { filter: b.filter, update: { $set: b.update } },
        })) as any,
      );
      count += batch.length;
      batch.length = 0;
    };

    const cursor = model
      .find({ [`customFields.${fromKey}`]: { $exists: true } })
      .select({
        customFields: 1,
        ...this.selectCoreForMerge(mergeInto, mergeIntoCustom),
      })
      .cursor();

    for await (const doc of cursor) {
      const d = doc;
      const cf: Record<string, unknown> = { ...(d.customFields || {}) };
      if (!(fromKey in cf)) continue;

      const raw = cf[fromKey];
      delete cf[fromKey];
      const update: Record<string, unknown> = { customFields: cf };

      if (!isEmptyMergeTarget(raw)) {
        if (mergeIntoCustom) {
          if (isEmptyMergeTarget(cf[mergeInto])) {
            cf[mergeInto] = raw;
          }
        } else {
          const cur = d[mergeInto];
          if (isEmptyMergeTarget(cur)) {
            update[mergeInto] = coerceToCoreString(raw);
          }
        }
      }

      batch.push({ filter: { _id: d._id }, update });
      if (batch.length >= 200) await flush();
    }
    await flush();
    return count;
  }

  /** Ensure top-level merge target is loaded when merging to a core field */
  private selectCoreForMerge(
    mergeInto: string,
    mergeIntoCustom: boolean,
  ): Record<string, 1> {
    if (mergeIntoCustom) return {};
    return { [mergeInto]: 1 };
  }

  private getModelForModule(moduleName: string): Model<any> {
    switch (moduleName) {
      case 'leads':
        return this.leadModel;
      case 'deals':
        return this.dealModel;
      case 'contacts':
        return this.contactModel;
      case 'organizations':
        return this.organizationModel;
      case 'clients':
        return this.clientModel;
      default:
        throw new BadRequestException(`Unsupported module: ${moduleName}`);
    }
  }

  async reorder(ids: string[]): Promise<void> {
    const ops = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));
    if (ops.length > 0) {
      await this.customFieldModel.bulkWrite(ops as any);
    }
  }
}
