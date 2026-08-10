import { CRM_API_URL } from '@/lib/crm/config';

export type EmailCampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "cancelled"
  | "failed";

export type EmailCampaignRecipient = {
  email: string;
  name?: string;
  module?: string;
  entityId?: string;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string;
  sentAt?: string;
  accountId?: string;
};

export type EmailCampaign = {
  id: string;
  _id: string;
  name: string;
  description?: string;
  status: EmailCampaignStatus;
  subject: string;
  bodyHtml: string;
  templateId?: string;
  segmentId?: string;
  recipients: EmailCampaignRecipient[];
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  enforceCrmRecipient?: boolean;
  aiDraftPerRecipient?: boolean;
  aiInstructions?: string;
  retryOnSendFail?: boolean;
  maxEmailsPerSenderInBatch?: number;
  mailboxSplit?: {
    mode?: "round_robin" | "random" | "sticky_entity";
    accountIds?: string[];
  };
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
};

function authHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchEmailCampaigns(params?: {
  status?: string;
  search?: string;
}): Promise<EmailCampaign[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const res = await fetch(
    `${CRM_API_URL}/crm/email-campaigns?${q.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to load campaigns");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchEmailCampaign(id: string): Promise<EmailCampaign> {
  const res = await fetch(`${CRM_API_URL}/crm/email-campaigns/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load campaign");
  return res.json();
}

export async function createEmailCampaign(
  body: Record<string, unknown>,
): Promise<EmailCampaign> {
  const res = await fetch(`${CRM_API_URL}/crm/email-campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (typeof data?.message === "string" && data.message) ||
        (typeof data?.error === "string" && data.error) ||
        "Failed to create campaign",
    );
  }
  return data;
}

export async function updateEmailCampaign(
  id: string,
  body: Record<string, unknown>,
): Promise<EmailCampaign> {
  const res = await fetch(`${CRM_API_URL}/crm/email-campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (typeof data?.message === "string" && data.message) ||
        "Failed to update campaign",
    );
  }
  return data;
}

export async function sendEmailCampaignNow(id: string): Promise<EmailCampaign> {
  const res = await fetch(`${CRM_API_URL}/crm/email-campaigns/${id}/send`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (typeof data?.message === "string" && data.message) ||
        "Failed to send campaign",
    );
  }
  return data;
}

export async function cancelEmailCampaign(id: string): Promise<EmailCampaign> {
  const res = await fetch(`${CRM_API_URL}/crm/email-campaigns/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to cancel campaign");
  return res.json();
}

export async function duplicateEmailCampaign(id: string): Promise<EmailCampaign> {
  const res = await fetch(
    `${CRM_API_URL}/crm/email-campaigns/${id}/duplicate`,
    { method: "POST", headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to duplicate campaign");
  return res.json();
}

export async function deleteEmailCampaign(id: string): Promise<void> {
  const res = await fetch(`${CRM_API_URL}/crm/email-campaigns/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete campaign");
}

export function parseRecipientLines(text: string): Array<{
  email: string;
  name?: string;
}> {
  const out: Array<{ email: string; name?: string }> = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const comma = t.includes(",") ? t.split(",") : t.split(/\t/);
    if (comma.length >= 2) {
      const name = comma[0].trim();
      const email = comma[1].trim().toLowerCase();
      if (email.includes("@") && !seen.has(email)) {
        seen.add(email);
        out.push({ name: name || undefined, email });
      }
      continue;
    }
    const email = t.toLowerCase();
    if (email.includes("@") && !seen.has(email)) {
      seen.add(email);
      out.push({ email });
    }
  }
  return out;
}

export const CAMPAIGN_STATUS_LABEL: Record<EmailCampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};
