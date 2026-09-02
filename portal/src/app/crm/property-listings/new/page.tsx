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
  const bucket = parseBucket(searchParams.get("bucket") || searchParams.get("mode"));
  const isPm = bucket === "pm";

  const [pmDraft, setPmDraft] = useState<PmPropertyDraft>(EMPTY_PM_PROPERTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const setPm = <K extends keyof PmPropertyDraft>(key: K, value: PmPropertyDraft[K]) =>
    setPmDraft((d) => ({ ...d, [key]: value }));

  const savePm = async () => {
    if (!leadId) {
      toast.error("Open Create PM Property from a lead so it is recorded on that client’s 2bigha account");
      return;
    }
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
      if (created.userPropertyId) {
        toast.success("PM property bound on 2bigha");
        router.push(`/crm/property-listings/${created._id}`);
      } else if (created.twobighaSyncStatus === "failed") {
        toast.error(
          created.twobighaSyncError ||
            "Saved locally, but 2bigha did not create a userPropertyId",
        );
        router.push(`/crm/property-listings/${created._id}`);
      } else {
        toast.success("PM property submitted");
        router.push(`/crm/property-listings/${created._id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit PM property");
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
          description="Subscription Property Management case — recorded on the linked lead’s 2bigha user, not as a marketplace listing."
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

        { !leadId ? (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Open this form from a lead (Create PM Property) so the case is recorded on that client’s 2bigha account. Submit is disabled until a lead is linked.
          </p>
        ) : null}
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
            disabled={saving || !leadId}
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

  // Otherwise render the 5-step Property Creation Wizard
  return <PropertyStepWizard leadId={leadId} bucket={bucket} />;
}
