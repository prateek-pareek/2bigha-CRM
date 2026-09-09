/**
 * CRM notification / reminder event keys.
 * Used for preference toggles and dispatcher routing.
 */
export const CRM_NOTIFY_EVENTS = [
  'lead_follow_up_upcoming',
  'lead_follow_up_due',
  'lead_follow_up_overdue',
  'lead_intent_follow_up',
  'lead_follow_up_scheduled',
  'follow_up_sequence_scheduled',
  'follow_up_sequence_stopped',
  'follow_up_email_drafted',
  'follow_up_email_sent',
  'callback_due',
  'lead_assigned',
  'lead_reassigned',
  'lead_transferred',
  'task_assigned',
  'task_reassigned',
  'task_due',
  'task_overdue',
  'custom_reminder',
  'follow_up_reminder',
  'hrms_user_pending',
  'hrms_user_unavailable',
  'hrms_user_revoked',
  'hrms_workload_reassigned',
  'property_listing_expiring',
  'subscription_plan_expiring',
  'legal_case_transferred',
  'legal_case_status_changed',
] as const;

export type CrmNotifyEvent = (typeof CRM_NOTIFY_EVENTS)[number];

export type CrmNotifyChannelPrefs = {
  inApp: boolean;
  email: boolean;
};

export type CrmNotifyPreferencesMap = Partial<
  Record<CrmNotifyEvent, CrmNotifyChannelPrefs>
>;

/** Defaults: in-app on for all; email on for time-sensitive follow-ups/reminders/assignments. */
export const CRM_NOTIFY_DEFAULT_PREFS: Record<
  CrmNotifyEvent,
  CrmNotifyChannelPrefs
> = {
  lead_follow_up_upcoming: { inApp: true, email: true },
  lead_follow_up_due: { inApp: true, email: true },
  lead_follow_up_overdue: { inApp: true, email: true },
  lead_intent_follow_up: { inApp: true, email: true },
  lead_follow_up_scheduled: { inApp: true, email: true },
  follow_up_sequence_scheduled: { inApp: true, email: true },
  follow_up_sequence_stopped: { inApp: true, email: true },
  follow_up_email_drafted: { inApp: true, email: false },
  follow_up_email_sent: { inApp: true, email: true },
  callback_due: { inApp: true, email: true },
  lead_assigned: { inApp: true, email: true },
  lead_reassigned: { inApp: true, email: true },
  lead_transferred: { inApp: true, email: true },
  task_assigned: { inApp: true, email: false },
  task_reassigned: { inApp: true, email: false },
  task_due: { inApp: true, email: true },
  task_overdue: { inApp: true, email: true },
  custom_reminder: { inApp: true, email: true },
  follow_up_reminder: { inApp: true, email: true },
  hrms_user_pending: { inApp: true, email: true },
  hrms_user_unavailable: { inApp: true, email: true },
  hrms_user_revoked: { inApp: true, email: true },
  hrms_workload_reassigned: { inApp: true, email: true },
  property_listing_expiring: { inApp: true, email: false },
  subscription_plan_expiring: { inApp: true, email: false },
  legal_case_transferred: { inApp: true, email: false },
  legal_case_status_changed: { inApp: true, email: false },
};

export const CRM_NOTIFY_EVENT_LABELS: Record<CrmNotifyEvent, string> = {
  lead_follow_up_upcoming: 'Upcoming lead follow-up',
  lead_follow_up_due: 'Lead follow-up due',
  lead_follow_up_overdue: 'Overdue lead follow-up',
  lead_intent_follow_up: 'Lead intent follow-up',
  lead_follow_up_scheduled: 'Follow-up date scheduled',
  follow_up_sequence_scheduled: 'Follow-up email sequence scheduled',
  follow_up_sequence_stopped: 'Follow-up sequence stopped / declined',
  follow_up_email_drafted: 'Follow-up email drafted',
  follow_up_email_sent: 'Follow-up email sent',
  callback_due: 'Callback due',
  lead_assigned: 'Lead assigned',
  lead_reassigned: 'Lead reassigned',
  lead_transferred: 'Lead transferred',
  task_assigned: 'Task assigned',
  task_reassigned: 'Task reassigned',
  task_due: 'Task due',
  task_overdue: 'Task overdue',
  custom_reminder: 'Custom reminders',
  follow_up_reminder: 'Follow-up reminders (email / WhatsApp)',
  hrms_user_pending: 'HRMS user pending CRM access',
  hrms_user_unavailable: 'Teammate unavailable today',
  hrms_user_revoked: 'HRMS CRM eligibility revoked',
  hrms_workload_reassigned: 'Workload reassigned (HRMS absence)',
  property_listing_expiring: 'Property listing expiring',
  subscription_plan_expiring: 'Subscription plan expiring',
  legal_case_transferred: 'Legal case transferred',
  legal_case_status_changed: 'Legal case status changed',
};
