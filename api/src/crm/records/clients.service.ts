import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Client, ClientDocument } from '../schemas/client.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Model, Types } from 'mongoose';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

const CLIENT_ASSOC_KEYS = [
  'associatedLeads',
  'associatedOrganizations',
  'associatedContacts',
] as const;

function normalizeObjectIdArray(val: unknown): Types.ObjectId[] {
  if (!Array.isArray(val)) return [];
  const out: Types.ObjectId[] = [];
  for (const x of val) {
    const s = String(x ?? '').trim();
    if (Types.ObjectId.isValid(s)) out.push(new Types.ObjectId(s));
  }
  return out;
}

function normalizeAdditionalEmailsPayload(data: any): void {
  if (!data || data.additionalEmails === undefined) return;
  const primary = String(data.email ?? '')
    .trim()
    .toLowerCase();
  const raw = Array.isArray(data.additionalEmails) ? data.additionalEmails : [];
  const seen = new Set<string>();
  data.additionalEmails = raw
    .map((e: unknown) => String(e ?? '').trim())
    .filter((e: string) => {
      if (!e || !e.includes('@')) return false;
      const low = e.toLowerCase();
      if (primary && low === primary) return false;
      if (seen.has(low)) return false;
      seen.add(low);
      return true;
    });
}

function normalizeClientAssociations(data: any): void {
  if (!data) return;
  for (const k of CLIENT_ASSOC_KEYS) {
    if (data[k] !== undefined) {
      data[k] = normalizeObjectIdArray(data[k]);
    }
  }
}
import { appendCrmListFilters, parseCrmFiltersQuery } from '../shared/crm-list-filters';
import { CRMService } from '../core/crm.service';
import { AssociationsService } from '../associations/associations.service';
import { hasCrmAdminJwtBypass } from '../shared/crm-admin-access.util';
import { TwoBighaClientService } from './twobigha-client.service';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    private readonly crmService: CRMService,
    private readonly associationsService: AssociationsService,
    private readonly twoBighaClientService: TwoBighaClientService,
  ) {}

  private _cleanData(data: any) {
    // Aggressively remove empty strings which cause CastError on populate
    if (
      data.organization === '' ||
      data.organization === null ||
      data.organization === undefined
    ) {
      delete data.organization;
    }
    return data;
  }

  private getActorId(actor?: any): string | null {
    const raw = actor?.userId || actor?._id || actor?.id || null;
    if (!raw) return null;
    const value = String(raw);
    return /^[0-9a-fA-F]{24}$/.test(value) ? value : null;
  }

  private actorPermissions(actor?: any): string[] {
    const hrms = Array.isArray(actor?.permissions) ? actor.permissions : [];
    const crm = Array.isArray(actor?.crmPermissions) ? actor.crmPermissions : [];
    return [...hrms, ...crm].map((p: any) => String(p || '').trim());
  }

  private isActorAdminLike(actor?: any): boolean {
    const role = String(actor?.role || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    return ['ADMIN', 'ADMINISTRATOR', 'SUPERADMIN', 'CEO', 'CTO', 'SUBADMIN'].includes(role);
  }

  private canManageAllClients(actor?: any): boolean {
    if (!actor) return true;
    if (this.isActorAdminLike(actor)) return true;
    const perms = this.actorPermissions(actor);
    return (
      perms.includes('clients:read:all') ||
      perms.includes('clients:write') ||
      perms.includes('clients:edit') ||
      perms.includes('clients:delete')
    );
  }

  async create(data: any, user?: any): Promise<Client> {
    const payload = this._cleanData({ ...(data || {}) });
    normalizeAdditionalEmailsPayload(payload);
    normalizeClientAssociations(payload);
    const actorId = this.getActorId(user);
    const canManageAll = this.canManageAllClients(user);

    if (!canManageAll && actorId) {
      payload.assignedTo = [new Types.ObjectId(actorId)];
    } else if (!Array.isArray(payload.assignedTo) || payload.assignedTo.length === 0) {
      if (actorId) payload.assignedTo = [new Types.ObjectId(actorId)];
    }

    const client = await new this.clientModel(payload).save();

    // Sync the underlying platform-user record to 2bigha (adminCreateUser)
    // — never throws; a 2bigha outage or missing email must not block
    // creating the client locally, the sync status is stored instead.
    const syncResult = await this.twoBighaClientService.syncClientCreate({
      _id: String(client._id),
      name: client.name,
      email: client.email,
      phone: client.phone,
      whatsappNumber: client.whatsappNumber,
      address: client.address,
      role: client.role,
    });
    client.twobighaUserId = syncResult.twobighaUserId ?? client.twobighaUserId;
    client.twobighaSyncStatus = syncResult.status;
    client.twobighaSyncError =
      syncResult.status === 'failed' || syncResult.status === 'skipped' ? syncResult.error : undefined;
    client.twobighaSyncedAt = syncResult.syncedAt;
    await client.save();

    const populated = await this.clientModel
      .findById(client._id)
      .populate('organization')
      .exec();
    if (populated) await this.crmService.syncContactFromClientSafe(populated);
    if (user) {
      await new this.activityModel({
        type: 'Note',
        title: 'Client Created',
        content: `Client ${client.name} created by ${user.firstName} ${user.lastName}`,
        relatedTo: client._id,
        relatedType: 'Client',
        author: new Types.ObjectId(user.userId || user._id),
      }).save();
    }
    return client;
  }

  async findAll(query: any = {}, actor?: any): Promise<any> {
    if (!hasCrmAdminJwtBypass(actor)) {
      throw new ForbiddenException(
        'Client list is restricted to administrators.',
      );
    }

    const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
    const limit = Math.min(
      Math.max(
        1,
        parseInt(String(query.pageSize ?? query.limit ?? 25), 10) || 25,
      ),
      200,
    );
    const search = String(query.search || '').trim();
    const criteria = parseCrmFiltersQuery(query.filters);
    const skip = (page - 1) * limit;

    let filter: Record<string, unknown> = {};
    if (search) {
      const re = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [
        { name: re },
        { email: re },
        { additionalEmails: re },
      ];
    }

    if (!this.canManageAllClients(actor)) {
      const actorId = this.getActorId(actor);
      if (!actorId) {
        return { data: [], total: 0 };
      }
      filter.assignedTo = new Types.ObjectId(actorId);
    }

    if (criteria.length) {
      filter = appendCrmListFilters(filter, criteria, 'clients');
    }

    const [data, total] = await Promise.all([
      this.clientModel
        .find(filter)
        .populate('organization')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.clientModel.countDocuments(filter),
    ]);

    return { data, total, page, pageSize: limit };
  }

  async findOne(id: string, actor?: any): Promise<Client | null> {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return null;
    const doc = await this.clientModel
      .findById(id)
      .populate('organization')
      .populate('associatedLeads', 'firstName lastName email status stage')
      .populate('associatedOrganizations', 'name industry')
      .populate('associatedContacts', 'firstName lastName email stage')
      .exec();
    if (!doc) return null;
    if (this.canManageAllClients(actor)) return doc;
    const actorId = this.getActorId(actor);
    if (!actorId) return null;
    const assigned = Array.isArray((doc as any).assignedTo) ? (doc as any).assignedTo : [];
    const hasAccess = assigned.some((u: any) => String(u) === actorId);
    return hasAccess ? doc : null;
  }

  async update(id: string, data: any, user?: any): Promise<Client | null> {
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return null;
    const existing = await this.clientModel
      .findById(id)
      .select(
        'assignedTo associatedLeads associatedOrganizations associatedContacts',
      )
      .exec();
    if (!existing) return null;

    const canManageAll = this.canManageAllClients(user);
    const actorId = this.getActorId(user);
    if (!canManageAll) {
      const assigned = Array.isArray((existing as any).assignedTo)
        ? (existing as any).assignedTo
        : [];
      const isAssigned = !!actorId && assigned.some((u: any) => String(u) === actorId);
      if (!isAssigned) {
        throw new ForbiddenException('You can only update clients assigned to you.');
      }
      if (data && Object.prototype.hasOwnProperty.call(data, 'assignedTo')) {
        delete data.assignedTo;
      }
    }

    const patch = this._cleanData({ ...(data || {}) });
    normalizeAdditionalEmailsPayload(patch);
    normalizeClientAssociations(patch);

    const updated = await this.clientModel
      .findByIdAndUpdate(id, patch, { new: true })
      .exec();
    if (updated) {
      const assocMap: Array<{
        key: (typeof CLIENT_ASSOC_KEYS)[number];
        toType: string;
        associationType: string;
      }> = [
        {
          key: 'associatedOrganizations',
          toType: 'organizations',
          associationType: 'client_company',
        },
        {
          key: 'associatedContacts',
          toType: 'contacts',
          associationType: 'client_contact',
        },
        {
          key: 'associatedLeads',
          toType: 'leads',
          associationType: 'client_lead',
        },
      ];
      for (const m of assocMap) {
        if (patch[m.key] === undefined) continue;
        const before = normalizeObjectIdArray((existing as any)[m.key]);
        const after = normalizeObjectIdArray(patch[m.key]);
        const beforeSet = new Set(before.map(String));
        const afterSet = new Set(after.map(String));
        const added = after.filter((x) => !beforeSet.has(String(x)));
        const removed = before.filter((x) => !afterSet.has(String(x)));
        if (added.length || removed.length) {
          void this.associationsService
            .mirrorArrayDiff({
              fromType: 'clients',
              fromId: id,
              toType: m.toType,
              associationType: m.associationType,
              added,
              removed,
            })
            .catch(() => undefined);
        }
      }

      const populated = await this.clientModel
        .findById(updated._id)
        .populate('organization')
        .populate('associatedLeads', 'firstName lastName email status stage')
        .populate('associatedOrganizations', 'name industry')
        .populate('associatedContacts', 'firstName lastName email stage')
        .exec();
      if (populated) await this.crmService.syncContactFromClientSafe(populated);
    }
    if (user && updated) {
      await new this.activityModel({
        type: 'Note',
        title: 'Client Updated',
        content: `Client details updated by ${user.firstName} ${user.lastName}`,
        relatedTo: updated._id,
        relatedType: 'Client',
        author: new Types.ObjectId(user.userId || user._id),
      }).save();
    }
    return updated;
  }

  async delete(id: string, deletedBy?: string): Promise<any> {
    return this.clientModel
      .findByIdAndUpdate(id, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }
}
