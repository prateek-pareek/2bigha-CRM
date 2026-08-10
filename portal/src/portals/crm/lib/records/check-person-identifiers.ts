import { CRM_API_URL } from '@/lib/crm/config';

export type PersonIdentifierContext = {
  entityType: 'lead' | 'contact';
  excludeLeadId?: string;
  excludeContactId?: string;
};

export type PersonIdentifierConflicts = Record<
  string,
  { entityType: 'Lead' | 'Contact'; id: string; name: string; message: string }
>;

/** Build `+CC number` from CRM phone fields (matches Quick Add / Edit). */
export function combinePhoneFromForm(fd: FormData, name: string): string {
  const cc = fd.get(`${name}_countryCode`);
  const num = fd.get(name);
  if (num != null && String(num).trim()) {
    return `${cc || ''} ${num}`.trim();
  }
  return '';
}

export async function fetchPersonIdentifierConflicts(
  token: string,
  params: {
    email?: string;
    mobileNo?: string;
    phone?: string;
    linkedinUrl?: string;
  } & PersonIdentifierContext,
): Promise<PersonIdentifierConflicts> {
  const sp = new URLSearchParams();
  sp.set('entityType', params.entityType);
  if (params.excludeLeadId) sp.set('excludeLeadId', params.excludeLeadId);
  if (params.excludeContactId) sp.set('excludeContactId', params.excludeContactId);
  if (params.email != null && String(params.email).trim()) sp.set('email', String(params.email).trim());
  if (params.mobileNo != null && String(params.mobileNo).trim()) sp.set('mobileNo', String(params.mobileNo).trim());
  if (params.phone != null && String(params.phone).trim()) sp.set('phone', String(params.phone).trim());
  if (params.linkedinUrl != null && String(params.linkedinUrl).trim())
    sp.set('linkedinUrl', String(params.linkedinUrl).trim());

  const res = await fetch(`${CRM_API_URL}/crm/person-identifiers/check?${sp.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return {};
  }
  const data = await res.json();
  return (data.conflicts || {}) as PersonIdentifierConflicts;
}
