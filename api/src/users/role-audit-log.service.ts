import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoleAuditLog, RoleAuditLogDocument } from './schemas/role-audit-log.schema';

export type RoleAuditAction =
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'user_role_assigned'
  | 'ownership_changed';

export type RoleAuditEntry = {
  actor?: any;
  action: RoleAuditAction;
  targetType: string;
  targetId?: string | Types.ObjectId;
  targetLabel?: string;
  before?: any;
  after?: any;
};

@Injectable()
export class RoleAuditLogService {
  constructor(
    @InjectModel(RoleAuditLog.name)
    private readonly auditModel: Model<RoleAuditLogDocument>,
  ) {}

  private actorLabelFrom(actor?: any): string | undefined {
    if (!actor) return undefined;
    const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
    return name || actor.email || undefined;
  }

  private actorIdFrom(actor?: any): Types.ObjectId | undefined {
    const raw = actor?.userId ?? actor?._id;
    return raw && Types.ObjectId.isValid(String(raw)) ? new Types.ObjectId(String(raw)) : undefined;
  }

  /** Fire-and-forget — an audit-log write failure must never break the underlying action. */
  async log(entry: RoleAuditEntry): Promise<void> {
    try {
      await this.auditModel.create({
        actorId: this.actorIdFrom(entry.actor),
        actorLabel: this.actorLabelFrom(entry.actor),
        action: entry.action,
        targetType: entry.targetType,
        targetId:
          entry.targetId && Types.ObjectId.isValid(String(entry.targetId))
            ? new Types.ObjectId(String(entry.targetId))
            : undefined,
        targetLabel: entry.targetLabel,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
      });
    } catch (err) {
      console.error('RoleAuditLogService: failed to write audit entry', err);
    }
  }

  async list(filters: { targetType?: string; targetId?: string; page?: number; pageSize?: number }) {
    const query: Record<string, unknown> = {};
    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.targetId && Types.ObjectId.isValid(filters.targetId)) {
      query.targetId = new Types.ObjectId(filters.targetId);
    }
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize || 50));
    const [items, total] = await Promise.all([
      this.auditModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.auditModel.countDocuments(query).exec(),
    ]);
    return { items, total, page, pageSize };
  }
}
