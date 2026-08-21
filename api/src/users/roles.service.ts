import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole, UserRoleDocument } from './schemas/user-role.schema';
import { RoleAuditLogService } from './role-audit-log.service';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(UserRole.name) private readonly roleModel: Model<UserRoleDocument>,
    private readonly auditLog: RoleAuditLogService,
  ) {}

  async createRole(dto: any, actor?: any) {
    const actorId = actor?.userId || actor?._id;
    const payload = {
      name: String(dto?.name || '').trim(),
      description: String(dto?.description || '').trim(),
      isActive: dto?.isActive !== false,
      permissions: Array.isArray(dto?.permissions) ? dto.permissions : [],
      crmPermissions: Array.isArray(dto?.crmPermissions) ? dto.crmPermissions : [],
      pmPermissions: Array.isArray(dto?.pmPermissions) ? dto.pmPermissions : [],
      permittedTools: Array.isArray(dto?.permittedTools) ? dto.permittedTools : [],
      dataScopes: Array.isArray(dto?.dataScopes) ? dto.dataScopes : [],
      fieldPermissions: Array.isArray(dto?.fieldPermissions) ? dto.fieldPermissions : [],
      createdBy:
        actorId && Types.ObjectId.isValid(String(actorId))
          ? new Types.ObjectId(String(actorId))
          : undefined,
    };
    const created = await this.roleModel.create(payload);
    await this.auditLog.log({
      actor,
      action: 'role_created',
      targetType: 'UserRole',
      targetId: created._id,
      targetLabel: created.name,
      after: payload,
    });
    return created;
  }

  async findAllRoles() {
    return this.roleModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async findRoleById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.roleModel.findById(id).lean().exec();
  }

  async updateRole(id: string, dto: any, actor?: any) {
    if (!Types.ObjectId.isValid(id)) return null;
    const before = await this.roleModel.findById(id).lean().exec();
    if (!before) return null;
    const payload: Record<string, unknown> = {};
    const keys = [
      'name',
      'description',
      'isActive',
      'permissions',
      'crmPermissions',
      'pmPermissions',
      'permittedTools',
      'dataScopes',
      'fieldPermissions',
    ] as const;
    for (const k of keys) {
      if (dto?.[k] === undefined) continue;
      payload[k] = dto[k];
    }
    const updated = await this.roleModel.findByIdAndUpdate(id, payload, { new: true }).lean().exec();
    await this.auditLog.log({
      actor,
      action: 'role_updated',
      targetType: 'UserRole',
      targetId: id,
      targetLabel: (updated as any)?.name || before.name,
      before,
      after: payload,
    });
    return updated;
  }

  async deleteRole(id: string, actor?: any) {
    if (!Types.ObjectId.isValid(id)) return { deleted: false };
    const before = await this.roleModel.findById(id).lean().exec();
    const res = await this.roleModel.deleteOne({ _id: id }).exec();
    const deleted = (res.deletedCount || 0) > 0;
    if (deleted && before) {
      await this.auditLog.log({
        actor,
        action: 'role_deleted',
        targetType: 'UserRole',
        targetId: id,
        targetLabel: before.name,
        before,
      });
    }
    return { deleted };
  }
}

