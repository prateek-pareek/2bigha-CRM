import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { DEFAULT_PLATFORM_OPPORTUNITY_STAGES } from '../shared/platform-opportunity-pipeline.util';
import { DEFAULT_PROPOSAL_PIPELINE_STAGES } from '../proposals/proposal-pipeline.util';
import { DEFAULT_CONTRACT_PIPELINE_STAGES } from '../proposals/contract-pipeline.util';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

export type CrmPipelineType =
  | 'deals'
  | 'leads'
  | 'platform_opportunities'
  | 'proposals'
  | 'contracts';

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

  async findAll(type?: CrmPipelineType): Promise<Pipeline[]> {
    const filter: Record<string, unknown> = {};
    if (type === 'deals') {
      filter.$or = [{ type: 'deals' }, { type: { $exists: false } }];
    } else if (type === 'leads') {
      filter.type = 'leads';
    } else if (type === 'platform_opportunities') {
      filter.type = 'platform_opportunities';
    } else if (type === 'proposals') {
      filter.type = 'proposals';
    } else if (type === 'contracts') {
      filter.type = 'contracts';
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
    const dealCount = await this.pipelineModel.countDocuments({
      $or: [{ type: 'deals' }, { type: { $exists: false } }],
    });
    if (dealCount === 0) {
      await this.create({
        name: 'Standard Sales',
        type: 'deals',
        categoryType: 'it_consulting',
        isDefault: true,
        stages: [
          { name: 'Qualification', probability: 10, order: 1, isDefault: true },
          {
            name: 'Needs Analysis',
            probability: 20,
            order: 2,
            isDefault: false,
          },
          { name: 'Proposal', probability: 50, order: 3, isDefault: false },
          { name: 'Negotiation', probability: 80, order: 4, isDefault: false },
          { name: 'Closed Won', probability: 100, order: 5, isDefault: false },
          { name: 'Closed Lost', probability: 0, order: 6, isDefault: false },
        ],
      });
    }
    const leadCount = await this.pipelineModel.countDocuments({
      type: 'leads',
    });
    if (leadCount === 0) {
      await this.create({
        name: 'Lead Qualification',
        type: 'leads',
        categoryType: 'it_consulting',
        isDefault: true,
        stages: [
          { name: 'New', probability: 5, order: 1, isDefault: true },
          { name: 'Contacted', probability: 15, order: 2, isDefault: false },
          { name: 'Qualified', probability: 40, order: 3, isDefault: false },
          {
            name: 'Meeting Scheduled',
            probability: 60,
            order: 4,
            isDefault: false,
          },
          { name: 'Converted', probability: 100, order: 5, isDefault: false },
          { name: 'Disqualified', probability: 0, order: 6, isDefault: false },
        ],
      });
    }

    const platformCount = await this.pipelineModel.countDocuments({
      type: 'platform_opportunities',
    });
    if (platformCount === 0) {
      await this.create({
        name: 'Platform outreach',
        type: 'platform_opportunities',
        categoryType: 'freelancer',
        isDefault: true,
        stages: DEFAULT_PLATFORM_OPPORTUNITY_STAGES.map(
          ({ name, probability, order, isDefault }) => ({
            name,
            probability,
            order,
            isDefault,
          }),
        ),
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
