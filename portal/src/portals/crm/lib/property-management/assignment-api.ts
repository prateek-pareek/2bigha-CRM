import api from "@/lib/crm/api";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";

export type PmAssignRole = "manager" | "legal" | "field";
export type PmStaffSource = "twobigha" | "crm";

export interface PmStaffPerson {
  id: string;
  source: PmStaffSource;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  employeeId?: string;
  twobighaAdminId?: string;
  crmUserId?: string;
  synced: boolean;
  syncStatus?: string;
  totalProperties?: number;
  roleLabel?: string;
}

export interface PmAssignmentStaffResponse {
  manager: { twobigha: PmStaffPerson[]; crm: PmStaffPerson[] };
  legal: { twobigha: PmStaffPerson[]; crm: PmStaffPerson[] };
  field: { twobigha: PmStaffPerson[]; crm: PmStaffPerson[] };
  mock?: boolean;
}

export interface PmAssignPick {
  source: PmStaffSource;
  id: string;
  name: string;
}

export interface PmAssignResult {
  listing: PropertyListingRecord;
  twobigha: { status: "synced" | "skipped" | "failed" | "mock"; message?: string };
}

export async function fetchPmAssignmentStaff(search?: string): Promise<PmAssignmentStaffResponse> {
  const { data } = await api.get<PmAssignmentStaffResponse>(
    "/crm/property-listings/pm/assignment-staff",
    { params: search ? { search } : undefined },
  );
  return data;
}

export async function assignPmStaff(
  listingId: string,
  role: PmAssignRole,
  pick: PmAssignPick,
): Promise<PmAssignResult> {
  const { data } = await api.post<PmAssignResult>(
    `/crm/property-listings/${encodeURIComponent(listingId)}/pm/assign`,
    { role, source: pick.source, id: pick.id, name: pick.name },
  );
  return {
    listing: {
      ...data.listing,
      _id: String(data.listing?._id || listingId),
      listingBucket: data.listing?.listingBucket || "pm",
      pmAssignmentSyncStatus: data.listing?.pmAssignmentSyncStatus || data.twobigha?.status,
      pmAssignmentSyncError: data.listing?.pmAssignmentSyncError || data.twobigha?.message,
    },
    twobigha: data.twobigha,
  };
}

export async function unassignPmStaff(
  listingId: string,
  role: PmAssignRole,
): Promise<PmAssignResult> {
  const { data } = await api.post<PmAssignResult>(
    `/crm/property-listings/${encodeURIComponent(listingId)}/pm/unassign`,
    { role },
  );
  return {
    listing: {
      ...data.listing,
      _id: String(data.listing?._id || listingId),
      listingBucket: data.listing?.listingBucket || "pm",
    },
    twobigha: data.twobigha,
  };
}

export function staffOptionValue(person: PmStaffPerson): string {
  return `${person.source}:${person.id}`;
}

export function parseStaffOption(
  value: string,
  pool: { twobigha: PmStaffPerson[]; crm: PmStaffPerson[] },
): PmAssignPick | null {
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const source = value.slice(0, idx) as PmStaffSource;
  const id = value.slice(idx + 1);
  const person =
    (source === "twobigha" ? pool.twobigha : pool.crm).find((p) => p.id === id) ||
    pool.twobigha.find((p) => p.id === id) ||
    pool.crm.find((p) => p.id === id);
  if (!person) return null;
  return { source: person.source, id: person.id, name: person.name };
}
