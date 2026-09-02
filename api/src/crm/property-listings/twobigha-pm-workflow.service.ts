import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

export interface PmWorkflowMutationResult {
  success: boolean;
  message: string;
  data?: unknown;
}

const START_LEGAL = `
  mutation StartLegalCheck($input: StartLegalCheckInput!) {
    startLegalCheck(input: $input) {
      userPropertyId
      overallStatus
    }
  }
`;

const COMPLETE_LEGAL = `
  mutation CompleteLegalCheck($input: CompleteLegalCheckInput!) {
    completeLegalCheck(input: $input) {
      userPropertyId
      overallStatus
    }
  }
`;

const SAVE_LEGAL_CHECKLIST = `
  mutation SaveLegalChecklistResponse(
    $userPropertyId: ID!
    $checklistItemId: ID!
    $isChecked: Boolean!
    $notes: String
  ) {
    saveLegalChecklistResponse(
      userPropertyId: $userPropertyId
      checklistItemId: $checklistItemId
      isChecked: $isChecked
      notes: $notes
    ) {
      success
      message
    }
  }
`;

const SCHEDULE_VISIT = `
  mutation ScheduleVisitDirectlyByRM($input: ScheduleVisitDirectlyByRMInput!) {
    scheduleVisitDirectlyByRM(input: $input) {
      fieldVisit {
        id
        visitRequestId
        userPropertyId
        status
        scheduledAt
        agentId
      }
    }
  }
`;

const UPDATE_VISIT_STATUS = `
  mutation UpdateFieldVisitStatus($input: UpdateFieldVisitStatusInput!) {
    updateFieldVisitStatus(input: $input) {
      id
      status
      scheduledAt
      checkInAt
      checkOutAt
      notes
    }
  }
`;

const REVIEW_REPORT = `
  mutation ReviewVisitReport($input: ReviewVisitReportInput!) {
    reviewVisitReport(input: $input) {
      success
      message
      data
    }
  }
`;

const REVIEW_SECTIONS = `
  mutation ReviewReportSections($input: ReviewReportSectionsInput!) {
    reviewReportSections(input: $input) {
      success
      message
      data
    }
  }
`;

const REJECT_RESCHEDULE = `
  mutation RejectReportAndReschedule($input: RejectReportAndRescheduleInput!) {
    rejectReportAndReschedule(input: $input) {
      success
      message
      data
    }
  }
`;

const GET_ASSIGNMENT = `
  query GetPropertyAssignmentDetails($userPropertyId: String!) {
    getPropertyAssignmentDetails(userPropertyId: $userPropertyId) {
      userPropertyId
      managerAssignedAt
      agentAssignedAt
      subscriptionStartDate
      subscriptionEndDate
      agent {
        adminId
        firstName
        lastName
        email
      }
      assignedBy {
        adminId
        firstName
        lastName
        email
      }
      user {
        userId
        firstName
        lastName
        phone
        email
      }
      property {
        id
        title
        propertyName
      }
    }
  }
`;

@Injectable()
export class TwoBighaPmWorkflowService {
  private readonly logger = new Logger(TwoBighaPmWorkflowService.name);

  async getPropertyAssignmentDetails(userPropertyId: string) {
    const config = getTwoBighaConfig();
    if (!config) {
      return {
        userPropertyId,
        mock: true,
        agent: { adminId: 'mock-agent', firstName: 'Field', lastName: 'Agent' },
      };
    }
    const data = await twoBighaGraphqlRequest<{
      getPropertyAssignmentDetails?: Record<string, unknown>;
    }>(config, GET_ASSIGNMENT, { userPropertyId });
    return data?.getPropertyAssignmentDetails || null;
  }

  async startLegalCheck(userPropertyId: string, summary?: string): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock legal check started', data: { userPropertyId } };
    }
    try {
      await twoBighaGraphqlRequest(config, START_LEGAL, {
        input: { userPropertyId, summary: summary || undefined },
      });
      return { success: true, message: 'Legal check started on 2bigha' };
    } catch (e: any) {
      this.logger.warn(`startLegalCheck failed: ${e?.message}`);
      return { success: false, message: e?.message || 'startLegalCheck failed' };
    }
  }

  async completeLegalCheck(userPropertyId: string, summary?: string): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock legal check completed', data: { userPropertyId } };
    }
    try {
      await twoBighaGraphqlRequest(config, COMPLETE_LEGAL, {
        input: { userPropertyId, summary: summary || 'Completed from CRM' },
      });
      return { success: true, message: 'Legal check completed on 2bigha' };
    } catch (e: any) {
      this.logger.warn(`completeLegalCheck failed: ${e?.message}`);
      return { success: false, message: e?.message || 'completeLegalCheck failed' };
    }
  }

  async saveLegalChecklistItem(
    userPropertyId: string,
    checklistItemId: string,
    isChecked: boolean,
    notes?: string,
  ): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock checklist saved' };
    }
    try {
      const data = await twoBighaGraphqlRequest<{
        saveLegalChecklistResponse?: { success?: boolean; message?: string };
      }>(config, SAVE_LEGAL_CHECKLIST, {
        userPropertyId,
        checklistItemId,
        isChecked,
        notes: notes || undefined,
      });
      const res = data?.saveLegalChecklistResponse;
      return {
        success: res?.success !== false,
        message: res?.message || 'Checklist item saved',
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'saveLegalChecklistResponse failed' };
    }
  }

  async scheduleVisitDirectly(input: {
    userPropertyId: string;
    agentId: string;
    scheduledAt: string;
    visitCategory?: string;
    description?: string;
    countsTowardLimit?: boolean;
  }): Promise<PmWorkflowMutationResult & { fieldVisitId?: number; visitRequestId?: number }> {
    const config = getTwoBighaConfig();
    if (!config) {
      return {
        success: true,
        message: 'Mock visit scheduled',
        fieldVisitId: 1,
        visitRequestId: 1,
      };
    }
    try {
      const data = await twoBighaGraphqlRequest<{
        scheduleVisitDirectlyByRM?: {
          fieldVisit?: { id?: string; visitRequestId?: number; scheduledAt?: string; status?: string };
        };
      }>(config, SCHEDULE_VISIT, {
        input: {
          userPropertyId: input.userPropertyId,
          agentId: input.agentId,
          scheduledAt: input.scheduledAt,
          visitCategory: input.visitCategory || 'ROUTINE',
          description: input.description,
          countsTowardLimit: input.countsTowardLimit ?? true,
        },
      });
      const fv = data?.scheduleVisitDirectlyByRM?.fieldVisit;
      return {
        success: true,
        message: 'Field visit scheduled on 2bigha',
        fieldVisitId: fv?.id ? Number(fv.id) : undefined,
        visitRequestId: fv?.visitRequestId,
        data: fv,
      };
    } catch (e: any) {
      this.logger.warn(`scheduleVisitDirectlyByRM failed: ${e?.message}`);
      return { success: false, message: e?.message || 'scheduleVisitDirectlyByRM failed' };
    }
  }

  async updateFieldVisitStatus(
    fieldVisitId: number,
    status: string,
  ): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: `Mock visit status → ${status}` };
    }
    try {
      await twoBighaGraphqlRequest(config, UPDATE_VISIT_STATUS, {
        input: { fieldVisitId, status },
      });
      return { success: true, message: `Visit status updated to ${status}` };
    } catch (e: any) {
      return { success: false, message: e?.message || 'updateFieldVisitStatus failed' };
    }
  }

  mapVisitStatusToTwoBigha(status: string): string {
    const s = status.toLowerCase();
    if (s === 'complete' || s === 'completed') return 'COMPLETED';
    if (s === 'cancel' || s === 'cancelled') return 'CANCELLED';
    if (s === 'pending') return 'SCHEDULED';
    return status.toUpperCase();
  }

  async reviewVisitReport(
    reportId: number,
    decision: 'Approved' | 'Rejected',
    rejectionReason?: string,
  ): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    const reportStatus = decision === 'Approved' ? 'APPROVED' : 'REJECTED';
    if (!config) {
      return { success: true, message: `Mock report ${reportStatus}` };
    }
    try {
      const data = await twoBighaGraphqlRequest<{
        reviewVisitReport?: PmWorkflowMutationResult;
      }>(config, REVIEW_REPORT, {
        input: {
          reportId,
          reportStatus,
          rejectionReason: decision === 'Rejected' ? rejectionReason || 'Rejected from CRM' : undefined,
        },
      });
      const res = data?.reviewVisitReport;
      return {
        success: res?.success !== false,
        message: res?.message || `Report ${reportStatus}`,
        data: res?.data,
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'reviewVisitReport failed' };
    }
  }

  async reviewReportSections(
    reportId: number,
    sections: Array<{ sectionKey: string; status: 'APPROVED' | 'REJECTED'; comment?: string }>,
  ): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock section review saved' };
    }
    try {
      const data = await twoBighaGraphqlRequest<{
        reviewReportSections?: PmWorkflowMutationResult;
      }>(config, REVIEW_SECTIONS, {
        input: { reportId, sections },
      });
      const res = data?.reviewReportSections;
      return {
        success: res?.success !== false,
        message: res?.message || 'Section reviews saved',
        data: res?.data,
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'reviewReportSections failed' };
    }
  }

  async rejectReportAndReschedule(input: {
    reportId: number;
    reason: string;
    agentId?: string;
    scheduledAt?: string;
    visitCategory?: string;
    description?: string;
  }): Promise<PmWorkflowMutationResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock reject & reschedule' };
    }
    try {
      const data = await twoBighaGraphqlRequest<{
        rejectReportAndReschedule?: PmWorkflowMutationResult;
      }>(config, REJECT_RESCHEDULE, { input });
      const res = data?.rejectReportAndReschedule;
      return {
        success: res?.success !== false,
        message: res?.message || 'Report rejected and visit rescheduled',
        data: res?.data,
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'rejectReportAndReschedule failed' };
    }
  }
}
