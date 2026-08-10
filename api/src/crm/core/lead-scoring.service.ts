import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LeadEngagementAutomationService } from '../automation/lead-engagement-automation.service';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { computeLeadScore } from '../shared/lead-score.util';

@Injectable()
export class LeadScoringService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(EmailTracking.name, 'crmConnection')
    private trackingModel: Model<EmailTrackingDocument>,
    @InjectModel(Pipeline.name, 'crmConnection')
    private pipelineModel: Model<PipelineDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @Inject(forwardRef(() => LeadEngagementAutomationService))
    private readonly leadEngagementAutomation: LeadEngagementAutomationService,
  ) {}

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async mirrorScoreToContact(
    emailRaw: string | undefined,
    score: number,
    breakdown: Record<string, number>,
    updatedAt: Date,
  ): Promise<void> {
    const email = (emailRaw || '').trim();
    if (!email || !email.includes('@')) return;
    await this.contactModel
      .updateOne(
        { email: new RegExp(`^${this.escapeRegex(email)}$`, 'i') },
        {
          $set: {
            leadScore: score,
            leadScoreUpdatedAt: updatedAt,
            leadScoreBreakdown: breakdown,
          },
        },
      )
      .exec();
  }

  private stageFitPercent(stage: string | undefined, pipeline: unknown): number {
    const stageName = String(stage || '').trim();
    const doc = pipeline as {
      stages?: Array<{
        name: string;
        probability?: number;
        order?: number;
      }>;
    } | null;
    const stages = [...(doc?.stages || [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    if (stages.length === 0) return 0;

    const match = stages.find((s) => s.name === stageName);
    if (match && typeof match.probability === 'number') {
      return Math.min(100, Math.max(0, match.probability));
    }
    const idx = stages.findIndex((s) => s.name === stageName);
    if (idx >= 0 && stages.length > 1) {
      return Math.round((idx / (stages.length - 1)) * 100);
    }
    return 5;
  }

  /**
   * Recompute and persist lead score (+ mirrored contact sync happens via CRMService when lead updates).
   * Safe to call frequently (e.g. after activity or email open).
   */
  async refreshLeadScore(leadId: string): Promise<void> {
    if (!Types.ObjectId.isValid(leadId)) return;

    const lead = await this.leadModel.findById(leadId).lean().exec();
    if (!lead) return;

    const oid = new Types.ObjectId(leadId);
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const activityCount30d = await this.activityModel
      .countDocuments({
        relatedTo: oid,
        relatedType: 'Lead',
        createdAt: { $gte: since },
      })
      .exec();

    const trackingRows = await this.trackingModel
      .find({ entityId: oid, module: 'leads' })
      .select(['openCount', 'clicks'])
      .lean()
      .exec();

    let emailOpenSum = 0;
    let emailClickSum = 0;
    for (const row of trackingRows) {
      emailOpenSum += row.openCount ?? 0;
      const clicks = row.clicks;
      if (Array.isArray(clicks)) emailClickSum += clicks.length;
    }

    let pipeline: PipelineDocument | null = null;
    const pid = lead.pipeline;
    if (pid) {
      const idStr = String(pid);
      if (Types.ObjectId.isValid(idStr)) {
        pipeline = await this.pipelineModel.findById(idStr).lean().exec();
      }
    }

    const stageFitPercent = this.stageFitPercent(
      lead.stage || lead.status,
      pipeline,
    );

    const { score, breakdown } = computeLeadScore({
      email: lead.email,
      phone: lead.phone,
      mobileNo: lead.mobileNo,
      organization: lead.organization,
      jobTitle: lead.jobTitle,
      website: lead.website,
      linkedinUrl: lead.linkedinUrl,
      twitterHandle: lead.twitterHandle,
      industry: lead.industry,
      annualRevenue: lead.annualRevenue,
      noOfEmployees: lead.noOfEmployees,
      stageFitPercent,
      activityCount30d,
      emailOpenSum,
      emailClickSum,
    });

    const now = new Date();
    await this.leadModel
      .updateOne(
        { _id: oid },
        {
          $set: {
            leadScore: score,
            leadScoreUpdatedAt: now,
            leadScoreBreakdown: breakdown,
          },
        },
      )
      .exec();

    await this.mirrorScoreToContact(lead.email, score, breakdown, now);
    void this.leadEngagementAutomation.onLeadUpdated(leadId);
  }
}
