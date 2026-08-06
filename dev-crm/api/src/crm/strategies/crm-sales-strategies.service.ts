import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isCrmTopAdmin } from '../shared/crm-admin-access.util';
import {
  CrmSalesStrategy,
  CrmSalesStrategyDocument,
  CrmSalesStrategyStatus,
} from '../schemas/crm-sales-strategy.schema';

type StrategyGoalInput = {
  title?: string;
  metric?: string;
  target?: string;
};

type StrategyWriteInput = {
  title?: string;
  summary?: string;
  objective?: string;
  status?: string;
  segments?: string[];
  motionTypes?: string[];
  icpNotes?: string[];
  channels?: string[];
  playbookSteps?: string[];
  keyMessages?: string[];
  goals?: StrategyGoalInput[];
  startDate?: string | null;
  endDate?: string | null;
  quotaTarget?: string;
  tags?: string[];
  ownerId?: string | null;
  authorizedUserIds?: string[];
};

@Injectable()
export class CrmSalesStrategiesService {
  constructor(
    @InjectModel(CrmSalesStrategy.name, 'crmConnection')
    private readonly model: Model<CrmSalesStrategyDocument>,
  ) {}

  private actorCrmUserId(actor?: any): string {
    const crmId = actor?.crmDbUser?._id;
    if (crmId) return String(crmId);
    return String(actor?.userId || actor?._id || '');
  }

  private isTopAdmin(actor?: any): boolean {
    return isCrmTopAdmin(actor, actor?.crmDbUser);
  }

  private canAccessRecord(
    doc: CrmSalesStrategyDocument,
    actor?: any,
  ): boolean {
    if (this.isTopAdmin(actor)) return true;
    const uid = this.actorCrmUserId(actor);
    if (!uid || !Types.ObjectId.isValid(uid)) return false;
    if (String(doc.createdBy) === uid) return true;
    if (doc.ownerId && String(doc.ownerId) === uid) return true;
    const allowed = (doc.authorizedUserIds || []).map((id) => String(id));
    return allowed.includes(uid);
  }

  private assertCanAccess(doc: CrmSalesStrategyDocument, actor?: any) {
    if (!this.canAccessRecord(doc, actor)) {
      throw new ForbiddenException(
        'You are not authorized to access this sales strategy',
      );
    }
  }

  private cleanStringList(values?: string[]): string[] {
    if (!Array.isArray(values)) return [];
    return [
      ...new Set(
        values
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .slice(0, 40),
      ),
    ];
  }

  private cleanGoals(goals?: StrategyGoalInput[]) {
    if (!Array.isArray(goals)) return [];
    return goals
      .map((g) => ({
        title: String(g?.title || '').trim(),
        metric: String(g?.metric || '').trim() || undefined,
        target: String(g?.target || '').trim() || undefined,
      }))
      .filter((g) => g.title)
      .slice(0, 20);
  }

  private cleanObjectIds(ids?: string[]): Types.ObjectId[] {
    if (!Array.isArray(ids)) return [];
    return [
      ...new Set(
        ids
          .map((id) => String(id || '').trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
  }

  private parseDate(value?: string | null): Date | undefined {
    if (value == null || value === '') return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private normalizeStatus(status?: string): CrmSalesStrategyStatus {
    const allowed = new Set(['draft', 'active', 'completed', 'archived']);
    const key = String(status || 'draft').trim().toLowerCase();
    return (allowed.has(key) ? key : 'draft') as CrmSalesStrategyStatus;
  }

  async list(
    actor: any,
    status?: string,
  ): Promise<CrmSalesStrategyDocument[]> {
    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') {
      filter.status = this.normalizeStatus(status);
    }

    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .exec();

    if (this.isTopAdmin(actor)) return docs;
    return docs.filter((doc) => this.canAccessRecord(doc, actor));
  }

  async findOne(
    id: string,
    actor: any,
  ): Promise<CrmSalesStrategyDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).exec();
    if (!doc) return null;
    this.assertCanAccess(doc, actor);
    return doc;
  }

  async create(
    data: StrategyWriteInput,
    actor: any,
  ): Promise<CrmSalesStrategyDocument> {
    const userId = this.actorCrmUserId(actor);
    const title = String(data.title || '').trim();
    if (!title) throw new Error('title is required');
    if (!Types.ObjectId.isValid(userId)) throw new Error('Invalid user');

    const ownerRaw = data.ownerId ? String(data.ownerId).trim() : '';
    const ownerId =
      ownerRaw && Types.ObjectId.isValid(ownerRaw)
        ? new Types.ObjectId(ownerRaw)
        : new Types.ObjectId(userId);

    let authorizedUserIds = this.cleanObjectIds(data.authorizedUserIds);
    // Always include creator so they retain access after saving ACL lists
    const creatorOid = new Types.ObjectId(userId);
    if (!authorizedUserIds.some((id) => String(id) === userId)) {
      authorizedUserIds = [creatorOid, ...authorizedUserIds];
    }

    return new this.model({
      title,
      summary: String(data.summary || '').trim() || undefined,
      objective: String(data.objective || '').trim() || undefined,
      status: this.normalizeStatus(data.status),
      segments: this.cleanStringList(data.segments),
      motionTypes: this.cleanStringList(data.motionTypes),
      icpNotes: this.cleanStringList(data.icpNotes),
      channels: this.cleanStringList(data.channels),
      playbookSteps: this.cleanStringList(data.playbookSteps),
      keyMessages: this.cleanStringList(data.keyMessages),
      goals: this.cleanGoals(data.goals),
      startDate: this.parseDate(data.startDate),
      endDate: this.parseDate(data.endDate),
      quotaTarget: String(data.quotaTarget || '').trim() || undefined,
      tags: this.cleanStringList(data.tags),
      authorizedUserIds,
      ownerId,
      createdBy: creatorOid,
    }).save();
  }

  async update(
    id: string,
    data: StrategyWriteInput,
    actor: any,
  ): Promise<CrmSalesStrategyDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Sales strategy not found');
    this.assertCanAccess(doc, actor);

    if (data.title !== undefined) {
      const title = String(data.title).trim();
      if (!title) throw new Error('title cannot be empty');
      doc.title = title;
    }
    if (data.summary !== undefined) {
      doc.summary = String(data.summary).trim() || undefined;
    }
    if (data.objective !== undefined) {
      doc.objective = String(data.objective).trim() || undefined;
    }
    if (data.status !== undefined) {
      doc.status = this.normalizeStatus(data.status);
    }
    if (data.segments !== undefined) {
      doc.segments = this.cleanStringList(data.segments);
    }
    if (data.motionTypes !== undefined) {
      doc.motionTypes = this.cleanStringList(data.motionTypes);
    }
    if (data.icpNotes !== undefined) {
      doc.icpNotes = this.cleanStringList(data.icpNotes);
    }
    if (data.channels !== undefined) {
      doc.channels = this.cleanStringList(data.channels);
    }
    if (data.playbookSteps !== undefined) {
      doc.playbookSteps = this.cleanStringList(data.playbookSteps);
    }
    if (data.keyMessages !== undefined) {
      doc.keyMessages = this.cleanStringList(data.keyMessages);
    }
    if (data.goals !== undefined) {
      doc.goals = this.cleanGoals(data.goals);
    }
    if (data.startDate !== undefined) {
      doc.startDate = this.parseDate(data.startDate);
    }
    if (data.endDate !== undefined) {
      doc.endDate = this.parseDate(data.endDate);
    }
    if (data.quotaTarget !== undefined) {
      doc.quotaTarget = String(data.quotaTarget).trim() || undefined;
    }
    if (data.tags !== undefined) {
      doc.tags = this.cleanStringList(data.tags);
    }
    if (data.ownerId !== undefined) {
      const ownerRaw = data.ownerId ? String(data.ownerId).trim() : '';
      doc.ownerId =
        ownerRaw && Types.ObjectId.isValid(ownerRaw)
          ? new Types.ObjectId(ownerRaw)
          : undefined;
    }
    if (data.authorizedUserIds !== undefined) {
      let authorizedUserIds = this.cleanObjectIds(data.authorizedUserIds);
      const creatorId = String(doc.createdBy);
      if (
        Types.ObjectId.isValid(creatorId) &&
        !authorizedUserIds.some((id) => String(id) === creatorId)
      ) {
        authorizedUserIds = [
          new Types.ObjectId(creatorId),
          ...authorizedUserIds,
        ];
      }
      doc.authorizedUserIds = authorizedUserIds;
    }

    return doc.save();
  }

  async remove(id: string, actor: any): Promise<void> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Sales strategy not found');
    this.assertCanAccess(doc, actor);
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    const uid = actor?.userId || actor?.id;
    if (uid && Types.ObjectId.isValid(String(uid))) {
      doc.deletedBy = new Types.ObjectId(String(uid));
    }
    await doc.save();
  }
}
