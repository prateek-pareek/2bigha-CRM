import api from "@/lib/crm/api";
import { API_HOST_URL } from "@/lib/api/config";

export function resolveBrochurePdfUrl(url?: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_HOST_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Mirrors `PropertyShareInput` in api/src/crm/property-listings/property-share-pdf.service.ts. */
export type PropertyShareFields = {
  title: string;
  location: string;
  area?: string;
  areaUnit?: string;
  pricePerUnit?: string;
  totalPrice?: string;
  landType?: string;
  roadAccess?: string;
  waterLevel?: string;
  highway?: string;
  contactName?: string;
  contactPhone?: string;
  link?: string;
  images: string[];
};

export type SendPropertyShareResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

/** Generates or fetches cached property brochure PDF — POST /crm/property-share/generate. */
export async function generatePropertyBrochurePdf(params: {
  propertyId?: string;
  fields?: Partial<PropertyShareFields>;
  forceRegenerate?: boolean;
}): Promise<{ url: string; filename: string; cached?: boolean }> {
  const { data } = await api.post<{ url: string; filename: string; cached?: boolean }>("/crm/property-share/generate", params);
  return {
    ...data,
    url: resolveBrochurePdfUrl(data.url),
  };
}

/** Generates the property PDF and sends it to `waId` as a WhatsApp document — POST /crm/property-share/send. */
export async function sendPropertyShare(params: {
  waId: string;
  fields?: PropertyShareFields;
  propertyId?: string;
  module?: string;
  entityId?: string;
}): Promise<SendPropertyShareResult> {
  const { data } = await api.post<SendPropertyShareResult>("/crm/property-share/send", params);
  return data;
}

export type WhatsAppMediaMessage = {
  _id: string;
  waId: string;
  body: string;
  createdAt: string;
  attachment?: { type: "image" | "document" | "video" | "audio"; url: string; filename?: string };
};

export type SharedMediaResult = {
  images: WhatsAppMediaMessage[];
  documents: WhatsAppMediaMessage[];
  videos: WhatsAppMediaMessage[];
  audio: WhatsAppMediaMessage[];
};

/** Every attachment ever exchanged with this contact — GET /crm/whatsapp/conversations/:waId/media. */
export async function fetchSharedMedia(waId: string): Promise<SharedMediaResult> {
  const { data } = await api.get<SharedMediaResult>(
    `/crm/whatsapp/conversations/${encodeURIComponent(waId)}/media`,
  );
  return data;
}
