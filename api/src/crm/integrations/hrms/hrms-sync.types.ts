/** Shared HRMS → CRM integration contract (versioned). */

export const HRMS_SYNC_EVENT_TYPES = [
  'employee.eligible',
  'employee.updated',
  'employee.ineligible',
  'attendance.day',
  'employment.status',
] as const;

export type HrmsSyncEventType = (typeof HRMS_SYNC_EVENT_TYPES)[number];

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

export type HrmsSyncEnvelope<T = unknown> = {
  eventId: string;
  eventType: HrmsSyncEventType;
  occurredAt: string;
  payload: T;
};

export const UNAVAILABLE_ATTENDANCE_STATUSES = new Set([
  'Absent',
  'On Leave',
]);
