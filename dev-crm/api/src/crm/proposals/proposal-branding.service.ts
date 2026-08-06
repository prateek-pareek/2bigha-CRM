import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CrmProposalBranding,
  ProposalBrandingDocument,
  AgencyBrandingSubdoc,
  FreelancerBrandingSubdoc,
} from '../schemas/proposal-branding.schema';

export type ProposalBrandingDto = {
  agency?: Partial<AgencyBrandingSubdoc>;
  freelancer?: Partial<FreelancerBrandingSubdoc>;
};

@Injectable()
export class ProposalBrandingService {
  constructor(
    @InjectModel(CrmProposalBranding.name, 'crmConnection')
    private brandingModel: Model<ProposalBrandingDocument>,
  ) {}

  async findForUser(userId: string): Promise<CrmProposalBranding | null> {
    if (!Types.ObjectId.isValid(userId)) return null;
    return this.brandingModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec() as Promise<CrmProposalBranding | null>;
  }

  async upsertForUser(
    userId: string,
    dto: ProposalBrandingDto,
  ): Promise<CrmProposalBranding> {
    const uid = new Types.ObjectId(userId);
    let doc = await this.brandingModel.findOne({ userId: uid }).exec();
    if (!doc) {
      doc = new this.brandingModel({
        userId: uid,
        agency: { ...(dto.agency ?? {}) },
        freelancer: { ...(dto.freelancer ?? {}) },
      });
    } else {
      if (dto.agency) {
        doc.agency = { ...(doc.agency ?? {}), ...dto.agency } as AgencyBrandingSubdoc;
      }
      if (dto.freelancer) {
        doc.freelancer = {
          ...(doc.freelancer ?? {}),
          ...dto.freelancer,
        } as FreelancerBrandingSubdoc;
      }
    }
    await doc.save();
    return doc.toObject() as CrmProposalBranding;
  }
}
