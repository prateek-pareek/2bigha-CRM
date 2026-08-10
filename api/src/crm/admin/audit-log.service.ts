import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name, 'crmConnection')
    private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async logAction(data: {
    user: string;
    action: string;
    module: string;
    entityId?: string;
    changes?: Record<string, unknown>;
    description?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const log = new this.auditLogModel(data);
    return log.save();
  }

  async findAll(query: any = {}): Promise<AuditLog[]> {
    return this.auditLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .populate({ path: 'user', select: 'firstName lastName email', model: this.userModel })
      .exec();
  }

  async findByEntity(entityId: string): Promise<AuditLog[]> {
    return this.auditLogModel
      .find({ entityId })
      .sort({ createdAt: -1 })
      .populate({ path: 'user', select: 'firstName lastName email', model: this.userModel })
      .exec();
  }

  async deleteLog(id: string): Promise<boolean> {
    const result = await this.auditLogModel.findByIdAndDelete(id);
    return !!result;
  }

  async deleteAllLogs(): Promise<void> {
    await this.auditLogModel.deleteMany({});
  }
}
