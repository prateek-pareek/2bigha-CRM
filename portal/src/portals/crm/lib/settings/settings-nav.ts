import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Braces,
  Building2,
  Columns,
  Database,
  DollarSign,
  FileText,
  GitBranch,
  GitMerge,
  Layout,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageCircle,
  ScrollText,
  Share2,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";

export type CrmSettingsNavItem = {
  name: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export type CrmSettingsNavSection = {
  id: string;
  label: string;
  description: string;
  /** Icon for Dreams-style category tabs on the overview */
  icon: LucideIcon;
  items: CrmSettingsNavItem[];
};

/** Shared settings IA — sidebar + overview stay in sync. */
export const CRM_SETTINGS_SECTIONS: CrmSettingsNavSection[] = [
  {
    id: "email",
    label: "Email & outreach",
    description: "Deliverability, templates, and AI drafting.",
    icon: Mail,
    items: [
      /* Hidden for now, not needed yet. Re-enable by uncommenting.
      {
        name: "Email Deliverability",
        description: "Per-inbox hourly and daily sending caps to protect domain reputation.",
        href: "/crm/settings/email-deliverability",
        icon: Mail,
      },
      {
        name: "Deliverability Health",
        description: "SPF, DKIM, DMARC, and other factors that affect inbox placement.",
        href: "/crm/settings/email-deliverability/health",
        icon: Shield,
      },
      {
        name: "Deliverability Checklist",
        description: "Reply rate, reputation, engagement, and a full deliverability audit.",
        href: "/crm/settings/email-deliverability/checklist",
        icon: ClipboardCheck,
      },
      {
        name: "Undeliverable Contacts",
        description: "Review and manage contacts that bounce or cannot receive email.",
        href: "/crm/settings/email-deliverability/undeliverable",
        icon: MailX,
      },
      */
      {
        name: "Email Templates",
        description: "Create reusable email templates for outreach and follow-ups.",
        href: "/crm/settings/email-templates",
        icon: Mail,
      },
      {
        name: "WhatsApp Templates",
        description: "Sync approved Meta templates and send them from Inbox chat.",
        href: "/crm/whatsapp/templates",
        icon: MessageCircle,
      },
      /* Disabled for now, not needed yet. Re-enable by uncommenting.
      {
        name: "AI Outreach",
        description: "Positioning, tone, and guardrails for Claude draft emails.",
        href: "/crm/settings/ai-outreach",
        icon: Sparkles,
      },
      {
        name: "AI Proposal Drafter",
        description: "Agency vs freelancer profiles and formatting for AI proposals.",
        href: "/crm/settings/ai-proposal",
        icon: FileText,
      },
      {
        name: "AI Contract Maker",
        description: "Legal profiles and clauses for AI-generated service agreements.",
        href: "/crm/settings/ai-contract",
        icon: ScrollText,
      },
      */
      {
        name: "Snippets",
        description: "Reusable text — copy anywhere or insert in email.",
        href: "/crm/settings/snippets",
        icon: Braces,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales setup",
    description: "Pipelines, automation, fields, and board views.",
    icon: GitBranch,
    items: [
      {
        name: "Pipelines",
        description: "Configure sales workflows and stages.",
        href: "/crm/settings/pipelines",
        icon: GitBranch,
      },
      {
        name: "Sales agents",
        description: "Supervised AI agents for outreach, qualification, and closing.",
        href: "/crm/settings/agents",
        icon: Sparkles,
      },
      {
        name: "Custom Fields",
        description: "Create dynamic properties for CRM modules.",
        href: "/crm/settings/custom-fields",
        icon: Layout,
      },
      {
        name: "Lead Type, Group & Checklist",
        description: "Manage Lead Type, Group, and onboarding checklist options.",
        href: "/crm/settings/lead-picklists",
        icon: ListChecks,
      },
      {
        name: "Custom objects",
        description: "Define new object types beyond leads, contacts, and deals.",
        href: "/crm/settings/custom-objects",
        icon: Database,
      },
      {
        name: "Associations",
        description: "First-class record links with dual-write to legacy arrays.",
        href: "/crm/settings/associations",
        icon: GitMerge,
      },
      {
        name: "Columns",
        description: "Choose which columns are visible in list views.",
        href: "/crm/settings/columns",
        icon: Columns,
      },
      {
        name: "Card Customizations",
        description: "Fields shown on record cards in board views.",
        href: "/crm/settings/card-customization",
        icon: Layout,
      },
      {
        name: "Currency",
        description: "USD → INR and other rates used for deal value conversions.",
        href: "/crm/settings/currency",
        icon: DollarSign,
      },
    ],
  },
  {
    id: "system",
    label: "System & admin",
    description: "Integrations, audit trail, and data hygiene.",
    icon: Shield,
    items: [
      {
        name: "Integrations",
        description: "Connect external tools and platforms.",
        href: "/crm/settings/integrations",
        icon: Share2,
      },
      {
        name: "Audit",
        description: "Sales activity stream and system audit trail.",
        href: "/crm/settings/audit-logs",
        icon: Shield,
      },
      /* Disabled for now, not needed yet. Re-enable by uncommenting.
      {
        name: "Wiki",
        description: "Attach PM wiki spaces or pages for quick access.",
        href: "/crm/settings/wiki",
        icon: BookOpen,
      },
      */
      {
        name: "Data Migration",
        description:
          "Import companies, contacts, leads, deals, notes/calls, and relationships from any CRM.",
        href: "/crm/settings/migration",
        icon: Database,
      },
      {
        name: "Domain → company",
        description:
          "Auto-link contacts by corporate email domain; sync existing contacts into companies.",
        href: "/crm/settings/domain-companies",
        icon: Building2,
      },
      {
        name: "Duplicate Management",
        description: "Find and merge duplicate leads or contacts.",
        href: "/crm/settings/duplicates",
        icon: GitMerge,
      },
      {
        name: "Trash",
        description: "Restore or permanently delete soft-deleted CRM records.",
        href: "/crm/settings/trash",
        icon: Trash2,
      },
      {
        name: "Export Quota",
        description: "Daily export limits for Super Admins, across Lead Manager and IVR exports.",
        href: "/crm/settings/export-quota",
        icon: Shield,
      },
      {
        name: "Export History",
        description: "Review past Lead Manager and IVR export attempts.",
        href: "/crm/settings/export-history",
        icon: FileText,
      },
    ],
  },
];

export const CRM_SETTINGS_OVERVIEW = {
  name: "Overview",
  href: "/crm/settings",
  icon: LayoutDashboard,
} as const;

const ALL_SETTINGS_HREFS = CRM_SETTINGS_SECTIONS.flatMap((section) =>
  section.items.map((item) => item.href),
);

export function isCrmSettingsPathActive(pathname: string, href: string): boolean {
  if (href === "/crm/settings") return pathname === href;
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Prefer the longest matching nav href so parents (e.g. Email Deliverability)
  // do not stay highlighted on nested pages (Health / Checklist / …).
  return !ALL_SETTINGS_HREFS.some(
    (other) =>
      other !== href &&
      other.length > href.length &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}
