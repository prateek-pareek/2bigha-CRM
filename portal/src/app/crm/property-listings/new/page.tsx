"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PropertyStepWizard } from "@/components/crm/property-listings/wizard/PropertyStepWizard";
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
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId") || undefined;
  const ownerName = searchParams.get("ownerName") || searchParams.get("name") || undefined;
  const ownerPhone = searchParams.get("ownerPhone") || searchParams.get("phone") || searchParams.get("mobileNo") || undefined;
  const ownerEmail = searchParams.get("ownerEmail") || searchParams.get("email") || undefined;
  const bucket = parseBucket(searchParams.get("bucket") || searchParams.get("mode"));

  // Render the 5-step Property Creation Wizard with prefilled params for all buckets (properties, farm, pm)
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
