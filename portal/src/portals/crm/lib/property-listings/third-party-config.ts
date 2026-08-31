/**
 * 2Bigha / third-party listings API config.
 *
 * Mock (default): leave NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL empty.
 * Live: set NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL to the platform base URL, e.g.
 *   https://api.2bigha.ai
 * Optional: NEXT_PUBLIC_2BIGHA_LISTINGS_API_KEY for Bearer auth.
 * Force mock even with a URL: NEXT_PUBLIC_2BIGHA_LISTINGS_USE_MOCK=true
 */

export const THIRD_PARTY_LISTINGS_API_URL = (
  process.env.NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL ||
  process.env.NEXT_PUBLIC_CRM_API_URL ||
  "http://localhost:4000/api"
).replace(/\/$/, "");

export const THIRD_PARTY_LISTINGS_API_KEY =
  process.env.NEXT_PUBLIC_2BIGHA_LISTINGS_API_KEY || "";

/** When true (or when no base URL), all calls use the local mock store. */
export function useThirdPartyListingsMock(): boolean {
  if (process.env.NEXT_PUBLIC_2BIGHA_LISTINGS_USE_MOCK === "true") return true;
  if (process.env.NEXT_PUBLIC_2BIGHA_LISTINGS_USE_MOCK === "false") return false;
  // Disable mock mode by default to connect BUY/SELL to the live NestJS/MongoDB backend
  return false;
}

export function thirdPartyListingsAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (THIRD_PARTY_LISTINGS_API_KEY) {
    headers.Authorization = `Bearer ${THIRD_PARTY_LISTINGS_API_KEY}`;
  } else if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
