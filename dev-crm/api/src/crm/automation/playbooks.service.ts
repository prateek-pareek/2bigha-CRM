import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Playbook, PlaybookDocument } from '../schemas/playbook.schema';
import { CRMService } from '../core/crm.service';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import {
  buildPlaybookFromTemplate,
  listTemplateSummaries,
  PLAYBOOK_TEMPLATE_KEYS,
  type PlaybookTemplateKey,
} from './playbook-templates';
import { EmailTrackingService } from '../email/email-tracking.service';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

const SAFE_PATH = /^[a-zA-Z][a-zA-Z0-9_.]*$/;

@Injectable()
export class PlaybooksService {
  constructor(
    @InjectModel(Playbook.name, 'crmConnection')
    private playbookModel: Model<PlaybookDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
    private readonly emailTrackingService: EmailTrackingService,
  ) {}

  listTemplates() {
    return listTemplateSummaries();
  }

  async createFromTemplate(templateKey: string, userId?: string) {
    if (
      !PLAYBOOK_TEMPLATE_KEYS.includes(templateKey as PlaybookTemplateKey)
    ) {
      throw new BadRequestException('Unknown template');
    }
    const blueprint = buildPlaybookFromTemplate(
      templateKey as PlaybookTemplateKey,
    );
    return this.create(
      {
        ...blueprint,
        isTemplate: false,
        isActive: true,
        archived: false,
      },
      userId,
    );
  }

  async findAll(
    appliesTo?: string,
    filters?: {
      category?: string;
      team?: string;
      salesStage?: string;
      search?: string;
    },
  ) {
    const and: Record<string, unknown>[] = [
      { isActive: true },
      { archived: { $ne: true } },
      { isTemplate: { $ne: true } },
      { $or: [{ status: 'published' }, { status: { $exists: false } }] },
    ];
    if (appliesTo && appliesTo !== 'Any') {
      and.push({ $or: [{ appliesTo: 'Any' }, { appliesTo }] });
    }
    if (filters?.category?.trim()) {
      and.push({
        category: new RegExp(
          `^${this.escapeRegex(filters.category.trim())}$`,
          'i',
        ),
      });
    }
    if (filters?.team?.trim()) {
      and.push({
        team: new RegExp(`^${this.escapeRegex(filters.team.trim())}$`, 'i'),
      });
    }
    if (filters?.salesStage?.trim()) {
      and.push({ salesStages: filters.salesStage.trim() });
    }
    if (filters?.search?.trim()) {
      const rx = new RegExp(this.escapeRegex(filters.search.trim()), 'i');
      and.push({
        $or: [{ name: rx }, { description: rx }, { content: rx }],
      });
    }
    const rows = await this.playbookModel
      .find({ $and: and })
      .sort({ name: 1 })
      .lean()
      .exec();
    return rows.map((pb) => this.toPublicPlaybook(pb as unknown));
  }

  /** Include inactive, drafts, templates (admin). */
  async findAllAdmin(filters?: {
    category?: string;
    team?: string;
    salesStage?: string;
    search?: string;
    status?: string;
    includeArchived?: boolean;
  }) {
    const and: Record<string, unknown>[] = [];
    if (!filters?.includeArchived) {
      and.push({ archived: { $ne: true } });
    }
    if (filters?.status === 'draft') and.push({ status: 'draft' });
    else if (filters?.status === 'published') and.push({ status: 'published' });
    if (filters?.category?.trim()) {
      and.push({
        category: new RegExp(
          `^${this.escapeRegex(filters.category.trim())}$`,
          'i',
        ),
      });
    }
    if (filters?.team?.trim()) {
      and.push({
        team: new RegExp(`^${this.escapeRegex(filters.team.trim())}$`, 'i'),
      });
    }
    if (filters?.salesStage?.trim()) {
      and.push({ salesStages: filters.salesStage.trim() });
    }
    if (filters?.search?.trim()) {
      const rx = new RegExp(this.escapeRegex(filters.search.trim()), 'i');
      and.push({
        $or: [{ name: rx }, { description: rx }, { content: rx }],
      });
    }
    const q = and.length ? { $and: and } : {};
    const rows = await this.playbookModel.find(q).sort({ name: 1 }).lean().exec();
    return rows.map((pb) => this.toPublicPlaybook(pb as unknown));
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const pb = await this.playbookModel.findById(id).lean().exec();
    return pb ? this.toPublicPlaybook(pb as unknown) : null;
  }

  async create(dto: any, userId?: string) {
    const sections = this.normalizeSections(dto.sections);
    const runnerQuestions = this.normalizeRunnerQuestions(dto.runnerQuestions);
    const content =
      String(dto.content ?? '').trim() ||
      this.sectionsToPlain(sections) ||
      '';
    const doc = await this.playbookModel.create({
      name: String(dto.name || '').trim() || 'Untitled playbook',
      description: String(dto.description || '').trim(),
      content: this.normalizeContent(content),
      appliesTo: dto.appliesTo || 'Any',
      status: dto.status === 'draft' ? 'draft' : 'published',
      isTemplate: Boolean(dto.isTemplate),
      category: String(dto.category || '').trim(),
      team: String(dto.team || '').trim(),
      salesStages: this.normalizeStringArray(dto.salesStages),
      archived: Boolean(dto.archived),
      sections,
      runnerQuestions,
      recommendationTrigger:
        this.normalizeTrigger(dto.recommendationTrigger) ?? undefined,
      steps: [],
      isActive: dto.isActive !== false,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
    return this.toPublicPlaybook(doc.toObject() as unknown);
  }

  async update(id: string, dto: any) {
    if (!Types.ObjectId.isValid(id)) return null;
    const patch: Record<string, unknown> = {};
    if (dto.name != null) patch.name = String(dto.name).trim() || 'Untitled playbook';
    if (dto.description != null) patch.description = String(dto.description).trim();
    if (dto.appliesTo != null) patch.appliesTo = dto.appliesTo;
    if (dto.status != null) patch.status = dto.status === 'draft' ? 'draft' : 'published';
    if (dto.isTemplate != null) patch.isTemplate = Boolean(dto.isTemplate);
    if (dto.category != null) patch.category = String(dto.category).trim();
    if (dto.team != null) patch.team = String(dto.team).trim();
    if (dto.salesStages != null) patch.salesStages = this.normalizeStringArray(dto.salesStages);
    if (dto.archived != null) patch.archived = Boolean(dto.archived);
    if (dto.sections != null) {
      patch.sections = this.normalizeSections(dto.sections);
      patch.steps = [];
    }
    if (dto.runnerQuestions != null) {
      patch.runnerQuestions = this.normalizeRunnerQuestions(dto.runnerQuestions);
    }
    let unsetRec = false;
    if (dto.recommendationTrigger === null) {
      unsetRec = true;
    } else if (dto.recommendationTrigger !== undefined) {
      patch.recommendationTrigger = this.normalizeTrigger(
        dto.recommendationTrigger,
      );
    }
    if (dto.content != null) {
      patch.content = this.normalizeContent(dto.content);
      patch.steps = [];
    }
    if (dto.isActive != null) patch.isActive = Boolean(dto.isActive);

    if (dto.sections != null && dto.content == null) {
      patch.content = this.normalizeContent(
        this.sectionsToPlain(patch.sections as Playbook['sections']),
      );
    }

    const updateOp: Record<string, unknown> = {};
    if (Object.keys(patch).length) updateOp.$set = patch;
    if (unsetRec) {
      updateOp.$unset = { recommendationTrigger: 1 };
    }
    if (!updateOp.$set && !updateOp.$unset) {
      return this.findOne(id);
    }
    const doc = await this.playbookModel
      .findByIdAndUpdate(id, updateOp, { new: true })
      .lean()
      .exec();
    return doc ? this.toPublicPlaybook(doc as unknown) : null;
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.playbookModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
  }

  async clone(id: string, userId?: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const src = await this.playbookModel.findById(id).lean().exec();
    if (!src) return null;
    const pub = this.toPublicPlaybook(src as unknown) as Record<string, unknown>;
    const sections = this.normalizeSections(pub.sections).map((s) => ({
      ...s,
      id: randomUUID(),
    }));
    const runnerQuestions = this.normalizeRunnerQuestions(
      pub.runnerQuestions,
    ).map((q) => ({ ...q, id: randomUUID() }));
    const rec = this.normalizeTrigger(pub.recommendationTrigger);
    const doc = await this.playbookModel.create({
      name: `${String(pub.name || 'Playbook')} (copy)`,
      description: String(pub.description || ''),
      content: String(pub.content || ''),
      appliesTo: pub.appliesTo || 'Any',
      status: 'draft',
      isTemplate: false,
      category: String(pub.category || ''),
      team: String(pub.team || ''),
      salesStages: this.normalizeStringArray(pub.salesStages),
      archived: false,
      sections,
      runnerQuestions,
      ...(rec ? { recommendationTrigger: rec } : {}),
      steps: [],
      isActive: true,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    } as any);
    return this.toPublicPlaybook((doc as PlaybookDocument).toObject() as unknown);
  }

  async setArchived(id: string, archived: boolean) {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.playbookModel
      .findByIdAndUpdate(id, { $set: { archived } }, { new: true })
      .lean()
      .exec();
    return doc ? this.toPublicPlaybook(doc as unknown) : null;
  }

  async apply(
    playbookId: string,
    relatedTo: string,
    relatedType: string,
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(playbookId)) {
      throw new BadRequestException('Invalid playbook id');
    }
    const pb = await this.playbookModel.findById(playbookId).exec();
    if (!pb) throw new NotFoundException('Playbook not found');
    if (!pb.isActive) throw new BadRequestException('Playbook is inactive');
    if (pb.archived) throw new BadRequestException('Playbook is archived');
    if (pb.status === 'draft') {
      throw new BadRequestException('Playbook is still a draft');
    }

    const rt = (relatedType || '').trim();
    if (
      pb.appliesTo !== 'Any' &&
      pb.appliesTo !== rt
    ) {
      throw new BadRequestException(
        `This playbook is for ${pb.appliesTo} records only`,
      );
    }

    const text = this.resolveContent(pb.toObject() as unknown as Playbook);
    if (!text.trim()) {
      throw new BadRequestException('Playbook has no guidance content');
    }

    const act = await this.crmService.createActivity(
      {
        type: 'Note',
        title: `Playbook: ${pb.name}`,
        content: text,
        relatedTo,
        relatedType: rt,
        metadata: {
          playbookId: String(pb._id),
          playbookName: pb.name,
        },
      },
      user,
    );

    return { count: 1, activities: [act] };
  }

  async submitRunner(
    playbookId: string,
    body: {
      relatedTo: string;
      relatedType: string;
      answers: Record<string, unknown>;
      callOutcome: string;
      callOutcomeNote?: string;
    },
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(playbookId)) {
      throw new BadRequestException('Invalid playbook id');
    }
    const pb = await this.playbookModel.findById(playbookId).exec();
    if (!pb) throw new NotFoundException('Playbook not found');
    if (!pb.isActive) throw new BadRequestException('Playbook is inactive');
    if (pb.archived) throw new BadRequestException('Playbook is archived');
    if (pb.status === 'draft') {
      throw new BadRequestException('Publish the playbook before running it live');
    }

    const rt = (body.relatedType || '').trim();
    if (pb.appliesTo !== 'Any' && pb.appliesTo !== rt) {
      throw new BadRequestException(
        `This playbook is for ${pb.appliesTo} records only`,
      );
    }
    if (!Types.ObjectId.isValid(body.relatedTo)) {
      throw new BadRequestException('Invalid record id');
    }

    const questions = [...(pb.runnerQuestions || [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    const answers = body.answers || {};

    const lines: string[] = [`Playbook run: ${pb.name}`, ''];

    for (const q of questions) {
      const raw = answers[q.id];
      const display = this.formatAnswerForLog(q.answerType, raw);
      lines.push(`Q: ${q.prompt}`);
      lines.push(`A: ${display}`);
      lines.push('');

      if (q.crmFieldPath?.trim() && q.crmTarget === rt) {
        const coerced = this.coerceAnswerForCrm(q.answerType, raw);
        if (coerced !== undefined) {
          await this.patchCrmField(rt, body.relatedTo, q.crmFieldPath, coerced);
        }
      }
    }

    lines.push(`Call outcome: ${body.callOutcome || '—'}`);
    if (body.callOutcomeNote?.trim()) {
      lines.push(`Outcome notes: ${body.callOutcomeNote.trim()}`);
    }

    const act = await this.crmService.createActivity(
      {
        type: 'Call',
        title: `Playbook call: ${pb.name}`,
        content: lines.join('\n'),
        relatedTo: body.relatedTo,
        relatedType: rt,
        metadata: {
          playbookId: String(pb._id),
          playbookName: pb.name,
          callOutcome: body.callOutcome,
        },
      },
      user,
    );

    return { activity: act, updatedFields: true };
  }

  async recommendations(relatedTo: string, relatedType: string) {
    if (!Types.ObjectId.isValid(relatedTo)) {
      throw new BadRequestException('Invalid record id');
    }
    const rt = (relatedType || '').trim();
    const record = await this.loadRecord(rt, relatedTo);
    if (!record) throw new NotFoundException('Record not found');

    const and: Record<string, unknown>[] = [
      { isActive: true },
      { archived: { $ne: true } },
      { isTemplate: { $ne: true } },
      { $or: [{ status: 'published' }, { status: { $exists: false } }] },
      { recommendationTrigger: { $exists: true, $ne: null } },
    ];
    if (rt !== 'Any') {
      and.push({ $or: [{ appliesTo: 'Any' }, { appliesTo: rt }] });
    }

    const rows = await this.playbookModel
      .find({ $and: and })
      .sort({ name: 1 })
      .lean()
      .exec();
    const matched: typeof rows = [];
    for (const pb of rows) {
      const ok = await this.triggerMatches(
        (pb as Playbook).recommendationTrigger,
        rt,
        record,
        relatedTo,
      );
      if (ok) matched.push(pb);
    }

    return matched.map((pb) => {
      const pub = this.toPublicPlaybook(pb as unknown);
      return {
        _id: (pub as { _id?: string })._id,
        name: (pub as { name?: string }).name,
        description: (pub as { description?: string }).description,
        appliesTo: (pub as { appliesTo?: string }).appliesTo,
      };
    });
  }

  private async loadRecord(
    relatedType: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    if (relatedType === 'Deal') {
      const d = await this.dealModel.findById(id).lean().exec();
      return d as Record<string, unknown> | null;
    }
    if (relatedType === 'Contact') {
      const c = await this.contactModel.findById(id).lean().exec();
      return c as Record<string, unknown> | null;
    }
    if (relatedType === 'Lead') {
      const l = await this.leadModel.findById(id).lean().exec();
      return l as Record<string, unknown> | null;
    }
    return null;
  }

  private async triggerMatches(
    trigger: Playbook['recommendationTrigger'] | undefined,
    recordType: string,
    record: Record<string, unknown>,
    recordId: string,
  ): Promise<boolean> {
    if (!trigger) return false;
    if (trigger.recordType !== recordType) return false;

    const kind =
      (trigger as { triggerKind?: string }).triggerKind === 'email_engagement'
        ? 'email_engagement'
        : 'field';

    if (kind === 'email_engagement') {
      const eg = String(
        (trigger as { emailEngagement?: string }).emailEngagement || 'opened',
      ).trim();
      const modMap: Record<string, 'leads' | 'deals' | 'contacts' | null> = {
        Lead: 'leads',
        Deal: 'deals',
        Contact: 'contacts',
      };
      const mod = modMap[recordType];
      if (!mod) return false;
      const s = await this.emailTrackingService.summarizeEngagementForCrmRecord(
        recordId,
        mod,
      );
      if (eg === 'never_sent') return !s.anySend;
      if (eg === 'has_tracked_send') return s.anySend;
      if (eg === 'opened') return s.anyOpened;
      if (eg === 'not_opened') return s.anySend && !s.anyOpened;
      return false;
    }

    if (!trigger.fieldPath?.trim()) return false;
    const path = trigger.fieldPath.trim();
    if (path === '_email_engagement') return false;

    const cur = this.getFieldValue(record, path);
    const vals = (trigger.values || []).map(String);
    if (vals.length === 0) return false;

    if (trigger.operator === 'in') {
      if (Array.isArray(cur)) {
        const curSet = new Set(cur.map((x) => String(x).trim()));
        return vals.some((v) => curSet.has(v));
      }
      const str = cur == null ? '' : String(cur);
      return vals.includes(str);
    }

    if (Array.isArray(cur)) {
      const asStrings = cur.map((x) => String(x).trim());
      return vals.length === 1 && asStrings.includes(vals[0]);
    }
    const str = cur == null ? '' : String(cur);
    return str === vals[0];
  }

  private getFieldValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }

  private formatAnswerForLog(type: string, raw: unknown): string {
    if (raw == null) return '—';
    if (type === 'checkbox' && Array.isArray(raw)) {
      return raw.length ? raw.join(', ') : '—';
    }
    return String(raw);
  }

  private coerceAnswerForCrm(
    type: string,
    raw: unknown,
  ): unknown | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (type === 'checkbox') {
      if (Array.isArray(raw)) return raw.join(', ');
      return String(raw);
    }
    if (type === 'dropdown') return String(raw);
    return String(raw);
  }

  private async patchCrmField(
    relatedType: string,
    recordId: string,
    path: string,
    value: unknown,
  ) {
    const p = path.trim();
    if (!SAFE_PATH.test(p)) {
      throw new BadRequestException(`Invalid CRM field path: ${path}`);
    }
    if (relatedType === 'Deal') {
      await this.dealModel
        .findByIdAndUpdate(recordId, { $set: { [p]: value } })
        .exec();
      return;
    }
    if (relatedType === 'Contact') {
      await this.contactModel
        .findByIdAndUpdate(recordId, { $set: { [p]: value } })
        .exec();
      return;
    }
    if (relatedType === 'Lead') {
      await this.leadModel
        .findByIdAndUpdate(recordId, { $set: { [p]: value } })
        .exec();
    }
  }

  private escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }

  private normalizeTrigger(raw: unknown): Playbook['recommendationTrigger'] | undefined {
    if (raw == null || typeof raw !== 'object') return undefined;
    const t = raw as Record<string, unknown>;
    const recordType = String(t.recordType || '').trim();
    if (!['Deal', 'Contact', 'Lead'].includes(recordType)) return undefined;
    const triggerKind =
      t.triggerKind === 'email_engagement' ? 'email_engagement' : 'field';

    if (triggerKind === 'email_engagement') {
      const allowed = [
        'has_tracked_send',
        'opened',
        'not_opened',
        'never_sent',
      ];
      const emailEngagement = allowed.includes(String(t.emailEngagement || ''))
        ? String(t.emailEngagement)
        : 'opened';
      return {
        recordType,
        triggerKind: 'email_engagement',
        emailEngagement,
        fieldPath: '_email_engagement',
        operator: 'eq',
        values: [emailEngagement],
      };
    }

    const fieldPath = String(t.fieldPath || 'stage').trim();
    if (!fieldPath || fieldPath === '_email_engagement') return undefined;
    const operator = t.operator === 'in' ? 'in' : 'eq';
    let values: string[] = [];
    if (Array.isArray(t.values)) {
      values = t.values.map((v) => String(v).trim()).filter(Boolean);
    } else if (t.value != null && String(t.value).trim()) {
      values = [String(t.value).trim()];
    }
    if (values.length === 0) return undefined;
    return {
      recordType,
      triggerKind: 'field',
      fieldPath,
      operator,
      values,
    };
  }

  private normalizeSections(raw: unknown): Playbook['sections'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((s: any, i: number) => ({
        id: String(s?.id || randomUUID()),
        type: ['script', 'checklist', 'qa', 'notes'].includes(String(s?.type))
          ? String(s.type)
          : 'notes',
        order: Number.isFinite(s?.order) ? s.order : i,
        title: String(s?.title || '').trim(),
        html: String(s?.html ?? '<p></p>'),
      }))
      .sort((a, b) => a.order - b.order);
  }

  private normalizeRunnerQuestions(
    raw: unknown,
  ): Playbook['runnerQuestions'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((q: any, i: number) => ({
        id: String(q?.id || randomUUID()),
        order: Number.isFinite(q?.order) ? q.order : i,
        prompt: String(q?.prompt || '').trim(),
        answerType: ['text', 'dropdown', 'checkbox'].includes(
          String(q?.answerType),
        )
          ? String(q.answerType)
          : 'text',
        options: Array.isArray(q?.options)
          ? q.options.map((o: unknown) => String(o).trim()).filter(Boolean)
          : [],
        crmTarget: ['Deal', 'Contact', 'Lead'].includes(String(q?.crmTarget))
          ? String(q.crmTarget)
          : 'Deal',
        crmFieldPath: String(q?.crmFieldPath || '').trim(),
      }))
      .sort((a, b) => a.order - b.order);
  }

  private sectionsToPlain(sections: Playbook['sections']): string {
    if (!sections?.length) return '';
    return sections
      .map((s) => {
        const t = s.title?.trim();
        const plain = this.stripHtml(s.html || '');
        return t ? `${t}\n${plain}` : plain;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private stripHtml(html: string): string {
    return String(html)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toPublicPlaybook(pb: unknown) {
    if (!pb || typeof pb !== 'object') return pb;
    const raw = pb as Record<string, unknown> & {
      steps?: Playbook['steps'];
      content?: string;
      sections?: Playbook['sections'];
    };
    const { steps: _steps, ...rest } = raw;
    const content = this.resolveContent({
      content: raw.content,
      steps: raw.steps,
      sections: raw.sections,
    });
    const status =
      typeof raw.status === 'string' && raw.status ? raw.status : 'published';
    const archived = Boolean(raw.archived);
    return {
      ...rest,
      content,
      status,
      archived,
      sections: raw.sections || [],
      runnerQuestions: raw.runnerQuestions || [],
      recommendationTrigger: raw.recommendationTrigger ?? null,
      salesStages: raw.salesStages || [],
      category: raw.category ?? '',
      team: raw.team ?? '',
      isTemplate: Boolean(raw.isTemplate),
    };
  }

  private resolveContent(pb: {
    content?: string;
    steps?: Playbook['steps'];
    sections?: Playbook['sections'];
  }): string {
    const direct = String(pb.content ?? '').trim();
    if (direct) return String(pb.content ?? '');
    const fromSections = this.sectionsToPlain(pb.sections || []);
    if (fromSections) return fromSections;
    return this.legacyStepsToContent(pb.steps);
  }

  private legacyStepsToContent(
    steps: Playbook['steps'] | undefined,
  ): string {
    if (!Array.isArray(steps) || steps.length === 0) return '';
    const sorted = [...steps].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    return sorted
      .map((s, i) => {
        const title = String(s.title || `Section ${i + 1}`).trim();
        const body = String(s.body ?? '').trim();
        return body ? `${title}\n${body}` : title;
      })
      .join('\n\n');
  }

  private normalizeContent(raw: unknown): string {
    return String(raw ?? '').trimEnd();
  }
}
