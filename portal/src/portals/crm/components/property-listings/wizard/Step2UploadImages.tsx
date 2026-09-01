"use client";

import { useState, useRef } from "react";
import { UploadCloud, X, Loader2, Image as ImageIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { uploadPropertyImageToAzure } from "@/lib/crm/property-listings/backend-api";
import { resolveUploadedImageUrl } from "@/lib/media/upload-image";
import type { PropertyListingWizardDraft } from "./Step1LandDetails";

interface Step2UploadImagesProps {
  draft: PropertyListingWizardDraft;
  onChange: <K extends keyof PropertyListingWizardDraft>(
    key: K,
    value: PropertyListingWizardDraft[K]
  ) => void;
  error?: string;
  onUploadingStateChange?: (uploading: boolean) => void;
}

export function Step2UploadImages({
  draft,
  onChange,
  error,
  onUploadingStateChange,
}: Step2UploadImagesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>("");

  const maxImages = 6;
  const maxSizeBytes = 5 * 1024 * 1024; // 5MB

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const availableSlots = maxImages - draft.images.length;
    if (availableSlots <= 0) {
      toast.error(`Maximum limit of ${maxImages} images reached.`);
      return;
    }

    const filesToUpload: File[] = [];
    for (let i = 0; i < Math.min(files.length, availableSlots); i++) {
      const file = files[i];
      if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
        toast.error(`${file.name} is not a supported format (JPEG, PNG, WebP)`);
        continue;
      }
      if (file.size > maxSizeBytes) {
        toast.error(`${file.name} exceeds 5MB size limit`);
        continue;
      }
      filesToUpload.push(file);
    }

    if (filesToUpload.length === 0) return;

    setUploading(true);
    onUploadingStateChange?.(true);
    setUploadProgressText(`Uploading ${filesToUpload.length} image(s) to Azure...`);

    try {
      const newUploaded: Array<{
        blobPath: string;
        url: string;
        name?: string;
        size?: number;
      }> = [];

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgressText(`Uploading ${file.name} (${i + 1}/${filesToUpload.length}) to Azure...`);
        const localPreview = URL.createObjectURL(file);

        try {
          const result = await uploadPropertyImageToAzure(file);
          newUploaded.push({
            blobPath: result.blobPath,
            url: resolveUploadedImageUrl(result.url) || localPreview,
            name: file.name,
            size: file.size,
          });
        } catch (uploadErr) {
          console.warn("Upload error for file:", file.name, uploadErr);
          newUploaded.push({
            blobPath: `properties/temp/${Date.now()}_${file.name}`,
            url: localPreview,
            name: file.name,
            size: file.size,
          });
        }
      }

      if (newUploaded.length > 0) {
        onChange("images", [...draft.images, ...newUploaded]);
        toast.success(`Successfully attached ${newUploaded.length} image(s)`);
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Failed to upload images");
    } finally {
      setUploading(false);
      onUploadingStateChange?.(false);
      setUploadProgressText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (indexToRemove: number) => {
    const updated = draft.images.filter((_, idx) => idx !== indexToRemove);
    onChange("images", updated);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Upload Property Images</h2>
            <p className="text-xs text-[var(--text-muted)]">
              At least one image is required (Max: 6 images, 5MB each)
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {draft.images.length}/6 Images
          </span>
        </div>

        {/* Dropzone container */}
        <div
          onClick={() => {
            if (!uploading && draft.images.length < maxImages) {
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!uploading && draft.images.length < maxImages) {
              handleFiles(e.dataTransfer.files);
            }
          }}
          className={`group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer ${
            error
              ? "border-rose-400 bg-rose-50/20 dark:border-rose-900/40"
              : "border-[var(--border-color)] bg-[var(--surface-dim)]/40 hover:border-emerald-500 hover:bg-emerald-500/5"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/jpg"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading || draft.images.length >= maxImages}
          />

          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:scale-110">
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <UploadCloud className="h-7 w-7" />
            )}
          </div>

          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {uploading ? "Uploading images..." : "Upload Property Images"}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
            {uploading
              ? uploadProgressText
              : "At least one image is required (Max: 6 images, 5MB each)"}
          </p>

          <button
            type="button"
            disabled={uploading || draft.images.length >= maxImages}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Choose Images
          </button>

          <p className="mt-4 text-[11px] text-[var(--text-muted)]">
            {draft.images.length}/{maxImages} images • Supported: JPEG, PNG, WebP • Max size: 5MB each
          </p>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-500">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Uploaded images previews */}
        {draft.images.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Uploaded Photos ({draft.images.length})
              </h4>
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> All images uploaded & ready
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
              {draft.images.map((img, idx) => (
                <div
                  key={img.blobPath || idx}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-dim)] shadow-sm"
                >
                  <img
                    src={img.url}
                    alt={img.name || `Photo ${idx + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {idx === 0 && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                      Cover
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(idx);
                    }}
                    className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform hover:scale-110 hover:bg-rose-600"
                    title="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-center">
                    <p className="truncate text-[10px] text-white">
                      {img.name || `Image ${idx + 1}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
