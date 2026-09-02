"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Sprout, X } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "@/components/crm/ui";
import { cn } from "@/lib/utils";
import {
  EMPTY_PROPERTY_LISTING_DRAFT,
  PropertyListingFormFields,
  isLandPropertyType,
  parseImageUrls,
  validatePropertyListingDraft,
  type PropertyListingDraft,
} from "@/components/crm/property-listings/PropertyListingForm";
import {
  createBackendPropertyListing,
  type BackendPropertyListing,
} from "@/lib/crm/property-listings/backend-api";

/**
 * Frontend land/farm types (Agricultural/Farm/Farmland/Farmhouse) all route
 * to 2bigha's separate Farm API (createFarmByAdmin) once they reach the
 * backend — TwoBighaPropertyService only checks for propertyType === 'Farm'.
 * 'Plot' is a real Property-domain type in 2bigha's schema, so it stays on
 * the Property API rather than being folded in here.
 */
const LAND_TO_FARM_TYPES = new Set(["Agricultural", "Farm", "Farmland", "Farmhouse"]);
const BACKEND_PROPERTY_TYPES = new Set([
  "Apartment",
  "Villa",
  "Independent House",
  "Plot",
  "Commercial",
  "Office",
  "Warehouse",
  "Other",
]);

/** Maps the portal's richer PropertyListingType set onto the backend's smaller enum (see property-listing.schema.ts). */
function toBackendPropertyType(type: string): string {
  if (LAND_TO_FARM_TYPES.has(type)) return "Farm";
  return BACKEND_PROPERTY_TYPES.has(type) ? type : "Other";
}

type Props = {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  onSuccess?: (property: BackendPropertyListing) => void;
  /** 'Farm' / 'Agricultural' opens land-first form ("Add Farm" quick action). */
  defaultPropertyType?: string;
};

import { useRouter } from "next/navigation";

/** Create a property/farm listing in the CRM (linked to a lead when provided) — synced to 2bigha via TwoBighaPropertyService. */
export default function AddPropertyModal({
  open,
  onClose,
  leadId,
  leadName,
  onSuccess,
  defaultPropertyType = "Apartment",
}: Props) {
  const router = useRouter();
  const isFarm =
    defaultPropertyType === "Farm" || defaultPropertyType === "Agricultural";
  const [draft, setDraft] = useState<PropertyListingDraft>(EMPTY_PROPERTY_LISTING_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (leadId) params.set("leadId", leadId);
    if (leadName) params.set("ownerName", leadName);
    router.push(`/crm/property-listings/new?${params.toString()}`);
    onClose();
  }, [open, leadId, leadName, router, onClose]);

  if (!open) return null;

  const set = <K extends keyof PropertyListingDraft>(key: K, value: PropertyListingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const error = validatePropertyListingDraft(draft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    const land = isLandPropertyType(draft.propertyType);
    try {
      const created = await createBackendPropertyListing({
        title: draft.title.trim(),
        address: draft.address.trim() || undefined,
        city: draft.city.trim() || undefined,
        state: draft.state.trim() || undefined,
        price: Number(draft.price),
        currency: draft.currency,
        propertyType: toBackendPropertyType(draft.propertyType),
        listedFor: draft.listedFor as "Sale" | "Rent",
        bedrooms: !land && draft.bedrooms ? Number(draft.bedrooms) : undefined,
        bathrooms: !land && draft.bathrooms ? Number(draft.bathrooms) : undefined,
        areaSqft: draft.areaSqft ? Number(draft.areaSqft) : undefined,
        status: draft.status,
        description: draft.description.trim() || undefined,
        images: parseImageUrls(draft.images),
        contactName: draft.contactName.trim() || undefined,
        contactPhone: draft.contactPhone.trim() || undefined,
        contactEmail: draft.contactEmail.trim() || undefined,
        leadId,
      });
      const syncNote =
        created.twobighaSyncStatus === "synced"
          ? " · synced to 2bigha"
          : created.twobighaSyncStatus === "mock"
            ? " · 2bigha sync pending (mock mode)"
            : created.twobighaSyncStatus === "unsupported"
              ? " · saved (2bigha has no farm-edit API)"
              : created.twobighaSyncStatus === "failed"
                ? " · 2bigha sync failed, will retry"
                : "";
      toast.success((isFarm ? "Farm listing saved" : "Property listing saved") + syncNote);
      onSuccess?.(created);
      onClose();
    } catch {
      toast.error(isFarm ? "Failed to save farm" : "Failed to save property");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border shadow-sm",
              isFarm 
                ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                : "bg-sky-50 text-sky-600 border-sky-100"
            )}>
              {isFarm ? <Sprout size={16} /> : <Building2 size={16} />}
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {isFarm ? "Add farm" : "Add property"}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {leadName
                  ? `Linked to ${leadName} · synced to 2bigha`
                  : leadId
                    ? "Linked to this lead · synced to 2bigha"
                    : "Synced to 2bigha"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div id="add-property-modal-container" className="max-h-[65vh] overflow-y-auto p-5 custom-scrollbar bg-slate-50/20">
          <style dangerouslySetInnerHTML={{ __html: `
            #add-property-modal-container input, 
            #add-property-modal-container select, 
            #add-property-modal-container textarea {
              border: 1px solid #cbd5e1 !important;
              border-radius: 0.375rem !important;
              box-shadow: none !important;
              transition: all 0.15s ease-in-out !important;
              background-color: #ffffff !important;
              color: #1e293b !important;
            }
            #add-property-modal-container input:focus, 
            #add-property-modal-container select:focus, 
            #add-property-modal-container textarea:focus {
              border-color: #10b981 !important;
              box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
              outline: none !important;
            }
          `}} />
          <PropertyListingFormFields draft={draft} onChange={set} farmMode={isFarm} />
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <CrmButton type="button" variant="secondary" onClick={onClose} className="border-slate-200">
            Cancel
          </CrmButton>
          <CrmButton
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg transition font-semibold"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isFarm ? (
              <Sprout size={14} />
            ) : (
              <Building2 size={14} />
            )}
            {saving ? "Submitting…" : isFarm ? "Submit farm" : "Submit property"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
