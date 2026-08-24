"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { CrmButton, CrmInput, CrmLabel, CrmSelect } from "@/components/crm/ui";
import { CRM_API_URL } from "@/lib/crm/config";
import { uploadCrmImages } from "@/lib/crm/media/upload-image";
import { sendPropertyShare, type PropertyShareFields } from "@/lib/crm/whatsapp/property-share-api";
import { fetchBackendPropertyListingsByLead } from "@/lib/crm/property-listings/backend-api";

type ShareDraft = {
  title: string;
  location: string;
  area: string;
  areaUnit: string;
  pricePerUnit: string;
  totalPrice: string;
  landType: string;
  roadAccess: string;
  waterLevel: string;
  highway: string;
  contactName: string;
  contactPhone: string;
  link: string;
};

const EMPTY_DRAFT: ShareDraft = {
  title: "Agricultural Land",
  location: "",
  area: "",
  areaUnit: "Acre",
  pricePerUnit: "",
  totalPrice: "",
  landType: "",
  roadAccess: "",
  waterLevel: "",
  highway: "",
  contactName: "",
  contactPhone: "",
  link: "",
};

const AREA_UNITS = ["Acre", "Bigha", "Sq. Yard", "Sq. Ft"];

type Props = {
  open: boolean;
  onClose: () => void;
  waId: string;
  leadId?: string;
  leadName?: string;
  onSuccess?: () => void;
};

/** "Share Property" — fills a brochure form, uploads images, generates the 2Bigha PDF, and sends it as a WhatsApp document. */
export default function SharePropertyModal({ open, onClose, waId, leadId, leadName, onSuccess }: Props) {
  const [draft, setDraft] = useState<ShareDraft>(EMPTY_DRAFT);
  const [images, setImages] = useState<{ url: string; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [existingProperties, setExistingProperties] = useState<
    { _id: string; title: string; price: number; areaSqft?: number; images?: string[] }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(EMPTY_DRAFT);
    setImages([]);
    if (leadId) {
      fetchBackendPropertyListingsByLead(leadId)
        .then((rows) => setExistingProperties(rows))
        .catch(() => setExistingProperties([]));
    } else {
      setExistingProperties([]);
    }
  }, [open, leadId]);

  if (!open) return null;

  const set = <K extends keyof ShareDraft>(key: K, value: ShareDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const prefillFromExisting = (id: string) => {
    const listing = existingProperties.find((p) => p._id === id);
    if (!listing) return;
    setDraft((d) => ({
      ...d,
      title: listing.title || d.title,
      area: listing.areaSqft ? String(listing.areaSqft) : d.area,
      areaUnit: listing.areaSqft ? "Sq. Ft" : d.areaUnit,
      totalPrice: listing.price ? String(listing.price) : d.totalPrice,
    }));
    if (listing.images?.length) {
      setImages(
        listing.images.map((url) => ({
          url,
          previewUrl: url.startsWith("http") ? url : `${CRM_API_URL}${url}`,
        })),
      );
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadCrmImages(Array.from(files));
      setImages((prev) => [
        ...prev,
        ...uploaded.map((u) => ({
          url: u.url,
          previewUrl: u.url.startsWith("http") ? u.url : `${CRM_API_URL}${u.url}`,
        })),
      ]);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => setImages((prev) => prev.filter((i) => i.url !== url));

  const send = async () => {
    if (!draft.title.trim() || !draft.location.trim()) {
      toast.error("Title and location are required");
      return;
    }
    if (!images.length) {
      toast.error("Add at least one property image");
      return;
    }
    setSending(true);
    try {
      const fields: PropertyShareFields = {
        title: draft.title.trim(),
        location: draft.location.trim(),
        area: draft.area.trim() || undefined,
        areaUnit: draft.areaUnit,
        pricePerUnit: draft.pricePerUnit.trim() || undefined,
        totalPrice: draft.totalPrice.trim() || undefined,
        landType: draft.landType.trim() || undefined,
        roadAccess: draft.roadAccess.trim() || undefined,
        waterLevel: draft.waterLevel.trim() || undefined,
        highway: draft.highway.trim() || undefined,
        contactName: draft.contactName.trim() || undefined,
        contactPhone: draft.contactPhone.trim() || undefined,
        link: draft.link.trim() || undefined,
        images: images.map((i) => i.url),
      };
      const result = await sendPropertyShare({ waId, fields, module: "whatsapp", entityId: leadId });
      if (!result.success) {
        toast.error(result.error || "Failed to send property");
        return;
      }
      toast.success("Property PDF sent");
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Failed to send property");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <Share2 size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">Share property</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {leadName ? `Sends a PDF brochure to ${leadName} on WhatsApp` : "Sends a PDF brochure on WhatsApp"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="space-y-4">
            {existingProperties.length > 0 && (
              <div>
                <CrmLabel>Load from existing property (optional)</CrmLabel>
                <CrmSelect className="mt-1" onChange={(e) => prefillFromExisting(e.target.value)} defaultValue="">
                  <option value="">Fill in manually</option>
                  {existingProperties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title}
                    </option>
                  ))}
                </CrmSelect>
              </div>
            )}

            <div>
              <CrmLabel required>Title</CrmLabel>
              <CrmInput
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Agricultural Land"
                className="mt-1"
              />
            </div>

            <div>
              <CrmLabel required>Location</CrmLabel>
              <CrmInput
                value={draft.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Sikar Road, Jaipur"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <CrmLabel>Area</CrmLabel>
                <CrmInput
                  value={draft.area}
                  onChange={(e) => set("area", e.target.value)}
                  placeholder="e.g. 15"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Unit</CrmLabel>
                <CrmSelect
                  className="mt-1"
                  value={draft.areaUnit}
                  onChange={(e) => set("areaUnit", e.target.value)}
                >
                  {AREA_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </CrmSelect>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <CrmLabel>Price/unit</CrmLabel>
                <CrmInput
                  value={draft.pricePerUnit}
                  onChange={(e) => set("pricePerUnit", e.target.value)}
                  placeholder="e.g. ₹45 Lakh/Acre"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Total price</CrmLabel>
                <CrmInput
                  value={draft.totalPrice}
                  onChange={(e) => set("totalPrice", e.target.value)}
                  placeholder="e.g. ₹6.75 Crore"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <CrmLabel>Land type</CrmLabel>
                <CrmInput
                  value={draft.landType}
                  onChange={(e) => set("landType", e.target.value)}
                  placeholder="e.g. Agricultural"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Road access</CrmLabel>
                <CrmInput
                  value={draft.roadAccess}
                  onChange={(e) => set("roadAccess", e.target.value)}
                  placeholder="e.g. 40 ft road"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Water level</CrmLabel>
                <CrmInput
                  value={draft.waterLevel}
                  onChange={(e) => set("waterLevel", e.target.value)}
                  placeholder="e.g. 150 ft"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <CrmLabel>Highway</CrmLabel>
                <CrmInput
                  value={draft.highway}
                  onChange={(e) => set("highway", e.target.value)}
                  placeholder="e.g. 2 km from NH-11"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Contact name</CrmLabel>
                <CrmInput
                  value={draft.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Contact phone</CrmLabel>
                <CrmInput
                  value={draft.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <CrmLabel>Link</CrmLabel>
              <CrmInput
                value={draft.link}
                onChange={(e) => set("link", e.target.value)}
                placeholder="e.g. https://2bigha.com/..."
                className="mt-1"
              />
            </div>

            <div>
              <CrmLabel required>Images</CrmLabel>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                First image is the hero shot on the brochure.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {images.map((img) => (
                  <div key={img.url} className="group relative h-20 w-20 overflow-hidden rounded-md border border-[var(--border-color)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(img.url)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  <span className="text-[10px]">Add</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFilesSelected(e.target.files)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton
            type="button"
            disabled={sending || uploading}
            onClick={() => void send()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            {sending ? "Sending…" : "Send"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
