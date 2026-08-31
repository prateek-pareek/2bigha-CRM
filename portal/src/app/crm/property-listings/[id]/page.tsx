"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/crm/api";
import {
  Home,
  Loader2,
  Mail,
  Phone,
  Ruler,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import { CrmPageHeader, CrmSectionCard, CrmSoftBadge, CrmStatusBadge } from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import { fetchThirdPartyPropertyById, deleteThirdPartyProperty, fetchLeadSubscriptionMock, requestPropertyLegalVerification } from "@/lib/crm/property-listings/third-party-api";
import PmWorkflowPanel from "@/components/crm/property-listings/PmWorkflowPanel";
import LegalVerificationReviewPanel from "@/components/crm/property-listings/LegalVerificationReviewPanel";
import {
  formatAddress,
  formatIndianLandAmount,
  formatListingArea,
  formatPrice,
  legalStatusBadgeTone,
  resolveAreaBigha,
  statusBadgeTone,
  approvalStatusBadgeTone,
  LISTING_BUCKETS,
  type LeadSubscriptionMock,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import { pmStageBadgeTone } from "@/lib/crm/property-management/types";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] py-2.5 text-sm last:border-b-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-main)]">{value}</span>
    </div>
  );
}

export default function PropertyListingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<PropertyListingRecord | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [sub, setSub] = useState<LeadSubscriptionMock | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchThirdPartyPropertyById(id);
      if (!data) {
        toast.error("Property listing not found");
        return;
      }
      setListing(data);
      setActiveImage(0);

      const isMockId = id.startsWith("tp_listing_") || id.startsWith("mock_");
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
      if (!isMockId && !isMongoId) {
        api.get<{ images: string[] }>(`/crm/property-listings/twobigha/farms/media/${id}`)
          .then(({ data: mediaData }) => {
            if (mediaData?.images) {
              setListing((prev) => (prev ? { ...prev, images: mediaData.images } : null));
            }
          })
          .catch(() => {});
      }

      if (data.leadId && data.listingBucket !== "pm") {
        const subscription = await fetchLeadSubscriptionMock(data.leadId);
        setSub(subscription);
      } else {
        setSub(null);
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

  const remove = async () => {
    if (!confirm("Delete this property listing?")) return;
    const bucket = listing?.listingBucket || "sell";
    try {
      await deleteThirdPartyProperty(id);
      toast.success("Listing deleted");
      router.push(`/crm/property-listings?bucket=${bucket}`);
    } catch {
      toast.error("Failed to delete listing");
    }
  };

  const requestLegal = async () => {
    setRequestBusy(true);
    try {
      const next = await requestPropertyLegalVerification(id);
      setListing(next);
      toast.success("Legal Verification requested");
      if (next.leadId) {
        setSub(await fetchLeadSubscriptionMock(next.leadId));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRequestBusy(false);
    }
  };

  if (loading || !listing) {
    return <CrmRecordDetailSkeleton />;
  }

  const areaBigha = resolveAreaBigha(listing);
  const isPm = listing.listingBucket === "pm";
  const bucketLabel =
    LISTING_BUCKETS.find((b) => b.key === listing.listingBucket)?.label || listing.listingBucket;
  const canRequestLegal =
    !isPm &&
    !!sub?.includesLegalVerification &&
    listing.propertyLegal?.status !== "Pending" &&
    (listing.propertyLegal != null ||
      sub.legalVerificationAllowance == null ||
      sub.legalVerificationUsed < sub.legalVerificationAllowance);

  const legalAllowanceHint = (() => {
    if (!sub || isPm) return null;
    if (!sub.includesLegalVerification) return "Plan does not include Legal Verification";
    if (sub.legalVerificationAllowance == null) {
      return `${sub.legalVerificationUsed} used · unlimited remaining`;
    }
    const left = Math.max(0, sub.legalVerificationAllowance - sub.legalVerificationUsed);
    return `${left} of ${sub.legalVerificationAllowance} verifications left`;
  })();

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<Home size={18} />}
        title={listing.title}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <CrmSoftBadge label={bucketLabel} tone="secondary" />
            {isPm && listing.pmStage ? (
              <CrmStatusBadge tone={pmStageBadgeTone(listing.pmStage)}>
                {listing.pmStage}
              </CrmStatusBadge>
            ) : (
              <>
                <CrmStatusBadge tone={statusBadgeTone(listing.status)}>{listing.status}</CrmStatusBadge>
                <CrmStatusBadge tone={approvalStatusBadgeTone(listing.approvalStatus)}>
                  {listing.approvalStatus}
                </CrmStatusBadge>
              </>
            )}
            {listing.pmPlan ? <CrmSoftBadge label={`Plan: ${listing.pmPlan}`} tone="secondary" /> : null}
            {listing.propertyLegal ? (
              <CrmStatusBadge tone={legalStatusBadgeTone(listing.propertyLegal.status)}>
                Legal: {listing.propertyLegal.status}
              </CrmStatusBadge>
            ) : null}
          </div>
        }
        description={formatAddress(listing)}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          {
            label: "Property Listings",
            href: `/crm/property-listings?bucket=${listing.listingBucket}`,
          },
          { label: listing.title },
        ]}
        actions={
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            {legalAllowanceHint && !isPm ? (
              <span className="text-[11px] text-[var(--text-muted)]">{legalAllowanceHint}</span>
            ) : null}
            {canRequestLegal ? (
              <button
                type="button"
                disabled={requestBusy}
                onClick={() => void requestLegal()}
                className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 shadow-[var(--crm-shadow-input)] transition-colors hover:bg-sky-100 disabled:opacity-60"
              >
                {requestBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                Request Legal Verification
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push(`/crm/property-listings/${id}/edit`)}
              className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-main)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--surface-dim)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error)]"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        }
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
                className="h-80 w-full object-cover"
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
                      "h-16 w-20 shrink-0 overflow-hidden rounded-[6px] border-2 transition-colors",
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
          <div className={cn(CRM_PANEL, "flex h-40 items-center justify-center")}>
            <Home size={28} className="text-[var(--text-muted)] opacity-30" />
          </div>
        )}

        {isPm ? (
          <PmWorkflowPanel listing={listing} onUpdated={setListing} />
        ) : listing.propertyLegal ? (
          <LegalVerificationReviewPanel listing={listing} onUpdated={setListing} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CrmSectionCard title="Overview">
            {isPm ? (
              <>
                <DetailRow label="PM plan" value={listing.pmPlan} />
                <DetailRow label="PM stage" value={listing.pmStage} />
                <DetailRow label="Property type" value={listing.propertyType} />
                <DetailRow label="Area" value={formatListingArea(listing)} />
                <DetailRow label="Khasra" value={listing.khasraNumber} />
                <DetailRow
                  label="Maps link"
                  value={
                    listing.googleMapsLink ? (
                      <a
                        href={listing.googleMapsLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2f80ed] underline"
                      >
                        Open map
                      </a>
                    ) : undefined
                  }
                />
              </>
            ) : (
              <>
                <DetailRow label="Total" value={formatIndianLandAmount(listing.price)} />
                <DetailRow label="Price" value={formatPrice(listing.price, listing.currency)} />
                <DetailRow label="Property type" value={listing.propertyType} />
                <DetailRow label="Listed for" value={listing.listedFor} />
                <DetailRow
                  label="Area"
                  value={
                    areaBigha != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Ruler size={13} /> {areaBigha} Bigha
                      </span>
                    ) : (
                      formatListingArea(listing)
                    )
                  }
                />
                <DetailRow label="Views" value={listing.viewCount ?? 0} />
                <DetailRow label="Likes" value={listing.likeCount ?? 0} />
              </>
            )}
            <DetailRow
              label="Listed on"
              value={listing.listedDate ? new Date(listing.listedDate).toLocaleDateString() : undefined}
            />
          </CrmSectionCard>

          <CrmSectionCard title="Location & contact">
            <DetailRow label="Address" value={listing.address} />
            <DetailRow label="Village / Area" value={listing.village} />
            <DetailRow label="Tehsil" value={listing.tehsil} />
            <DetailRow label="City" value={listing.city} />
            <DetailRow label="District" value={listing.district} />
            <DetailRow label="State" value={listing.state} />
            <DetailRow label="Pincode" value={listing.zipCode} />
            <DetailRow label="Country" value={listing.country} />
            {listing.contactName && (
              <DetailRow
                label="Contact"
                value={
                  <span className="inline-flex items-center gap-1">
                    <User size={13} /> {listing.contactName}
                  </span>
                }
              />
            )}
            {listing.contactPhone && (
              <DetailRow
                label="Phone"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Phone size={13} /> {listing.contactPhone}
                  </span>
                }
              />
            )}
            {listing.contactEmail && (
              <DetailRow
                label="Email"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Mail size={13} /> {listing.contactEmail}
                  </span>
                }
              />
            )}
          </CrmSectionCard>
        </div>

        {listing.description && (
          <CrmSectionCard title="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
              {listing.description}
            </p>
          </CrmSectionCard>
        )}

        {listing.amenities?.length > 0 && (
          <CrmSectionCard title="Amenities">
            <div className="flex flex-wrap gap-2">
              {listing.amenities.map((a) => (
                <CrmSoftBadge key={a} label={a} tone="secondary" />
              ))}
            </div>
          </CrmSectionCard>
        )}
      </div>
    </div>
  );
}
