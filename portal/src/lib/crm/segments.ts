import { CRM_API_URL } from "@/lib/api/config";
import type { FilterCriteria } from "@/lib/crm/filter-config";

export type CrmSegmentListType = "dynamic" | "static";

export type CrmSegmentMemberModule =
  | "leads"
  | "contacts"
  | "platform-opportunities";

export type CrmSegment = {
  id: string;
  _id: string;
  name: string;
  description?: string;
  listType: CrmSegmentListType;
  leadFilters: FilterCriteria[];
  contactFilters: FilterCriteria[];
  platformOpportunityFilters: FilterCriteria[];
  members: Array<{ module: CrmSegmentMemberModule; entityId: string }>;
  leadCount?: number;
  contactCount?: number;
  platformOpportunityCount?: number;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

function authHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type CrmRecordSegmentMembership = {
  id: string;
  name: string;
  listType: CrmSegmentListType;
};

export type CrmRecordSegmentsForRecord = {
  module: CrmSegmentMemberModule;
  entityId: string;
  memberships: CrmRecordSegmentMembership[];
  staticLists: Array<{ id: string; name: string; isMember: boolean }>;
};

export async function fetchCrmSegmentsForRecord(
  module: CrmSegmentMemberModule,
  entityId: string,
): Promise<CrmRecordSegmentsForRecord> {
  const q = new URLSearchParams({ module, entityId });
  const res = await fetch(`${CRM_API_URL}/crm/segments/for-record?${q}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to load segment lists");
  }
  return res.json();
}

export async function fetchCrmSegments(): Promise<CrmSegment[]> {
  const res = await fetch(`${CRM_API_URL}/crm/segments`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load segments");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchCrmSegment(id: string): Promise<CrmSegment> {
  const res = await fetch(`${CRM_API_URL}/crm/segments/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load segment");
  return res.json();
}

export async function createCrmSegment(body: {
  name: string;
  description?: string;
  listType?: CrmSegmentListType;
  leadFilters?: FilterCriteria[];
  contactFilters?: FilterCriteria[];
  platformOpportunityFilters?: FilterCriteria[];
}): Promise<CrmSegment> {
  const res = await fetch(`${CRM_API_URL}/crm/segments`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to create segment");
  }
  return res.json();
}

export async function updateCrmSegment(
  id: string,
  body: Partial<{
    name: string;
    description?: string;
    listType?: CrmSegmentListType;
    leadFilters?: FilterCriteria[];
    contactFilters?: FilterCriteria[];
    platformOpportunityFilters?: FilterCriteria[];
  }>,
): Promise<CrmSegment> {
  const res = await fetch(`${CRM_API_URL}/crm/segments/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to update segment");
  }
  return res.json();
}

export async function deleteCrmSegment(id: string): Promise<void> {
  const res = await fetch(`${CRM_API_URL}/crm/segments/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete segment");
}

export async function fetchCrmSegmentMembers(
  id: string,
  module: CrmSegmentMemberModule,
  params?: { page?: number; pageSize?: number; search?: string },
): Promise<{ module: string; data: unknown[]; total: number; page: number; pageSize: number }> {
  const q = new URLSearchParams({ module });
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  if (params?.search?.trim()) q.set("search", params.search.trim());
  const res = await fetch(`${CRM_API_URL}/crm/segments/${id}/members?${q}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load segment members");
  return res.json();
}

export async function addCrmSegmentMember(
  id: string,
  module: CrmSegmentMemberModule,
  entityId: string,
): Promise<CrmSegment> {
  const res = await fetch(`${CRM_API_URL}/crm/segments/${id}/members`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ module, entityId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to add member");
  }
  return res.json();
}

export type SegmentCampaignRecipient = {
  email: string;
  name?: string;
  module: "leads" | "contacts";
  entityId: string;
};

export async function fetchSegmentCampaignRecipients(
  segmentId: string,
): Promise<{
  segmentId: string;
  segmentName: string;
  recipients: SegmentCampaignRecipient[];
  leadsScanned: number;
  contactsScanned: number;
  skippedNoEmail: number;
  truncated: boolean;
}> {
  const res = await fetch(
    `${CRM_API_URL}/crm/segments/${segmentId}/campaign-recipients`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to load segment recipients");
  }
  return res.json();
}

export async function removeCrmSegmentMember(
  id: string,
  module: CrmSegmentMemberModule,
  entityId: string,
): Promise<CrmSegment> {
  const res = await fetch(
    `${CRM_API_URL}/crm/segments/${id}/members/${encodeURIComponent(module)}/${entityId}`,
    { method: "DELETE", headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to remove member");
  return res.json();
}
