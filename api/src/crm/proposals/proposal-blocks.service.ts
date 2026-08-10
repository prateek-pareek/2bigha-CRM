import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CrmProposalBlock,
  ProposalBlockDocument,
} from '../schemas/proposal-block.schema';

@Injectable()
export class ProposalBlocksService {
  constructor(
    @InjectModel(CrmProposalBlock.name, 'crmConnection')
    private blockModel: Model<ProposalBlockDocument>,
  ) {}

  async create(data: {
    name: string;
    category: string;
    bodyHtml: string;
    createdBy: string;
    isActive?: boolean;
  }): Promise<CrmProposalBlock> {
    return new this.blockModel({
      name: data.name.trim(),
      category: data.category,
      bodyHtml: data.bodyHtml ?? '',
      createdBy: new Types.ObjectId(data.createdBy),
      isActive: data.isActive !== false,
    }).save();
  }

  async findAll(query: {
    category?: string;
    activeOnly?: boolean;
  } = {}): Promise<CrmProposalBlock[]> {
    const filter: Record<string, unknown> = {};
    if (query.activeOnly === false) {
      /* all */
    } else {
      filter.isActive = { $ne: false };
    }
    if (query.category?.trim()) {
      filter.category = query.category.trim();
    }
    return this.blockModel
      .find(filter)
      .sort({ category: 1, name: 1 })
      .populate('createdBy', 'firstName lastName email')
      .lean()
      .exec() as Promise<CrmProposalBlock[]>;
  }

  async findOne(id: string): Promise<CrmProposalBlock | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.blockModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .lean()
      .exec() as Promise<CrmProposalBlock | null>;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      category: string;
      bodyHtml: string;
      isActive: boolean;
    }>,
    userId: string,
    canManageAll: boolean,
  ): Promise<CrmProposalBlock | null> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const doc = await this.blockModel.findById(id).exec();
    if (!doc) throw new NotFoundException();
    if (!canManageAll && String(doc.createdBy) !== String(userId)) {
      throw new ForbiddenException('You can only edit your own blocks');
    }
    if (data.name != null) doc.name = String(data.name).trim();
    if (data.category != null) doc.category = data.category;
    if (data.bodyHtml != null) doc.bodyHtml = data.bodyHtml;
    if (data.isActive !== undefined) doc.isActive = data.isActive;
    await doc.save();
    return doc.toObject();
  }

  async delete(
    id: string,
    userId: string,
    canManageAll: boolean,
  ): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const doc = await this.blockModel.findById(id).exec();
    if (!doc) throw new NotFoundException();
    if (!canManageAll && String(doc.createdBy) !== String(userId)) {
      throw new ForbiddenException('You can only delete your own blocks');
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    if (Types.ObjectId.isValid(String(userId))) {
      doc.deletedBy = new Types.ObjectId(String(userId));
    }
    await doc.save();
    return { deleted: true };
  }
}
