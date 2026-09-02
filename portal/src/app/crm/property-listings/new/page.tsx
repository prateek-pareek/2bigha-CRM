"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
  CrmSectionCard,
} from "@/components/crm/ui";
import {
  EMPTY_PM_PROPERTY_DRAFT,
  PmPropertyFormFields,
  pmDraftToCreateInput,
  validatePmPropertyDraft,
  type PmPropertyDraft,
} from "@/components/crm/property-listings/PmPropertyForm";
import { PropertyStepWizard } from "@/components/crm/property-listings/wizard/PropertyStepWizard";
import { createThirdPartyProperty } from "@/lib/crm/property-listings/third-party-api";
import type { PropertyRecordBucket } from "@/lib/crm/property-listings/types";

function parseBucket(raw: string | null): PropertyRecordBucket {
  if (raw === "properties" || raw === "farm" || raw === "pm") return raw;
  if (raw === "buy" || raw === "sell") return "properties";
  return "properties";
}

export default function NewPropertyListingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-4xl animate-pulse p-10">
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
  const ownerName = searchParams.get("ownerName") || searchParams.get("name") || undefined;
  const ownerPhone = searchParams.get("ownerPhone") || searchParams.get("phone") || searchParams.get("mobileNo") || undefined;
  const ownerEmail = searchParams.get("ownerEmail") || searchParams.get("email") || undefined;
  const bucket = parseBucket(searchParams.get("bucket") || searchParams.get("mode"));
  const isPm = bucket === "pm";

  const [pmDraft, setPmDraft] = useState<PmPropertyDraft>(EMPTY_PM_PROPERTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const setPm = <K extends keyof PmPropertyDraft>(key: K, value: PmPropertyDraft[K]) =>
    setPmDraft((d) => ({ ...d, [key]: value }));

  const savePm = async () => {
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
  };

  // If PM case, render PM form
  if (isPm) {
    return (
      <div className="theme-crm-hubspot mx-auto w-full max-w-3xl animate-in fade-in duration-500 pb-10">
        <CrmPageHeader
          icon={<ClipboardList size={18} />}
          title="Create PM property"
          description="Subscription Property Management case — verification pipeline."
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

        <CrmSectionCard title="PM property details">
          <PmPropertyFormFields draft={pmDraft} onChange={setPm} />
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
            onClick={() => void savePm()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Submit PM property
          </CrmButton>
        </div>
      </div>
    );
  }

  // Otherwise render the 5-step Property Creation Wizard with prefilled params
  return (
    <PropertyStepWizard
      leadId={leadId}
      bucket={bucket}
      initialOwnerName={ownerName}
      initialOwnerPhone={ownerPhone}
      initialOwnerEmail={ownerEmail}
    />
  );
}
