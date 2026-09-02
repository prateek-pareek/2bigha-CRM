"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  Paperclip,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CrmButton, CrmInput, CrmLabel, CrmSelect } from "@/components/crm/ui";
import { CRM_API_URL } from "@/lib/crm/config";
import { uploadCrmImages } from "@/lib/crm/media/upload-image";
import {
  generatePropertyBrochurePdf,
  sendPropertyShare,
  type PropertyShareFields,
} from "@/lib/crm/whatsapp/property-share-api";
import { fetchBackendPropertyListingsByLead } from "@/lib/crm/property-listings/backend-api";
import PropertySearchDropdown, {
  type PropertyOption,
} from "@/portals/crm/components/inbox/PropertySearchDropdown";

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

export default function SharePropertyModal({
  open,
  onClose,
  waId,
  leadId,
  leadName,
  onSuccess,
}: Props) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [draft, setDraft] = useState<ShareDraft>(EMPTY_DRAFT);
  const [images, setImages] = useState<{ url: string; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [brochurePdfUrl, setBrochurePdfUrl] = useState<string>("");
  const [brochurePdfFilename, setBrochurePdfFilename] = useState<string>("");
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [isCustomized, setIsCustomized] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(EMPTY_DRAFT);
    setImages([]);
    setSelectedPropertyId("");
    setBrochurePdfUrl("");
    setBrochurePdfFilename("");
    setShowCustomFields(false);
    setIsCustomized(false);

    const token = localStorage.getItem("token");
    setLoadingProperties(true);

    const loadAllProps = async () => {
      try {
        let list: PropertyOption[] = [];
        if (leadId) {
          try {
            const leadProps = await fetchBackendPropertyListingsByLead(leadId);
            if (Array.isArray(leadProps)) {
              list.push(...leadProps);
            }
          } catch {
            // ignore
          }
        }
        const res = await fetch(`${CRM_API_URL}/crm/property-listings?pageSize=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        const allProps = Array.isArray(data) ? data : (data.data || []);
        const existingIds = new Set(list.map((p) => p._id || p.id));
        for (const p of allProps) {
          if (!existingIds.has(p._id || p.id)) {
            list.push(p);
          }
        }
        setProperties(list);
        if (list.length > 0) {
          handleSelectProperty(list[0]._id || list[0].id || "", list[0]);
        }
      } catch (err) {
        console.error("Failed to load properties:", err);
      } finally {
        setLoadingProperties(false);
      }
    };

    void loadAllProps();
  }, [open, leadId]);

  const handleSelectProperty = (id: string, prop: PropertyOption) => {
    setSelectedPropertyId(id);
    if (prop.brochurePdfUrl) {
      setBrochurePdfUrl(prop.brochurePdfUrl);
      setBrochurePdfFilename(`${prop.title || "2Bigha-Brochure"}.pdf`);
    } else {
      setBrochurePdfUrl("");
      setBrochurePdfFilename("");
    }

    const loc = [prop.city, prop.district, prop.state].filter(Boolean).join(", ") || prop.address || "";
    setDraft({
      title: prop.title || prop.propertyName || "Agricultural Land",
      location: loc,
      area: prop.areaSqft ? String(prop.areaSqft) : "",
      areaUnit: prop.areaUnit || "Sq. Ft",
      pricePerUnit: "",
      totalPrice: prop.price ? `₹${Number(prop.price).toLocaleString("en-IN")}` : "",
      landType: prop.propertyType || "Agricultural",
      roadAccess: prop.roadAccess || "",
      waterLevel: prop.waterLevel || "",
      highway: prop.highway || "",
      contactName: prop.contactName || "",
      contactPhone: prop.contactPhone || "",
      link: prop.link || "",
    });

    if (Array.isArray(prop.images) && prop.images.length > 0) {
      setImages(
        prop.images.map((url) => ({
          url,
          previewUrl: url.startsWith("http") ? url : `${CRM_API_URL}${url}`,
        })),
      );
    } else {
      setImages([]);
    }
    setIsCustomized(false);
  };

  const selectedProperty = useMemo(() => {
    return properties.find((p) => (p._id || p.id) === selectedPropertyId);
  }, [properties, selectedPropertyId]);

  if (!open) return null;

  const set = <K extends keyof ShareDraft>(key: K, value: ShareDraft[K]) => {
    setIsCustomized(true);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setIsCustomized(true);
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

  const removeImage = (url: string) => {
    setIsCustomized(true);
    setImages((prev) => prev.filter((i) => i.url !== url));
  };

  const handleRegenerateBrochure = async () => {
    if (!selectedPropertyId) return;
    setGeneratingPdf(true);
    try {
      const result = await generatePropertyBrochurePdf({
        propertyId: selectedPropertyId,
        forceRegenerate: true,
        fields: isCustomized
          ? {
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
            }
          : undefined,
      });

      if (result?.url) {
        setBrochurePdfUrl(result.url);
        setBrochurePdfFilename(result.filename || "2Bigha-Property-Brochure.pdf");
        toast.success("Fresh Azure Brochure PDF generated!");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to regenerate brochure");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const send = async () => {
    if (!draft.title.trim() || !draft.location.trim()) {
      toast.error("Title and location are required");
      return;
    }

    setSending(true);
    try {
      const fields: PropertyShareFields | undefined = isCustomized
        ? {
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
          }
        : undefined;

      const result = await sendPropertyShare({
        waId,
        propertyId: selectedPropertyId || undefined,
        fields,
        module: "whatsapp",
        entityId: leadId,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to send property brochure");
        return;
      }
      toast.success("Property brochure PDF delivered directly to WhatsApp!");
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Failed to send property brochure");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shadow-xs">
              <Share2 size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Share Property Brochure</h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Deliver 2Bigha PDF brochure directly to{" "}
                <span className="font-semibold text-slate-700">{waId}</span>
                {leadName && ` (${leadName})`} (24h Window)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-4 bg-slate-50/40 flex-1">
          {/* Property Combobox Selector */}
          <div className="bg-white p-4 rounded-xl border border-emerald-500/20 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Building2 size={14} className="text-emerald-600" />
                Select Property / Project
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                2Bigha Database
              </span>
            </div>

            <PropertySearchDropdown
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              onSelect={handleSelectProperty}
              loading={loadingProperties}
            />
          </div>

          {/* Selected Property Preview & Azure Status Card */}
          {selectedProperty && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      {selectedProperty.title || selectedProperty.propertyName}
                    </h4>
                    {brochurePdfUrl && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                        <Sparkles size={10} className="text-emerald-600" /> Azure PDF Ready
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400 shrink-0" />
                    {[selectedProperty.city, selectedProperty.district, selectedProperty.state].filter(Boolean).join(", ") || selectedProperty.address || "Location on request"}
                  </p>
                </div>
                {selectedProperty.price && (
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                    ₹{Number(selectedProperty.price).toLocaleString("en-IN")}
                  </span>
                )}
              </div>

              {/* Actions: Preview PDF / Regenerate PDF */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                {brochurePdfUrl ? (
                  <a
                    href={brochurePdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
                  >
                    <ExternalLink size={12} /> Preview Azure PDF
                  </a>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <Paperclip size={12} /> PDF will be auto-generated upon send
                  </span>
                )}

                <CrmButton
                  type="button"
                  variant="secondary"
                  disabled={generatingPdf}
                  onClick={() => void handleRegenerateBrochure()}
                  className="h-8 px-3 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  {generatingPdf ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={12} /> {brochurePdfUrl ? "Regenerate PDF" : "Generate PDF Now"}
                    </>
                  )}
                </CrmButton>
              </div>
            </div>
          )}

          {/* Toggle Customize Details Accordion */}
          <button
            type="button"
            onClick={() => setShowCustomFields((prev) => !prev)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <span>
              {showCustomFields ? "Hide Custom Details" : "Customize Brochure Details / Photos"}
              {isCustomized && (
                <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Customized
                </span>
              )}
            </span>
            {showCustomFields ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* Expandable Custom Fields Section */}
          {showCustomFields && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* General Info */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                  General Info
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <CrmLabel required className="text-xs font-bold text-slate-700">
                      Title
                    </CrmLabel>
                    <CrmInput
                      value={draft.title}
                      onChange={(e) => set("title", e.target.value)}
                      placeholder="e.g. Agricultural Land"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel required className="text-xs font-bold text-slate-700">
                      Location
                    </CrmLabel>
                    <CrmInput
                      value={draft.location}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder="e.g. Dumka, Jharkhand"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Area & Price */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                  Area & Price
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <CrmLabel className="text-xs font-bold text-slate-700">Area</CrmLabel>
                    <CrmInput
                      value={draft.area}
                      onChange={(e) => set("area", e.target.value)}
                      placeholder="e.g. 15"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Unit</CrmLabel>
                    <CrmSelect
                      className="mt-1 h-9 text-xs border-slate-200 bg-white"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Price / Unit</CrmLabel>
                    <CrmInput
                      value={draft.pricePerUnit}
                      onChange={(e) => set("pricePerUnit", e.target.value)}
                      placeholder="e.g. ₹45 Lakh / Acre"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Total Price</CrmLabel>
                    <CrmInput
                      value={draft.totalPrice}
                      onChange={(e) => set("totalPrice", e.target.value)}
                      placeholder="e.g. ₹6.75 Crore"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Technical Features */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                  Technical Features
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Land Type</CrmLabel>
                    <CrmInput
                      value={draft.landType}
                      onChange={(e) => set("landType", e.target.value)}
                      placeholder="e.g. Agricultural"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Road Access</CrmLabel>
                    <CrmInput
                      value={draft.roadAccess}
                      onChange={(e) => set("roadAccess", e.target.value)}
                      placeholder="e.g. 40 ft road"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Water Level</CrmLabel>
                    <CrmInput
                      value={draft.waterLevel}
                      onChange={(e) => set("waterLevel", e.target.value)}
                      placeholder="e.g. 150 ft"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Highway</CrmLabel>
                    <CrmInput
                      value={draft.highway}
                      onChange={(e) => set("highway", e.target.value)}
                      placeholder="e.g. 2 km from NH-8"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Contact Name</CrmLabel>
                    <CrmInput
                      value={draft.contactName}
                      onChange={(e) => set("contactName", e.target.value)}
                      placeholder="e.g. 2Bigha Advisory"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                  <div>
                    <CrmLabel className="text-xs font-bold text-slate-700">Contact Phone</CrmLabel>
                    <CrmInput
                      value={draft.contactPhone}
                      onChange={(e) => set("contactPhone", e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="mt-1 h-9 text-xs border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Photos */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <CrmLabel className="text-xs font-bold text-slate-700">
                    Property Photos ({images.length})
                  </CrmLabel>
                  <CrmButton
                    type="button"
                    variant="secondary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-2.5 text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <ImagePlus size={12} /> Add Photos
                      </>
                    )}
                  </CrmButton>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFilesSelected(e.target.files)}
                  />
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                    {images.map((img) => (
                      <div
                        key={img.url}
                        className="group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                      >
                        <img
                          src={img.previewUrl}
                          alt="preview"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img.url)}
                          className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/90 px-6 py-4 shrink-0">
          <CrmButton
            type="button"
            variant="secondary"
            onClick={onClose}
            className="h-10 px-4 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </CrmButton>

          <CrmButton
            type="button"
            variant="primary"
            disabled={sending || (!draft.title.trim() && !selectedPropertyId)}
            onClick={() => void send()}
            className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-md hover:shadow-lg transition flex items-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Sending Brochure...
              </>
            ) : (
              <>
                <Send size={14} /> Send Brochure on WhatsApp
              </>
            )}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
