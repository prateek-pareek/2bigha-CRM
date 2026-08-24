import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";

/**
 * CRM pipelines API — owned under lib/crm.
 */
export type CrmPipelineRow = { _id: string; name?: string; [key: string]: unknown };

export async function fetchCrmPipelines(
  type:
    | "leads"
    | "proposals"
    | "quotations"
    | "contracts",
  token?: string | null,
): Promise<CrmPipelineRow[]> {
  const auth = token ?? getCrmAuthToken();
  if (!auth) return [];
  try {
    const res = await fetch(`${CRM_API_URL}/crm/pipelines?type=${type}`, {
      headers: { Authorization: `Bearer ${auth}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as CrmPipelineRow[]) : [];
  } catch {
    return [];
  }
}
