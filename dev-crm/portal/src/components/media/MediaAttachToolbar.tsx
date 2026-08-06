"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type MediaAttachment,
  type MediaUploadContext,
  removeUploadedMedia,
  resolveMediaUrl,
  uploadDocumentAsAttachment,
  uploadImageAsAttachment,
} from "@/lib/media/upload-media";
import type { ImageUploadPreset } from "@/lib/media/optimize-image-client";

type Props = {
  attachments: MediaAttachment[];
  onChange: (attachments: MediaAttachment[]) => void;
  context?: MediaUploadContext;
  imagePreset?: ImageUploadPreset;
  disabled?: boolean;
  className?: string;
};

/** Attach images or files (PM tickets, CRM notes, etc.) before sending a comment or form. */
export function MediaAttachToolbar({
  attachments,
  onChange,
  context = "pm",
  imagePreset = "inline",
  disabled = false,
  className = "",
}: Props) {
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;
    setUploading(true);
    try {
      const att = await uploadImageAsAttachment(file, { context, preset: imagePreset });
      onChange([...attachments, att]);
      toast.success("Image attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;
    setUploading(true);
    try {
      const att = await uploadDocumentAsAttachment(file, context);
      onChange([...attachments, att]);
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "File upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = (id: string) => {
    const att = attachments.find((a) => a.id === id);
    if (att) void removeUploadedMedia(att);
    onChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={imageRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void pickImage(e)}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,application/pdf"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void pickFile(e)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs gap-1"
          disabled={disabled || uploading}
          onClick={() => imageRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          Image
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs gap-1"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          File
        </Button>
      </div>

      {attachments.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-2 py-1.5 text-xs"
            >
              {att.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveMediaUrl(att.url)}
                  alt=""
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              )}
              <a
                href={resolveMediaUrl(att.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate font-medium text-[var(--hs-link)] hover:underline"
              >
                {att.name}
              </a>
              {!disabled ? (
                <button
                  type="button"
                  className="shrink-0 p-0.5 text-[var(--text-muted)] hover:text-red-600"
                  onClick={() => remove(att.id)}
                  aria-label="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
