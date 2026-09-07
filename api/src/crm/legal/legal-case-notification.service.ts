import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LegalCase, LegalCaseDocument } from '../records/schemas/legal-case.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { CrmNotifyService } from '../notifications/crm-notify.service';

@Injectable()
export class LegalCaseNotificationService {
  private readonly logger = new Logger(LegalCaseNotificationService.name);

  constructor(
    @InjectModel(LegalCase.name, 'crmConnection')
    private readonly legalCaseModel: Model<LegalCaseDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  /**
   * Notify on legal case status (stage) change.
   * Notifies: Calling Agent on originating lead + Legal Executive (caseOwner)
   */
  async notifyStatusChange(
    caseId: string,
    previousStage: string | null,
    newStage: string,
    legalCase?: LegalCaseDocument | null,
  ) {
    try {
      let theCase = legalCase;
      if (!theCase) {
        theCase = await this.legalCaseModel.findById(caseId).lean().exec();
      }
      if (!theCase) {
        this.logger.warn(`Legal case ${caseId} not found for status change notification`);
        return;
      }

      if (!previousStage || previousStage === newStage) return;

      const caseTitle = (theCase as any).title || 'Legal case';
      const title = `Legal case status changed: ${caseTitle}`;
      const message = `${caseTitle} status changed from "${previousStage}" to "${newStage}".`;
      const link = `/crm/legal-cases/${caseId}`;

      const recipients = [];

      if ((theCase as any).associatedLeads && (theCase as any).associatedLeads.length > 0) {
        const leadId = (theCase as any).associatedLeads[0];
        const lead = await this.leadModel
          .findById(leadId)
          .select('_id createdBy leadOwner')
          .lean()
          .exec();

        if (lead) {
          recipients.push({
            userId: (lead as any).createdBy,
            label: String((lead as any).leadOwner || '').trim() || undefined,
          });
        }
      }

      if ((theCase as any).caseOwner) {
        recipients.push({
          label: (theCase as any).caseOwner,
        });
      }

      if (!recipients.length) {
        this.logger.warn(`No recipients found for legal case ${caseId} status change`);
        return;
      }

      const primary = recipients[0];
      const alsoNotify = recipients.slice(1);

      await this.crmNotify.notify({
        event: 'legal_case_status_changed',
        title,
        message,
        recipient: primary,
        alsoNotify: alsoNotify.length ? alsoNotify : undefined,
        link,
        metadata: {
          link,
          entityId: caseId,
          relatedType: 'LegalCase',
          previousStage,
          newStage,
        },
        type: 'LegalStatusChange',
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to notify legal case status change for ${caseId}: ${err?.message || err}`,
      );
    }
  }
}
