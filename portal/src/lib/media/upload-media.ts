import api from "@/lib/hrms/api";
import { API_HOST_URL } from "@/lib/api/config";
import type { MediaAttachment, MediaUploadContext } from "@/lib/media/types";
import type { ImageUploadPreset } from "@/lib/media/optimize-image-client";
import {
  deleteUploadedImage,
  isManagedUploadUrl,
  removeUploadedImage,
  resolveUploadedImageUrl,
  uploadImageFile,
  type UploadImageOptions,
} from "@/lib/media/upload-image";

export type { MediaAttachment, MediaUploadContext };
export {
  uploadImageFile,
  resolveUploadedImageUrl,
  removeUploadedImage,
  deleteUploadedImage,
  isManagedUploadUrl,
};
export type { ImageUploadPreset, UploadImageOptions };

export type FileUploadResponse = {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  publicId?: string;
  storage?: "cloudinary" | "local";
  kind: "file";
};

/** Resolve API-relative paths for images and files. */
export function resolveMediaUrl(url: string): string {
  return resolveUploadedImageUrl(url);
}

export function isManagedMediaUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (isManagedUploadUrl(u)) return true;
  if (u.includes("res.cloudinary.com") && u.includes("/raw/upload/")) {
    return /\/mathionix\//.test(u);
  }
  if (u.includes("/uploads/files/")) return true;
  return false;
}

export async function uploadDocumentFile(
  file: File,
  context: MediaUploadContext = "uploads",
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<FileUploadResponse>("/uploads/file", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params: { context },
  });
  return data;
}

export async function deleteUploadedFile(
  url: string,
  publicId?: string,
): Promise<{ deleted: boolean; reason?: string }> {
  const { data } = await api.delete<{ deleted: boolean; reason?: string }>(
    "/uploads/file",
    { data: { url: url.trim() || undefined, publicId: publicId?.trim() || undefined } },
  );
  return data;
}

export async function removeUploadedMedia(
  attachment: Pick<MediaAttachment, "url" | "publicId" | "kind">,
): Promise<void> {
  if (!attachment.url?.trim() && !attachment.publicId?.trim()) return;
  try {
    if (attachment.kind === "file") {
      await deleteUploadedFile(attachment.url, attachment.publicId);
    } else {
      await deleteUploadedImage(attachment.url, attachment.publicId);
    }
  } catch {
    /* best-effort */
  }
}

export function fileUploadToAttachment(
  data: FileUploadResponse,
  file: File,
): MediaAttachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    url: resolveMediaUrl(data.url),
    name: data.originalName || file.name,
    mimeType: data.mimeType || file.type,
    size: data.size,
    publicId: data.publicId,
    storage: data.storage,
    kind: "file",
  };
}

export async function uploadImageAsAttachment(
  file: File,
  options: UploadImageOptions = {},
): Promise<MediaAttachment> {
  const data = await uploadImageFile(file, options);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    url: resolveMediaUrl(data.url),
    name: file.name,
    mimeType: file.type || "image/webp",
    size: data.optimizedBytes ?? file.size,
    publicId: data.publicId,
    storage: data.storage,
    kind: "image",
  };
}

export async function uploadDocumentAsAttachment(
  file: File,
  context: MediaUploadContext = "uploads",
): Promise<MediaAttachment> {
  const data = await uploadDocumentFile(file, context);
  return fileUploadToAttachment(data, file);
}
