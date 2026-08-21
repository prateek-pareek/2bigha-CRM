import { CRM_API_URL } from '@/lib/crm/config';

export type CrmSearchResults = {
  leads?: Array<{
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    organization?: string;
    status?: string;
  }>;
  deals?: Array<{
    _id: string;
    title?: string;
    organization?: string;
    dealValue?: number;
    status?: string;
  }>;
  contacts?: Array<{
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  }>;
  organizations?: Array<{ _id: string; name?: string; industry?: string }>;
  clients?: Array<{ _id: string; name?: string; email?: string }>;
};

export async function fetchCrmSearch(
  query: string,
  options?: { full?: boolean; signal?: AbortSignal },
): Promise<CrmSearchResults> {
  const q = query.trim();
  const params = new URLSearchParams({ q });
  if (options?.full) {
    params.set("full", "1");
  }
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(`${CRM_API_URL}/crm/search?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error("Search failed");
  }
  return res.json();
}

export function crmSearchHasResults(data: CrmSearchResults | null | undefined) {
  if (!data) return false;
  return (
    (data.leads?.length ?? 0) > 0 ||
    (data.deals?.length ?? 0) > 0 ||
    (data.contacts?.length ?? 0) > 0 ||
    (data.organizations?.length ?? 0) > 0 ||
    (data.clients?.length ?? 0) > 0
  );
}
