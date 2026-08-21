import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmGlobalSettings, CrmGlobalSettingsSchema } from './schemas/crm-global-settings.schema';
import { CRMUsersModule } from './crm-users/crm-users.module';
import { CRMController } from './core/crm.controller';
import { CRMService } from './core/crm.service';
import { Lead, LeadSchema } from './schemas/lead.schema';
import { Deal, DealSchema } from './schemas/deal.schema';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import { Contact, ContactSchema } from './schemas/contact.schema';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { CustomField, CustomFieldSchema } from './schemas/custom-field.schema';
import { CustomFieldsService } from './admin/custom-fields.service';
import { CustomFieldsController } from './admin/custom-fields.controller';
import {
  ColumnPreference,
  ColumnPreferenceSchema,
} from './schemas/column-preference.schema';
import { SavedView, SavedViewSchema } from './schemas/saved-view.schema';
import { SavedViewsService } from './admin/saved-views.service';
import { SavedViewsController } from './admin/saved-views.controller';
import { ColumnPreferencesService } from './admin/column-preferences.service';
import { ColumnPreferencesController } from './admin/column-preferences.controller';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogInterceptor } from './admin/audit-log.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './admin/audit-log.service';
import { AuditLogController } from './admin/audit-log.controller';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from './schemas/email-template.schema';
import { CrmSnippet, CrmSnippetSchema } from './schemas/crm-snippet.schema';
import { EmailTemplatesService } from './email/email-templates.service';
import { EmailTemplateMergeService } from './email/email-template-merge.service';
import { EmailTemplatesController } from './email/email-templates.controller';
import {
  EmailCampaign,
  EmailCampaignSchema,
} from './schemas/email-campaign.schema';
import { CrmTrashController } from './admin/crm-trash.controller';
import { CrmTrashService } from './admin/crm-trash.service';
import { CrmSegment, CrmSegmentSchema } from './schemas/crm-segment.schema';
import { CrmSegmentsService } from './segments/crm-segments.service';
import { CrmSegmentsController } from './segments/crm-segments.controller';
import { EmailCampaignsService } from './email/email-campaigns.service';
import { EmailCampaignsController } from './email/email-campaigns.controller';
import { CrmSnippetsService } from './email/crm-snippets.service';
import { CrmSnippetsController } from './email/crm-snippets.controller';
import { Email, EmailSchema } from './schemas/email.schema';
import { EmailCommunicationService } from './email/email-communication.service';
import { EmailCommunicationController } from './email/email-communication.controller';
import { Integration, IntegrationSchema } from './schemas/integration.schema';
import { TeamsIntegrationService } from './integrations/teams-integration.service';
import { SlackIntegrationService } from './integrations/slack-integration.service';
import { IntegrationsController } from './integrations/integrations.controller';
import { IntegrationCatalogService } from './integration-catalog/integration-catalog.service';
import { PaymentTerm, PaymentTermSchema } from './schemas/payment-term.schema';
import { PaymentTermsController } from './services/payment-terms.controller';
import { PaymentTermsService } from './services/payment-terms.service';
import { PortalController } from './portal/portal.controller';
import {
  PortalClientNeed,
  PortalClientNeedSchema,
} from './schemas/portal-client-need.schema';
import { ClientPortalNeedsService } from './portal/client-portal-needs.service';
import { Client, ClientSchema } from './schemas/client.schema';
import { ClientsService } from './records/clients.service';
import { GlobalSearchService } from './core/global-search.service';
import { ClientsController } from './records/clients.controller';
import { Pipeline, PipelineSchema } from './schemas/pipeline.schema';
import { PipelinesService } from './core/pipelines.service';
import { ReportingService } from './reporting/reporting.service';
import { PipelineController } from './core/pipeline.controller';
import {
  UserEmailAccount,
  UserEmailAccountSchema,
} from './schemas/user-email-account.schema';
import { InboxEmail, InboxEmailSchema } from './schemas/inbox-email.schema';
import { InboxRule, InboxRuleSchema } from './schemas/inbox-rules.schema';
import { InboxAccountsService } from './inbox/inbox-accounts.service';
import { InboxClassificationService } from './inbox/inbox-classification.service';
import { InboxOAuthService } from './inbox/inbox-oauth.service';
import { InboxAccountsController } from './inbox/inbox-accounts.controller';
import {
  EmailTracking,
  EmailTrackingSchema,
} from './schemas/email-tracking.schema';
import { EmailTrackingService } from './email/email-tracking.service';
import { EmailTrackingController } from './email/email-tracking.controller';
import { EmailUnsubscribeController } from './email/email-unsubscribe.controller';
import { CrmEmailEngagementBatchService } from './email/crm-email-engagement-batch.service';
import { CrmEmailEngagementFilterService } from './email/crm-email-engagement-filter.service';
import {
  WhatsAppMessage,
  WhatsAppMessageSchema,
} from './schemas/whatsapp-message.schema';
import { WhatsAppService } from './integrations/whatsapp.service';
import { VoiceCallingService } from './integrations/voice-calling.service';
import { VoiceCallingController } from './integrations/voice-calling.controller';
import { CallLog, CallLogSchema } from './ivr/schemas/call-log.schema';
import { IvrService } from './ivr/ivr.service';
import { IvrController } from './ivr/ivr.controller';
import { KommunoWebhookController } from './ivr/kommuno-webhook.controller';
import { WhatsAppController } from './integrations/whatsapp.controller';
import { WhatsAppWebhookController } from './integrations/whatsapp-webhook.controller';
import { AiSensyWebhookController } from './integrations/aisensy-webhook.controller';
import { MetaLeadAdsService } from './integrations/meta-lead-ads.service';
import { MetaLeadAdsWebhookController } from './integrations/meta-lead-ads-webhook.controller';
import { MetaLeadAdsPollingCronService } from './integrations/meta-lead-ads-polling-cron.service';
import { Workflow, WorkflowSchema } from './schemas/workflow.schema';
import {
  WorkflowExecution,
  WorkflowExecutionSchema,
} from './schemas/workflow-execution.schema';
import {
  WorkflowEnrollment,
  WorkflowEnrollmentSchema,
} from './schemas/workflow-enrollment.schema';
import {
  WorkflowDelayedJob,
  WorkflowDelayedJobSchema,
} from './schemas/workflow-delayed-job.schema';
import {
  WorkflowSplitCounter,
  WorkflowSplitCounterSchema,
} from './schemas/workflow-split-counter.schema';
import {
  WorkflowGoalHit,
  WorkflowGoalHitSchema,
} from './schemas/workflow-goal-hit.schema';
import {
  WorkflowTriggerProgress,
  WorkflowTriggerProgressSchema,
} from './schemas/workflow-trigger-progress.schema';
import { WorkflowsService } from './automation/workflows.service';
import { WorkflowsController } from './automation/workflows.controller';
import {
  LeadEngagementAutomationTemplate,
  LeadEngagementAutomationTemplateSchema,
} from './schemas/lead-engagement-automation-template.schema';
import { LeadEngagementAutomationService } from './automation/lead-engagement-automation.service';
import { LeadEngagementAutomationController } from './automation/lead-engagement-automation.controller';
import {
  DealEngagementAutomationTemplate,
  DealEngagementAutomationTemplateSchema,
} from './schemas/deal-engagement-automation-template.schema';
import { DealEngagementAutomationService } from './automation/deal-engagement-automation.service';
import { DealEngagementAutomationController } from './automation/deal-engagement-automation.controller';
import { DuplicatesService } from './admin/duplicates.service';
import { DuplicatesController } from './admin/duplicates.controller';
import { UsersModule } from '../users/users.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CrmProposal, CrmProposalSchema } from './schemas/proposal.schema';
import {
  CrmProposalBlock,
  CrmProposalBlockSchema,
} from './schemas/proposal-block.schema';
import {
  CrmProposalBranding,
  CrmProposalBrandingSchema,
} from './schemas/proposal-branding.schema';
import { ProposalExportService } from './proposals/proposal-export.service';
import { ProposalsService } from './proposals/proposals.service';
import { ProposalsController } from './proposals/proposals.controller';
import { ProposalBlocksService } from './proposals/proposal-blocks.service';
import { ProposalBlocksController } from './proposals/proposal-blocks.controller';
import { ProposalBrandingService } from './proposals/proposal-branding.service';
import { ProposalBrandingController } from './proposals/proposal-branding.controller';
import {
  ServiceOffering,
  ServiceOfferingSchema,
} from './schemas/service-offering.schema';
import { ServiceOfferingsService } from './services/service-offerings.service';
import { ServiceOfferingsController } from './services/service-offerings.controller';
import {
  LeadPicklistOption,
  LeadPicklistOptionSchema,
} from './records/schemas/lead-picklist-option.schema';
import { LeadPicklistOptionsService } from './records/lead-picklist-options.service';
import { LeadPicklistOptionsController } from './records/lead-picklist-options.controller';
import {
  LeadIntentEvent,
  LeadIntentEventSchema,
} from './records/schemas/lead-intent-event.schema';
import { LeadIntentService } from './records/lead-intent.service';
import { LeadIntentController } from './records/lead-intent.controller';
import {
  ExportQuotaConfig,
  ExportQuotaConfigSchema,
} from './admin/schemas/export-quota-config.schema';
import { ExportLog, ExportLogSchema } from './admin/schemas/export-log.schema';
import { ExportQuotaService } from './admin/export-quota.service';
import { ExportQuotaController } from './admin/export-quota.controller';
import {
  AgentTarget,
  AgentTargetSchema,
} from './reporting/schemas/agent-target.schema';
import { CrmAiService } from './ai/crm-ai.service';
import { CrmAiController } from './ai/crm-ai.controller';
import {
  CrmOutreachAiSettings,
  CrmOutreachAiSettingsSchema,
} from './schemas/crm-outreach-ai-settings.schema';
import { CrmOutreachAiSettingsModule } from './ai/crm-outreach-ai-settings.module';
import {
  CrmProposalAiSettings,
  CrmProposalAiSettingsSchema,
} from './schemas/crm-proposal-ai-settings.schema';
import { CrmProposalAiSettingsService } from './proposals/crm-proposal-ai-settings.service';
import {
  CrmContractAiSettings,
  CrmContractAiSettingsSchema,
} from './schemas/crm-contract-ai-settings.schema';
import { CrmContractAiSettingsService } from './proposals/crm-contract-ai-settings.service';
import { InboxSyncCronService } from './inbox/inbox-sync-cron.service';
import { InboxPushService } from './inbox/inbox-push.service';
import { InboxPushController } from './inbox/inbox-push.controller';
import { InboxIdleService } from './inbox/inbox-idle.service';
import { CrmCalendarCronService } from './calendar/crm-calendar-cron.service';
import { LeadFollowUpReminderCronService } from './records/lead-followup-reminder-cron.service';
import { CrmCalendarSyncService } from './calendar/crm-calendar-sync.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  ClientPortalAccessAssignment,
  ClientPortalAccessAssignmentSchema,
} from './schemas/client-portal-access-assignment.schema';
import {
  ClientPortalAccessLog,
  ClientPortalAccessLogSchema,
} from './schemas/client-portal-access-log.schema';
import {
  ClientPortalUpdate,
  ClientPortalUpdateSchema,
} from './schemas/client-portal-update.schema';
import {
  PortalChatMessage,
  PortalChatMessageSchema,
} from './schemas/portal-chat-message.schema';
import { PmProgressReadService } from './pm-bridge/pm-progress-read.service';
import {
  PM_PROGRESS_READ_PORT,
} from './shared/pm-progress-read.port';
import { EmailIntelligenceService } from './email-intelligence/email-intelligence.service';
import { WebsiteEmailExtractorService } from './email-intelligence/website-email-extractor.service';
import {
  EmailFinderLegacyController,
  EmailIntelligenceController,
} from './email-intelligence/email-intelligence.controller';
import { EmailProviderRegistry } from './email-intelligence/providers/provider.registry';
import { TombaEmailProvider } from './email-intelligence/providers/tomba-email.provider';
import { HunterEmailProvider } from './email-intelligence/providers/hunter-email.provider';
import { ProspeoEmailProvider } from './email-intelligence/providers/prospeo-email.provider';
import { ClayEmailProvider } from './email-intelligence/providers/clay-email.provider';
import { ClearoutEmailProvider } from './email-intelligence/providers/clearout-email.provider';
import { AnymailEmailProvider } from './email-intelligence/providers/anymail-email.provider';
import { SalesAgentModule } from './sales-agent/sales-agent.module';
import {
  CrmMigrationJob,
  CrmMigrationJobSchema,
} from './migration/schemas/migration-job.schema';
import {
  CrmMigrationIdMap,
  CrmMigrationIdMapSchema,
} from './migration/schemas/migration-id-map.schema';
import {
  CrmMigrationTouch,
  CrmMigrationTouchSchema,
} from './migration/schemas/migration-touch.schema';
import { CrmMigrationService } from './migration/migration.service';
import { CrmMigrationController } from './migration/migration.controller';
import {
  CrmAssociation,
  CrmAssociationSchema,
} from './associations/schemas/crm-association.schema';
import { AssociationsService } from './associations/associations.service';
import { AssociationsController } from './associations/associations.controller';
import {
  CrmObjectType,
  CrmObjectTypeSchema,
} from './custom-objects/schemas/crm-object-type.schema';
import {
  CrmObjectRecord,
  CrmObjectRecordSchema,
} from './custom-objects/schemas/crm-object-record.schema';
import { CustomObjectsService } from './custom-objects/custom-objects.service';
import {
  CustomObjectTypesController,
  CustomObjectRecordsController,
} from './custom-objects/custom-objects.controller';

@Module({
  imports: [
    UsersModule,
    RealtimeModule,
    CrmOutreachAiSettingsModule,
    forwardRef(() => SalesAgentModule),
    MongooseModule.forFeature(
      [
        { name: Lead.name, schema: LeadSchema },
        { name: Deal.name, schema: DealSchema },
        { name: Organization.name, schema: OrganizationSchema },
        { name: Contact.name, schema: ContactSchema },
        { name: Activity.name, schema: ActivitySchema },
        { name: CrmMigrationJob.name, schema: CrmMigrationJobSchema },
        { name: CrmMigrationIdMap.name, schema: CrmMigrationIdMapSchema },
        { name: CrmMigrationTouch.name, schema: CrmMigrationTouchSchema },
        { name: CustomField.name, schema: CustomFieldSchema },
        { name: ColumnPreference.name, schema: ColumnPreferenceSchema },
        { name: SavedView.name, schema: SavedViewSchema },
        { name: AuditLog.name, schema: AuditLogSchema },
        { name: EmailTemplate.name, schema: EmailTemplateSchema },
        { name: EmailCampaign.name, schema: EmailCampaignSchema },
        { name: CrmSegment.name, schema: CrmSegmentSchema },
        { name: CrmSnippet.name, schema: CrmSnippetSchema },
        { name: Email.name, schema: EmailSchema },
        { name: Integration.name, schema: IntegrationSchema },
        { name: Client.name, schema: ClientSchema },
        { name: PaymentTerm.name, schema: PaymentTermSchema },
        { name: Pipeline.name, schema: PipelineSchema },
        { name: UserEmailAccount.name, schema: UserEmailAccountSchema },
        { name: InboxEmail.name, schema: InboxEmailSchema },
        { name: InboxRule.name, schema: InboxRuleSchema },
        { name: EmailTracking.name, schema: EmailTrackingSchema },
        { name: WhatsAppMessage.name, schema: WhatsAppMessageSchema },
        { name: Workflow.name, schema: WorkflowSchema },
        { name: WorkflowExecution.name, schema: WorkflowExecutionSchema },
        { name: WorkflowEnrollment.name, schema: WorkflowEnrollmentSchema },
        { name: WorkflowDelayedJob.name, schema: WorkflowDelayedJobSchema },
        { name: WorkflowSplitCounter.name, schema: WorkflowSplitCounterSchema },
        { name: WorkflowGoalHit.name, schema: WorkflowGoalHitSchema },
        {
          name: WorkflowTriggerProgress.name,
          schema: WorkflowTriggerProgressSchema,
        },
        { name: CrmProposal.name, schema: CrmProposalSchema },
        { name: CrmProposalBlock.name, schema: CrmProposalBlockSchema },
        { name: CrmProposalBranding.name, schema: CrmProposalBrandingSchema },
        { name: ServiceOffering.name, schema: ServiceOfferingSchema },
        { name: LeadPicklistOption.name, schema: LeadPicklistOptionSchema },
        { name: LeadIntentEvent.name, schema: LeadIntentEventSchema },
        { name: ExportQuotaConfig.name, schema: ExportQuotaConfigSchema },
        { name: ExportLog.name, schema: ExportLogSchema },
        { name: AgentTarget.name, schema: AgentTargetSchema },
        { name: PortalClientNeed.name, schema: PortalClientNeedSchema },
        {
          name: ClientPortalAccessAssignment.name,
          schema: ClientPortalAccessAssignmentSchema,
        },
        { name: ClientPortalAccessLog.name, schema: ClientPortalAccessLogSchema },
        { name: ClientPortalUpdate.name, schema: ClientPortalUpdateSchema },
        { name: PortalChatMessage.name, schema: PortalChatMessageSchema },
        {
          name: CrmOutreachAiSettings.name,
          schema: CrmOutreachAiSettingsSchema,
        },
        {
          name: CrmProposalAiSettings.name,
          schema: CrmProposalAiSettingsSchema,
        },
        {
          name: CrmContractAiSettings.name,
          schema: CrmContractAiSettingsSchema,
        },
        { name: CrmGlobalSettings.name, schema: CrmGlobalSettingsSchema },
        {
          name: LeadEngagementAutomationTemplate.name,
          schema: LeadEngagementAutomationTemplateSchema,
        },
        {
          name: DealEngagementAutomationTemplate.name,
          schema: DealEngagementAutomationTemplateSchema,
        },
        { name: CrmAssociation.name, schema: CrmAssociationSchema },
        { name: CrmObjectType.name, schema: CrmObjectTypeSchema },
        { name: CrmObjectRecord.name, schema: CrmObjectRecordSchema },
        { name: CallLog.name, schema: CallLogSchema },
      ],
      'crmConnection',
    ),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    CRMUsersModule,
    NotificationsModule,
  ],
  controllers: [
    CRMController,
    ClientsController,
    ColumnPreferencesController,
    SavedViewsController,
    CustomFieldsController,
    EmailCommunicationController,
    EmailTemplatesController,
    EmailCampaignsController,
    CrmSegmentsController,
    CrmSnippetsController,
    AuditLogController,
    IntegrationsController,
    VoiceCallingController,
    IvrController,
    KommunoWebhookController,
    PipelineController,
    PaymentTermsController,
    PortalController,
    InboxAccountsController,
    InboxPushController,
    EmailTrackingController,
    EmailUnsubscribeController,
    WhatsAppController,
    WhatsAppWebhookController,
    AiSensyWebhookController,
    MetaLeadAdsWebhookController,
    WorkflowsController,
    LeadEngagementAutomationController,
    DealEngagementAutomationController,
    DuplicatesController,
    ProposalsController,
    ProposalBlocksController,
    ProposalBrandingController,
    ServiceOfferingsController,
    LeadPicklistOptionsController,
    LeadIntentController,
    ExportQuotaController,
    CrmAiController,
    EmailIntelligenceController,
    EmailFinderLegacyController,
    CrmTrashController,
    CrmMigrationController,
    AssociationsController,
    CustomObjectTypesController,
    CustomObjectRecordsController,
  ],
  providers: [
    LeadEngagementAutomationService,
    DealEngagementAutomationService,
    WorkflowsService,
    DuplicatesService,
    ProposalsService,
    ProposalExportService,
    ProposalBlocksService,
    ProposalBrandingService,
    ServiceOfferingsService,
    LeadPicklistOptionsService,
    LeadIntentService,
    ExportQuotaService,
    CrmAiService,
    CrmProposalAiSettingsService,
    CrmContractAiSettingsService,
    CRMService,
    CrmMigrationService,
    CrmEmailEngagementBatchService,
    CrmEmailEngagementFilterService,
    AuditLogService,
    ColumnPreferencesService,
    SavedViewsService,
    CustomFieldsService,
    EmailCommunicationService,
    EmailTemplatesService,
    EmailCampaignsService,
    CrmSegmentsService,
    CrmSnippetsService,
    EmailTemplateMergeService,
    GlobalSearchService,
    PipelinesService,
    ReportingService,
    TeamsIntegrationService,
    SlackIntegrationService,
    IntegrationCatalogService,
    ClientsService,
    PaymentTermsService,
    ClientPortalNeedsService,
    InboxAccountsService,
    InboxClassificationService,
    InboxSyncCronService,
    CrmCalendarCronService,
    LeadFollowUpReminderCronService,
    CrmCalendarSyncService,
    InboxIdleService,
    InboxPushService,
    InboxOAuthService,
    PmProgressReadService,
    {
      provide: PM_PROGRESS_READ_PORT,
      useExisting: PmProgressReadService,
    },
    EmailTrackingService,
    WhatsAppService,
    MetaLeadAdsService,
    MetaLeadAdsPollingCronService,
    VoiceCallingService,
    IvrService,
    EmailIntelligenceService,
    WebsiteEmailExtractorService,
    EmailProviderRegistry,
    TombaEmailProvider,
    HunterEmailProvider,
    ProspeoEmailProvider,
    ClayEmailProvider,
    ClearoutEmailProvider,
    AnymailEmailProvider,
    AuditLogInterceptor,
    CrmTrashService,
    AssociationsService,
    CustomObjectsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [
    CRMService,
    AuditLogService,
    ColumnPreferencesService,
    CustomFieldsService,
    ClientsService,
    EmailTemplatesService,
    CrmSnippetsService,
    EmailCommunicationService,
    TeamsIntegrationService,
    SlackIntegrationService,
    GlobalSearchService,
    PipelinesService,
    ReportingService,
    WorkflowsService,
    CrmAiService,
    InboxAccountsService,
    EmailTrackingService,
    WebsiteEmailExtractorService,
    AuditLogInterceptor,
    AssociationsService,
    CustomObjectsService,
    CRMUsersModule,
    WhatsAppService,
    // Re-exported so sibling modules (e.g. WhatsAppTemplatesModule) can
    // inject already-registered models (Integration, etc.) on
    // 'crmConnection' without re-registering them via their own
    // MongooseModule.forFeature(), which would throw OverwriteModelError.
    MongooseModule,
  ],
})
export class CRMModule {}
