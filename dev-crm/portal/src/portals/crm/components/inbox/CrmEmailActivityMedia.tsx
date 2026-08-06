"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CRM_API_URL } from "@/lib/crm/config";
import {
  buildCrmEmailPreviewSrcDoc,
  collectEmailCidRefsFromHtml,
  normalizeEmailCid,
} from "@/lib/crm/email/email-preview-iframe";
import { resolveMediaUrl } from "@/lib/media/upload-media";

export type CrmEmailActivityAttachment = {
  id?: string;
  filename?: string;
  name?: string;
  size?: number;
  contentType?: string;
  cid?: string;
  isInline?: boolean;
  url?: string;
};

/** Session cache so reopening the same attachment is instant. */
const attachmentBlobCache = new Map<string, string>();
/** Dedupe concurrent downloads of the same attachment. */
const attachmentBlobInflight = new Map<string, Promise<string>>();
/**
 * Inline (cid:) images must be data URLs: the preview iframe is fully sandboxed, so
 * its opaque origin cannot read blob: URLs created by this document.
 */
const attachmentDataUrlCache = new Map<string, string>();
const attachmentDataUrlInflight = new Map<string, Promise<string>>();

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
};

function authHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function attachmentLabel(att: CrmEmailActivityAttachment): string {
  return String(att.filename || att.name || "Attachment").trim() || "Attachment";
}

function isImageAttachment(att: CrmEmailActivityAttachment): boolean {
  const ct = String(att.contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const name = attachmentLabel(att).toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function isPdfAttachment(att: CrmEmailActivityAttachment): boolean {
  const ct = String(att.contentType || "").toLowerCase();
  if (ct.includes("pdf")) return true;
  return /\.pdf$/i.test(attachmentLabel(att));
}

function cacheKey(emailId: string, attachmentId: string): string {
  return `${emailId}::${attachmentId}`;
}

function chipKey(att: CrmEmailActivityAttachment): string {
  return String(att.id || att.url || attachmentLabel(att));
}

async function fetchAttachmentBlob(
  emailId: string,
  attachmentId: string,
): Promise<Blob> {
  const url = `${CRM_API_URL}/crm/inbox-accounts/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    // Allow browser to reuse recent authenticated responses when possible.
    cache: "force-cache",
  });
  if (!res.ok) throw new Error(`Attachment fetch failed (${res.status})`);
  return res.blob();
}

async function resolveAttachmentObjectUrl(
  emailId: string,
  attachmentId: string,
): Promise<string> {
  const key = cacheKey(emailId, attachmentId);
  const cached = attachmentBlobCache.get(key);
  if (cached) return cached;

  const existing = attachmentBlobInflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const blob = await fetchAttachmentBlob(emailId, attachmentId);
    const objectUrl = URL.createObjectURL(blob);
    attachmentBlobCache.set(key, objectUrl);
    return objectUrl;
  })().finally(() => {
    attachmentBlobInflight.delete(key);
  });

  attachmentBlobInflight.set(key, pending);
  return pending;
}

/** Providers often report inline images as octet-stream, which no <img> will render. */
function imageMimeType(
  blobType: string,
  att: CrmEmailActivityAttachment,
): string {
  const fromBlob = String(blobType || "").toLowerCase();
  if (fromBlob.startsWith("image/")) return fromBlob;
  const fromMeta = String(att.contentType || "").toLowerCase();
  if (fromMeta.startsWith("image/")) return fromMeta.split(";")[0].trim();
  const ext = attachmentLabel(att).split(".").pop()?.toLowerCase() || "";
  return IMAGE_MIME_BY_EXTENSION[ext] || "image/png";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read attachment"));
    reader.readAsDataURL(blob);
  });
}

async function resolveAttachmentDataUrl(
  emailId: string,
  attachmentId: string,
  att: CrmEmailActivityAttachment,
): Promise<string> {
  const key = cacheKey(emailId, attachmentId);
  const cached = attachmentDataUrlCache.get(key);
  if (cached) return cached;

  const existing = attachmentDataUrlInflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const blob = await fetchAttachmentBlob(emailId, attachmentId);
    const raw = await blobToDataUrl(blob);
    const dataUrl = raw.replace(
      /^data:[^;,]*/,
      `data:${imageMimeType(blob.type, att)}`,
    );
    attachmentDataUrlCache.set(key, dataUrl);
    return dataUrl;
  })().finally(() => {
    attachmentDataUrlInflight.delete(key);
  });

  attachmentDataUrlInflight.set(key, pending);
  return pending;
}

function isStreamableAttachmentId(id: string): boolean {
  return (
    !!id && !id.startsWith("pending-") && !id.startsWith("body-img-")
  );
}

/** Inline images become base64 in the iframe document, so keep very large parts out. */
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

function canRenderInline(att: CrmEmailActivityAttachment): boolean {
  if (Number(att.size || 0) > MAX_INLINE_IMAGE_BYTES) return false;
  const ct = String(att.contentType || "").toLowerCase();
  // A cid reference in an <img> is an image; only rule out parts that clearly are not.
  if (
    ct.startsWith("video/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("text/") ||
    ct.includes("pdf") ||
    ct.includes("zip")
  ) {
    return false;
  }
  return true;
}

/**
 * Map the `cid:` references in the email HTML to displayable image sources so inline
 * images (Outlook/Gmail embed pictures this way) render instead of showing as blanks.
 */
export function useCrmEmailInlineImages({
  bodyHtml,
  emailId,
  attachments,
}: {
  bodyHtml: string;
  emailId?: string | null;
  attachments?: CrmEmailActivityAttachment[];
}): Record<string, string> {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  // Callers rebuild the attachment array on every render; key off its contents instead.
  const attachmentsKey = useMemo(
    () =>
      JSON.stringify(
        (Array.isArray(attachments) ? attachments : []).map((a) => [
          a?.cid,
          a?.id,
          a?.filename,
          a?.name,
          a?.contentType,
          a?.size,
          a?.url,
        ]),
      ),
    [attachments],
  );

  const pending = useMemo(() => {
    const refs = collectEmailCidRefsFromHtml(bodyHtml);
    if (!refs.length) return [] as Array<{ cid: string; att: CrmEmailActivityAttachment }>;

    const byKey = new Map<string, CrmEmailActivityAttachment>();
    for (const att of Array.isArray(attachments) ? attachments : []) {
      if (!att) continue;
      // cid is authoritative; id/filename are fallbacks for providers that omit it.
      for (const candidate of [att.cid, att.id, att.filename, att.name]) {
        const key = normalizeEmailCid(String(candidate || ""));
        if (key && !byKey.has(key)) byKey.set(key, att);
      }
    }

    return refs
      .map((cid) => ({ cid, att: byKey.get(cid) }))
      .filter((row): row is { cid: string; att: CrmEmailActivityAttachment } =>
        Boolean(row.att && canRenderInline(row.att)),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachmentsKey tracks the attachment contents
  }, [bodyHtml, attachmentsKey]);

  useEffect(() => {
    if (!pending.length) return;

    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        pending.map(async ({ cid, att }) => {
          const eid = String(emailId || "").trim();
          const id = String(att.id || "").trim();
          try {
            if (eid && isStreamableAttachmentId(id)) {
              next[cid] = await resolveAttachmentDataUrl(eid, id, att);
              return;
            }
            if (att.url) next[cid] = resolveMediaUrl(String(att.url));
          } catch {
            /* leave unresolved — the preview drops the placeholder */
          }
        }),
      );
      if (cancelled || !Object.keys(next).length) return;
      setResolved((prev) => {
        const changed = Object.entries(next).some(
          ([cid, url]) => prev[cid] !== url,
        );
        return changed ? { ...prev, ...next } : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [emailId, pending]);

  // Only expose sources the current body actually references.
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const { cid } of pending) {
      if (resolved[cid]) out[cid] = resolved[cid];
    }
    return out;
  }, [pending, resolved]);
}

function downloadFromUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[/\\?%*:|"<>]/g, "_").trim() || "attachment";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Email HTML with inline (cid:) images resolved from the mailbox attachments. */
export function CrmEmailActivityBody({
  bodyHtml,
  emailId,
  attachments,
  className,
}: {
  bodyHtml: string;
  emailId?: string | null;
  attachments?: CrmEmailActivityAttachment[];
  className?: string;
}) {
  const cidToUrl = useCrmEmailInlineImages({ bodyHtml, emailId, attachments });
  const srcDoc = useMemo(
    () =>
      buildCrmEmailPreviewSrcDoc(bodyHtml, cidToUrl, {
        dropUnresolvedImages: true,
      }),
    [bodyHtml, cidToUrl],
  );

  return (
    <iframe
      title="Email message"
      className={
        className ||
        "w-full min-h-[280px] rounded-[var(--radius-md)] border border-border bg-white"
      }
      sandbox=""
      srcDoc={srcDoc}
    />
  );
}

type PreviewState = {
  kind: "image" | "pdf";
  title: string;
  url: string | null;
  loading: boolean;
};

/** Attachment chips (images + PDFs): open only on click — same pattern for both. */
export function CrmEmailActivityAttachments({
  emailId,
  attachments,
  onDownload,
}: {
  emailId?: string | null;
  attachments?: CrmEmailActivityAttachment[];
  onDownload?: (emailId: string, attachment: { id: string; filename: string }) => void;
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const openSeqRef = useRef(0);

  // Callers rebuild the attachment array on every render; key off its contents instead.
  const attachmentsKey = useMemo(
    () =>
      JSON.stringify(
        (Array.isArray(attachments) ? attachments : []).map((a) => [
          a?.id,
          a?.filename,
          a?.name,
          a?.contentType,
          a?.size,
          a?.url,
        ]),
      ),
    [attachments],
  );

  const visible = useMemo(() => {
    const list = Array.isArray(attachments) ? attachments : [];
    return list.filter((a) => a && (a.id || a.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachmentsKey tracks the attachment contents
  }, [attachmentsKey]);

  // Small thumbnail previews for image chips (reuse blob cache when possible).
  useEffect(() => {
    let cancelled = false;
    const images = visible.filter((a) => isImageAttachment(a));
    if (!images.length) return;

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        images.map(async (att) => {
          const key = chipKey(att);
          const mediaUrl = att.url ? resolveMediaUrl(String(att.url)) : "";
          const eid = String(emailId || "").trim();
          const id = String(att.id || "").trim();

          try {
            if (mediaUrl && (!eid || !isStreamableAttachmentId(id))) {
              next[key] = mediaUrl;
              return;
            }
            if (eid && isStreamableAttachmentId(id)) {
              next[key] = await resolveAttachmentObjectUrl(eid, id);
              return;
            }
            if (mediaUrl) next[key] = mediaUrl;
          } catch {
            /* keep icon fallback */
          }
        }),
      );
      if (cancelled || !Object.keys(next).length) return;
      setThumbUrls((prev) => {
        const changed = Object.entries(next).some(
          ([key, url]) => prev[key] !== url,
        );
        return changed ? { ...prev, ...next } : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [emailId, visible]);

  if (!visible.length) return null;

  const closePreview = () => {
    openSeqRef.current += 1;
    setPreview(null);
  };

  const prefetchAttachment = (att: CrmEmailActivityAttachment) => {
    if (!isImageAttachment(att) && !isPdfAttachment(att)) return;
    const eid = String(emailId || "").trim();
    const id = String(att.id || "").trim();
    if (!eid || !id || id.startsWith("pending-") || id.startsWith("body-img-")) {
      return;
    }
    if (attachmentBlobCache.has(cacheKey(eid, id))) return;
    void resolveAttachmentObjectUrl(eid, id)
      .then((url) => {
        if (isImageAttachment(att)) {
          setThumbUrls((prev) =>
            prev[chipKey(att)] ? prev : { ...prev, [chipKey(att)]: url },
          );
        }
      })
      .catch(() => undefined);
  };

  const openPreview = (att: CrmEmailActivityAttachment) => {
    const label = attachmentLabel(att);
    const key = chipKey(att);
    const kind: "image" | "pdf" = isPdfAttachment(att) ? "pdf" : "image";
    if (!isImageAttachment(att) && !isPdfAttachment(att)) {
      const fallback = att.url ? resolveMediaUrl(String(att.url)) : "";
      if (fallback) {
        window.open(fallback, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error("Attachment is not available to preview");
      return;
    }

    // Instant: reuse thumbnail / cached blob already in memory
    const warmUrl =
      thumbUrls[key] ||
      (() => {
        const eid = String(emailId || "").trim();
        const id = String(att.id || "").trim();
        return eid && id ? attachmentBlobCache.get(cacheKey(eid, id)) : undefined;
      })();
    if (warmUrl) {
      setPreview({ kind, title: label, url: warmUrl, loading: false });
      return;
    }

    const mediaUrl = att.url ? resolveMediaUrl(String(att.url)) : "";
    const eid = String(emailId || "").trim();
    const id = String(att.id || "").trim();
    const useDirectUrl =
      !!mediaUrl &&
      (!eid ||
        !id ||
        id.startsWith("pending-") ||
        id.startsWith("body-img-"));

    if (useDirectUrl || (!!mediaUrl && !eid)) {
      setPreview({ kind, title: label, url: mediaUrl, loading: false });
      return;
    }

    // Prefer mailbox attachment stream when we have emailId + attachment id
    if (eid && id && !id.startsWith("pending-") && !id.startsWith("body-img-")) {
      const seq = ++openSeqRef.current;
      setPreview({
        kind,
        title: label,
        url: null,
        loading: true,
      });

      void (async () => {
        try {
          // Joins in-flight thumb download when present — no second network trip
          const objectUrl = await resolveAttachmentObjectUrl(eid, id);
          if (openSeqRef.current !== seq) return;
          setThumbUrls((prev) => ({ ...prev, [key]: objectUrl }));
          setPreview({ kind, title: label, url: objectUrl, loading: false });
        } catch {
          if (openSeqRef.current !== seq) return;
          if (mediaUrl) {
            setPreview({ kind, title: label, url: mediaUrl, loading: false });
            return;
          }
          setPreview(null);
          toast.error("Could not open attachment");
        }
      })();
      return;
    }

    if (mediaUrl) {
      setPreview({ kind, title: label, url: mediaUrl, loading: false });
      return;
    }

    toast.error("Attachment is not available to preview");
  };

  return (
    <>
      <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
        <div className="flex flex-wrap gap-2">
          {visible.map((att) => {
            const id = chipKey(att);
            const label = attachmentLabel(att);
            const image = isImageAttachment(att);
            const pdf = isPdfAttachment(att);
            const canOpen = image || pdf;

            return (
              <div
                key={id}
                onMouseEnter={() => prefetchAttachment(att)}
                onFocusCapture={() => prefetchAttachment(att)}
                className="group/att flex max-w-full items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-dim/20 px-2.5 py-1.5 text-xs font-semibold text-text-main"
              >
                {image ? (
                  <button
                    type="button"
                    onClick={() => openPreview(att)}
                    className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--border-color)] bg-white"
                    title={`Preview ${label}`}
                    aria-label={`Preview ${label}`}
                  >
                    {thumbUrls[id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrls[id]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sky-600">
                        <ImageIcon size={14} />
                      </span>
                    )}
                  </button>
                ) : pdf ? (
                  <FileText size={12} className="shrink-0 text-rose-500" />
                ) : (
                  <Paperclip size={12} className="shrink-0 text-text-muted" />
                )}
                <span className="max-w-[200px] truncate">{label}</span>
                {att.size ? (
                  <span className="text-xs font-medium text-text-muted">
                    ({(Number(att.size) / 1024).toFixed(1)} KB)
                  </span>
                ) : null}
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => openPreview(att)}
                    className="ml-1 inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-2.5 text-[11px] font-semibold text-[var(--text-main)] shadow-none transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-light)] hover:text-[var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/30 active:bg-[var(--surface-dim)]"
                  >
                    Open
                  </button>
                ) : null}
                {emailId && att.id && onDownload && !String(att.id).startsWith("pending-") && !String(att.id).startsWith("body-img-") ? (
                  <button
                    type="button"
                    onClick={() =>
                      onDownload(String(emailId), {
                        id: String(att.id),
                        filename: label,
                      })
                    }
                    className="rounded-md px-1.5 py-0.5 text-text-muted transition-colors hover:bg-white hover:text-primary"
                    title="Download"
                    aria-label={`Download ${label}`}
                  >
                    <Download size={12} />
                  </button>
                ) : att.url ? (
                  <button
                    type="button"
                    onClick={() =>
                      downloadFromUrl(resolveMediaUrl(String(att.url)), label)
                    }
                    className="rounded-md px-1.5 py-0.5 text-text-muted transition-colors hover:bg-white hover:text-primary"
                    title="Download"
                    aria-label={`Download ${label}`}
                  >
                    <Download size={12} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent
          hideCloseButton
          className="flex max-h-[92vh] w-[min(96vw,960px)] max-w-[960px] flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-4 py-3">
            <DialogTitle className="truncate text-sm font-semibold">
              {preview?.title || "Attachment"}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {preview?.url ? (
                <a
                  href={preview.url}
                  download={preview.title}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-semibold text-text-main hover:bg-surface-dim"
                >
                  <Download size={12} />
                  Download
                </a>
              ) : null}
              <button
                type="button"
                onClick={closePreview}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-dim hover:text-text-main"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
          </DialogHeader>
          <div className="relative min-h-[240px] flex-1 bg-[var(--surface-dim)]">
            {preview?.loading || !preview?.url ? (
              <div className="flex h-[min(60vh,520px)] flex-col items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                Opening…
              </div>
            ) : preview.kind === "pdf" ? (
              <iframe
                title={preview.title}
                src={preview.url}
                className="h-[min(80vh,820px)] w-full border-0 bg-white"
              />
            ) : (
              <div className="flex max-h-[min(80vh,820px)] items-center justify-center overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt={preview.title}
                  className="max-h-[min(76vh,780px)] max-w-full object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
