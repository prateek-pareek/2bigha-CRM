/**
 * Default API client — points to the HRMS / Master Auth backend (port 4000).
 * Used by HRMS components (e.g., NotificationList) that need an Axios instance
 * with automatic JWT injection.
 *
 * For CRM or PM calls, use CRM_API_URL / PM_API_URL from @/lib/api/config directly.
 */
export { default } from '@/lib/hrms/api';
