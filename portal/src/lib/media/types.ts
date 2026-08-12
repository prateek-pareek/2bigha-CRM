/** Product area — server disk folder: uploads/{context}/ */
export type MediaUploadContext = "crm" | "social" | "hrms" | "pm" | "wiki" | "uploads";

export type MediaAttachment = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size?: number;
  publicId?: string;
  storage?: "local";
  kind: "image" | "file";
};
