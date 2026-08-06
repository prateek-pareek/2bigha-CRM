import api from "@/lib/hrms/api";
import { API_HOST_URL } from "@/lib/api/config";
import type { MediaUploadContext } from "@/lib/media/types";
import {
  optimizeImageFileClient,
  type ImageUploadPreset,
} from "@/lib/media/optimize-image-client";

/** @deprecated use MediaUploadContext from @/lib/media/types */
export type ImageUploadContext = MediaUploadContext;

export type ImageUploadResponse = {
  url: string;
  filename: string;
  publicId?: string;
  storage?: "cloudinary" | "local";
  width?: number;
  height?: number;
  originalBytes?: number;
  optimizedBytes?: number;
  optimized?: boolean;
};

export type UploadImageOptions = {
  /** Product area — stored under mathionix/{context}/ on Cloudinary */
  context?: MediaUploadContext;
  /** Size/quality preset: avatar (512px), inline (1280), cover (2048), default (1920) */
  preset?: ImageUploadPreset;
  /** Set false to skip browser compression (server still optimizes) */
  clientOptimize?: boolean;
};

/** Resolve API-relative upload paths to absolute URLs for display. */
export function resolveUploadedImageUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${API_HOST_URL}${u}`;
  return u;
}

/** Normalize before saving to API so public blog + syndication get reachable URLs. */
export function normalizeStoredImageUrl(url: string): string {
  return resolveUploadedImageUrl(url.trim());
}

/** Absolutize `<img src="…">` URLs in blog body HTML before save. */
export function normalizeStoredImageUrlsInHtml(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return raw;

  return raw.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (_match, prefix: string, src: string, suffix: string) => {
      const next = normalizeStoredImageUrl(src);
      return next ? `${prefix}${next}${suffix}` : `${prefix}${src}${suffix}`;
    },
  );
}

/** Absolutize image `src` attrs in TipTap / ProseMirror JSON before save. */
export function normalizeStoredImageUrlsInTipTapJson(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc;
  const node = doc as { type?: string; attrs?: { src?: string }; content?: unknown[] };
  if (node.type === "image" && node.attrs?.src) {
    return {
      ...node,
      attrs: {
        ...node.attrs,
        src: normalizeStoredImageUrl(String(node.attrs.src)),
      },
    };
  }
  if (!Array.isArray(node.content)) return doc;
  return {
    ...node,
    content: node.content.map((child) => normalizeStoredImageUrlsInTipTapJson(child)),
  };
}

/**
 * Optimize (browser) then upload via `/api/uploads/image`.
 * Works across CRM, PM, HRMS, Social desk, and Wiki — JWT only.
 */
export async function uploadImageFile(
  file: File,
  options: UploadImageOptions = {},
): Promise<ImageUploadResponse> {
  const { context = "uploads", preset = "default", clientOptimize = true } = options;

  const prepared = clientOptimize
    ? await optimizeImageFileClient(file, { preset })
    : file;

  const formData = new FormData();
  formData.append("file", prepared);

  const { data } = await api.post<ImageUploadResponse>("/uploads/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params: { context, preset },
  });
  return data;
}

/** Upload and return a display-ready absolute URL. */
export async function uploadImageAndResolveUrl(
  file: File,
  options?: UploadImageOptions,
): Promise<string> {
  const result = await uploadImageFile(file, options);
  return resolveUploadedImageUrl(result.url);
}

/** Collect managed image URLs from TipTap / ProseMirror JSON. */
export function extractManagedImageUrlsFromTipTapJson(doc: unknown): string[] {
  const urls = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: { src?: string }; content?: unknown[] };
    if (n.type === "image") {
      const src = String(n.attrs?.src || "").trim();
      if (src && isManagedUploadUrl(src)) urls.add(src);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return [...urls];
}

/** Collect managed image URLs from HTML `<img src="…">` tags. */
export function extractManagedImageUrlsFromHtml(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (src && isManagedUploadUrl(src)) {
      urls.add(src);
    }
  }
  return [...urls];
}

/** True if URL is from our API /uploads or Cloudinary mathionix folder. */
export function isManagedUploadUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.includes("/uploads/") && !u.includes("res.cloudinary.com")) {
    try {
      const path = u.startsWith("http") ? new URL(u).pathname : u;
      return /^\/uploads\/[^/?#]+$/.test(path);
    } catch {
      return /^\/uploads\/[^/?#]+$/.test(u);
    }
  }
  if (u.includes("res.cloudinary.com")) {
    if (u.includes("/image/upload/") || u.includes("/raw/upload/")) {
      return /\/mathionix\//.test(u);
    }
  }
  if (u.includes("/uploads/files/")) return true;
  return false;
}

export type DeleteImageResponse = {
  deleted: boolean;
  storage?: "cloudinary" | "local";
  reason?: string;
};

/**
 * Remove image from Cloudinary (or local ./uploads). No-op for external URLs.
 * Call when the user removes/replaces an image in the UI.
 */
export async function deleteUploadedImage(
  url: string,
  publicId?: string,
): Promise<DeleteImageResponse> {
  const u = url.trim();
  if (!u && !publicId?.trim()) {
    return { deleted: false, reason: "empty" };
  }
  if (!publicId && !isManagedUploadUrl(u)) {
    return { deleted: false, reason: "external_url" };
  }
  const { data } = await api.delete<DeleteImageResponse>("/uploads/image", {
    data: { url: u || undefined, publicId: publicId?.trim() || undefined },
  });
  return data;
}

/** Clear UI value and delete backing file when it was uploaded through our stack. */
export async function removeUploadedImage(
  url: string,
  publicId?: string,
): Promise<void> {
  if (!url.trim() && !publicId?.trim()) return;
  try {
    await deleteUploadedImage(url, publicId);
  } catch {
    // Best-effort: UI still clears even if delete fails (e.g. already removed)
  }
}
