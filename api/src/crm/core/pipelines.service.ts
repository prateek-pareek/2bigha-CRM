import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { DEFAULT_PROPOSAL_PIPELINE_STAGES } from '../proposals/proposal-pipeline.util';
import { DEFAULT_CONTRACT_PIPELINE_STAGES } from '../proposals/contract-pipeline.util';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

export type CrmPipelineType =
  | 'leads'
  | 'proposals'
  | 'quotations'
  | 'contracts'
  | 'legal';

@Injectable()
export class PipelinesService implements OnModuleInit {
  private readonly logger = new Logger(PipelinesService.name);

  constructor(
    @InjectModel(Pipeline.name, 'crmConnection')
    private pipelineModel: Model<PipelineDocument>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefault();
    } catch (err) {
      this.logger.warn(
        `Skipped default pipeline seed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async create(data: any): Promise<Pipeline> {
    return new this.pipelineModel(data).save();
  }

  async findAll(
    type?: CrmPipelineType,
    leadVertical?: 'property_listing' | 'property_management',
  ): Promise<Pipeline[]> {
    const filter: Record<string, unknown> = {};
    if (type === 'leads') {
      filter.type = 'leads';
      // Legacy lead pipelines created before this field existed have no leadVertical set;
      // treat those as 'property_listing' so they don't silently disappear from either board.
      if (leadVertical === 'property_management') {
        filter.leadVertical = 'property_management';
      } else if (leadVertical === 'property_listing') {
        filter.$or = [
          { leadVertical: 'property_listing' },
          { leadVertical: { $exists: false } },
          { leadVertical: null },
        ];
      }
    } else if (type === 'proposals') {
      filter.type = 'proposals';
    } else if (type === 'quotations') {
      filter.type = 'quotations';
    } else if (type === 'contracts') {
      filter.type = 'contracts';
    } else if (type === 'legal') {
      filter.type = 'legal';
    }
    return this.pipelineModel.find(filter).sort({ createdAt: 1 }).exec();
  }

  async findOne(id: string): Promise<Pipeline | null> {
    return this.pipelineModel.findById(id).exec();
  }

  async update(id: string, data: any): Promise<Pipeline | null> {
    return this.pipelineModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<any> {
    return this.pipelineModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
  }

  async seedDefault() {
    // Leads split into two independently-customizable verticals: Property Listing and
    // Property Management. Each gets its own seeded starter pipeline (stage names below
    // are just a starting point — admins can rename/add/remove stages freely from
    // CRM > Settings > Pipelines, same as any other pipeline).
    const listingLeadCount = await this.pipelineModel.countDocuments({
      type: 'leads',
      leadVertical: 'property_listing',
    });
    if (listingLeadCount === 0) {
      await this.create({
        name: 'Property Listing Pipeline',
        type: 'leads',
        leadVertical: 'property_listing',
        categoryType: 'generic',
        isDefault: true,
        stages: [
          { name: 'New', probability: 5, order: 1, isDefault: true },
          { name: 'Contacted', probability: 15, order: 2, isDefault: false },
          { name: 'Site Visit Scheduled', probability: 35, order: 3, isDefault: false },
          { name: 'Offer Made', probability: 60, order: 4, isDefault: false },
          { name: 'Negotiation', probability: 80, order: 5, isDefault: false },
          { name: 'Closed Won', probability: 100, order: 6, isDefault: false },
          { name: 'Closed Lost', probability: 0, order: 7, isDefault: false },
        ],
      });
    }

    const managementLeadCount = await this.pipelineModel.countDocuments({
      type: 'leads',
      leadVertical: 'property_management',
    });
    if (managementLeadCount === 0) {
      await this.create({
        name: 'Property Management Pipeline',
        type: 'leads',
        leadVertical: 'property_management',
        categoryType: 'generic',
        isDefault: true,
        stages: [
          { name: 'New', probability: 5, order: 1, isDefault: true },
          { name: 'Contacted', probability: 15, order: 2, isDefault: false },
          { name: 'Agreement Sent', probability: 40, order: 3, isDefault: false },
          { name: 'Agreement Signed', probability: 70, order: 4, isDefault: false },
          { name: 'Onboarded', probability: 100, order: 5, isDefault: false },
          { name: 'Disqualified', probability: 0, order: 6, isDefault: false },
        ],
      });
    }

    const proposalCount = await this.pipelineModel.countDocuments({
      type: 'proposals',
    });
    if (proposalCount === 0) {
      await this.create({
        name: 'Standard Proposals',
        type: 'proposals',
        categoryType: 'it_consulting',
        isDefault: true,
        stages: DEFAULT_PROPOSAL_PIPELINE_STAGES.map((s) => ({ ...s })),
      });
    }

    const quotationCount = await this.pipelineModel.countDocuments({
      type: 'quotations',
    });
    if (quotationCount === 0) {
      await this.create({
        name: 'Standard Quotations',
        type: 'quotations',
        categoryType: 'it_consulting',
        isDefault: true,
        stages: DEFAULT_PROPOSAL_PIPELINE_STAGES.map((s) => ({ ...s })),
      });
    }

    const contractCount = await this.pipelineModel.countDocuments({
      type: 'contracts',
    });
    if (contractCount === 0) {
      await this.create({
        name: 'Standard Contracts',
        type: 'contracts',
        categoryType: 'it_consulting',
        isDefault: true,
        stages: DEFAULT_CONTRACT_PIPELINE_STAGES.map((s) => ({ ...s })),
      });
    }

    const legalCount = await this.pipelineModel.countDocuments({
      type: 'legal',
    });
    if (legalCount === 0) {
      await this.create({
        name: 'Legal Case Pipeline',
        type: 'legal',
        categoryType: 'it_consulting',
        isDefault: true,
        stages: [
          { name: 'Intake', probability: 10, order: 1, isDefault: true },
          {
            name: 'Document Review',
            probability: 30,
            order: 2,
            isDefault: false,
          },
          { name: 'Drafting', probability: 50, order: 3, isDefault: false },
          { name: 'Negotiation', probability: 70, order: 4, isDefault: false },
          {
            name: 'Signed / Closed',
            probability: 100,
            order: 5,
            isDefault: false,
          },
          { name: 'Terminated', probability: 0, order: 6, isDefault: false },
        ],
      });
    }

    const socialRetype = await this.pipelineModel.updateMany(
      {
        type: { $ne: 'leads' },
        name: {
          $regex: /^\s*(linkedin|twitter|x\b|threads?)\s*$/i,
        },
      },
      { $set: { type: 'leads' } },
    );
    if (socialRetype.modifiedCount > 0) {
      this.logger.log(
        `Retyped ${socialRetype.modifiedCount} social pipeline(s) to type=leads`,
      );
    }
  }
}
