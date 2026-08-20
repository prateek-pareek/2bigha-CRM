import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from '@/lib/crm/api';

/**
 * CRM legal cases API client — mirrors the Deal/Lead fetch conventions used across
 * the CRM portal (bearer token from localStorage, JSON body, `{ data, total }` list
 * payloads). Owned under lib/crm so pages/components can import a single typed surface
 * instead of re-writing `fetch(`${CRM_API_URL}/crm/legal-cases...`)` everywhere.
 */

export type LegalCaseDocument = {
  name: string;
  url: string;
  uploadedAt?: string;
};

export type LegalCase = {
  _id: string;
  title: string;
  caseType: 'contract_review' | 'dispute' | 'compliance' | 'nda' | 'other';
  description?: string;
  counterpartyName?: string;
  contractValue?: number;
  currency?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  startDate?: string;
  expiryDate?: string;
  jurisdiction?: string;
  documents?: LegalCaseDocument[];
  caseOwner?: string;
  pipeline?: string | { _id: string; name?: string };
  stage: string;
  clientId?: string;
  associatedContacts?: any[];
  associatedLeads?: any[];
  associatedDeals?: any[];
  customFields?: Record<string, unknown>;
  recordId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type LegalCaseListParams = {
  page?: number;
  limit?: number;
  search?: string;
  pipeline?: string;
  stage?: string;
  caseOwner?: string;
  priority?: string;
  caseType?: string;
};

export type LegalCaseListResult = {
  data: LegalCase[];
  total: number;
  hasMore?: boolean;
  totalIsApproximate?: boolean;
};

function authHeaders(token?: string | null): Record<string, string> {
  const auth = token ?? getCrmAuthToken();
  return auth ? { Authorization: `Bearer ${auth}` } : {};
}

function jsonHeaders(token?: string | null): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders(token) };
}

async function parseJsonOrThrow(res: Response, fallbackMessage: string) {
  if (res.ok) return res.json();
  const err = await res.json().catch(() => ({}));
  const msg =
    typeof err?.message === 'string'
      ? err.message
      : Array.isArray(err?.message)
        ? err.message.join(', ')
        : fallbackMessage;
  throw new Error(msg);
}

function unwrapList(payload: unknown): LegalCaseListResult {
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
    const p = payload as { data: LegalCase[]; total?: number; hasMore?: boolean; totalIsApproximate?: boolean };
    return {
      data: p.data,
      total: typeof p.total === 'number' ? p.total : p.data.length,
      hasMore: p.hasMore,
      totalIsApproximate: p.totalIsApproximate,
    };
  }
  if (Array.isArray(payload)) return { data: payload as LegalCase[], total: payload.length };
  return { data: [], total: 0 };
}

export async function fetchLegalCases(
  params: LegalCaseListParams = {},
  token?: string | null,
): Promise<LegalCaseListResult> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.pipeline) qs.set('pipeline', params.pipeline);
  if (params.stage) qs.set('stage', params.stage);
  if (params.caseOwner) qs.set('caseOwner', params.caseOwner);
  if (params.priority) qs.set('priority', params.priority);
  if (params.caseType) qs.set('caseType', params.caseType);
  const q = qs.toString();
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases${q ? `?${q}` : ''}`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return { data: [], total: 0 };
  return unwrapList(await res.json());
}

export async function fetchLegalCase(id: string, token?: string | null): Promise<LegalCase | null> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?._id ? data : null;
}

export async function createLegalCase(
  payload: Record<string, unknown>,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'Failed to create legal case');
}

export async function updateLegalCase(
  id: string,
  payload: Record<string, unknown>,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'Failed to update legal case');
}

export async function deleteLegalCase(id: string, token?: string | null): Promise<boolean> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return res.ok;
}

export async function bulkDeleteLegalCases(ids: string[], token?: string | null): Promise<boolean> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/bulk-delete`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ ids }),
  });
  return res.ok;
}

export async function bulkAssignLegalCases(
  ids: string[],
  caseOwner: string,
  token?: string | null,
): Promise<boolean> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/bulk-assign`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ ids, caseOwner }),
  });
  return res.ok;
}

export async function updateLegalCaseStage(
  id: string,
  stage: string,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}/stage`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ stage }),
  });
  return parseJsonOrThrow(res, 'Failed to update stage');
}

export async function linkLegalCaseLead(
  id: string,
  leadId: string,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}/link-lead`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ leadId }),
  });
  return parseJsonOrThrow(res, 'Failed to link lead');
}

export async function unlinkLegalCaseLead(
  id: string,
  leadId: string,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}/unlink-lead`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ leadId }),
  });
  return parseJsonOrThrow(res, 'Failed to unlink lead');
}

export async function linkLegalCaseContact(
  id: string,
  contactId: string,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}/link-contact`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ contactId }),
  });
  return parseJsonOrThrow(res, 'Failed to link contact');
}

export async function unlinkLegalCaseContact(
  id: string,
  contactId: string,
  token?: string | null,
): Promise<LegalCase> {
  const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}/unlink-contact`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ contactId }),
  });
  return parseJsonOrThrow(res, 'Failed to unlink contact');
}
