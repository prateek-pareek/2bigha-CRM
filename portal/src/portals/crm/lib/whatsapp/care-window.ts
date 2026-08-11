/**
 * WhatsApp's 24-hour "customer service window" — free-form text replies are
 * only allowed within 24h of the customer's last inbound message; outside
 * that window Meta requires sending an approved template instead.
 *
 * Shared by the general Inbox WhatsApp tab (`/crm/inbox?source=whatsapp`)
 * and the dedicated WhatsApp module (`/crm/whatsapp`) so both enforce the
 * same rule from one place.
 */

export const WA_CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const WA_WINDOW_WARN_MS = 60 * 60 * 1000; // warn under 1 hour

export interface WhatsAppCareWindowMessage {
  direction: "inbound" | "outbound";
  createdAt: string;
}

export type WhatsAppCareWindowStatus =
  | "open"
  | "expiring_soon"
  | "expired"
  | "no_inbound";

export interface WhatsAppCareWindow {
  status: WhatsAppCareWindowStatus;
  lastInboundAt: Date | null;
  expiresAt: Date | null;
  remainingMs: number;
}

export function formatWaWindowCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function getWhatsAppCareWindow(
  messages: WhatsAppCareWindowMessage[],
  nowMs: number,
): WhatsAppCareWindow {
  const lastInbound = messages
    .filter((m) => m.direction === "inbound" && m.createdAt)
    .reduce<Date | null>((latest, m) => {
      const d = new Date(m.createdAt);
      if (Number.isNaN(d.getTime())) return latest;
      if (!latest || d > latest) return d;
      return latest;
    }, null);

  if (!lastInbound) {
    return {
      status: "no_inbound",
      lastInboundAt: null,
      expiresAt: null,
      remainingMs: 0,
    };
  }

  const expiresAt = new Date(lastInbound.getTime() + WA_CUSTOMER_CARE_WINDOW_MS);
  const remainingMs = expiresAt.getTime() - nowMs;
  if (remainingMs <= 0) {
    return {
      status: "expired",
      lastInboundAt: lastInbound,
      expiresAt,
      remainingMs: 0,
    };
  }
  return {
    status: remainingMs <= WA_WINDOW_WARN_MS ? "expiring_soon" : "open",
    lastInboundAt: lastInbound,
    expiresAt,
    remainingMs,
  };
}
