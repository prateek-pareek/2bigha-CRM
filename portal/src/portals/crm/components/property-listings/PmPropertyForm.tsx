"use client";

import {
  CrmInput,
  CrmLabel,
  CrmSelect,
  CrmTextarea,
} from "@/components/crm/ui";
import type { CreateThirdPartyPropertyInput } from "@/lib/crm/property-listings/third-party-api";
import {
  AREA_UNITS,
  type AreaUnit,
  type PropertyListingRecord,
  type PropertyListingType,
} from "@/lib/crm/property-listings/types";
import { PM_PLANS, PM_PROPERTY_TYPES, type PmPlan } from "@/lib/crm/property-management/types";

export type PmPropertyDraft = {
  pmPlan: string;
  propertyType: string;
  title: string;
  description: string;
  state: string;
  district: string;
  city: string;
  village: string;
  tehsil: string;
  areaValue: string;
  areaUnit: string;
  zipCode: string;
  khasraNumber: string;
  googleMapsLink: string;
  images: string;
};

export const EMPTY_PM_PROPERTY_DRAFT: PmPropertyDraft = {
  pmPlan: "Standard",
  propertyType: "Agricultural",
  title: "",
  description: "",
  state: "",
  district: "",
  city: "",
  village: "",
  tehsil: "",
  areaValue: "",
  areaUnit: "Bigha",
  zipCode: "",
  khasraNumber: "",
  googleMapsLink: "",
  images: "",
};

export function draftFromPmListing(listing: PropertyListingRecord): PmPropertyDraft {
  return {
    pmPlan: listing.pmPlan || "Standard",
    propertyType: listing.propertyType || "Agricultural",
    title: listing.title || "",
    description: listing.description || "",
    state: listing.state || "",
    district: listing.district || "",
    city: listing.city || "",
    village: listing.village || "",
    tehsil: listing.tehsil || "",
    areaValue:
      typeof listing.areaValue === "number"
        ? String(listing.areaValue)
        : typeof listing.areaBigha === "number"
          ? String(listing.areaBigha)
          : "",
    areaUnit: listing.areaUnit || "Bigha",
    zipCode: listing.zipCode || "",
    khasraNumber: listing.khasraNumber || "",
    googleMapsLink: listing.googleMapsLink || "",
    images: (listing.images || []).join(", "),
  };
}

export function validatePmPropertyDraft(draft: PmPropertyDraft): string | null {
  if (!draft.pmPlan.trim()) return "PM plan is required";
  if (!draft.title.trim()) return "Title is required";
  if (draft.title.trim().length > 200) return "Title must be 200 characters or fewer";
  if (!draft.propertyType.trim()) return "Property type is required";
  if (!draft.state.trim()) return "State is required";
  if (!draft.areaValue.trim() || Number.isNaN(Number(draft.areaValue)) || Number(draft.areaValue) <= 0) {
    return "A valid area is required";
  }
  if (!draft.areaUnit.trim()) return "Area unit is required";
  if (draft.googleMapsLink.trim() && !/^https?:\/\/\S+$/i.test(draft.googleMapsLink.trim())) {
    return "Google Maps link must be a valid URL";
  }
  const images = draft.images
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = images.find((u) => !/^https?:\/\/\S+$/i.test(u));
  if (bad) return `Image URL looks invalid: ${bad}`;
  return null;
}

export function pmDraftToCreateInput(
  draft: PmPropertyDraft,
  extras?: { leadId?: string },
): CreateThirdPartyPropertyInput {
  const areaValue = Number(draft.areaValue);
  const areaUnit = draft.areaUnit as AreaUnit;
  return {
    listingBucket: "pm",
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    propertyType: draft.propertyType as PropertyListingType,
    state: draft.state.trim(),
    district: draft.district.trim() || undefined,
    city: draft.city.trim() || undefined,
    village: draft.village.trim() || undefined,
    tehsil: draft.tehsil.trim() || undefined,
    zipCode: draft.zipCode.trim() || undefined,
    address: [draft.village, draft.city, draft.district].filter(Boolean).join(", ") || undefined,
    areaValue,
    areaUnit,
    areaBigha: areaUnit === "Bigha" ? areaValue : undefined,
    price: 0,
    images: draft.images
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    pmPlan: draft.pmPlan as PmPlan,
    khasraNumber: draft.khasraNumber.trim() || undefined,
    googleMapsLink: draft.googleMapsLink.trim() || undefined,
    pmStage: "Property Submitted",
    approvalStatus: "Approved",
    leadId: extras?.leadId,
  };
}

type Props = {
  draft: PmPropertyDraft;
  onChange: <K extends keyof PmPropertyDraft>(key: K, value: PmPropertyDraft[K]) => void;
};

/** Property Management create/edit fields (subscription plan + verification pipeline). */
export function PmPropertyFormFields({ draft, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <CrmLabel required>PM plan</CrmLabel>
          <CrmSelect
            value={draft.pmPlan}
            onChange={(e) => onChange("pmPlan", e.target.value)}
            className="mt-1"
          >
            {PM_PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </CrmSelect>
        </div>
        <div>
          <CrmLabel required>Property type</CrmLabel>
          <CrmSelect
            value={draft.propertyType}
            onChange={(e) => onChange("propertyType", e.target.value)}
            className="mt-1"
          >
            {PM_PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </CrmSelect>
        </div>
      </div>

      <div>
        <CrmLabel required>Title</CrmLabel>
        <CrmInput
          value={draft.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="e.g. Agricultural land, Phagi"
          className="mt-1"
        />
      </div>

      <div>
        <CrmLabel>Description</CrmLabel>
        <CrmTextarea
          value={draft.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Access, irrigation, boundaries, documents available…"
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <CrmLabel required>State</CrmLabel>
          <CrmInput
            value={draft.state}
            onChange={(e) => onChange("state", e.target.value)}
            placeholder="Rajasthan"
            className="mt-1"
          />
        </div>
        <div>
          <CrmLabel>District</CrmLabel>
          <CrmInput
            value={draft.district}
            onChange={(e) => onChange("district", e.target.value)}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <CrmLabel>Village / Area</CrmLabel>
          <CrmInput
            value={draft.village}
            onChange={(e) => onChange("village", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <CrmLabel>Tehsil</CrmLabel>
          <CrmInput
            value={draft.tehsil}
            onChange={(e) => onChange("tehsil", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <CrmLabel required>Area</CrmLabel>
          <CrmInput
            type="number"
            min={0}
            step="0.01"
            value={draft.areaValue}
            onChange={(e) => onChange("areaValue", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <CrmLabel required>Area unit</CrmLabel>
          <CrmSelect
            value={draft.areaUnit}
            onChange={(e) => onChange("areaUnit", e.target.value)}
            className="mt-1"
          >
            {AREA_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </CrmSelect>
        </div>
        <div>
          <CrmLabel>Pincode</CrmLabel>
          <CrmInput
            value={draft.zipCode}
            onChange={(e) => onChange("zipCode", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <CrmLabel>Khasra number</CrmLabel>
          <CrmInput
            value={draft.khasraNumber}
            onChange={(e) => onChange("khasraNumber", e.target.value)}
            placeholder="e.g. 112/3"
            className="mt-1"
          />
        </div>
        <div>
          <CrmLabel>Google Maps link</CrmLabel>
          <CrmInput
            value={draft.googleMapsLink}
            onChange={(e) => onChange("googleMapsLink", e.target.value)}
            placeholder="https://maps.google.com/…"
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Used for field-agent check-in (~200 m radius).
          </p>
        </div>
      </div>

      <div>
        <CrmLabel>Image URLs (comma-separated)</CrmLabel>
        <CrmInput
          value={draft.images}
          onChange={(e) => onChange("images", e.target.value)}
          placeholder="https://example.com/photo1.jpg"
          className="mt-1"
        />
      </div>
    </div>
  );
}
