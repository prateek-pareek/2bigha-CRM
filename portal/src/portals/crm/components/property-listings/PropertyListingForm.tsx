"use client";

import { useState } from "react";
import { UploadCloud, Loader2, X } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { uploadCrmImage } from "../../lib/media/upload-image";
import {
  CrmInput,
  CrmLabel,
  CrmSelect,
  CrmTextarea,
} from "@/components/crm/ui";
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  areaBighaToSqYd,
  formatIndianLandAmount,
  formatRatePerBigha,
  type ListingBucket,
  type PropertyListingRecord,
  type PropertyListingType,
} from "@/lib/crm/property-listings/types";
import type { CreateThirdPartyPropertyInput } from "@/lib/crm/property-listings/third-party-api";

export type PropertyListingDraft = {
  title: string;
  address: string;
  city: string;
  state: string;
  price: string;
  currency: string;
  propertyType: string;
  listedFor: string;
  bedrooms: string;
  bathrooms: string;
  areaSqft: string;
  areaBigha: string;
  status: string;
  description: string;
  images: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

export const EMPTY_PROPERTY_LISTING_DRAFT: PropertyListingDraft = {
  title: "",
  address: "",
  city: "",
  state: "",
  price: "",
  currency: "INR",
  propertyType: "Apartment",
  listedFor: "Sale",
  bedrooms: "",
  bathrooms: "",
  areaSqft: "",
  areaBigha: "",
  status: "Available",
  description: "",
  images: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

/** Land / farm-style types — Bigha-first, no bedrooms/bathrooms. */
export const LAND_PROPERTY_TYPES: PropertyListingType[] = [
  "Agricultural",
  "Farm",
  "Farmland",
  "Farmhouse",
  "Plot",
];

export const INDIAN_STATES = [
  "Rajasthan",
  "Haryana",
  "Delhi",
  "Uttar Pradesh",
  "Punjab",
  "Gujarat",
  "Madhya Pradesh",
  "Maharashtra",
  "Andhra Pradesh",
  "Telangana",
  "Karnataka",
  "Tamil Nadu",
  "Kerala",
  "West Bengal",
  "Bihar",
  "Jharkhand",
  "Odisha",
  "Chhattisgarh",
  "Himachal Pradesh",
  "Uttarakhand",
  "Jammu & Kashmir",
  "Goa",
  "Assam",
  "Arunachal Pradesh",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Sikkim",
  "Tripura",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Lakshadweep",
  "Puducherry",
  "Ladakh",
  "Andaman and Nicobar Islands",
] as const;

export function isLandPropertyType(type: string): boolean {
  return LAND_PROPERTY_TYPES.includes(type as PropertyListingType);
}

export function draftFromListing(listing: PropertyListingRecord): PropertyListingDraft {
  return {
    title: listing.title || "",
    address: listing.address || "",
    city: listing.city || "",
    state: listing.state || "",
    price: typeof listing.price === "number" ? String(listing.price) : "",
    currency: listing.currency || "INR",
    propertyType: listing.propertyType || "Apartment",
    listedFor: listing.listedFor || "Sale",
    bedrooms: typeof listing.bedrooms === "number" ? String(listing.bedrooms) : "",
    bathrooms: typeof listing.bathrooms === "number" ? String(listing.bathrooms) : "",
    areaSqft: typeof listing.areaSqft === "number" ? String(listing.areaSqft) : "",
    areaBigha: typeof listing.areaBigha === "number" ? String(listing.areaBigha) : "",
    status: listing.status || "Available",
    description: listing.description || "",
    images: (listing.images || []).join(", "),
    contactName: listing.contactName || "",
    contactPhone: listing.contactPhone || "",
    contactEmail: listing.contactEmail || "",
  };
}

export function validatePropertyListingDraft(draft: PropertyListingDraft): string | null {
  if (!draft.title.trim()) return "Title is required";
  if (draft.title.trim().length > 200) return "Title must be 200 characters or fewer";

  if (!draft.price.trim() || Number.isNaN(Number(draft.price))) {
    return "A valid total price is required";
  }
  if (Number(draft.price) < 0) return "Price cannot be negative";

  const land = isLandPropertyType(draft.propertyType);
  if (land && !draft.areaBigha.trim()) {
    return "Area in Bigha is required for farm / agricultural / plot listings";
  }

  for (const [label, value] of [
    ["Bedrooms", draft.bedrooms],
    ["Bathrooms", draft.bathrooms],
    ["Area (sqft)", draft.areaSqft],
    ["Area (Bigha)", draft.areaBigha],
  ] as const) {
    if (!value.trim()) continue;
    if (Number.isNaN(Number(value)) || Number(value) < 0) {
      return `${label} must be a valid non-negative number`;
    }
  }

  if (draft.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())) {
    return "Contact email looks invalid";
  }

  if (draft.contactPhone.trim()) {
    const digits = draft.contactPhone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return "Contact phone must have between 7 and 15 digits";
    }
  }

  const imageUrls = parseImageUrls(draft.images);
  const badUrl = imageUrls.find((u) => !/^https?:\/\/\S+$/i.test(u));
  if (badUrl) return `Image URL looks invalid: ${badUrl}`;

  return null;
}

export function parseImageUrls(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function draftToCreateInput(
  draft: PropertyListingDraft,
  extras?: {
    leadId?: string;
    approvalStatus?: CreateThirdPartyPropertyInput["approvalStatus"];
    listingBucket?: ListingBucket;
  },
): CreateThirdPartyPropertyInput {
  const land = isLandPropertyType(draft.propertyType);
  const areaBigha = draft.areaBigha ? Number(draft.areaBigha) : undefined;
  const bucket =
    extras?.listingBucket ||
    (land && draft.propertyType !== "Plot" ? "farm" : "properties");
  return {
    listingBucket: bucket,
    title: draft.title.trim(),
    address: draft.address.trim() || undefined,
    city: draft.city.trim() || undefined,
    state: draft.state.trim() || undefined,
    price: Number(draft.price),
    currency: draft.currency,
    propertyType: draft.propertyType as PropertyListingType,
    listedFor: draft.listedFor as CreateThirdPartyPropertyInput["listedFor"],
    bedrooms: !land && draft.bedrooms ? Number(draft.bedrooms) : undefined,
    bathrooms: !land && draft.bathrooms ? Number(draft.bathrooms) : undefined,
    areaSqft: draft.areaSqft ? Number(draft.areaSqft) : undefined,
    areaBigha,
    areaValue: areaBigha,
    areaUnit: areaBigha != null ? "Bigha" : undefined,
    status: draft.status as CreateThirdPartyPropertyInput["status"],
    description: draft.description.trim() || undefined,
    images: parseImageUrls(draft.images),
    contactName: draft.contactName.trim() || undefined,
    contactPhone: draft.contactPhone.trim() || undefined,
    contactEmail: draft.contactEmail.trim() || undefined,
    leadId: extras?.leadId,
    approvalStatus: extras?.approvalStatus,
  };
}

type Props = {
  draft: PropertyListingDraft;
  onChange: <K extends keyof PropertyListingDraft>(key: K, value: PropertyListingDraft[K]) => void;
  /** When true, type options are limited to land / farm types. */
  farmMode?: boolean;
};

export function PropertyListingFormFields({ draft, onChange, farmMode = false }: Props) {
  const [uploading, setUploading] = useState(false);

  const land = isLandPropertyType(draft.propertyType);
  const typeOptions = farmMode
    ? LAND_PROPERTY_TYPES
    : PROPERTY_TYPES;

  const areaBighaNum = draft.areaBigha.trim() ? Number(draft.areaBigha) : NaN;
  const priceNum = draft.price.trim() ? Number(draft.price) : NaN;
  const ratePreview =
    Number.isFinite(areaBighaNum) &&
    areaBighaNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0
      ? formatRatePerBigha(priceNum, areaBighaNum)
      : null;
  const sqYdPreview =
    Number.isFinite(areaBighaNum) && areaBighaNum > 0
      ? areaBighaToSqYd(areaBighaNum).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  const imageUrls = parseImageUrls(draft.images);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await uploadCrmImage(file, "property-listing");
        const absoluteUrl = res.url.startsWith("http") ? res.url : `${CRM_API_URL}${res.url}`;
        newUrls.push(absoluteUrl);
      }
      const updatedList = [...imageUrls, ...newUrls].join(", ");
      onChange("images", updatedList);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const updatedList = imageUrls.filter((_, idx) => idx !== indexToRemove).join(", ");
    onChange("images", updatedList);
  };

  return (
    <div className="crm-form-container space-y-6 pb-2">
      <style dangerouslySetInnerHTML={{ __html: `
        .crm-form-container input,
        .crm-form-container select,
        .crm-form-container textarea {
          border: 1.5px solid #cbd5e1 !important;
          border-radius: 6px !important;
          padding: 8px 12px !important;
          font-size: 14px !important;
          color: #1e293b !important;
          background-color: #ffffff !important;
          transition: all 0.2s ease-in-out !important;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02) !important;
          height: 38px !important;
        }
        
        .crm-form-container textarea {
          height: auto !important;
          min-height: 100px !important;
        }
        
        .crm-form-container input:hover,
        .crm-form-container select:hover,
        .crm-form-container textarea:hover {
          border-color: #94a3b8 !important;
        }

        .crm-form-container input:focus,
        .crm-form-container select:focus,
        .crm-form-container textarea:focus {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
          background-color: #ffffff !important;
          outline: none !important;
        }
      ` }} />
      {/* SECTION 1: BASIC DETAILS */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Listing Information</h3>
        
        <div>
          <CrmLabel required>Title</CrmLabel>
          <CrmInput
            value={draft.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder={
              farmMode
                ? "e.g. Agricultural land near Dudu"
                : "e.g. 3BHK Sea View Apartment"
            }
            className="mt-1 font-medium"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <CrmLabel>Type</CrmLabel>
            <CrmSelect
              value={draft.propertyType}
              onChange={(e) => onChange("propertyType", e.target.value)}
              className="mt-1"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </CrmSelect>
          </div>
          <div>
            <CrmLabel>Listed for</CrmLabel>
            <CrmSelect
              value={draft.listedFor}
              onChange={(e) => onChange("listedFor", e.target.value)}
              className="mt-1"
            >
              <option value="Sale">Sale</option>
              <option value="Rent">Rent</option>
            </CrmSelect>
          </div>
          <div>
            <CrmLabel>Status</CrmLabel>
            <CrmSelect
              value={draft.status}
              onChange={(e) => onChange("status", e.target.value)}
              className="mt-1"
            >
              {PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </CrmSelect>
          </div>
        </div>
      </div>

      {/* SECTION 2: PRICING & SPECIFICATIONS */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Pricing & Size</h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <CrmLabel required>Total price (₹)</CrmLabel>
            <CrmInput
              type="number"
              min={0}
              value={draft.price}
              onChange={(e) => onChange("price", e.target.value)}
              placeholder="10000000"
              className="mt-1 font-medium"
            />
            {Number.isFinite(priceNum) && priceNum > 0 ? (
              <p className="mt-1.5 text-xs font-medium text-emerald-600">
                Total: {formatIndianLandAmount(priceNum)}
              </p>
            ) : null}
          </div>

          <div>
            <CrmLabel required={land}>Area (Bigha)</CrmLabel>
            <CrmInput
              type="number"
              min={0}
              step="0.01"
              value={draft.areaBigha}
              onChange={(e) => onChange("areaBigha", e.target.value)}
              placeholder="e.g. 10"
              className="mt-1 font-medium"
            />
            {sqYdPreview ? (
              <p className="mt-1.5 text-xs text-slate-500 font-medium">≈ {sqYdPreview} sq. yd</p>
            ) : null}
          </div>
        </div>

        {ratePreview ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 px-3 py-2 text-xs">
            <span className="text-slate-500 font-medium">Rate preview: </span>
            <span className="font-bold text-emerald-700">{ratePreview}</span>
          </div>
        ) : null}

        {!land ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 border-t border-slate-50">
            <div>
              <CrmLabel>Bedrooms</CrmLabel>
              <CrmInput
                type="number"
                min={0}
                value={draft.bedrooms}
                onChange={(e) => onChange("bedrooms", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <CrmLabel>Bathrooms</CrmLabel>
              <CrmInput
                type="number"
                min={0}
                value={draft.bathrooms}
                onChange={(e) => onChange("bathrooms", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <CrmLabel>Area (sqft)</CrmLabel>
              <CrmInput
                type="number"
                min={0}
                value={draft.areaSqft}
                onChange={(e) => onChange("areaSqft", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-slate-50 max-w-xs">
            <CrmLabel>Area (sqft) — optional</CrmLabel>
            <CrmInput
              type="number"
              min={0}
              value={draft.areaSqft}
              onChange={(e) => onChange("areaSqft", e.target.value)}
              className="mt-1"
            />
          </div>
        )}
      </div>

      {/* SECTION 3: LOCATION */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Location</h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <CrmLabel>Address / Plus Code</CrmLabel>
            <CrmInput
              value={draft.address}
              onChange={(e) => onChange("address", e.target.value)}
              placeholder="H7W3+588, Dudu, Dhani Nanu"
              className="mt-1"
            />
          </div>
          <div>
            <CrmLabel>City</CrmLabel>
            <CrmInput
              value={draft.city}
              onChange={(e) => onChange("city", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="max-w-xs">
          <CrmLabel>State</CrmLabel>
          <CrmSelect
            value={draft.state}
            onChange={(e) => onChange("state", e.target.value)}
            className="mt-1"
          >
            <option value="">Select State</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </CrmSelect>
        </div>
      </div>

      {/* SECTION 4: MEDIA */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Images</h3>
        
        <div className="space-y-2">
          <div className="relative rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50/50 hover:bg-slate-55 p-6 text-center transition group cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={uploading}
              onChange={handleFileChange}
              className="absolute inset-0 cursor-pointer opacity-0 z-10"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              ) : (
                <UploadCloud className="h-8 w-8 text-slate-400 group-hover:text-emerald-500 transition" />
              )}
              <span className="text-xs font-semibold text-slate-700">
                {uploading ? "Uploading images..." : "Drag & drop property photos here, or click to browse"}
              </span>
              <span className="text-[10px] text-slate-400">Supports PNG, JPG, JPEG (Max 10 files)</span>
            </div>
          </div>

          {imageUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 mt-3 animate-in fade-in zoom-in-95 duration-200">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="relative aspect-square w-full rounded-lg border border-slate-100 bg-white p-1 overflow-hidden shadow-sm group">
                  <img
                    src={url}
                    alt={`Uploaded preview ${idx + 1}`}
                    className="h-full w-full object-cover rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition hover:bg-rose-600 shadow-sm"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <CrmLabel className="text-[11px] text-slate-400 font-medium">Or paste image URLs manually (comma-separated)</CrmLabel>
            <CrmInput
              value={draft.images}
              onChange={(e) => onChange("images", e.target.value)}
              placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
              className="mt-1 text-xs"
            />
          </div>
        </div>
      </div>

      {/* SECTION 5: DESCRIPTION */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Description</h3>
        
        <div>
          <CrmTextarea
            value={draft.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="Notes about the property, irrigation, road access, nearby landmarks…"
            className="mt-1 min-h-[100px]"
          />
        </div>
      </div>

      {/* SECTION 6: CONTACT INFORMATION */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact details</h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <CrmLabel>Contact name</CrmLabel>
            <CrmInput
              value={draft.contactName}
              onChange={(e) => onChange("contactName", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <CrmLabel>Contact phone</CrmLabel>
            <CrmInput
              value={draft.contactPhone}
              onChange={(e) => onChange("contactPhone", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <CrmLabel>Contact email</CrmLabel>
            <CrmInput
              type="email"
              value={draft.contactEmail}
              onChange={(e) => onChange("contactEmail", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
