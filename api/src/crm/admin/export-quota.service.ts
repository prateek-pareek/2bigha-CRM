import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ExportQuotaConfig,
  ExportQuotaConfigDocument,
} from './schemas/export-quota-config.schema';
import { ExportLog, ExportLogDocument } from './schemas/export-log.schema';

@Injectable()
export class ExportQuotaService {
  constructor(
    @InjectModel(ExportQuotaConfig.name, 'crmConnection')
    private configModel: Model<ExportQuotaConfigDocument>,
    @InjectModel(ExportLog.name, 'crmConnection')
    private exportLogModel: Model<ExportLogDocument>,
  ) {}

  private async getOrCreateConfig(): Promise<ExportQuotaConfig> {
    const existing = await this.configModel.findOne().lean();
    if (existing) return existing;
    const created = await this.configModel.create({});
    return created.toObject();
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Throws if this user has already used today's export quota. Call before running the export query. */
  async checkQuota(userId?: string): Promise<void> {
    if (!userId || !Types.ObjectId.isValid(userId)) return;
    const config = await this.getOrCreateConfig();
    const limit = config.perUserOverrides?.[userId] ?? config.dailyLimitDefault;
    if (limit <= 0) return; // 0/unset = unlimited for this deployment
    const usedToday = await this.exportLogModel.countDocuments({
      userId: new Types.ObjectId(userId),
      createdAt: { $gte: this.startOfToday() },
    });
    if (usedToday >= limit) {
      throw new ForbiddenException(
        `Daily export quota reached (${limit} exports/day). Contact a Super Admin to raise your limit.`,
      );
    }
  }

  /** Records a completed export attempt — call after the export data was built. */
  async logExport(
    user: { userId?: string; firstName?: string; lastName?: string } | undefined,
    exportType: string,
    rowCount: number,
    filters?: Record<string, unknown>,
  ): Promise<void> {
    const userId = user?.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) return;
    await this.exportLogModel.create({
      userId: new Types.ObjectId(userId),
      userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined,
      exportType,
      rowCount,
      filters,
    });
  }

  async getConfig(): Promise<ExportQuotaConfig> {
    return this.getOrCreateConfig();
  }

  async updateConfig(patch: {
    dailyLimitDefault?: number;
    perUserOverrides?: Record<string, number>;
  }): Promise<ExportQuotaConfig> {
    const existing = await this.configModel.findOne();
    if (!existing) {
      return this.configModel.create(patch);
    }
    if (patch.dailyLimitDefault !== undefined) existing.dailyLimitDefault = patch.dailyLimitDefault;
    if (patch.perUserOverrides !== undefined) existing.perUserOverrides = patch.perUserOverrides;
    await existing.save();
    return existing.toObject();
  }

  async listHistory(query: { page?: number; pageSize?: number }): Promise<{
    data: ExportLog[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const [data, total] = await Promise.all([
      this.exportLogModel
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.exportLogModel.countDocuments(),
    ]);
    return { data, total, page, pageSize };
  }
}
