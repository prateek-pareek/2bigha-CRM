"use client";

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
    (land && draft.propertyType !== "Plot" ? "farm" : "sell");
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

  return (
    <div className="space-y-4">
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
          className="mt-1"
        />
      </div>

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

      <div>
        <CrmLabel>State</CrmLabel>
        <CrmInput
          value={draft.state}
          onChange={(e) => onChange("state", e.target.value)}
          className="mt-1 max-w-xs"
          placeholder="Rajasthan"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <CrmLabel required>Total price (₹)</CrmLabel>
          <CrmInput
            type="number"
            min={0}
            value={draft.price}
            onChange={(e) => onChange("price", e.target.value)}
            placeholder="10000000"
            className="mt-1"
          />
          {Number.isFinite(priceNum) && priceNum > 0 ? (
            <p className="mt-1 text-xs text-[#1a9f4b]">
              Total: {formatIndianLandAmount(priceNum)}
            </p>
          ) : null}
        </div>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <CrmLabel required={land}>Area (Bigha)</CrmLabel>
          <CrmInput
            type="number"
            min={0}
            step="0.01"
            value={draft.areaBigha}
            onChange={(e) => onChange("areaBigha", e.target.value)}
            placeholder="e.g. 10"
            className="mt-1"
          />
          {sqYdPreview ? (
            <p className="mt-1 text-xs text-slate-400">≈ {sqYdPreview} sq. yd</p>
          ) : null}
        </div>
        {!land ? (
          <>
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
          </>
        ) : (
          <div>
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

      {ratePreview ? (
        <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
          <span className="text-slate-500">Rate preview: </span>
          <span className="font-semibold text-[#0f1b2d]">{ratePreview}</span>
        </div>
      ) : null}

      <div>
        <CrmLabel>Image URLs (comma-separated)</CrmLabel>
        <CrmInput
          value={draft.images}
          onChange={(e) => onChange("images", e.target.value)}
          placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
          className="mt-1"
        />
      </div>

      <div>
        <CrmLabel>Description</CrmLabel>
        <CrmTextarea
          value={draft.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Notes about the property, irrigation, road access, nearby landmarks…"
          className="mt-1"
        />
      </div>

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
  );
}
