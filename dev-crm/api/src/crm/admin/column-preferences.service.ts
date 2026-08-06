import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ColumnPreference,
  ColumnPreferenceDocument,
} from '../schemas/column-preference.schema';

@Injectable()
export class ColumnPreferencesService {
  constructor(
    @InjectModel(ColumnPreference.name, 'crmConnection')
    private columnPreferenceModel: Model<ColumnPreferenceDocument>,
  ) {}

  async getPreference(
    userId: string,
    module: string,
  ): Promise<ColumnPreference | null> {
    return this.columnPreferenceModel.findOne({ user: userId, module }).exec();
  }

  async savePreference(
    userId: string,
    module: string,
    columns: string[],
  ): Promise<ColumnPreference> {
    return this.columnPreferenceModel
      .findOneAndUpdate(
        { user: userId, module },
        { columns },
        { upsert: true, new: true },
      )
      .exec();
  }
}
