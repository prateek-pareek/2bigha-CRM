import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole, UserRoleDocument } from './schemas/user-role.schema';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(UserRole.name) private readonly roleModel: Model<UserRoleDocument>,
  ) {}

  async createRole(dto: any, actorId?: string) {
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
        actorId && Types.ObjectId.isValid(actorId)
          ? new Types.ObjectId(actorId)
          : undefined,
    };
    return this.roleModel.create(payload);
  }

  async findAllRoles() {
    return this.roleModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async findRoleById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.roleModel.findById(id).lean().exec();
  }

  async updateRole(id: string, dto: any) {
    if (!Types.ObjectId.isValid(id)) return null;
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
      if (dto?.[k] !== undefined) payload[k] = dto[k];
    }
    return this.roleModel.findByIdAndUpdate(id, payload, { new: true }).lean().exec();
  }

  async deleteRole(id: string) {
    if (!Types.ObjectId.isValid(id)) return { deleted: false };
    const res = await this.roleModel.deleteOne({ _id: id }).exec();
    return { deleted: (res.deletedCount || 0) > 0 };
  }
}

