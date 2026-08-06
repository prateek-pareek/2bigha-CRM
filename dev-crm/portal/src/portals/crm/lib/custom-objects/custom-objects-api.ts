/**
 * CRM Associations v2 + Custom Objects API helpers.
 */
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from '@/lib/crm/api';

function authHeaders(): HeadersInit {
  const token = getCrmAuthToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export type CrmAssociationTypeDef = {
  key: string;
  fromType: string;
  toType: string;
  label: string;
  inverseLabel: string;
  legacyFromField: string;
  legacyToField: string | null;
};

export type CrmObjectType = {
  _id: string;
  key: string;
  name: string;
  singularLabel: string;
  pluralLabel: string;
  description?: string;
  primaryPropertyKey?: string;
  icon?: string;
  isActive?: boolean;
  order?: number;
};

export type CrmObjectRecord = {
  _id: string;
  objectTypeKey: string;
  objectTypeId: string;
  name: string;
  properties: Record<string, unknown>;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchAssociationTypes(): Promise<CrmAssociationTypeDef[]> {
  const res = await fetch(`${CRM_API_URL}/crm/associations/types`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load association types');
  return res.json();
}

export async function fetchRecordAssociations(
  objectType: string,
  objectId: string,
): Promise<any[]> {
  const url = new URL(`${CRM_API_URL}/crm/associations`);
  url.searchParams.set('objectType', objectType);
  url.searchParams.set('objectId', objectId);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load associations');
  const body = await res.json();
  if (Array.isArray(body)) return body;
  return body.items ?? [];
}

export async function createAssociation(body: {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  associationType?: string;
  label?: string;
  inverseLabel?: string;
}): Promise<any> {
  const res = await fetch(`${CRM_API_URL}/crm/associations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create association');
  }
  return res.json();
}

export async function removeAssociation(body: {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  associationType?: string;
}): Promise<void> {
  const res = await fetch(`${CRM_API_URL}/crm/associations`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to remove association');
  }
}

export type BackfillAssociationsResult = {
  scanned: number;
  upserted: number;
  errors: number;
  done: boolean;
  hasMore: boolean;
  module?: string;
  nextAfterId?: string;
  nextModule?: string;
};

export async function backfillAssociations(body?: {
  modules?: string[];
  module?: string;
  afterId?: string;
  batchSize?: number;
  maxBatches?: number;
}): Promise<BackfillAssociationsResult> {
  const res = await fetch(`${CRM_API_URL}/crm/associations/backfill`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Backfill failed');
  }
  return res.json();
}

export async function fetchObjectTypes(includeInactive = false): Promise<CrmObjectType[]> {
  const url = new URL(`${CRM_API_URL}/crm/object-types`);
  if (includeInactive) url.searchParams.set('includeInactive', '1');
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load object types');
  return res.json();
}

export async function createObjectType(body: {
  key?: string;
  name: string;
  singularLabel?: string;
  pluralLabel?: string;
  description?: string;
}): Promise<CrmObjectType> {
  const res = await fetch(`${CRM_API_URL}/crm/object-types`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create object type');
  }
  return res.json();
}

export async function updateObjectType(
  key: string,
  body: Partial<CrmObjectType>,
): Promise<CrmObjectType> {
  const res = await fetch(`${CRM_API_URL}/crm/object-types/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update object type');
  }
  return res.json();
}

export async function deleteObjectType(key: string): Promise<void> {
  const res = await fetch(`${CRM_API_URL}/crm/object-types/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete object type');
  }
}

export async function fetchObjectRecords(
  objectTypeKey: string,
  opts?: { page?: number; pageSize?: number; search?: string; afterId?: string },
): Promise<{
  items: CrmObjectRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore?: boolean;
  totalIsApproximate?: boolean;
  nextAfterId?: string;
}> {
  const url = new URL(
    `${CRM_API_URL}/crm/objects/${encodeURIComponent(objectTypeKey)}/records`,
  );
  if (opts?.page) url.searchParams.set('page', String(opts.page));
  if (opts?.pageSize) url.searchParams.set('pageSize', String(opts.pageSize));
  if (opts?.search) url.searchParams.set('search', opts.search);
  if (opts?.afterId) url.searchParams.set('afterId', opts.afterId);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load records');
  return res.json();
}

export async function createObjectRecord(
  objectTypeKey: string,
  body: { name?: string; properties?: Record<string, unknown> },
): Promise<CrmObjectRecord> {
  const res = await fetch(
    `${CRM_API_URL}/crm/objects/${encodeURIComponent(objectTypeKey)}/records`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create record');
  }
  return res.json();
}

export async function deleteObjectRecord(
  objectTypeKey: string,
  id: string,
): Promise<void> {
  const res = await fetch(
    `${CRM_API_URL}/crm/objects/${encodeURIComponent(objectTypeKey)}/records/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete record');
  }
}
