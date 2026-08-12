"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  removeUploadedImage,
  resolveUploadedImageUrl,
  uploadImageFile,
} from "@/lib/media/upload-image";
import type { MediaUploadContext } from "@/lib/media/types";
import type { ImageUploadPreset } from "@/lib/media/optimize-image-client";

type Props = {
  value: string;
  onChange: (url: string) => void;
  /** CRM, PM, HRMS, social, wiki — organizes server-disk upload folders */
  context?: MediaUploadContext;
  preset?: ImageUploadPreset;
  disabled?: boolean;
  label?: string;
  hint?: string;
  showUrlInput?: boolean;
  accept?: string;
  className?: string;
};

/**
 * Reusable image picker: compress in browser → upload to this server's local disk.
 * Removing or replacing an image deletes it from local server storage.
 */
export function ImageUploadField({
  value,
  onChange,
  context = "uploads",
  preset = "default",
  disabled = false,
  label = "Image",
  hint,
  showUrlInput = true,
  accept = "image/jpeg,image/png,image/webp,image/gif",
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [publicId, setPublicId] = useState<string | undefined>();
  const preview = resolveUploadedImageUrl(value);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;
    setUploading(true);
    try {
      if (value.trim()) {
        await removeUploadedImage(value, publicId);
      }
      const data = await uploadImageFile(file, { context, preset });
      setPublicId(data.publicId);
      onChange(resolveUploadedImageUrl(data.url));
      const saved =
        data.originalBytes && data.optimizedBytes
          ? ` (${Math.round((1 - data.optimizedBytes / data.originalBytes) * 100)}% smaller)`
          : "";
      toast.success(`Image uploaded${saved}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!value.trim() || disabled) return;
    setRemoving(true);
    try {
      await removeUploadedImage(value, publicId);
      setPublicId(undefined);
      onChange("");
    } catch {
      toast.error("Could not delete image from storage");
    } finally {
      setRemoving(false);
    }
  };

  const handleUrlChange = (next: string) => {
    if (!next.trim() && value.trim()) {
      void removeUploadedImage(value, publicId).then(() => {
        setPublicId(undefined);
        onChange("");
      });
      return;
    }
    if (next.trim() !== value.trim()) {
      setPublicId(undefined);
    }
    onChange(next);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label ? (
        <Label className="text-sm font-semibold text-[var(--text-main)]">{label}</Label>
      ) : null}
      {hint ? <p className="text-xs text-[var(--primary-muted)]">{hint}</p> : null}

      {preview ? (
        <div className="relative overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="w-full max-h-40 object-cover" />
          {!disabled ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2 h-7 w-7 p-0"
              disabled={removing}
              onClick={() => void handleRemove()}
              aria-label="Remove image"
            >
              {removing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-[var(--border-color)] bg-slate-50/50 text-[var(--primary-muted)]">
          <ImageIcon className="h-8 w-8 opacity-40" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void handleFile(e)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs font-semibold"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5 mr-1" />
          )}
          Upload image
        </Button>
      </div>

      {showUrlInput ? (
        <Input
          type="url"
          value={value}
          onChange={(e) => handleUrlChange(e.target.value)}
          readOnly={disabled}
          placeholder="Or paste image URL"
          className="text-sm"
        />
      ) : null}
    </div>
  );
}

