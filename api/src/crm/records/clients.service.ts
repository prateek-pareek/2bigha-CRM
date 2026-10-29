import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Client, ClientDocument } from '../schemas/client.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Model, Types } from 'mongoose';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import {
  CrmAssociation,
  CrmAssociationDocument,
} from '../associations/schemas/crm-association.schema';
import { normalizeEmail, normalizePhoneDigits } from '../shared/crm-person-identifiers.util';

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
import { hasCrmAdminFromDbUser, hasCrmAdminJwtBypass } from '../shared/crm-admin-access.util';
import { TwoBighaClientService } from './twobigha-client.service';
import {
  CLIENT_DUPLICATE_PROJECTION,
  CLIENT_DUPLICATE_REASON_LABELS,
  CLIENT_DUPLICATE_SCAN_LIMIT,
  ClientDuplicateIndex,
  ClientDuplicateMatch,
  ClientDuplicateReason,
  clientNameKey,
} from '../shared/crm-client-duplicate.util';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(CrmAssociation.name, 'crmConnection')
    private associationModel: Model<CrmAssociationDocument>,
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
    // CRM Super Admin / admin role (e.g. HRMS role "Employee" + CRM `admin:manage`) sees every client.
    if (hasCrmAdminJwtBypass(actor) || hasCrmAdminFromDbUser(actor?.crmDbUser)) return true;
    const perms = this.actorPermissions(actor);
    return (
      perms.includes('clients:read:all') ||
      perms.includes('clients:write') ||
      perms.includes('clients:edit') ||
      perms.includes('clients:delete')
    );
  }

  private async loadDuplicateIndex(): Promise<ClientDuplicateIndex> {
    const rows = await this.clientModel
      .find({}, CLIENT_DUPLICATE_PROJECTION)
      .limit(CLIENT_DUPLICATE_SCAN_LIMIT)
      .lean()
      .exec();
    return new ClientDuplicateIndex(rows as any[]);
  }

  /** Live duplicate check for the Add Client form. */
  async checkDuplicates(query: {
    name?: string;
    email?: string;
    phone?: string;
    whatsappNumber?: string;
    excludeId?: string;
  }): Promise<{ duplicates: ClientDuplicateMatch[] }> {
    const index = await this.loadDuplicateIndex();
    const duplicates = index.findMatches(
      {
        name: query.name,
        email: query.email,
        phone: query.phone,
        whatsappNumber: query.whatsappNumber,
      },
      query.excludeId ? String(query.excludeId) : '',
    );
    return { duplicates };
  }

  /**
   * Edits must not create a duplicate that the Add Client form would have
   * blocked. Only keys the patch actually changes are checked, so editing a
   * record that is already part of a duplicate group stays possible.
   */
  private async assertNoNewDuplicate(
    id: string,
    existing: any,
    patch: Record<string, any>,
    confirmDuplicate: boolean,
  ): Promise<void> {
    const touches = ['name', 'email', 'additionalEmails', 'phone', 'whatsappNumber'].some(
      (k) => patch[k] !== undefined,
    );
    if (!touches) return;
    const before = {
      name: existing.name,
      email: existing.email,
      additionalEmails: existing.additionalEmails,
      phone: existing.phone,
      whatsappNumber: existing.whatsappNumber,
    };
    const after = { ...before, ...patch };
    const changed = new Set<ClientDuplicateReason>();
    if (clientNameKey(before.name) !== clientNameKey(after.name)) changed.add('name');
    const emails = (c: any) =>
      [c.email, ...(c.additionalEmails || [])]
        .map((e) => normalizeEmail(e))
        .filter(Boolean)
        .sort()
        .join('|');
    if (emails(before) !== emails(after)) changed.add('email');
    const phones = (c: any) =>
      [c.phone, c.whatsappNumber]
        .map((p) => normalizePhoneDigits(p))
        .filter(Boolean)
        .sort()
        .join('|');
    if (phones(before) !== phones(after)) changed.add('phone');
    if (!changed.size) return;

    const duplicates = (await this.loadDuplicateIndex())
      .findMatches(after, id)
      .map((d) => ({ ...d, reasons: d.reasons.filter((r) => changed.has(r)) }))
      .filter((d) => d.reasons.length);
    if (!duplicates.length) return;

    const emailClash = duplicates.some((d) => d.reasons.includes('email'));
    if (!emailClash && confirmDuplicate) return;
    const first = duplicates[0];
    const why = first.reasons
      .map((r) => CLIENT_DUPLICATE_REASON_LABELS[r].toLowerCase())
      .join(', ');
    throw new ConflictException({
      statusCode: 409,
      code: 'CLIENT_DUPLICATE',
      message: emailClash
        ? `Another client already uses this email ("${first.name}"). Merge the records instead of duplicating it.`
        : `This change makes the client a possible duplicate of "${first.name}" (${why}).`,
      canOverride: !emailClash,
      duplicates,
    });
  }

  /**
   * Merge duplicate clients into `masterId` (admin only). Empty master fields
   * are back-filled, emails / assignees / associations are unioned, activities
   * and association edges are re-pointed, and the duplicates are soft-deleted
   * (their email is released so the unique index stays free).
   */
  async mergeClients(masterId: string, duplicateIds: string[], actor?: any) {
    if (!hasCrmAdminJwtBypass(actor)) {
      throw new ForbiddenException('Merging clients is restricted to administrators.');
    }
    if (!Types.ObjectId.isValid(masterId)) throw new BadRequestException('Invalid master id');
    const dupIds = [...new Set((duplicateIds || []).map(String))].filter(
      (d) => d !== masterId && Types.ObjectId.isValid(d),
    );
    if (!dupIds.length) throw new BadRequestException('At least one duplicate id required');

    const master: any = await this.clientModel.findById(masterId).lean().exec();
    if (!master) throw new NotFoundException('Master client not found');
    const dups: any[] = await this.clientModel
      .find({ _id: { $in: dupIds.map((d) => new Types.ObjectId(d)) } })
      .lean()
      .exec();
    if (dups.length !== dupIds.length) {
      throw new BadRequestException('One or more duplicate clients not found');
    }

    const patch: Record<string, unknown> = {};
    for (const f of ['phone', 'whatsappNumber', 'address', 'photoUrl', 'role', 'organization', 'sourceLead']) {
      if (master[f]) continue;
      const src = dups.find((d) => d[f]);
      if (src) patch[f] = src[f];
    }
    if (!master.twobighaUserId) {
      const src = dups.find((d) => d.twobighaUserId);
      if (src) {
        patch.twobighaUserId = src.twobighaUserId;
        patch.twobighaSyncStatus = src.twobighaSyncStatus;
        patch.twobighaSyncedAt = src.twobighaSyncedAt;
      }
    }

    const primary = master.email || dups.find((d) => d.email)?.email;
    if (primary && !master.email) patch.email = primary;
    const primaryKey = normalizeEmail(primary);
    const seen = new Set<string>();
    patch.additionalEmails = [master, ...dups]
      .flatMap((c) => [c.email, ...(c.additionalEmails || [])])
      .map((e) => String(e ?? '').trim())
      .filter((e) => {
        const k = normalizeEmail(e);
        if (!k || !k.includes('@') || k === primaryKey || seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    const union = (field: string) => [
      ...new Map(
        [master, ...dups]
          .flatMap((c) => c[field] || [])
          .map((x: any) => [String(x), x] as const),
      ).values(),
    ];
    for (const f of ['assignedTo', ...CLIENT_ASSOC_KEYS]) patch[f] = union(f);
    patch.customFields = Object.assign(
      {},
      ...dups.map((d) => d.customFields || {}),
      master.customFields || {},
    );

    const dupOids = dupIds.map((d) => new Types.ObjectId(d));
    const masterOid = new Types.ObjectId(masterId);
    const actorId = this.getActorId(actor);
    // Release the duplicates' unique email before the master adopts it.
    await this.clientModel.updateMany(
      { _id: { $in: dupOids } },
      { ...softDeleteUpdate(actorId || undefined), $unset: { email: '' } },
    );
    await this.clientModel.updateOne({ _id: masterOid }, { $set: patch });

    await this.activityModel.updateMany(
      { relatedTo: { $in: dupOids }, relatedType: 'Client' },
      { $set: { relatedTo: masterOid } },
    );
    await this.rewireClientEdges(dupOids, masterOid);

    const populated = await this.clientModel.findById(masterOid).populate('organization').exec();
    if (populated) await this.crmService.syncContactFromClientSafe(populated);
    if (actorId) {
      await new this.activityModel({
        type: 'Note',
        title: 'Clients Merged',
        content: `${dups.length} duplicate client record(s) merged into ${master.name}`,
        relatedTo: masterOid,
        relatedType: 'Client',
        author: new Types.ObjectId(actorId),
      }).save();
    }
    return { ok: true, masterId, removedIds: dupIds };
  }

  /** Duplicate clusters for the bulk "Manage duplicates" dialog (admin only). */
  async listDuplicateGroups(actor?: any) {
    if (!hasCrmAdminJwtBypass(actor)) {
      throw new ForbiddenException('Managing duplicate clients is restricted to administrators.');
    }
    const groups = (await this.loadDuplicateIndex()).groups();
    return { groups, total: groups.length };
  }

  /**
   * Merge many duplicate clusters in one call. Each group is merged
   * independently so one failure never blocks the rest.
   */
  async mergeDuplicateGroups(
    groups: Array<{ masterId: string; duplicateIds: string[] }>,
    actor?: any,
  ) {
    if (!hasCrmAdminJwtBypass(actor)) {
      throw new ForbiddenException('Merging clients is restricted to administrators.');
    }
    if (!Array.isArray(groups) || !groups.length) {
      throw new BadRequestException('At least one duplicate group is required');
    }
    const results: Array<{ masterId: string; merged: number; error?: string }> = [];
    for (const g of groups.slice(0, 500)) {
      try {
        const r = await this.mergeClients(g?.masterId, g?.duplicateIds || [], actor);
        results.push({ masterId: String(g.masterId), merged: r.removedIds.length });
      } catch (e: any) {
        results.push({ masterId: String(g?.masterId), merged: 0, error: e?.message || 'Merge failed' });
      }
    }
    return {
      ok: results.every((r) => !r.error),
      groupsMerged: results.filter((r) => !r.error).length,
      recordsMerged: results.reduce((n, r) => n + r.merged, 0),
      results,
    };
  }

  /** Re-point crm_associations edges from merged clients, dropping edges the master already has. */
  private async rewireClientEdges(dupOids: Types.ObjectId[], masterOid: Types.ObjectId) {
    for (const side of ['from', 'to'] as const) {
      const other = side === 'from' ? 'to' : 'from';
      const edges = await this.associationModel
        .find({ [`${side}Type`]: 'clients', [`${side}Id`]: { $in: dupOids } })
        .lean()
        .exec();
      for (const e of edges as any[]) {
        const clash = await this.associationModel
          .findOne({
            [`${side}Type`]: 'clients',
            [`${side}Id`]: masterOid,
            [`${other}Type`]: e[`${other}Type`],
            [`${other}Id`]: e[`${other}Id`],
            associationType: e.associationType,
          })
          .lean()
          .exec();
        if (clash || String(e[`${other}Id`]) === String(masterOid)) {
          await this.associationModel.deleteOne({ _id: e._id });
        } else {
          await this.associationModel.updateOne(
            { _id: e._id },
            { $set: { [`${side}Id`]: masterOid } },
          );
        }
      }
    }
  }

  async create(data: any, user?: any): Promise<Client> {
    const payload = this._cleanData({ ...(data || {}) });
    const confirmDuplicate = payload.confirmDuplicate === true;
    delete payload.confirmDuplicate;
    normalizeAdditionalEmailsPayload(payload);

    // Block silent duplicates: an email match can never be saved (unique index),
    // name/phone matches need an explicit "Create anyway" from the form.
    const duplicates = (await this.loadDuplicateIndex()).findMatches(payload, '');
    if (duplicates.length) {
      const emailClash = duplicates.some((d) => d.reasons.includes('email'));
      if (emailClash || !confirmDuplicate) {
        const first = duplicates[0];
        const why = first.reasons
          .map((r) => CLIENT_DUPLICATE_REASON_LABELS[r].toLowerCase())
          .join(', ');
        throw new ConflictException({
          statusCode: 409,
          code: 'CLIENT_DUPLICATE',
          message: emailClash
            ? `A client with this email already exists ("${first.name}"). Open that record instead of creating a duplicate.`
            : `Possible duplicate of "${first.name}" (${why}). Review the existing record or choose "Create anyway".`,
          canOverride: !emailClash,
          duplicates,
        });
      }
    }
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
    await this.healStaleTwoBighaClientStatus(client);
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

  /**
   * If we hold a 2bigha user id but status is not 'synced' (e.g. a retry hit
   * "User already exists" after the first create succeeded), verify with
   * getUser and correct the stored status.
   */
  private async healStaleTwoBighaClientStatus(client: {
    _id?: any;
    twobighaUserId?: string;
    twobighaSyncStatus?: string;
    twobighaSyncError?: string;
    twobighaSyncedAt?: Date;
  }): Promise<void> {
    if (!client.twobighaUserId?.trim()) return;
    if (client.twobighaSyncStatus === 'synced' || client.twobighaSyncStatus === 'mock') return;

    const verify = await this.twoBighaClientService.fetchUser(client.twobighaUserId);
    if (verify.status !== 'fetched' && verify.status !== 'mock') return;

    client.twobighaSyncStatus = 'synced';
    client.twobighaSyncError = undefined;
    client.twobighaSyncedAt = new Date();
    if (client._id) {
      await this.clientModel.updateOne(
        { _id: client._id },
        {
          $set: { twobighaSyncStatus: 'synced', twobighaSyncedAt: client.twobighaSyncedAt },
          $unset: { twobighaSyncError: '' },
        },
      );
    }
  }

  /**
   * Manually (re)sync a client to 2bigha as a platform user (adminCreateUser)
   * — the UI-driven counterpart to the automatic create-time sync. Used to
   * retry clients whose sync was 'skipped' (no email at create) or 'failed'.
   * Persists the resulting status back onto the record, exactly like create().
   */
  async resyncTwoBigha(id: string, actor?: any): Promise<any> {
    const client = await this.clientModel.findById(id).exec();
    if (!client) throw new NotFoundException('Client not found');

    // Already linked — verify with getUser instead of calling adminCreateUser again
    // (a duplicate create returns "User already exists" even though sync succeeded).
    if (client.twobighaUserId) {
      await this.healStaleTwoBighaClientStatus(client);
      if (client.twobighaSyncStatus === 'synced' || client.twobighaSyncStatus === 'mock') {
        await client.save();
        return {
          _id: String(client._id),
          twobighaUserId: client.twobighaUserId,
          twobighaSyncStatus: client.twobighaSyncStatus,
          twobighaSyncError: client.twobighaSyncError,
          twobighaSyncedAt: client.twobighaSyncedAt,
        };
      }
    }

    const syncResult = await this.twoBighaClientService.syncClientCreate({
      _id: String(client._id),
      name: client.name,
      email: client.email,
      phone: client.phone,
      whatsappNumber: client.whatsappNumber,
      address: client.address,
      role: client.role,
      existingTwobighaUserId: client.twobighaUserId,
    });
    client.twobighaUserId = syncResult.twobighaUserId ?? client.twobighaUserId;
    client.twobighaSyncStatus = syncResult.status;
    client.twobighaSyncError =
      syncResult.status === 'failed' || syncResult.status === 'skipped' ? syncResult.error : undefined;
    client.twobighaSyncedAt = syncResult.syncedAt;
    await this.healStaleTwoBighaClientStatus(client);
    await client.save();

    return {
      _id: String(client._id),
      twobighaUserId: client.twobighaUserId,
      twobighaSyncStatus: client.twobighaSyncStatus,
      twobighaSyncError: client.twobighaSyncError,
      twobighaSyncedAt: client.twobighaSyncedAt,
    };
  }

  /** Read a client's live 2bigha platform-user profile (getUser). */
  async fetchTwoBighaProfile(id: string): Promise<any> {
    const client = await this.clientModel.findById(id).exec();
    if (!client) throw new NotFoundException('Client not found');
    return this.twoBighaClientService.fetchUser(client.twobighaUserId);
  }

  private async resolveTwobighaUserId(id: string): Promise<string | null> {
    if (!id) return null;
    // If it's a 24-hex mongo id, find the client doc
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      const client = await this.clientModel.findById(id).exec();
      return client?.twobighaUserId || null;
    }
    // Otherwise it might already be the twobigha userId (e.g. UUID)
    return id;
  }

  async getClientMetaData(id: string): Promise<any> {
    const twobighaUserId = await this.resolveTwobighaUserId(id);
    return this.twoBighaClientService.getClientMetaData(twobighaUserId || undefined);
  }

  async getClientProperties(id: string, query: any = {}): Promise<any> {
    const twobighaUserId = await this.resolveTwobighaUserId(id);
    // Without a linked 2bigha user the upstream query has no clientId filter
    // and would return every platform property — scope to nothing instead.
    if (!twobighaUserId) {
      return {
        result: [],
        totalCount: 0,
        counts: { all: 0, pending: 0, approved: 0, rejected: 0, flagged: 0 },
        message: 'Client is not linked to a 2bigha user',
        clientLinked: false,
        STATUS_CODES: 200,
      };
    }
    return this.twoBighaClientService.getPropertiesByClientId({
      clientId: twobighaUserId,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 10,
      search: query.search,
      propertyCategory: query.propertyCategory,
      approvalStatus: query.approvalStatus,
      createdBy: query.createdBy,
    });
  }

  async getAllTwoBighaProperties(query: any = {}): Promise<any> {
    return this.twoBighaClientService.getPropertiesByClientId({
      clientId: query.clientId,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 10,
      search: query.search,
      propertyCategory: query.propertyCategory,
      approvalStatus: query.approvalStatus,
      createdBy: query.createdBy,
    });
  }

  async getClientInvoices(id: string): Promise<any> {
    const twobighaUserId = await this.resolveTwobighaUserId(id);
    return this.twoBighaClientService.getClientInvoices(twobighaUserId || '');
  }

  async getClientBillingAndUsageSummary(id: string): Promise<any> {
    const twobighaUserId = await this.resolveTwobighaUserId(id);
    return this.twoBighaClientService.getClientBillingAndUsageSummary(twobighaUserId || '');
  }

  async getClientFeatureRequests(id: string): Promise<any> {
    const twobighaUserId = await this.resolveTwobighaUserId(id);
    return this.twoBighaClientService.getClientFeatureRequests(twobighaUserId || '');
  }

  async getClientManagedProperties(id: string, query: any = {}): Promise<any> {
    const twobighaUserId = await this.resolveTwobighaUserId(id);
    return this.twoBighaClientService.getManagedPropertiesByClientId(
      twobighaUserId || '',
      query.page ? Number(query.page) : 1,
      query.limit ? Number(query.limit) : 10,
    );
  }

  /**
   * Sync-health rollup for the Settings → 2bigha Sync hub: per-status counts
   * plus the client rows (trimmed to sync-relevant fields).
   */
  async twoBighaSummary(): Promise<any> {
    const rows = await this.clientModel
      .find({}, 'name email role twobighaUserId twobighaSyncStatus twobighaSyncError twobighaSyncedAt')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()
      .exec();

    for (const row of rows) {
      await this.healStaleTwoBighaClientStatus(row as any);
    }

    const counts: Record<string, number> = {
      synced: 0,
      mock: 0,
      failed: 0,
      skipped: 0,
      not_synced: 0,
    };
    for (const r of rows) {
      const status = (r as any).twobighaSyncStatus || 'not_synced';
      counts[status] = (counts[status] || 0) + 1;
    }
    return { counts, total: rows.length, items: rows };
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

    const index = await this.loadDuplicateIndex();
    const annotated = data.map((doc: any) => {
      const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
      const duplicateInfo = index.infoFor(String(obj._id));
      return duplicateInfo ? { ...obj, duplicateInfo } : obj;
    });

    return {
      data: annotated,
      total,
      page,
      pageSize: limit,
      duplicateSummary: {
        records: index.duplicateRecordCount,
        groups: index.duplicateGroupCount,
      },
    };
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
    await this.healStaleTwoBighaClientStatus(doc);
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
        'name email additionalEmails phone whatsappNumber assignedTo associatedLeads associatedOrganizations associatedContacts',
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
    if (patch.status !== undefined) {
      const status = String(patch.status).toLowerCase();
      if (!['active', 'inactive', 'prospective'].includes(status)) {
        throw new BadRequestException('Status must be active, inactive or prospective');
      }
      patch.status = status;
    }
    const confirmDuplicate = patch.confirmDuplicate === true;
    delete patch.confirmDuplicate;
    normalizeAdditionalEmailsPayload(patch);
    normalizeClientAssociations(patch);
    await this.assertNoNewDuplicate(id, existing, patch, confirmDuplicate);

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
