import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SavedView, SavedViewDocument } from '../schemas/saved-view.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

@Injectable()
export class SavedViewsService {
  constructor(
    @InjectModel(SavedView.name, 'crmConnection')
    private savedViewModel: Model<SavedViewDocument>,
  ) {}

  async findAll(userId: string, module: string): Promise<SavedView[]> {
    return this.savedViewModel
      .find({ user: new Types.ObjectId(userId), module })
      .sort({ isDefault: -1, name: 1 })
      .lean()
      .exec();
  }

  async create(
    userId: string,
    dto: {
      module: string;
      name: string;
      filters?: { property: string; operator: string; value: string }[];
      columns?: { key: string; label: string; visible: boolean }[];
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      isDefault?: boolean;
    },
  ): Promise<SavedView> {
    if (dto.isDefault) {
      await this.savedViewModel
        .updateMany(
          { user: new Types.ObjectId(userId), module: dto.module },
          { $set: { isDefault: false } },
        )
        .exec();
    }
    const view = new this.savedViewModel({
      user: new Types.ObjectId(userId),
      module: dto.module,
      name: dto.name,
      filters: dto.filters || [],
      columns: dto.columns || [],
      sortBy: dto.sortBy || 'createdAt',
      sortOrder: dto.sortOrder || 'desc',
      isDefault: dto.isDefault ?? false,
    });
    return view.save();
  }

  async update(
    userId: string,
    viewId: string,
    dto: Partial<{
      name: string;
      filters: { property: string; operator: string; value: string }[];
      columns: { key: string; label: string; visible: boolean }[];
      sortBy: string;
      sortOrder: 'asc' | 'desc';
      isDefault: boolean;
    }>,
  ): Promise<SavedView | null> {
    const view = await this.savedViewModel
      .findOne({
        _id: new Types.ObjectId(viewId),
        user: new Types.ObjectId(userId),
      })
      .exec();
    if (!view) return null;

    if (dto.isDefault === true) {
      await this.savedViewModel
        .updateMany(
          { user: new Types.ObjectId(userId), module: view.module },
          { $set: { isDefault: false } },
        )
        .exec();
    }

    if (dto.name !== undefined) view.name = dto.name;
    if (dto.filters !== undefined) view.filters = dto.filters;
    if (dto.columns !== undefined) view.columns = dto.columns;
    if (dto.sortBy !== undefined) view.sortBy = dto.sortBy;
    if (dto.sortOrder !== undefined) view.sortOrder = dto.sortOrder;
    if (dto.isDefault !== undefined) view.isDefault = dto.isDefault;

    return view.save();
  }

  async delete(userId: string, viewId: string): Promise<boolean> {
    const result = await this.savedViewModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(viewId),
          user: new Types.ObjectId(userId),
        },
        softDeleteUpdate(userId),
        { new: true },
      )
      .exec();
    return !!result;
  }
}
