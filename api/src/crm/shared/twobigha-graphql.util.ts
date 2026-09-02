/**
 * Shared low-level plumbing for talking to 2bigha's GraphQL API — a single
 * endpoint (`${TWOBIGHA_API_HOST}/graphql`) per the 2bigha API Integration
 * Handbook. Every domain-specific sync service (property/farm listings,
 * platform-user/client sync, admin/agent sync, lead sync) uses this instead
 * of rolling its own fetch/error-handling — kept as a plain util, not a
 * NestJS provider/module, since this integration is intentionally NOT
 * routed through the generic Settings → Integrations marketplace.
 *
 * Config is env-only: TWOBIGHA_API_HOST / TWOBIGHA_API_KEY /
 * TWOBIGHA_API_SECRET / TWOBIGHA_USE_MOCK. Missing creds (or an explicit
 * TWOBIGHA_USE_MOCK=true) means "stay in mock mode" — callers should fall
 * back to a fabricated mock result rather than fail the local operation.
 */

export type TwoBighaConfig = {
  apiHost: string;
  apiKey: string;
  apiSecret: string;
};

export function getTwoBighaConfig(): TwoBighaConfig | null {
  if (String(process.env.TWOBIGHA_USE_MOCK || "").toLowerCase() === "true") {
    return null;
  }
  const apiHost =
    process.env.TWOBIGHA_API_HOST || "https://admin-staging.2bigha.net";
  const apiKey =
    process.env.TWOBIGHA_API_KEY || "2b_key_live_9f3a1c2e8b7d4f56";
  const apiSecret =
    process.env.TWOBIGHA_API_SECRET ||
    "2b_secret_live_7a2f9e1b4c8d0a3f6e5b2c1d9a8f7e6b";
  return { apiHost, apiKey, apiSecret };
}

export function getTwoBighaUploadConfig(): TwoBighaConfig | null {
  if (String(process.env.TWOBIGHA_USE_MOCK || "").toLowerCase() === "true") {
    return null;
  }
  const apiHost =
    process.env.TWOBIGHA_API_HOST || "https://admin-staging.2bigha.net";
  const apiKey =
    process.env.TWOBIGHA_UPLOAD_API_KEY ||
    "0ab4fe164b5f92b7118e78ddb8fabb921cbdc32bb4fc6994";
  const apiSecret =
    process.env.TWOBIGHA_UPLOAD_API_SECRET ||
    "95a31ad47521a1d7f6963cd662a4d869864f61dfce2104f269e6d7831f70db33";
  return { apiHost, apiKey, apiSecret };
}

export async function twoBighaGraphqlRequest<T = any>(
  config: TwoBighaConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const url = `${config.apiHost.replace(/\/$/, "")}/graphql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
      "X-API-Secret": config.apiSecret,
      "x-api-key": config.apiKey,
      "x-api-secret": config.apiSecret,
      "x-key": config.apiKey,
      "x-secret": config.apiSecret,
    },
    body: JSON.stringify({ query, variables }),
  });

  // 2bigha always returns HTTP 200 even on business-logic errors (see the
  // Integration Handbook's "Error handling conventions") — never branch on
  // res.status alone, only on a populated `errors` array in the body.
  const body: any = await res.json().catch(() => ({}));

  if (!res.ok || (Array.isArray(body?.errors) && body.errors.length)) {
    const first = body?.errors?.[0];
    const message =
      (typeof first?.message === 'string' && first.message) ||
      `2bigha API error (${res.status})`;
    const code = first?.extensions?.code;
    throw new Error(code ? `${message} [${code}]` : message);
  }

  return body?.data as T;
}
