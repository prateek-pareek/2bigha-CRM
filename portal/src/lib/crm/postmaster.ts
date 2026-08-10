import api from '@/lib/crm/api';

export interface PostmasterConnectionStatus {
  isActive: boolean;
  hasRefreshToken: boolean;
  connectedEmail?: string;
  monitoredDomains: string[];
  accessTokenExpiresAt?: string;
}

export interface PostmasterSnapshot {
  _id?: string;
  domain: string;
  date: string;
  domainReputation: 'HIGH' | 'MEDIUM' | 'LOW' | 'BAD' | 'REPUTATION_CATEGORY_UNSPECIFIED';
  userReportedSpamRatio: number;
  spfSuccessRatio: number;
  dkimSuccessRatio: number;
  dmarcSuccessRatio: number;
  inboundEncryptionRatio: number;
  outboundEncryptionRatio: number;
  deliveryErrors: { errorClass: string; errorType: string; errorRatio: number }[];
  ipReputations: { reputation: string; numIps: number }[];
  createdAt: string;
}

export async function fetchPostmasterConfig(): Promise<PostmasterConnectionStatus> {
  const { data } = await api.get<PostmasterConnectionStatus>(
    '/crm/postmaster/config',
  );
  return data;
}

export async function fetchAuthorizeUrl(): Promise<{ authorizeUrl: string }> {
  const { data } = await api.get<{ authorizeUrl: string }>(
    '/crm/postmaster/oauth/authorize',
  );
  return data;
}

export async function updateMonitoredDomains(domains: string[]): Promise<void> {
  const domainsStr = domains.join(', ');
  await api.put('/crm/postmaster/config/domains', { domains: domainsStr });
}

export async function disconnectPostmaster(): Promise<void> {
  await api.delete('/crm/postmaster/config');
}

export async function triggerPostmasterSync(): Promise<{ synced: number }> {
  const { data } = await api.post<{ synced: number }>(
    '/crm/postmaster/sync',
    {},
  );
  return data;
}

export async function fetchVerifiedDomains(): Promise<string[]> {
  const { data } = await api.get<{ domains: string[] }>(
    '/crm/postmaster/domains',
  );
  return data.domains;
}

export async function fetchLatestSnapshot(
  domain: string,
): Promise<PostmasterSnapshot | null> {
  try {
    const { data } = await api.get<PostmasterSnapshot>(
      `/crm/postmaster/domains/${domain}/latest`,
    );
    return data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchSnapshotHistory(
  domain: string,
  days: number = 30,
): Promise<PostmasterSnapshot[]> {
  const { data } = await api.get<{ snapshots: PostmasterSnapshot[] }>(
    `/crm/postmaster/domains/${domain}/snapshots?days=${days}`,
  );
  return data.snapshots;
}
