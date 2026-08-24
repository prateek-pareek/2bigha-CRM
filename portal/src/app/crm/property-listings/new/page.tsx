"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Home, Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
  CrmSectionCard,
} from "@/components/crm/ui";
import {
  EMPTY_PROPERTY_LISTING_DRAFT,
  PropertyListingFormFields,
  draftToCreateInput,
  validatePropertyListingDraft,
  type PropertyListingDraft,
} from "@/components/crm/property-listings/PropertyListingForm";
import {
  EMPTY_PM_PROPERTY_DRAFT,
  PmPropertyFormFields,
  pmDraftToCreateInput,
  validatePmPropertyDraft,
  type PmPropertyDraft,
} from "@/components/crm/property-listings/PmPropertyForm";
import { createThirdPartyProperty } from "@/lib/crm/property-listings/third-party-api";
import type { PropertyRecordBucket } from "@/lib/crm/property-listings/types";

function parseBucket(raw: string | null): PropertyRecordBucket {
  if (raw === "buy" || raw === "sell" || raw === "farm" || raw === "pm") return raw;
  return "sell";
}

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
  const bucket = parseBucket(searchParams.get("bucket") || searchParams.get("mode"));
  const isPm = bucket === "pm";
  const farmMode = bucket === "farm";

  const initialMarketDraft = useMemo<PropertyListingDraft>(
    () => ({
      ...EMPTY_PROPERTY_LISTING_DRAFT,
      propertyType: farmMode ? "Agricultural" : bucket === "buy" ? "Plot" : "Apartment",
    }),
    [farmMode, bucket],
  );

  const [marketDraft, setMarketDraft] = useState<PropertyListingDraft>(initialMarketDraft);
  const [pmDraft, setPmDraft] = useState<PmPropertyDraft>(EMPTY_PM_PROPERTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMarketDraft(initialMarketDraft);
    setPmDraft({ ...EMPTY_PM_PROPERTY_DRAFT });
  }, [initialMarketDraft]);

  const setMarket = <K extends keyof PropertyListingDraft>(
    key: K,
    value: PropertyListingDraft[K],
  ) => setMarketDraft((d) => ({ ...d, [key]: value }));

  const setPm = <K extends keyof PmPropertyDraft>(key: K, value: PmPropertyDraft[K]) =>
    setPmDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (isPm) {
      const error = validatePmPropertyDraft(pmDraft);
      if (error) {
        toast.error(error);
        return;
      }
      setSaving(true);
      try {
        const created = await createThirdPartyProperty(
          pmDraftToCreateInput(pmDraft, { leadId }),
        );
        toast.success("PM property submitted");
        router.push(`/crm/property-listings/${created._id}`);
      } catch {
        toast.error("Failed to submit PM property");
      } finally {
        setSaving(false);
      }
      return;
    }

    const error = validatePropertyListingDraft(marketDraft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const created = await createThirdPartyProperty(
        draftToCreateInput(marketDraft, {
          leadId,
          approvalStatus: "Approved",
          listingBucket: bucket,
        }),
      );
      toast.success("Listing submitted");
      router.push(`/crm/property-listings/${created._id}`);
    } catch {
      toast.error("Failed to submit listing");
    } finally {
      setSaving(false);
    }
  };

  const title = isPm
    ? "Create PM property"
    : farmMode
      ? "New farm listing"
      : bucket === "buy"
        ? "New buy listing"
        : "New sell listing";

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-3xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={
          isPm ? <ClipboardList size={18} /> : farmMode ? <Sprout size={18} /> : <Home size={18} />
        }
        title={title}
        description={
          isPm
            ? "Subscription Property Management case — verification pipeline (mock third-party API)."
            : leadId
              ? "Linked to a lead — marketplace listing (mock third-party API)."
              : "Marketplace listing submitted to the third-party API (mock)."
        }
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          {
            label: "Property Listings",
            href: `/crm/property-listings?bucket=${bucket}`,
          },
          { label: "New" },
        ]}
        className="mb-4"
      />

      <CrmSectionCard title={isPm ? "PM property details" : "Listing details"}>
        {isPm ? (
          <PmPropertyFormFields draft={pmDraft} onChange={setPm} />
        ) : (
          <PropertyListingFormFields
            draft={marketDraft}
            onChange={setMarket}
            farmMode={farmMode}
          />
        )}
      </CrmSectionCard>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--border-color)] pt-4">
        <CrmButton
          variant="secondary"
          onClick={() => router.push(`/crm/property-listings?bucket=${bucket}`)}
        >
          Cancel
        </CrmButton>
        <CrmButton
          variant="primary"
          disabled={saving}
          onClick={() => void save()}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {isPm ? "Submit PM property" : "Submit listing"}
        </CrmButton>
      </div>
    </div>
  );
}
