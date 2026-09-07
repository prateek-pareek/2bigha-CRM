import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { LegalCase, LegalCaseDocument } from '../records/schemas/legal-case.schema';
import { PropertyListing, PropertyListingDocument } from '../property-listings/schemas/property-listing.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';
import {
  CrmWorkspaceModule,
  CRM_WORKSPACE_MODULES,
  resolveRoleModule,
  roleAllowsModule,
} from '../shared/crm-workspace-module.util';
import { RoleAuditLogService } from '../../users/role-audit-log.service';
import { CrmNotifyService } from '../notifications/crm-notify.service';

export type OwnershipTransferEntityType = 'Lead' | 'LegalCase';

export type OwnershipTransferDto = {
  newOwnerUserId: string;
  /** Lead only — moves the record into a different workspace as part of the same transfer. */
  newModule?: CrmWorkspaceModule;
  reason?: string;
};

@Injectable()
export class OwnershipTransferService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LegalCase.name, 'crmConnection')
    private readonly legalCaseModel: Model<LegalCaseDocument>,
    @InjectModel(PropertyListing.name, 'crmConnection')
    private readonly propertyListingModel: Model<PropertyListingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly roleAuditLog: RoleAuditLogService,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  private ownerLabel(u: any): string {
    if (!u) return 'Unknown';
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return name || u.email || 'Unknown';
  }

  private crmPermissionSet(user?: any): Set<string> {
    const hrms = Array.isArray(user?.permissions) ? user.permissions : [];
    const crm = Array.isArray(user?.crmPermissions) ? user.crmPermissions : [];
    return new Set([...hrms, ...crm].map((p: any) => String(p || '').trim()));
  }

  /** Same three tiers as the leads/legal list filters — 'own' (implicit fallback), 'team', 'all'. */
  private accessTier(moduleKey: 'leads' | 'legal', user?: any): 'own' | 'team' | 'all' {
    if (hasCrmFullDataAccess(user)) return 'all';
    const perms = this.crmPermissionSet(user);
    if (perms.has(`${moduleKey}:read:all`)) return 'all';
    if (perms.has(`${moduleKey}:read:team`)) return 'team';
    return 'own';
  }

  private async teamMemberIds(user?: any): Promise<Types.ObjectId[]> {
    const selfId = this.toObjectIdSafe(user?.userId ?? user?._id);
    if (!selfId) return [];
    const reports = await this.userModel.find({ reportsTo: selfId }).select('_id').lean();
    return [selfId, ...reports.map((r: any) => r._id as Types.ObjectId)];
  }

  private toObjectIdSafe(v: any): Types.ObjectId | null {
    if (!v) return null;
    if (v instanceof Types.ObjectId) return v;
    const s = String(v).trim();
    return /^[0-9a-fA-F]{24}$/.test(s) ? new Types.ObjectId(s) : null;
  }

  /**
   * Rule-based transfer blocks. Keyed by module so future rules for PROPERTY_MGMT/LEGAL
   * can be added alongside without touching the core transfer flow.
   */
  private async checkTransferBlockRules(
    entityType: OwnershipTransferEntityType,
    entity: any,
  ): Promise<string | null> {
    if (entityType === 'Lead' && entity.module === '2Bigha') {
      const listedCount = await this.propertyListingModel
        .countDocuments({ leadId: entity._id, isDeleted: { $ne: true } })
        .exec();
      if (listedCount > 0) {
        return 'This lead has at least one listed property and cannot be transferred.';
      }
    }
    return null;
  }

  async transfer(
    entityType: OwnershipTransferEntityType,
    id: string,
    dto: OwnershipTransferDto,
    actor: any,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid record id');
    }
    if (!Types.ObjectId.isValid(dto?.newOwnerUserId || '')) {
      throw new BadRequestException('A valid newOwnerUserId is required');
    }
    if (dto.newModule && !CRM_WORKSPACE_MODULES.includes(dto.newModule)) {
      throw new BadRequestException('Invalid newModule');
    }
    if (dto.newModule && entityType !== 'Lead') {
      throw new BadRequestException('newModule only applies to leads.');
    }

    const model: Model<any> = entityType === 'Lead' ? this.leadModel : this.legalCaseModel;
    const entity = await model.findById(id).exec();
    if (!entity) throw new NotFoundException(`${entityType} not found`);

    const currentModule: CrmWorkspaceModule =
      entityType === 'Lead' ? ((entity as any).module || '2Bigha') : 'LEGAL';
    const targetModule: CrmWorkspaceModule = dto.newModule || currentModule;
    const moduleChanging = targetModule !== currentModule;

    // 1) RBAC — module boundary. Actor's role must belong to the record's current module
    // (or 'ALL'), and to the target module too when this transfer crosses workspaces.
    const actorDbUser = actor?.crmDbUser;
    if (!roleAllowsModule(actorDbUser, currentModule)) {
      throw new ForbiddenException('This record belongs to a different workspace.');
    }
    if (moduleChanging && resolveRoleModule(actorDbUser) !== 'ALL') {
      throw new ForbiddenException('Only a Super Admin can transfer a record across workspaces.');
    }

    // 2) RBAC — ownership tier. Transfers are a Team Lead/Manager-or-above action; a plain
    // "own" tier (Calling Agent / Legal Executive) can't initiate a transfer at all.
    const moduleKey = entityType === 'Lead' ? 'leads' : 'legal';
    const tier = this.accessTier(moduleKey, actor);
    if (tier === 'own') {
      throw new ForbiddenException('Only a Team Lead, Manager, or Super Admin can transfer ownership.');
    }

    const ownerField = entityType === 'Lead' ? 'leadOwner' : 'caseOwner';
    const previousOwnerLabel = String((entity as any)[ownerField] || '');

    const newOwner = await this.userModel.findById(dto.newOwnerUserId).lean().exec();
    if (!newOwner) throw new NotFoundException('New owner not found');

    // 3) RBAC — team tier can only hand off within their own team; 'all'/Super Admin can
    // hand off to anyone (still bounded by the module checks above).
    if (tier === 'team') {
      const teamIds = await this.teamMemberIds(actor);
      const withinTeam = teamIds.some((tid) => String(tid) === String(newOwner._id));
      if (!withinTeam) {
        throw new ForbiddenException('You can only transfer ownership within your own team.');
      }
    }

    // 4) Rule-based blocks (e.g. 2Bigha lead with a listed property).
    const blockReason = await this.checkTransferBlockRules(entityType, entity);
    if (blockReason) {
      throw new ForbiddenException(blockReason);
    }

    const newOwnerLabel = this.ownerLabel(newOwner);
    const update: Record<string, unknown> = { [ownerField]: newOwnerLabel };
    if (moduleChanging) update.module = targetModule;

    const updated = await model.findByIdAndUpdate(id, update, { new: true }).exec();

    // 5) Audit trail.
    await this.roleAuditLog.log({
      actor,
      action: 'ownership_changed',
      targetType: entityType,
      targetId: id,
      targetLabel: entityType === 'Lead'
        ? `${(updated as any)?.firstName || ''} ${(updated as any)?.lastName || ''}`.trim()
        : (updated as any)?.title,
      before: { [ownerField]: previousOwnerLabel, module: currentModule },
      after: { [ownerField]: newOwnerLabel, module: targetModule, reason: dto.reason },
    });

    // 6) Notify both the old and new owner.
    const recordLabel =
      entityType === 'Lead'
        ? `${(updated as any)?.firstName || ''} ${(updated as any)?.lastName || ''}`.trim() || 'a lead'
        : (updated as any)?.title || 'a case';

    const prevOwnerUser = previousOwnerLabel
      ? await this.userModel
          .findOne({
            $or: [
              { email: previousOwnerLabel },
              {
                $expr: {
                  $eq: [
                    { $trim: { input: { $concat: ['$firstName', ' ', '$lastName'] } } },
                    previousOwnerLabel,
                  ],
                },
              },
            ],
          })
          .lean()
          .exec()
          .catch(() => null)
      : null;

    await Promise.all([
      prevOwnerUser && String(prevOwnerUser._id) !== String(newOwner._id)
        ? this.crmNotify
            .notify({
              event: 'lead_transferred',
              title: `${entityType} reassigned`,
              message: `${recordLabel} has been transferred to ${newOwnerLabel}.`,
              recipient: { userId: prevOwnerUser._id },
              link:
                entityType === 'Lead'
                  ? `/crm/leads/${id}`
                  : `/crm/legal-cases/${id}`,
              metadata: {
                entityType,
                entityId: id,
                action: 'ownership_transfer_out',
              },
              type: 'LEAD_TRANSFERRED',
            })
            .catch(() => null)
        : null,
      this.crmNotify
        .notify({
          event: 'lead_transferred',
          title: `${entityType} assigned to you`,
          message: `${recordLabel} has been transferred to you${previousOwnerLabel ? ` from ${previousOwnerLabel}` : ''}.`,
          recipient: { userId: newOwner._id, email: (newOwner as any).email },
          link:
            entityType === 'Lead'
              ? `/crm/leads/${id}`
              : `/crm/legal-cases/${id}`,
          metadata: {
            entityType,
            entityId: id,
            action: 'ownership_transfer_in',
          },
          type: 'LEAD_TRANSFERRED',
        })
        .catch(() => null),
    ]);

    return updated;
  }
}
