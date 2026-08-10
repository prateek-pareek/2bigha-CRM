/**
 * Default API client — suite authenticated axios (master / shared backend).
 * Used by shared suite features (notifications, media, vault, social, etc.).
 *
 * Prefer `@/lib/suite/api` for new shared code.
 * For CRM or PM product calls, use `@/lib/crm/api` / `@/lib/pm/api`.
 */
export { default } from '@/lib/suite/api';
