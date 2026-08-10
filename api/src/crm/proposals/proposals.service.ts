import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmProposal, ProposalDocument } from '../schemas/proposal.schema';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import {
  proposalStageFromStatus,
  proposalStatusFromStage,
} from './proposal-pipeline.util';
import {
  contractStageFromStatus,
  contractStatusFromStage,
} from './contract-pipeline.util';

@Injectable()
export class ProposalsService {
  constructor(
    @InjectModel(CrmProposal.name, 'crmConnection')
    private proposalModel: Model<ProposalDocument>,
    @InjectModel(Pipeline.name, 'crmConnection')
    private pipelineModel: Model<PipelineDocument>,
  ) {}

  private pipelineTypeForKind(kind?: string | null): 'proposals' | 'contracts' {
    return kind === 'contract' ? 'contracts' : 'proposals';
  }

  private statusFromStage(kind: string | undefined | null, stage?: string | null) {
    return kind === 'contract'
      ? contractStatusFromStage(stage)
      : proposalStatusFromStage(stage);
  }

  private stageFromStatus(kind: string | undefined | null, status?: string | null) {
    return kind === 'contract'
      ? contractStageFromStatus(status)
      : proposalStageFromStatus(status);
  }

  private async resolveDefaultPipeline(
    kind?: string | null,
  ): Promise<{
    pipelineId: Types.ObjectId;
    stage: string;
  } | null> {
    const type = this.pipelineTypeForKind(kind);
    const pipelines = await this.pipelineModel
      .find({ type })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean()
      .exec();
    const pipe = pipelines[0];
    if (!pipe?._id) return null;
    const stages = Array.isArray(pipe.stages) ? pipe.stages : [];
    const defaultStage =
      stages.find((s) => s?.isDefault)?.name ||
      [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.name ||
      'Draft';
    return {
      pipelineId: pipe._id as Types.ObjectId,
      stage: String(defaultStage),
    };
  }

  private async resolveStageForPipeline(
    pipelineId: string | Types.ObjectId | undefined,
    preferredStage?: string | null,
    fallbackStatus?: string | null,
    kind?: string | null,
  ): Promise<{ pipeline?: Types.ObjectId; stage?: string }> {
    if (!pipelineId || !Types.ObjectId.isValid(String(pipelineId))) {
      return {};
    }
    const expectedType = this.pipelineTypeForKind(kind);
    const pipe = await this.pipelineModel.findById(pipelineId).lean().exec();
    if (!pipe || pipe.type !== expectedType) return {};
    const stages = Array.isArray(pipe.stages) ? pipe.stages : [];
    const names = new Set(stages.map((s) => String(s.name || '').trim()).filter(Boolean));
    const preferred = String(preferredStage || '').trim();
    if (preferred && names.has(preferred)) {
      return { pipeline: pipe._id as Types.ObjectId, stage: preferred };
    }
    const fromStatus = this.stageFromStatus(kind, fallbackStatus);
    if (fromStatus && names.has(fromStatus)) {
      return { pipeline: pipe._id as Types.ObjectId, stage: fromStatus };
    }
    const defaultStage =
      stages.find((s) => s?.isDefault)?.name ||
      [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.name;
    return {
      pipeline: pipe._id as Types.ObjectId,
      stage: defaultStage ? String(defaultStage) : undefined,
    };
  }

  async findAll(query: {
    kind?: string;
    status?: string;
    search?: string;
    pipeline?: string;
    stage?: string;
  }): Promise<ProposalDocument[]> {
    const filter: Record<string, unknown> = {};
    if (query.kind) filter.kind = query.kind;
    if (query.status) filter.status = query.status;
    if (query.pipeline && Types.ObjectId.isValid(query.pipeline)) {
      filter.pipeline = new Types.ObjectId(query.pipeline);
    }
    if (query.stage?.trim()) filter.stage = query.stage.trim();
    const q = query.search?.trim();
    if (q) {
      filter.$or = [
        { title: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { clientName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { clientEmail: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
    return this.proposalModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }

  async findOne(id: string): Promise<ProposalDocument> {
    const doc = await this.proposalModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .exec();
    if (!doc) throw new NotFoundException('Proposal not found');
    return doc;
  }

  async create(
    data: Partial<CrmProposal> & {
      relatedTo?: string;
      pipeline?: string;
      stage?: string;
    },
    userId: string,
  ): Promise<ProposalDocument> {
    const payload: Record<string, unknown> = {
      title: data.title || 'Untitled',
      kind:
        data.kind === 'quotation'
          ? 'quotation'
          : data.kind === 'cv'
            ? 'cv'
            : data.kind === 'contract'
              ? 'contract'
              : 'proposal',
      issuerProfile:
        data.issuerProfile === 'freelancer' ? 'freelancer' : 'agency',
      status: data.status || 'draft',
      clientName: data.clientName ?? '',
      clientEmail: data.clientEmail ?? '',
      subject: data.subject ?? '',
      bodyHtml: data.bodyHtml ?? '',
      currency: data.currency ?? 'INR',
      totalAmount: data.totalAmount,
      validityUntil: data.validityUntil,
      meta: data.meta,
      createdBy: new Types.ObjectId(userId),
    };
    if (
      data.relatedModule &&
      data.relatedTo &&
      Types.ObjectId.isValid(String(data.relatedTo))
    ) {
      payload.relatedModule = data.relatedModule;
      payload.relatedTo = new Types.ObjectId(String(data.relatedTo));
    }

    let pipeResolved = await this.resolveStageForPipeline(
      data.pipeline,
      data.stage,
      String(payload.status),
      String(payload.kind),
    );
    if (!pipeResolved.pipeline) {
      const fallback = await this.resolveDefaultPipeline(String(payload.kind));
      if (fallback) {
        pipeResolved = {
          pipeline: fallback.pipelineId,
          stage: data.stage?.trim() || fallback.stage,
        };
      }
    }
    if (pipeResolved.pipeline) {
      payload.pipeline = pipeResolved.pipeline;
      payload.stage = pipeResolved.stage;
      const mapped = this.statusFromStage(String(payload.kind), pipeResolved.stage);
      if (mapped) payload.status = mapped;
    } else if (!payload.stage && payload.status) {
      payload.stage = this.stageFromStatus(String(payload.kind), String(payload.status));
    }

    const doc = new this.proposalModel(payload);
    return doc.save();
  }

  async update(
    id: string,
    data: Partial<CrmProposal> & {
      relatedTo?: string | null;
      pipeline?: string | null;
      stage?: string | null;
    },
  ): Promise<ProposalDocument> {
    const payload: Record<string, unknown> = { ...data };
    delete payload.createdBy;
    if (data.issuerProfile !== undefined) {
      payload.issuerProfile =
        data.issuerProfile === 'freelancer' ? 'freelancer' : 'agency';
    }
    if (data.relatedTo === null || data.relatedTo === '') {
      payload.relatedModule = undefined;
      payload.relatedTo = undefined;
    } else if (
      data.relatedTo &&
      data.relatedModule &&
      Types.ObjectId.isValid(String(data.relatedTo))
    ) {
      payload.relatedTo = new Types.ObjectId(String(data.relatedTo));
    }

    const existing = await this.proposalModel.findById(id).lean().exec();
    if (!existing) throw new NotFoundException('Proposal not found');

    const nextKind =
      data.kind !== undefined ? String(data.kind) : String(existing.kind || 'proposal');
    const nextPipelineId =
      data.pipeline === null || data.pipeline === ''
        ? undefined
        : data.pipeline !== undefined
          ? data.pipeline
          : existing.pipeline
            ? String(existing.pipeline)
            : undefined;
    const nextStage =
      data.stage !== undefined ? data.stage : existing.stage || undefined;
    const nextStatus =
      data.status !== undefined ? data.status : existing.status || 'draft';

    if (data.pipeline === null || data.pipeline === '') {
      payload.pipeline = null;
      if (data.stage === null || data.stage === '') payload.stage = null;
    } else if (nextPipelineId || data.stage !== undefined) {
      const resolved = await this.resolveStageForPipeline(
        nextPipelineId,
        nextStage != null ? String(nextStage) : undefined,
        String(nextStatus),
        nextKind,
      );
      if (resolved.pipeline) {
        payload.pipeline = resolved.pipeline;
        payload.stage = resolved.stage;
        const mapped = this.statusFromStage(nextKind, resolved.stage);
        if (mapped && data.status === undefined) payload.status = mapped;
      } else {
        const fallback = await this.resolveDefaultPipeline(nextKind);
        if (fallback) {
          payload.pipeline = fallback.pipelineId;
          payload.stage =
            (nextStage != null && String(nextStage).trim()) || fallback.stage;
          const mapped = this.statusFromStage(nextKind, String(payload.stage));
          if (mapped && data.status === undefined) payload.status = mapped;
        }
      }
    } else if (data.status !== undefined && data.stage === undefined) {
      payload.stage = this.stageFromStatus(nextKind, String(data.status));
    }

    const doc = await this.proposalModel
      .findByIdAndUpdate(id, { $set: payload }, { new: true })
      .populate('createdBy', 'firstName lastName email')
      .exec();
    if (!doc) throw new NotFoundException('Proposal not found');
    return doc;
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const res = await this.proposalModel
      .findByIdAndUpdate(id, softDeleteUpdate(), { new: true })
      .exec();
    if (!res) throw new NotFoundException('Proposal not found');
    return { ok: true };
  }
}
