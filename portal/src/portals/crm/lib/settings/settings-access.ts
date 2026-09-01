export type CrmSettingsItem = {
  name: string;
  href: string;
  requiredPermission: string;
  /** When true, only ceo@mathionix.com may open this setting. */
  superAdminOnly?: boolean;
};

export const CRM_SETTINGS_ITEMS: CrmSettingsItem[] = [
  { name: "Email Templates", href: "/crm/settings/email-templates", requiredPermission: "settings-email-templates:read" },
  { name: "AI Outreach", href: "/crm/settings/ai-outreach", requiredPermission: "settings-ai-outreach:read" },
  { name: "AI Proposal Drafter", href: "/crm/settings/ai-proposal", requiredPermission: "settings:read" },
  { name: "AI Contract Maker", href: "/crm/settings/ai-contract", requiredPermission: "settings:read" },
  { name: "Snippets", href: "/crm/settings/snippets", requiredPermission: "settings-snippets:read" },
  { name: "Pipelines", href: "/crm/settings/pipelines", requiredPermission: "settings-pipelines:read" },
  { name: "Sales agents", href: "/crm/settings/agents", requiredPermission: "settings:read" },
  { name: "Custom Fields", href: "/crm/settings/custom-fields", requiredPermission: "settings-custom-fields:read" },
  { name: "Lead Type, Group & Checklist", href: "/crm/settings/lead-picklists", requiredPermission: "settings:read" },
  { name: "Custom objects", href: "/crm/settings/custom-objects", requiredPermission: "settings:read" },
  { name: "Associations", href: "/crm/settings/associations", requiredPermission: "settings:read" },
  { name: "Columns", href: "/crm/settings/columns", requiredPermission: "settings-columns:read" },
  { name: "Card Customizations", href: "/crm/settings/card-customization", requiredPermission: "settings-card-customization:read" },
  { name: "Currency", href: "/crm/settings/currency", requiredPermission: "settings-currency:read", superAdminOnly: true },
  { name: "Users", href: "/crm/settings/users", requiredPermission: "settings:admin" },
  { name: "Roles", href: "/crm/settings/roles", requiredPermission: "settings:admin" },
  { name: "Integrations", href: "/crm/settings/integrations", requiredPermission: "settings-integrations:read" },
  { name: "2bigha platform sync", href: "/crm/settings/twobigha-sync", requiredPermission: "settings:admin" },
  { name: "Audit", href: "/crm/settings/audit-logs", requiredPermission: "settings-audit-logs:read" },
  { name: "Wiki", href: "/crm/settings/wiki", requiredPermission: "settings-wiki:read" },
  { name: "Duplicate Management", href: "/crm/settings/duplicates", requiredPermission: "settings-duplicates:read" },
  { name: "Trash", href: "/crm/settings/trash", requiredPermission: "admin:manage" },
  { name: "Export Quota", href: "/crm/settings/export-quota", requiredPermission: "admin:manage" },
  { name: "Export History", href: "/crm/settings/export-history", requiredPermission: "admin:manage" },
];

export function canAccessCrmSetting(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
  opts?: { canViewCrmRevenue?: boolean; superAdminOnly?: boolean },
): boolean {
  if (opts?.superAdminOnly && !opts.canViewCrmRevenue) return false;
  return hasAccess("settings:read") || hasAccess(requiredPermission);
}
