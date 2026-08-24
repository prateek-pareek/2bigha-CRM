"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { fetchSharedMedia, type SharedMediaResult } from "@/lib/crm/whatsapp/property-share-api";

type Props = {
  open: boolean;
  onClose: () => void;
  waId: string;
};

function toAbsolute(url: string): string {
  return url.startsWith("http") ? url : `${CRM_API_URL}${url}`;
}

/** Slide-over listing every image/document ever shared with this contact — mirrors WhatsApp Web's Media/Docs tabs. */
export default function SharedMediaPanel({ open, onClose, waId }: Props) {
  const [media, setMedia] = useState<SharedMediaResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !waId) return;
    setLoading(true);
    fetchSharedMedia(waId)
      .then(setMedia)
      .catch(() => setMedia({ images: [], documents: [], videos: [], audio: [] }))
      .finally(() => setLoading(false));
  }, [open, waId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Shared media</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#667781]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Images ({media?.images.length ?? 0})
                </h4>
                {media?.images.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {media.images.map((m) => (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => window.open(toAbsolute(m.attachment!.url), "_blank")}
                        className="aspect-square overflow-hidden rounded-md border border-[var(--border-color)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={toAbsolute(m.attachment!.url)}
                          alt={m.attachment?.filename || "Image"}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">No images shared yet.</p>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Documents ({media?.documents.length ?? 0})
                </h4>
                {media?.documents.length ? (
                  <div className="space-y-2">
                    {media.documents.map((m) => (
                      <div
                        key={m._id}
                        className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] p-2 text-xs"
                      >
                        <FileText size={18} className="shrink-0 text-slate-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[var(--text-main)]">
                            {m.attachment?.filename || "Document"}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            {new Date(m.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <a
                          href={toAbsolute(m.attachment!.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[11px] font-medium text-sky-600 hover:underline"
                        >
                          Open
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">No documents shared yet.</p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
