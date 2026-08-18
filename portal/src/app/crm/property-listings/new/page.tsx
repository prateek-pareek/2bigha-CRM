"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import {
  CrmButton,
  CrmInput,
  CrmLabel,
  CrmPageHeader,
  CrmSectionCard,
  CrmSelect,
  CrmTextarea,
} from "@/components/crm/ui";
import { PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/crm/property-listings/types";

interface Draft {
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
  status: string;
  description: string;
  images: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY_DRAFT: Draft = {
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
  status: "Available",
  description: "",
  images: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

export default function NewPropertyListingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-3xl animate-pulse p-10">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <NewPropertyListingPageContent />
    </Suspense>
  );
}

function NewPropertyListingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId") || undefined;
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const validate = (): string | null => {
    if (!draft.title.trim()) return "Title is required";
    if (draft.title.trim().length > 200) return "Title must be 200 characters or fewer";

    if (!draft.price.trim() || Number.isNaN(Number(draft.price))) {
      return "A valid price is required";
    }
    if (Number(draft.price) < 0) return "Price cannot be negative";

    for (const [label, value] of [
      ["Bedrooms", draft.bedrooms],
      ["Bathrooms", draft.bathrooms],
      ["Area (sqft)", draft.areaSqft],
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

    const imageUrls = draft.images
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const badUrl = imageUrls.find((u) => !/^https?:\/\/\S+$/i.test(u));
    if (badUrl) return `Image URL looks invalid: ${badUrl}`;

    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: draft.title.trim(),
          address: draft.address.trim() || undefined,
          city: draft.city.trim() || undefined,
          state: draft.state.trim() || undefined,
          price: Number(draft.price),
          currency: draft.currency,
          propertyType: draft.propertyType,
          listedFor: draft.listedFor,
          bedrooms: draft.bedrooms ? Number(draft.bedrooms) : undefined,
          bathrooms: draft.bathrooms ? Number(draft.bathrooms) : undefined,
          areaSqft: draft.areaSqft ? Number(draft.areaSqft) : undefined,
          status: draft.status,
          description: draft.description.trim() || undefined,
          images: draft.images
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          contactName: draft.contactName.trim() || undefined,
          contactPhone: draft.contactPhone.trim() || undefined,
          contactEmail: draft.contactEmail.trim() || undefined,
          leadId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to save listing");
        return;
      }
      toast.success("Property listing created");
      router.push(`/crm/property-listings/${data._id}`);
    } catch {
      toast.error("Failed to save listing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-3xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<Home size={18} />}
        title="New property listing"
        description={
          leadId
            ? "Linked to a lead — add the property details below."
            : "Add a property to track its status, price, and details."
        }
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings", href: "/crm/property-listings" },
          { label: "New" },
        ]}
        className="mb-4"
      />

      <div className="space-y-4">
        <CrmSectionCard title="Basic details">
          <div className="space-y-4">
            <div>
              <CrmLabel required>Title</CrmLabel>
              <CrmInput
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. 3BHK Sea View Apartment"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <CrmLabel>Address</CrmLabel>
                <CrmInput
                  value={draft.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Street address"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>City</CrmLabel>
                <CrmInput
                  value={draft.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <CrmLabel>State</CrmLabel>
              <CrmInput
                value={draft.state}
                onChange={(e) => set("state", e.target.value)}
                className="mt-1 max-w-xs"
              />
            </div>
          </div>
        </CrmSectionCard>

        <CrmSectionCard title="Pricing & specs">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <CrmLabel required>Price</CrmLabel>
                <CrmInput
                  type="number"
                  min={0}
                  value={draft.price}
                  onChange={(e) => set("price", e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Property type</CrmLabel>
                <CrmSelect
                  value={draft.propertyType}
                  onChange={(e) => set("propertyType", e.target.value)}
                  className="mt-1"
                >
                  {PROPERTY_TYPES.map((t) => (
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
                  onChange={(e) => set("listedFor", e.target.value)}
                  className="mt-1"
                >
                  <option value="Sale">Sale</option>
                  <option value="Rent">Rent</option>
                </CrmSelect>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <CrmLabel>Bedrooms</CrmLabel>
                <CrmInput
                  type="number"
                  min={0}
                  value={draft.bedrooms}
                  onChange={(e) => set("bedrooms", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Bathrooms</CrmLabel>
                <CrmInput
                  type="number"
                  min={0}
                  value={draft.bathrooms}
                  onChange={(e) => set("bathrooms", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Area (sqft)</CrmLabel>
                <CrmInput
                  type="number"
                  min={0}
                  value={draft.areaSqft}
                  onChange={(e) => set("areaSqft", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <CrmLabel>Status</CrmLabel>
                <CrmSelect
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value)}
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
        </CrmSectionCard>

        <CrmSectionCard title="Description & media">
          <div className="space-y-4">
            <div>
              <CrmLabel>Description</CrmLabel>
              <CrmTextarea
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Notes about the property, amenities, nearby landmarks…"
                className="mt-1"
              />
            </div>
            <div>
              <CrmLabel>Image URLs (comma-separated)</CrmLabel>
              <CrmInput
                value={draft.images}
                onChange={(e) => set("images", e.target.value)}
                placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
                className="mt-1"
              />
            </div>
          </div>
        </CrmSectionCard>

        <CrmSectionCard title="Contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <div>
              <CrmLabel>Contact email</CrmLabel>
              <CrmInput
                type="email"
                value={draft.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CrmSectionCard>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--border-color)] pt-4">
        <CrmButton variant="secondary" onClick={() => router.push("/crm/property-listings")}>
          Cancel
        </CrmButton>
        <CrmButton
          variant="primary"
          disabled={saving}
          onClick={() => void save()}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save listing
        </CrmButton>
      </div>
    </div>
  );
}
