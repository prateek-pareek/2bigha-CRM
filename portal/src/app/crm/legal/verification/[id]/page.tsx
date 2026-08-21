"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Gavel, Home, Mail, Phone, Ruler } from "lucide-react";
import { toast } from "sonner";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import { CrmPageHeader, CrmSectionCard, CrmSoftBadge, CrmStatusBadge } from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import LegalVerificationReviewPanel from "@/components/crm/property-listings/LegalVerificationReviewPanel";
import { fetchThirdPartyPropertyById } from "@/lib/crm/property-listings/third-party-api";
import {
  formatAddress,
  formatListingArea,
  formatPrice,
  legalStatusBadgeTone,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] py-2.5 text-sm last:border-b-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-main)]">{value}</span>
    </div>
  );
}

export default function LegalVerificationRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<PropertyListingRecord | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchThirdPartyPropertyById(id);
      if (!data?.propertyLegal) {
        toast.error("Legal verification request not found");
        router.push("/crm/legal/verification");
        return;
      }
      setListing(data);
      setActiveImage(0);
    } catch {
      toast.error("Failed to load request");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !listing) {
    return <CrmRecordDetailSkeleton />;
  }

  const legal = listing.propertyLegal!;

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<Gavel size={18} />}
        title={listing.title}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <CrmStatusBadge tone={legalStatusBadgeTone(legal.status)}>
              {legal.status}
            </CrmStatusBadge>
            <CrmSoftBadge label={listing.listingBucket.toUpperCase()} tone="secondary" />
          </div>
        }
        description={formatAddress(listing)}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Legal Verification", href: "/crm/legal/verification" },
          { label: listing.title },
        ]}
        className="mb-4"
      />

      <div className="space-y-4">
        {listing.images?.length ? (
          <div className={cn(CRM_PANEL, "space-y-2 overflow-hidden p-2")}>
            <div className="overflow-hidden rounded-[calc(var(--crm-radius-ui)-4px)] bg-[var(--surface-dim)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={listing.images[activeImage]}
                alt={listing.title}
                className="h-64 w-full object-cover"
              />
            </div>
            {listing.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-1">
                {listing.images.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "h-14 w-16 shrink-0 overflow-hidden rounded-[6px] border-2 transition-colors",
                      i === activeImage ? "border-[var(--primary)]" : "border-transparent",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={cn(CRM_PANEL, "flex h-32 items-center justify-center")}>
            <Home size={28} className="text-[var(--text-muted)] opacity-30" />
          </div>
        )}

        <LegalVerificationReviewPanel listing={listing} onUpdated={setListing} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CrmSectionCard title="Property details">
            <DetailRow label="Type" value={listing.propertyType} />
            <DetailRow label="Listed for" value={listing.listedFor} />
            <DetailRow
              label="Area"
              value={
                <span className="inline-flex items-center gap-1">
                  <Ruler size={13} /> {formatListingArea(listing)}
                </span>
              }
            />
            <DetailRow label="Price" value={formatPrice(listing.price, listing.currency)} />
            <DetailRow label="Khasra" value={listing.khasraNumber} />
          </CrmSectionCard>

          <CrmSectionCard title="Owner / client">
            <DetailRow label="Name" value={listing.contactName} />
            <DetailRow
              label="Phone"
              value={
                listing.contactPhone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={13} /> {listing.contactPhone}
                  </span>
                ) : undefined
              }
            />
            <DetailRow
              label="Email"
              value={
                listing.contactEmail ? (
                  <span className="inline-flex items-center gap-1">
                    <Mail size={13} /> {listing.contactEmail}
                  </span>
                ) : undefined
              }
            />
            <DetailRow label="Address" value={formatAddress(listing)} />
            <DetailRow
              label="Requested"
              value={new Date(legal.requestedAt).toLocaleString()}
            />
          </CrmSectionCard>
        </div>

        {listing.documents?.length ? (
          <CrmSectionCard title="Documents on file">
            <ul className="space-y-2 text-sm">
              {listing.documents.map((doc) => (
                <li
                  key={doc.name + (doc.uploadedAt || "")}
                  className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] py-2 last:border-b-0"
                >
                  <a
                    href={doc.url || "#"}
                    className="font-medium text-[#2f80ed] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.name}
                  </a>
                  {doc.uploadedAt ? (
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CrmSectionCard>
        ) : null}

        {listing.description ? (
          <CrmSectionCard title="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
              {listing.description}
            </p>
          </CrmSectionCard>
        ) : null}
      </div>
    </div>
  );
}
