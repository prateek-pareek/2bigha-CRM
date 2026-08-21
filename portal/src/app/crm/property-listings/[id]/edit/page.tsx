"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Home, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
  CrmSectionCard,
} from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import {
  PropertyListingFormFields,
  draftFromListing,
  draftToCreateInput,
  isLandPropertyType,
  validatePropertyListingDraft,
  type PropertyListingDraft,
} from "@/components/crm/property-listings/PropertyListingForm";
import {
  PmPropertyFormFields,
  draftFromPmListing,
  pmDraftToCreateInput,
  validatePmPropertyDraft,
  type PmPropertyDraft,
} from "@/components/crm/property-listings/PmPropertyForm";
import {
  fetchThirdPartyPropertyById,
  updateThirdPartyProperty,
} from "@/lib/crm/property-listings/third-party-api";

export default function EditPropertyListingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [isPm, setIsPm] = useState(false);
  const [marketDraft, setMarketDraft] = useState<PropertyListingDraft | null>(null);
  const [pmDraft, setPmDraft] = useState<PmPropertyDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchThirdPartyPropertyById(id);
      if (!data) {
        toast.error("Failed to load property listing");
        return;
      }
      if (data.listingBucket === "pm") {
        setIsPm(true);
        setPmDraft(draftFromPmListing(data));
      } else {
        setIsPm(false);
        setMarketDraft(draftFromListing(data));
      }
    } catch {
      toast.error("Failed to load property listing");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMarket = <K extends keyof PropertyListingDraft>(
    key: K,
    value: PropertyListingDraft[K],
  ) => setMarketDraft((d) => (d ? { ...d, [key]: value } : d));

  const setPm = <K extends keyof PmPropertyDraft>(key: K, value: PmPropertyDraft[K]) =>
    setPmDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    if (isPm) {
      if (!pmDraft) return;
      const error = validatePmPropertyDraft(pmDraft);
      if (error) {
        toast.error(error);
        return;
      }
      setSaving(true);
      try {
        await updateThirdPartyProperty(id, pmDraftToCreateInput(pmDraft));
        toast.success("PM property updated");
        router.push(`/crm/property-listings/${id}`);
      } catch {
        toast.error("Failed to update listing");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!marketDraft) return;
    const error = validatePropertyListingDraft(marketDraft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await updateThirdPartyProperty(id, draftToCreateInput(marketDraft));
      toast.success("Listing updated");
      router.push(`/crm/property-listings/${id}`);
    } catch {
      toast.error("Failed to update listing");
    } finally {
      setSaving(false);
    }
  };

  if (loading || (!marketDraft && !pmDraft)) {
    return <CrmRecordDetailSkeleton />;
  }

  const farmMode = marketDraft ? isLandPropertyType(marketDraft.propertyType) : false;

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-3xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<Home size={18} />}
        title={isPm ? "Edit PM property" : "Edit property listing"}
        description="Updates are sent to the third-party listing API (mock)."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings", href: "/crm/property-listings" },
          { label: "Edit" },
        ]}
        className="mb-4"
      />

      <CrmSectionCard title="Details">
        {isPm && pmDraft ? (
          <PmPropertyFormFields draft={pmDraft} onChange={setPm} />
        ) : marketDraft ? (
          <PropertyListingFormFields
            draft={marketDraft}
            onChange={setMarket}
            farmMode={farmMode}
          />
        ) : null}
      </CrmSectionCard>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--border-color)] pt-4">
        <CrmButton variant="secondary" onClick={() => router.push(`/crm/property-listings/${id}`)}>
          Cancel
        </CrmButton>
        <CrmButton
          variant="primary"
          disabled={saving}
          onClick={() => void save()}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save changes
        </CrmButton>
      </div>
    </div>
  );
}
