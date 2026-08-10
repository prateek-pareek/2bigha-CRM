import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async log(logData: any): Promise<void> {
    const log = new this.auditLogModel(logData);
    await log.save();
  }

  async getLogsForDocument(
    documentType: string,
    documentId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogModel
      .find({
        documentType,
        documentId,
      })
      .sort({ createdAt: -1 })
      .populate('userId', 'firstName lastName email')
      .exec();
  }

  async listLogs(opts: {
    page?: number;
    limit?: number;
    search?: string;
    excludeDocumentType?: string;
  }): Promise<{ data: AuditLog[]; total: number }> {
    const page = Math.max(1, Number(opts?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(opts?.limit || 25)));
    const skip = (page - 1) * limit;
    const search = String(opts?.search || '').trim();
    const excludeDocumentType = String(opts?.excludeDocumentType || '').trim();

    const filter: Record<string, any> = {};
    if (excludeDocumentType) {
      filter.documentType = { $ne: excludeDocumentType };
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { documentType: rx },
        { action: rx },
        { changes: { $elemMatch: { field: rx } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'firstName lastName email role')
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter),
    ]);
    return { data: data as any, total };
  }

  async deleteLog(id: string): Promise<{ deleted: boolean }> {
    const res = await this.auditLogModel.deleteOne({ _id: id }).exec();
    return { deleted: (res.deletedCount || 0) > 0 };
  }

  async purgeLogs(opts: { olderThanDays?: number; documentType?: string }): Promise<{ deletedCount: number }> {
    const olderThanDays = Number(opts?.olderThanDays || 0);
    const documentType = String(opts?.documentType || '').trim();
    const filter: Record<string, any> = {};
    if (olderThanDays > 0) {
      const until = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      filter.createdAt = { $lt: until };
    }
    if (documentType) {
      filter.documentType = documentType;
    }
    const res = await this.auditLogModel.deleteMany(filter).exec();
    return { deletedCount: res.deletedCount || 0 };
  }
}
