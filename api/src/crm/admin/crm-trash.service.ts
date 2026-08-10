import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  PlatformOpportunity,
  PlatformOpportunityDocument,
} from '../schemas/platform-opportunity.schema';
import { WebsiteLead, WebsiteLeadDocument } from '../schemas/website-lead.schema';
import { Workflow, WorkflowDocument } from '../schemas/workflow.schema';
import { CrmSegment, CrmSegmentDocument } from '../schemas/crm-segment.schema';
import {
  EmailTemplate,
  EmailTemplateDocument,
} from '../schemas/email-template.schema';
import {
  EmailCampaign,
  EmailCampaignDocument,
} from '../schemas/email-campaign.schema';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { Playbook, PlaybookDocument } from '../schemas/playbook.schema';
import { CrmProposal, ProposalDocument } from '../schemas/proposal.schema';
import {
  CrmProposalBlock,
  ProposalBlockDocument,
} from '../schemas/proposal-block.schema';
import { CrmSnippet, CrmSnippetDocument } from '../schemas/crm-snippet.schema';
import {
  CustomField,
  CustomFieldDocument,
} from '../schemas/custom-field.schema';
import { SavedView, SavedViewDocument } from '../schemas/saved-view.schema';
import {
  ServiceOffering,
  ServiceOfferingDocument,
} from '../schemas/service-offering.schema';
import {
  PaymentTerm,
  PaymentTermDocument,
} from '../schemas/payment-term.schema';
import {
  CrmSalesStrategy,
  CrmSalesStrategyDocument,
} from '../schemas/crm-sales-strategy.schema';
import {
  PortalClientNeed,
  PortalClientNeedDocument,
} from '../schemas/portal-client-need.schema';
import {
  LeadEngagementAutomationTemplate,
  LeadEngagementAutomationTemplateDocument,
} from '../schemas/lead-engagement-automation-template.schema';
import {
  WorkflowTriggerProgress,
  WorkflowTriggerProgressDocument,
} from '../schemas/workflow-trigger-progress.schema';
import { CRMService } from '../core/crm.service';
import {
  CRM_TRASH_ENTITY_LABELS,
  CRM_TRASH_ENTITY_TYPES,
  CrmTrashEntityType,
  isCrmTrashEntityType,
  restoreUpdate,
  trashItemTitle,
} from '../shared/crm-soft-delete.util';

@Injectable()
export class CrmTrashService {
  private readonly models: Record<CrmTrashEntityType, Model<any>>;

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    leadModel: Model<LeadDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    dealModel: Model<DealDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    contactModel: Model<ContactDocument>,
    @InjectModel(Client.name, 'crmConnection')
    clientModel: Model<ClientDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    organizationModel: Model<OrganizationDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    activityModel: Model<ActivityDocument>,
    @InjectModel(PlatformOpportunity.name, 'crmConnection')
    platformOpportunityModel: Model<PlatformOpportunityDocument>,
    @InjectModel(WebsiteLead.name, 'crmConnection')
    websiteLeadModel: Model<WebsiteLeadDocument>,
    @InjectModel(Workflow.name, 'crmConnection')
    workflowModel: Model<WorkflowDocument>,
    @InjectModel(CrmSegment.name, 'crmConnection')
    segmentModel: Model<CrmSegmentDocument>,
    @InjectModel(EmailTemplate.name, 'crmConnection')
    emailTemplateModel: Model<EmailTemplateDocument>,
    @InjectModel(EmailCampaign.name, 'crmConnection')
    emailCampaignModel: Model<EmailCampaignDocument>,
    @InjectModel(Pipeline.name, 'crmConnection')
    pipelineModel: Model<PipelineDocument>,
    @InjectModel(Playbook.name, 'crmConnection')
    playbookModel: Model<PlaybookDocument>,
    @InjectModel(CrmProposal.name, 'crmConnection')
    proposalModel: Model<ProposalDocument>,
    @InjectModel(CrmProposalBlock.name, 'crmConnection')
    proposalBlockModel: Model<ProposalBlockDocument>,
    @InjectModel(CrmSnippet.name, 'crmConnection')
    snippetModel: Model<CrmSnippetDocument>,
    @InjectModel(CustomField.name, 'crmConnection')
    customFieldModel: Model<CustomFieldDocument>,
    @InjectModel(SavedView.name, 'crmConnection')
    savedViewModel: Model<SavedViewDocument>,
    @InjectModel(ServiceOffering.name, 'crmConnection')
    serviceOfferingModel: Model<ServiceOfferingDocument>,
    @InjectModel(PaymentTerm.name, 'crmConnection')
    paymentTermModel: Model<PaymentTermDocument>,
    @InjectModel(CrmSalesStrategy.name, 'crmConnection')
    salesStrategyModel: Model<CrmSalesStrategyDocument>,
    @InjectModel(PortalClientNeed.name, 'crmConnection')
    portalNeedModel: Model<PortalClientNeedDocument>,
    @InjectModel(LeadEngagementAutomationTemplate.name, 'crmConnection')
    engagementTemplateModel: Model<LeadEngagementAutomationTemplateDocument>,
    @InjectModel(WorkflowTriggerProgress.name, 'crmConnection')
    private readonly workflowTriggerProgressModel: Model<WorkflowTriggerProgressDocument>,
    private readonly crmService: CRMService,
  ) {
    this.models = {
      leads: leadModel,
      deals: dealModel,
      contacts: contactModel,
      clients: clientModel,
      organizations: organizationModel,
      activities: activityModel,
      'platform-opportunities': platformOpportunityModel,
      'website-leads': websiteLeadModel,
      workflows: workflowModel,
      segments: segmentModel,
      'email-templates': emailTemplateModel,
      'email-campaigns': emailCampaignModel,
      pipelines: pipelineModel,
      playbooks: playbookModel,
      proposals: proposalModel,
      'proposal-blocks': proposalBlockModel,
      snippets: snippetModel,
      'custom-fields': customFieldModel,
      'saved-views': savedViewModel,
      'service-offerings': serviceOfferingModel,
      'payment-terms': paymentTermModel,
      'sales-strategies': salesStrategyModel,
      'portal-needs': portalNeedModel,
      'engagement-templates': engagementTemplateModel,
    };
  }

  entityTypes() {
    return CRM_TRASH_ENTITY_TYPES.map((type) => ({
      type,
      label: CRM_TRASH_ENTITY_LABELS[type],
    }));
  }

  private modelFor(entityType: string): Model<any> {
    if (!isCrmTrashEntityType(entityType)) {
      throw new BadRequestException(`Unknown trash entity type: ${entityType}`);
    }
    return this.models[entityType];
  }

  async list(options: {
    entityType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
    const search = String(options.search || '').trim().toLowerCase();
    const types: CrmTrashEntityType[] = options.entityType
      ? isCrmTrashEntityType(options.entityType)
        ? [options.entityType]
        : (() => {
            throw new BadRequestException('Invalid entityType');
          })()
      : [...CRM_TRASH_ENTITY_TYPES];

    const perTypeLimit = Math.min(200, limit * 3);
    const chunks = await Promise.all(
      types.map(async (entityType) => {
        const model = this.models[entityType];
        const rows = await model
          .find({ isDeleted: true })
          .sort({ deletedAt: -1 })
          .limit(perTypeLimit)
          .lean()
          .exec();
        return rows.map((doc: Record<string, unknown>) => ({
          entityType,
          entityLabel: CRM_TRASH_ENTITY_LABELS[entityType],
          id: String(doc._id),
          title: trashItemTitle(entityType, doc),
          deletedAt: doc.deletedAt || null,
          deletedBy: doc.deletedBy ? String(doc.deletedBy) : null,
          preview: {
            email: doc.email ? String(doc.email) : undefined,
            status: doc.status != null ? String(doc.status) : undefined,
          },
        }));
      }),
    );

    let items = chunks.flat();
    if (search) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          i.entityLabel.toLowerCase().includes(search) ||
          (i.preview.email || '').toLowerCase().includes(search),
      );
    }
    items.sort((a, b) => {
      const ta = a.deletedAt ? new Date(a.deletedAt as Date).getTime() : 0;
      const tb = b.deletedAt ? new Date(b.deletedAt as Date).getTime() : 0;
      return tb - ta;
    });

    const total = items.length;
    const start = (page - 1) * limit;
    return {
      items: items.slice(start, start + limit),
      total,
      page,
      limit,
      entityTypes: this.entityTypes(),
    };
  }

  async restore(entityType: string, id: string) {
    const model = this.modelFor(entityType);
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    const doc = await model
      .findOneAndUpdate({ _id: id, isDeleted: true }, restoreUpdate(), {
        new: true,
      })
      .exec();
    if (!doc) throw new NotFoundException('Trash item not found');
    return {
      success: true,
      entityType,
      id,
      title: trashItemTitle(entityType as CrmTrashEntityType, doc.toObject?.() || doc),
    };
  }

  async purge(entityType: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    if (entityType === 'leads') {
      const removed = await this.crmService.permanentlyRemoveLead(id);
      if (!removed) throw new NotFoundException('Trash item not found');
      return { success: true, entityType, id };
    }
    if (entityType === 'workflows') {
      const model = this.modelFor(entityType);
      const doc = await model
        .findOneAndDelete({ _id: id, isDeleted: true })
        .setOptions({ includeDeleted: true })
        .exec();
      if (!doc) throw new NotFoundException('Trash item not found');
      await this.workflowTriggerProgressModel
        .deleteMany({ workflowId: new Types.ObjectId(id) })
        .exec();
      return { success: true, entityType, id };
    }
    const model = this.modelFor(entityType);
    const doc = await model
      .findOneAndDelete({ _id: id, isDeleted: true })
      .setOptions({ includeDeleted: true })
      .exec();
    if (!doc) throw new NotFoundException('Trash item not found');
    return { success: true, entityType, id };
  }

  async empty(entityType?: string) {
    const types: CrmTrashEntityType[] = entityType
      ? isCrmTrashEntityType(entityType)
        ? [entityType]
        : (() => {
            throw new BadRequestException('Invalid entityType');
          })()
      : [...CRM_TRASH_ENTITY_TYPES];

    let deletedCount = 0;
    for (const type of types) {
      const model = this.models[type];
      if (type === 'leads') {
        const ids = await model
          .find({ isDeleted: true })
          .select('_id')
          .lean()
          .exec();
        for (const row of ids) {
          const removed = await this.crmService.permanentlyRemoveLead(
            String(row._id),
          );
          if (removed) deletedCount += 1;
        }
        continue;
      }
      if (type === 'workflows') {
        const ids = await model
          .find({ isDeleted: true })
          .select('_id')
          .lean()
          .exec();
        const oids = ids.map((r) => r._id);
        if (oids.length) {
          await this.workflowTriggerProgressModel
            .deleteMany({ workflowId: { $in: oids } })
            .exec();
        }
      }
      const result = await model.deleteMany({ isDeleted: true }).exec();
      deletedCount += result.deletedCount || 0;
    }
    return { success: true, deletedCount };
  }
}
