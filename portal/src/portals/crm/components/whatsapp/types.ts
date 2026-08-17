import type { WhatsAppTemplateComponent } from "@/lib/crm/whatsapp/template-variables";

export type WhatsAppTemplateStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "DISABLED"
  | "PAUSED";

export type WhatsAppTemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

/** Mirrors api/src/crm/whatsapp-templates/schemas/whatsapp-template.schema.ts */
export interface WhatsAppTemplateRecord {
  _id: string;
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  components: WhatsAppTemplateComponent[];
  status: WhatsAppTemplateStatus;
  metaTemplateId?: string;
  rejectionReason?: string;
  qualityScore?: string;
  source: "local" | "meta" | "aisensy";
  aisensyCampaignName?: string;
  submittedAt?: string;
  approvedAt?: string;
  lastSyncedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
