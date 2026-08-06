/**
 * Shared contract for public client portals (Next app + external marketing site).
 * Backend: Nest global prefix `/api` → routes are `${crmApiBase}/portal/:token/...`
 * where crmApiBase is typically `http://host:4000/api`.
 *
 * Copy this file into a Vite site as-is (no `@/` imports). Cast `data` to your view model.
 */

export type PublicPortalAuth = {
    password?: string;
    googleToken?: string;
};

/** Headers to send on any portal route that uses resolveAuthorizedDeal (GET payload, documents, etc.). */
export function buildPortalAuthHeaderRecord(auth: PublicPortalAuth): Record<string, string> {
    const h: Record<string, string> = {};
    const p = String(auth.password || '').trim();
    if (p) h['x-portal-password'] = p;
    const g = String(auth.googleToken || '').trim();
    if (g) h['x-portal-google-token'] = g;
    return h;
}

export type PortalAuthConfig = {
    requiresPassword: boolean;
    googleLoginEnabled: boolean;
    contactEmailHint: string | null;
    portalDomain: string | null;
    /** From CRM: deal pipeline category — freelancer vs agency marketing site. */
    portalMarket?: 'agency' | 'freelancer';
    /** True when a PM board is linked on the deal (Client Portals). */
    pmIssuesBoardLinked?: boolean;
};

export async function fetchPortalAuthConfig(
    crmApiBase: string,
    token: string,
    init?: RequestInit,
): Promise<PortalAuthConfig> {
    const url = `${crmApiBase.replace(/\/+$/, '')}/portal/${encodeURIComponent(token)}/auth-config`;
    const res = await fetch(url, { ...init });
    if (!res.ok) throw new Error(`auth-config failed (${res.status})`);
    return res.json() as Promise<PortalAuthConfig>;
}

export type RequestPortalPayloadResult =
    | { status: 'ok'; data: unknown }
    | { status: 'unauthorized'; attempted: boolean }
    | { status: 'error' };

/**
 * Same behavior the Next portal page relies on: 401 without prior auth attempt vs wrong password.
 */
export async function requestPortalPayload(
    crmApiBase: string,
    token: string,
    auth?: PublicPortalAuth,
    init?: RequestInit,
): Promise<RequestPortalPayloadResult> {
    const base = crmApiBase.replace(/\/+$/, '');
    const url = `${base}/portal/${encodeURIComponent(token)}`;
    const headers = new Headers(init?.headers);
    const authRec = buildPortalAuthHeaderRecord(auth || {});
    for (const [k, v] of Object.entries(authRec)) {
        headers.set(k, v);
    }
    const res = await fetch(url, { ...init, headers });
    if (res.ok) {
        const data = await res.json();
        return { status: 'ok', data };
    }
    if (res.status === 401) {
        const attempted = Boolean(authRec['x-portal-password'] || authRec['x-portal-google-token']);
        return { status: 'unauthorized', attempted };
    }
    return { status: 'error' };
}

export async function verifyPortalGoogle(
    crmApiBase: string,
    token: string,
    idToken: string,
    init?: RequestInit,
): Promise<void> {
    const base = crmApiBase.replace(/\/+$/, '');
    const url = `${base}/portal/${encodeURIComponent(token)}/verify-google`;
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    const res = await fetch(url, {
        ...init,
        method: 'POST',
        headers,
        body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error(`verify-google failed (${res.status})`);
}

export async function submitPortalInquiry(
    crmApiBase: string,
    token: string,
    body: { name: string; email: string; message: string },
    init?: RequestInit,
): Promise<void> {
    const base = crmApiBase.replace(/\/+$/, '');
    const url = `${base}/portal/${encodeURIComponent(token)}/inquiry`;
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    const res = await fetch(url, {
        ...init,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
            typeof (err as { message?: string })?.message === 'string'
                ? (err as { message: string }).message
                : `inquiry failed (${res.status})`;
        throw new Error(msg);
    }
}

export async function uploadPortalDocument(
    crmApiBase: string,
    token: string,
    doc: { name: string; url: string },
    auth: PublicPortalAuth,
    init?: RequestInit,
): Promise<void> {
    const base = crmApiBase.replace(/\/+$/, '');
    const url = `${base}/portal/${encodeURIComponent(token)}/documents`;
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(buildPortalAuthHeaderRecord(auth))) {
        headers.set(k, v);
    }
    const res = await fetch(url, {
        ...init,
        method: 'POST',
        headers,
        body: JSON.stringify(doc),
    });
    if (!res.ok) throw new Error(`upload document failed (${res.status})`);
}

export async function deletePortalDocument(
    crmApiBase: string,
    token: string,
    index: number,
    auth: PublicPortalAuth,
    init?: RequestInit,
): Promise<void> {
    const base = crmApiBase.replace(/\/+$/, '');
    const url = `${base}/portal/${encodeURIComponent(token)}/documents/${index}`;
    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(buildPortalAuthHeaderRecord(auth))) {
        headers.set(k, v);
    }
    const res = await fetch(url, { ...init, method: 'DELETE', headers });
    if (!res.ok) throw new Error(`delete document failed (${res.status})`);
}
