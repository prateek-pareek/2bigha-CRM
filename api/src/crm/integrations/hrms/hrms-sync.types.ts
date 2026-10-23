/** Shared HRMS ↔ CRM integration contract (versioned). Keep aligned with HRMS hrms-crm-sync.types.ts */

export const HRMS_SYNC_EVENT_TYPES = [
  'employee.eligible',
  'employee.updated',
  'employee.ineligible',
  'attendance.day',
  'employment.status',
  'role.upserted',
  'role.deleted',
  'employee.crm_assignment',
] as const;

export type HrmsSyncEventType = (typeof HRMS_SYNC_EVENT_TYPES)[number];

/** Processed before the webhook responds so HRMS gets the resulting CRM state back. */
export const HRMS_SYNC_RESPONSE_EVENT_TYPES = new Set<string>([
  'role.upserted',
  'role.deleted',
  'employee.crm_assignment',
]);

export type HrmsEmployeePayload = {
  hrmsEmployeeId: string;
  email: string;
  firstName: string;
  lastName?: string;
  departmentId?: string;
  departmentName?: string;
  designationId?: string;
  designationName?: string;
  employmentStatus?: string;
  reportsToEmployeeId?: string;
  phone?: string;
};

export type HrmsAttendancePayload = {
  hrmsEmployeeId: string;
  email?: string;
  date: string; // YYYY-MM-DD
  status: string; // Present | Absent | On Leave | Half Day | ...
  source?: string;
};

export type HrmsEmploymentStatusPayload = {
  hrmsEmployeeId: string;
  email?: string;
  status: string;
  lastWorkingDate?: string;
  reason?: string;
};

export type HrmsRolePayload = {
  hrmsRoleId: string;
  crmRoleId?: string;
  name: string;
  description?: string;
  isActive?: boolean;
  crmPermissions: string[];
  workspaceModule?: string;
};

export type HrmsRoleDeletedPayload = {
  hrmsRoleId: string;
  crmRoleId?: string;
  name: string;
};

export type HrmsCrmAssignmentPayload = HrmsEmployeePayload & {
  access: 'grant' | 'revoke' | 'update';
  crmRoleId?: string;
  crmRoleName?: string;
  /** null clears the CRM team lead; undefined leaves it unchanged. */
  crmReportsToEmail?: string | null;
  crmReportsToEmployeeId?: string | null;
};

export type HrmsSyncEnvelope<T = unknown> = {
  eventId: string;
  eventType: HrmsSyncEventType;
  occurredAt: string;
  origin?: 'hrms' | 'crm';
  payload: T;
};

export const UNAVAILABLE_ATTENDANCE_STATUSES = new Set([
  'Absent',
  'On Leave',
]);

// ---------------------------------------------------------------------------
// CRM → HRMS (POST {HRMS_API_URL}/api/webhooks/crm)
// ---------------------------------------------------------------------------

export type CrmToHrmsEventType =
  | 'role.upserted'
  | 'role.deleted'
  | 'user.access_changed'
  | 'user.reports_to_changed';

export type CrmRoleSnapshot = {
  crmRoleId: string;
  hrmsRoleId?: string;
  name: string;
  description?: string;
  isActive?: boolean;
  isSystem?: boolean;
  crmPermissions: string[];
  workspaceModule?: string;
};

export type CrmUserSnapshot = {
  crmUserId: string;
  email: string;
  hrmsEmployeeId?: string;
  firstName?: string;
  lastName?: string;
  crmRoleId?: string;
  crmRoleName?: string;
  provisioningStatus?: string;
  isActive?: boolean;
  reportsToEmail?: string | null;
  department?: string;
  designation?: string;
  phone?: string;
};

export type CrmSyncResult = {
  ok: boolean;
  detail?: string;
  role?: CrmRoleSnapshot;
  user?: CrmUserSnapshot;
};
