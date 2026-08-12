import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trash, TrashDocument } from './schemas/trash.schema';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    @InjectModel(Trash.name) private trashModel: Model<TrashDocument>,
    private storageService: StorageService,
  ) {}

  async moveToTrash(
    entityId: string,
    collectionName: string,
    data: any,
    deletedBy: string,
  ): Promise<Trash> {
    const trashItem = new this.trashModel({
      entityId,
      collectionName,
      data,
      deletedBy,
    });
    return trashItem.save();
  }

  async findAll(): Promise<Trash[]> {
    return this.trashModel.find().sort({ deletedAt: -1 }).exec();
  }

  async restore(id: string): Promise<Trash> {
    const item = await this.trashModel.findById(id).exec();
    if (!item) throw new NotFoundException('Trash item not found');

    // Recovery logic would happen in the respective services calling this,
    // or we can implement a generic one if we have access to all models.
    // For now, listing and purging are the main requirements.
    return item;
  }

  private async cleanupMedia(data: any): Promise<void> {
    if (!data) return;
    const strData = typeof data === 'string' ? data : JSON.stringify(data);
    // Matches both absolute (https://host/uploads/...) and relative (/uploads/...) local storage URLs.
    const urlRegex = /(?:https?:\/\/[^\s"'<>]+)?\/uploads\/[^\s"'<>]+/g;
    const urls = strData.match(urlRegex) || [];

    // Deduplicate
    const uniqueUrls = [...new Set(urls)];

    for (const url of uniqueUrls) {
      try {
        await this.storageService.deleteMedia({ url });
      } catch (err) {
        this.logger.warn(`Failed to cleanup local media: ${url}. Error: ${(err as Error).message}`);
      }
    }
  }

  async emptyTrash(): Promise<{ deletedCount: number }> {
    // We need to fetch all to clean up media
    const items = await this.trashModel.find({}).exec();
    for (const item of items) {
      await this.cleanupMedia(item.data);
    }
    const result = await this.trashModel.deleteMany({}).exec();
    return { deletedCount: result.deletedCount };
  }

  async deletePermanently(id: string): Promise<void> {
    const item = await this.trashModel.findById(id).exec();
    if (item) {
      await this.cleanupMedia(item.data);
      await this.trashModel.findByIdAndDelete(id).exec();
    }
  }
}
