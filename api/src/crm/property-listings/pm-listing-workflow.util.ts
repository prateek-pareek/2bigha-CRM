import type { ManagedPropertyDetail } from '../subscriptions/twobigha-subscriptions.service';

export function mapLegalStatus(raw?: string | null): 'Not started' | 'In progress' | 'Completed' {
  if (!raw) return 'Not started';
  const s = raw.toLowerCase();
  if (s.includes('complete')) return 'Completed';
  if (s.includes('progress') || s.includes('started') || s.includes('in_progress')) {
    return 'In progress';
  }
  return 'Not started';
}

export function mapReportStatus(
  raw?: string | null,
): 'Pending' | 'Approved' | 'Rejected' {
  if (!raw) return 'Pending';
  const u = raw.toUpperCase();
  if (u === 'APPROVED') return 'Approved';
  if (u === 'REJECTED') return 'Rejected';
  return 'Pending';
}

export function mapVisitStatus(raw?: string | null): 'Pending' | 'Complete' | 'Cancel' {
  if (!raw) return 'Pending';
  const u = raw.toUpperCase();
  if (u === 'COMPLETED') return 'Complete';
  if (u === 'CANCELLED' || u === 'MISSED') return 'Cancel';
  return 'Pending';
}

export function inferPmStage(
  detail?: ManagedPropertyDetail | null,
  reportStatus?: string | null,
): string | undefined {
  if (reportStatus) {
    const rs = mapReportStatus(reportStatus);
    if (rs === 'Approved') return 'Visit Report Approved';
    if (rs === 'Rejected') return 'Visit Report Rejected';
    if (rs === 'Pending') return 'Visit Report Pending';
  }
  const assignment = (detail?.assignmentStatus || '').toUpperCase();
  const legal = mapLegalStatus(detail?.legalCheckStatus);
  if (assignment.includes('FIELD')) return 'Assigned to Field Agent';
  if (legal === 'In progress' || legal === 'Completed' || assignment.includes('LEGAL')) {
    return 'Assigned to Legal';
  }
  if (assignment.includes('MANAGER') || assignment.includes('RM') || detail?.assignedManager) {
    return 'Assigned to RM';
  }
  return 'Property Submitted';
}

export function applyManagedDetailToListing(
  listing: Record<string, any>,
  detail: ManagedPropertyDetail | null,
  extras?: {
    reportId?: number;
    reportStatus?: string;
    fieldVisitId?: number;
    scheduledAt?: string;
    visitStatus?: string;
  },
) {
  if (!detail) return listing;
  const next = { ...listing };
  next.userPropertyId = detail.userPropertyId || next.userPropertyId;
  next.legalVerification = {
    ...(next.legalVerification || {}),
    status: mapLegalStatus(detail.legalCheckStatus),
    summary: detail.legalCheckNote || (next.legalVerification as any)?.summary,
    startedAt: detail.legalCheckStartedAt || (next.legalVerification as any)?.startedAt,
    completedAt: detail.legalCheckCompletedAt || (next.legalVerification as any)?.completedAt,
    checklist: (next.legalVerification as any)?.checklist || [],
  };
  if (detail.assignedManager?.name) {
    next.rmAssigneeName = detail.assignedManager.name;
    next.rmAssigneeId = detail.assignedManager.id;
  }
  if (detail.assignedLegalManager?.name) {
    next.legalAssigneeName = detail.assignedLegalManager.name;
    next.legalAssigneeId = detail.assignedLegalManager.id;
  }
  if (detail.assignedAgent?.name) {
    next.fieldAssigneeName = detail.assignedAgent.name;
    next.fieldAssigneeId = detail.assignedAgent.id;
  }
  const visitStatus = extras?.visitStatus;
  next.fieldVisit = {
    ...(next.fieldVisit || {}),
    status: mapVisitStatus(visitStatus),
    scheduledAt: extras?.scheduledAt || (next.fieldVisit as any)?.scheduledAt,
    notes: (next.fieldVisit as any)?.notes,
  };
  if (extras?.reportStatus) {
    next.visitReport = {
      ...(next.visitReport || {}),
      status: mapReportStatus(extras.reportStatus),
      submittedAt: (next.visitReport as any)?.submittedAt,
      reviewedAt: new Date().toISOString(),
    };
  }
  next.pmStage = inferPmStage(detail, extras?.reportStatus) || next.pmStage;
  next.pmWorkflowIds = {
    ...(next.pmWorkflowIds || {}),
    fieldVisitId: extras?.fieldVisitId ?? next.pmWorkflowIds?.fieldVisitId,
    reportId: extras?.reportId ?? next.pmWorkflowIds?.reportId,
  };
  return next;
}
