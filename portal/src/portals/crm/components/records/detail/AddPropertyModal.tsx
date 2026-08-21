"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton, CrmInput, CrmLabel, CrmSelect, CrmTextarea } from "@/components/crm/ui";
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
};

type Props = {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  onSuccess?: (property: any) => void;
  /** 'Farm' opens this same form pre-set to the Farm property type ("Add Farm" quick action). */
  defaultPropertyType?: string;
};

/** Create a property listing linked to a lead, opened from the lead detail page (or as "Add Farm" when defaultPropertyType is 'Farm'). */
export default function AddPropertyModal({
  open,
  onClose,
  leadId,
  leadName,
  onSuccess,
  defaultPropertyType = "Apartment",
}: Props) {
  const isFarm = defaultPropertyType === "Farm";
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft({ ...EMPTY_DRAFT, propertyType: defaultPropertyType });
  }, [open, defaultPropertyType]);

  if (!open) return null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (!draft.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!draft.price.trim() || Number.isNaN(Number(draft.price))) {
      toast.error("A valid price is required");
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
          ...(leadId ? { leadId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to save property");
        return;
      }
      toast.success("Property added");
      onSuccess?.(data);
      onClose();
    } catch {
      toast.error("Failed to save property");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <Building2 size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">{isFarm ? "Add farm" : "Add property"}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {leadName ? `Linked to ${leadName}` : leadId ? "Linked to this lead" : "Not linked to a lead"}
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

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
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
              <CrmInput value={draft.city} onChange={(e) => set("city", e.target.value)} className="mt-1" />
            </div>
          </div>

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
              <CrmSelect value={draft.status} onChange={(e) => set("status", e.target.value)} className="mt-1">
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </CrmSelect>
            </div>
          </div>

          <div>
            <CrmLabel>Description</CrmLabel>
            <CrmTextarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Notes about the property, amenities, nearby landmarks…"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton type="button" disabled={saving} onClick={() => void save()} className="gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
            {saving ? "Saving…" : isFarm ? "Add farm" : "Add property"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
