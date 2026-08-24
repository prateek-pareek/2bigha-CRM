import api from "@/lib/crm/api";

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

/** Generates the property PDF and sends it to `waId` as a WhatsApp document — POST /crm/property-share/send. */
export async function sendPropertyShare(params: {
  waId: string;
  fields: PropertyShareFields;
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
