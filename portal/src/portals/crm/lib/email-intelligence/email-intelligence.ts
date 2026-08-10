import { CRM_API_URL } from '@/lib/crm/config';

export type EmailCapability = 'linkedinFinder' | 'emailVerifier';

export type EmailProviderCapabilities = {
  linkedinFinder: boolean;
  emailVerifier: boolean;
};

export type FreeApiAccess = 'included' | 'trial' | 'paid_only' | 'unknown';

export type EmailProviderSettings = {
  id: string;
  name: string;
  description: string;
  supportedCapabilities: EmailCapability[];
  docsUrl: string;
  authMode: 'apiKey' | 'apiKeySecret';
  requiresApiSecret: boolean;
  freeApiAccess: FreeApiAccess;
  freeTierHint: string;
  enabled: boolean;
  configured: boolean;
  hasApiSecret: boolean;
  apiKey: string;
  webhookUrl: string;
  capabilities: EmailProviderCapabilities;
  priority: number;
};

export type EmailIntelligenceStatus = {
  capabilities: Record<
    EmailCapability,
    { available: boolean; providerIds: string[] }
  >;
};

export type EmailVerificationResult = {
  provider: string;
  email: string;
  result: string;
  status?: string;
  score?: number;
  deliverable: boolean;
  acceptAll?: boolean;
  disposable?: boolean;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchEmailIntelligenceStatus(): Promise<EmailIntelligenceStatus> {
  const res = await fetch(`${CRM_API_URL}/crm/email-intelligence/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    return {
      capabilities: {
        linkedinFinder: { available: false, providerIds: [] },
        emailVerifier: { available: false, providerIds: [] },
      },
    };
  }
  return res.json();
}

export async function fetchEmailIntelligenceSettings(): Promise<{
  providers: EmailProviderSettings[];
} | null> {
  const res = await fetch(`${CRM_API_URL}/crm/email-intelligence/settings`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function saveEmailIntelligenceSettings(body: {
  providers: Record<
    string,
    {
      enabled?: boolean;
      apiKey?: string;
      apiSecret?: string;
      webhookUrl?: string;
      capabilities?: Partial<EmailProviderCapabilities>;
      priority?: number;
    }
  >;
}): Promise<{ providers: EmailProviderSettings[] } | null> {
  const res = await fetch(`${CRM_API_URL}/crm/email-intelligence/settings`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to save email intelligence settings');
  }
  return res.json();
}

export async function findEmailFromLinkedIn(
  url: string,
  options?: { enrichMobile?: boolean; full?: boolean; providerId?: string },
): Promise<unknown> {
  const res = await fetch(`${CRM_API_URL}/crm/email-intelligence/linkedin`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ url, ...options }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Email finder request failed',
    );
  }
  return data;
}

export async function verifyEmailAddress(
  email: string,
  options?: { enrichMobile?: boolean; providerId?: string },
): Promise<EmailVerificationResult> {
  const res = await fetch(`${CRM_API_URL}/crm/email-intelligence/verify`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, ...options }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Email verification failed',
    );
  }
  return data;
}

function unwrapTombaPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const r = result as Record<string, unknown>;
  if ('data' in r && ('provider' in r || typeof r.provider === 'string')) {
    return r.data;
  }
  return result;
}

/** Extract primary email from Tomba / Hunter / Prospeo finder response shapes. */
export function primaryEmailFromFinderResult(result: unknown): string | null {
  const payload = unwrapTombaPayload(result);
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;

  // Hunter / Clay: { data: { email } }
  const data = (r.data ?? r) as Record<string, unknown>;
  // Anymail Finder: top-level valid_email / email
  const validEmail = r.valid_email ?? r.email;
  if (typeof validEmail === 'string' && validEmail.includes('@')) {
    return validEmail.trim();
  }

  const directEmail =
    data?.email ?? data?.work_email ?? data?.workEmail ?? data?.most_likely_email;
  if (typeof directEmail === 'string' && directEmail.includes('@')) {
    return directEmail.trim();
  }

  // Clearout: { data: { emails: [{ email_address }] } }
  const clearoutEmails = data?.emails;
  if (Array.isArray(clearoutEmails) && clearoutEmails.length > 0) {
    const first = clearoutEmails[0] as { email_address?: string };
    if (first?.email_address?.includes('@')) return first.email_address.trim();
  }

  // Prospeo: { response: { person: { email } } }
  const response = r.response as Record<string, unknown> | undefined;
  const person =
    response?.person ?? r.person ?? (data?.person as Record<string, unknown> | undefined);
  if (person && typeof person === 'object') {
    const p = person as Record<string, unknown>;
    const pe = p.email ?? p.work_email;
    if (typeof pe === 'string' && pe.includes('@')) return pe.trim();
  }

  const emails = data?.emails;
  if (Array.isArray(emails) && emails.length > 0) {
    const first = emails[0];
    if (typeof first === 'string' && first.includes('@')) return first.trim();
    if (first && typeof first === 'object' && 'email' in first) {
      const e = (first as { email?: string }).email;
      if (e?.includes('@')) return e.trim();
    }
  }
  return null;
}

/** @deprecated use primaryEmailFromFinderResult — re-exported from email-finder barrel only */
// (avoid duplicate export with email-finder via index.ts export *)

export function formatVerificationLabel(v: EmailVerificationResult): string {
  const parts = [v.result];
  if (v.score != null) parts.push(`score ${v.score}`);
  if (v.deliverable) parts.push('deliverable');
  if (v.acceptAll) parts.push('accept-all');
  if (v.disposable) parts.push('disposable');
  return parts.join(' · ');
}
