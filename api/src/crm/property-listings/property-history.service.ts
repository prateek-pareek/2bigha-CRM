import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PropertyHistory,
  PropertyHistoryDocument,
  PropertyHistorySource,
} from './schemas/property-history.schema';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import { PmActivityLogService } from '../subscriptions/pm-activity-log.service';

export const PROPERTY_AUDIT_MODULE = 'property-management';

/** Ignore a repeated 2bigha stage sync for the same stage within this window (parallel page loads). */
const SYNC_DEDUPE_MS = 60_000;

export type PropertyHistoryInput = {
  propertyKey: string;
  propertyTitle?: string;
  /** Machine code, e.g. `pm_legal_started`. */
  action: string;
  label: string;
  detail?: string;
  fromStage?: string;
  toStage?: string;
  source?: PropertyHistorySource;
  meta?: Record<string, unknown>;
  /** Short verb for the audit log filter (assign, start, complete, schedule, review, note, sync, …). */
  auditAction?: string;
  /** Keep the entry in the property timeline only (e.g. the first stage snapshot). */
  skipAudit?: boolean;
  /** Actor label when there is no CRM user (e.g. "2bigha"). */
  actorName?: string;
};

export type PropertyHistoryEntry = {
  id: string;
  action: string;
  label: string;
  detail?: string;
  fromStage?: string;
  toStage?: string;
  source: PropertyHistorySource;
  actorName?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

function cleanStage(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

export function actorLabel(user?: any): string | undefined {
  if (!user) return undefined;
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.fullName ||
    user.email ||
    undefined
  );
}

@Injectable()
export class PropertyHistoryService {
  private readonly logger = new Logger(PropertyHistoryService.name);

  constructor(
    @InjectModel(PropertyHistory.name, 'crmConnection')
    private readonly historyModel: Model<PropertyHistoryDocument>,
    @InjectModel(AuditLog.name, 'crmConnection')
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly pmActivityLog: PmActivityLogService,
  ) {}

  /**
   * Record one event in the property timeline and mirror it into the CRM audit log
   * (Settings → Audit, module "property-management"). Never throws — history must not
   * block the PM action that triggered it.
   */
  async record(input: PropertyHistoryInput, user?: any): Promise<void> {
    const key = String(input.propertyKey || '').trim();
    if (!key) return;
    const actorId = this.userOid(user);
    const actorName = actorLabel(user) || input.actorName || (input.source === 'twobigha' ? '2bigha' : 'System');
    const fromStage = cleanStage(input.fromStage);
    const toStage = cleanStage(input.toStage);

    try {
      await this.historyModel.create({
        propertyKey: key,
        propertyTitle: input.propertyTitle,
        action: input.action,
        label: input.label,
        detail: input.detail,
        fromStage,
        toStage,
        source: input.source || 'crm',
        actorId,
        actorName,
        meta: input.meta,
      });
    } catch (err: any) {
      this.logger.warn(`property history write failed for ${key}: ${err?.message || err}`);
      return;
    }

    if (input.skipAudit) return;
    try {
      const changes: Record<string, unknown> = {};
      if (fromStage !== toStage && (fromStage || toStage)) {
        changes.stage = { old: fromStage ?? null, new: toStage ?? null };
      }
      if (input.detail) changes.detail = input.detail;
      for (const [k, v] of Object.entries(input.meta || {})) {
        if (v == null || typeof v === 'object') continue;
        changes[k] = v;
      }
      const name = input.propertyTitle ? ` · ${input.propertyTitle}` : '';
      const stagePart =
        fromStage && toStage && fromStage !== toStage
          ? ` (${fromStage} → ${toStage})`
          : !fromStage && toStage && input.source === 'twobigha'
            ? ` (${toStage})`
            : '';
      await this.auditModel.create({
        user: actorId,
        actorName,
        action: input.auditAction || 'update',
        module: PROPERTY_AUDIT_MODULE,
        entityId: Types.ObjectId.isValid(key) && /^[a-f0-9]{24}$/i.test(key) ? new Types.ObjectId(key) : undefined,
        entityKey: key,
        entityName: input.propertyTitle,
        description: `${actorName} — ${input.label}${stagePart}${name}`,
        changes: Object.keys(changes).length ? changes : undefined,
      });
    } catch (err: any) {
      this.logger.warn(`property audit write failed for ${key}: ${err?.message || err}`);
    }
  }

  async list(propertyKey: string, limit = 100): Promise<PropertyHistoryEntry[]> {
    const key = String(propertyKey || '').trim();
    if (!key) return [];
    const cap = Math.min(Math.max(limit, 1), 300);
    const [rows, legacy] = await Promise.all([
      this.historyModel
        .find({ propertyKey: key })
        .sort({ createdAt: -1, _id: -1 })
        .limit(cap)
        .lean()
        .exec(),
      this.legacyPmActivity(key, cap),
    ]);
    const entries: PropertyHistoryEntry[] = rows.map((r: any) => ({
      id: String(r._id),
      action: r.action,
      label: r.label,
      detail: r.detail,
      fromStage: r.fromStage,
      toStage: r.toStage,
      source: r.source,
      actorName: r.actorName,
      createdAt: new Date(r.createdAt || Date.now()).toISOString(),
      meta: r.meta,
    }));
    return [...entries, ...legacy]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, cap);
  }

  /**
   * Older PM events (payments, 2bigha sync, property created) logged by PmActivityLogService.
   * That log only links CRM-stored listings (ObjectId ids), so live `pm_…` ids have none.
   */
  private async legacyPmActivity(key: string, limit: number): Promise<PropertyHistoryEntry[]> {
    if (!/^[a-f0-9]{24}$/i.test(key)) return [];
    try {
      const rows = await this.pmActivityLog.listForProperty(key, limit);
      return rows.map((r) => ({
        id: `pm-activity-${r.id}`,
        action: String(r.eventType || 'pm_event'),
        label: r.title,
        detail: r.content || undefined,
        source: 'crm' as const,
        actorName: 'System',
        createdAt: r.createdAt,
      }));
    } catch {
      return [];
    }
  }

  /** Most recent PM stage we know of for this property (from any recorded event). */
  async lastStage(propertyKey: string): Promise<string | undefined> {
    const key = String(propertyKey || '').trim();
    if (!key) return undefined;
    const row = await this.historyModel
      .findOne({ propertyKey: key, toStage: { $exists: true, $nin: [null, ''] } })
      .sort({ createdAt: -1, _id: -1 })
      .select('toStage')
      .lean()
      .exec()
      .catch(() => null);
    return cleanStage((row as any)?.toStage);
  }

  /**
   * Compare 2bigha's current stage with the last recorded one. The first sighting is stored
   * as a timeline baseline (not audited); a later mismatch means the stage was changed
   * outside the CRM, so it is recorded (and audited) as a 2bigha change.
   */
  async syncStage(propertyKey: string, currentStage: unknown, propertyTitle?: string): Promise<void> {
    const key = String(propertyKey || '').trim();
    const stage = cleanStage(currentStage);
    if (!key || !stage) return;
    try {
      const last = await this.lastStage(key);
      if (last === stage) return;

      const recent = await this.historyModel
        .findOne({
          propertyKey: key,
          toStage: stage,
          createdAt: { $gte: new Date(Date.now() - SYNC_DEDUPE_MS) },
        })
        .select('_id')
        .lean()
        .exec();
      if (recent) return;

      if (!last) {
        await this.record({
          propertyKey: key,
          propertyTitle,
          action: 'stage_baseline',
          label: `Status recorded: ${stage}`,
          detail: 'First status seen by the CRM — history starts here.',
          toStage: stage,
          source: 'twobigha',
          skipAudit: true,
        });
        return;
      }
      await this.record({
        propertyKey: key,
        propertyTitle,
        action: 'stage_synced',
        label: 'Stage changed in 2bigha',
        fromStage: last,
        toStage: stage,
        source: 'twobigha',
        auditAction: 'sync',
      });
    } catch (err: any) {
      this.logger.warn(`property stage sync failed for ${key}: ${err?.message || err}`);
    }
  }

  async addNote(propertyKey: string, text: string, user: any, propertyTitle?: string) {
    const body = String(text || '').trim();
    if (!body) throw new BadRequestException('Note text is required');
    if (body.length > 2000) throw new BadRequestException('Note is too long (max 2000 characters)');
    await this.record(
      {
        propertyKey,
        propertyTitle,
        action: 'note',
        label: 'Note added',
        detail: body,
        source: 'manual',
        auditAction: 'note',
      },
      user,
    );
    return this.list(propertyKey);
  }

  private userOid(user?: any): Types.ObjectId | undefined {
    const raw = String(user?.userId || user?._id || user?.id || '');
    return /^[a-f0-9]{24}$/i.test(raw) ? new Types.ObjectId(raw) : undefined;
  }
}
