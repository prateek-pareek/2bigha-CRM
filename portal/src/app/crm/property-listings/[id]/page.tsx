"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/crm/api";
import {
  Home,
  Loader2,
  Mail,
  Phone,
  Trash2,
  User,
  MapPin,
  Compass,
  Droplets,
  Layers,
  FileText,
  ShieldCheck,
  Building,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Tag,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CrmPageHeader,
  CrmSectionCard,
  CrmSoftBadge,
  CrmStatusBadge,
} from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import {
  fetchThirdPartyPropertyById,
  deleteThirdPartyProperty,
  fetchLeadSubscriptionMock,
  requestPropertyLegalVerification,
} from "@/lib/crm/property-listings/third-party-api";
import PmWorkflowPanel from "@/components/crm/property-listings/PmWorkflowPanel";
import PropertyVisitHistoryPanel from "@/components/crm/property-listings/PropertyVisitHistoryPanel";
import ActivePropertyPlanCard from "@/components/crm/property-listings/ActivePropertyPlanCard";
import ManagedPropertySummaryCard from "@/components/crm/property-listings/ManagedPropertySummaryCard";
import LegalVerificationReviewPanel from "@/components/crm/property-listings/LegalVerificationReviewPanel";
import PropertyDetailMapView from "@/portals/crm/components/property-listings/PropertyDetailMapView";
import { resolveUploadedImageUrl } from "@/lib/media/upload-image";
import {
  formatAddress,
  formatIndianLandAmount,
  formatListingArea,
  formatPrice,
  legalStatusBadgeTone,
  statusBadgeTone,
  approvalStatusBadgeTone,
  LISTING_BUCKETS,
  type LeadSubscriptionMock,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import { pmStageBadgeTone } from "@/lib/crm/property-management/types";

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] py-2.5 text-sm last:border-b-0">
      <span className="flex items-center gap-2 text-[var(--text-muted)]">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium text-[var(--text-main)]">
        {value}
      </span>
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
      if (!isMockId && !isMongoId && !(data.images && data.images.length)) {
        api
          .get<{ images: string[] }>(
            `/crm/property-listings/twobigha/farms/media/${encodeURIComponent(id)}`,
          )
          .then(({ data: mediaData }) => {
            const urls = (mediaData?.images || []).filter((url) => /^https?:\/\//i.test(url));
            if (!urls.length) return;
            setListing((prev) => {
              if (!prev || prev.images?.length) return prev;
              return { ...prev, images: urls };
            });
          })
          .catch(() => { });
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
    const bucket = listing?.listingBucket || "properties";
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

  const images = Array.isArray(listing.images) ? listing.images.filter(Boolean) : [];

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-6xl animate-in fade-in duration-500 pb-16">
      {/* Back Button & Breadcrumbs */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(`/crm/property-listings?bucket=${listing.listingBucket || "properties"}`)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
        >
          <ArrowLeft size={14} /> Back to Property Listings
        </button>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          ID: {listing._id}
        </span>
      </div>

      {/* Main Header */}
      <CrmPageHeader
        icon={<Home size={20} />}
        title={listing.title || "Untitled Property Listing"}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <CrmSoftBadge label={bucketLabel} tone="secondary" />
            {isPm && listing.pmStage ? (
              <CrmStatusBadge tone={pmStageBadgeTone(listing.pmStage)}>
                {listing.pmStage}
              </CrmStatusBadge>
            ) : (
              <>
                <CrmStatusBadge tone={statusBadgeTone(listing.status)}>
                  {listing.status || "Available"}
                </CrmStatusBadge>
                <CrmStatusBadge tone={approvalStatusBadgeTone(listing.approvalStatus)}>
                  {listing.approvalStatus || "Pending"}
                </CrmStatusBadge>
              </>
            )}
            {listing.pmPlan ? <CrmSoftBadge label={`Plan: ${listing.pmPlan}`} tone="secondary" /> : null}
            {listing.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} /> Verified
              </span>
            ) : null}
            {listing.propertyLegal ? (
              <CrmStatusBadge tone={legalStatusBadgeTone(listing.propertyLegal.status)}>
                Legal: {listing.propertyLegal.status}
              </CrmStatusBadge>
            ) : null}
          </div>
        }
        description={formatAddress(listing)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canRequestLegal ? (
              <button
                type="button"
                disabled={requestBusy}
                onClick={() => void requestLegal()}
                className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3.5 text-xs font-semibold text-sky-800 shadow-[var(--crm-shadow-input)] transition-colors hover:bg-sky-100 disabled:opacity-60"
              >
                {requestBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                Request Legal Verification
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push(`/crm/property-listings/${id}/edit`)}
              className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3.5 text-xs font-semibold text-[var(--text-main)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--surface-dim)]"
            >
              Edit Listing
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 shadow-[var(--crm-shadow-input)] transition-colors hover:bg-rose-100"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        }
        className="mb-5"
      />

      {/* KPI Stats Strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:border-[var(--primary)]/40">
          <span className="text-xs font-medium text-[var(--text-muted)]">Total Price</span>
          <p className="mt-1 text-xl font-bold text-[var(--text-main)]">
            {formatIndianLandAmount(listing.price)}
          </p>
          <span className="text-xs text-[var(--text-muted)]">
            {formatPrice(listing.price, listing.currency)}
          </span>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:border-[var(--primary)]/40">
          <span className="text-xs font-medium text-[var(--text-muted)]">Price / Unit</span>
          <p className="mt-1 text-xl font-bold text-[var(--text-main)]">
            {listing.pricePerUnit ? `₹${Number(listing.pricePerUnit).toLocaleString()}` : "—"}
          </p>
          <span className="text-xs text-[var(--text-muted)]">
            per {listing.areaUnit || "Unit"}
          </span>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:border-[var(--primary)]/40">
          <span className="text-xs font-medium text-[var(--text-muted)]">Total Area</span>
          <p className="mt-1 text-xl font-bold text-[var(--text-main)]">
            {listing.areaValue != null
              ? `${listing.areaValue.toLocaleString()} ${listing.areaUnit || "Bigha"}`
              : formatListingArea(listing)}
          </p>
          <span className="text-xs text-[var(--text-muted)]">
            {listing.propertyType || "Property"}
          </span>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:border-[var(--primary)]/40">
          <span className="text-xs font-medium text-[var(--text-muted)]">Moderation Status</span>
          <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {listing.approvalStatus || "Approved"}
          </p>
          <span className="text-xs text-[var(--text-muted)]">
            Listed for {listing.listedFor || "Sale"}
          </span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="space-y-6">
        {/* Gallery / Image Showcase */}
        {images.length > 0 ? (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 shadow-sm">
            <div className="relative aspect-[16/9] max-h-[460px] w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-dim)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveUploadedImageUrl(images[activeImage])}
                alt={listing.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-all duration-300"
              />
              <div className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {activeImage + 1} / {images.length} Photos
              </div>

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveImage((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-transform hover:scale-110"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveImage((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-transform hover:scale-110"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
                {images.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "relative h-20 w-28 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                      i === activeImage
                        ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30 scale-95"
                        : "border-transparent opacity-75 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveUploadedImageUrl(src)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-52 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] bg-[var(--card-bg)] text-center">
            <ImageIcon size={36} className="text-[var(--text-muted)] opacity-40 mb-2" />
            <p className="text-sm font-medium text-[var(--text-main)]">No Photos Available</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Images uploaded during creation will appear here.</p>
          </div>
        )}

        {isPm ? (
          <>
            <ManagedPropertySummaryCard propertyId={id} />
            <PmWorkflowPanel listing={listing} onUpdated={setListing} />
            <PropertyVisitHistoryPanel
              managePropertyId={
                listing.userPropertyId ||
                listing.twobighaPropertyId ||
                (id.startsWith("tp_") || id.startsWith("mock_") || /^[0-9a-fA-F]{24}$/.test(id)
                  ? undefined
                  : id)
              }
            />
          </>
        ) : listing.propertyLegal ? (
          <LegalVerificationReviewPanel listing={listing} onUpdated={setListing} />
        ) : null}

        {/* Details 2-Column Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column (2 Cols) */}
          <div className="space-y-6 lg:col-span-2">
            {isPm ? <ActivePropertyPlanCard propertyId={id} /> : null}

            {/* Land & Regulatory Details */}
            <CrmSectionCard title="Land & Regulatory Specifications">
              <div className="divide-y divide-[var(--border-color)]">
                {isPm ? (
                  <>
                    <DetailRow
                      label="PM Plan"
                      value={listing.pmPlan || "None"}
                      icon={<ShieldCheck size={15} className="text-[var(--primary)]" />}
                    />
                    <DetailRow
                      label="PM Stage"
                      value={listing.pmStage || "Pending"}
                      icon={<Tag size={15} className="text-[var(--primary)]" />}
                    />
                  </>
                ) : null}
                <DetailRow
                  label="Property Type"
                  value={listing.propertyType || "Plot"}
                  icon={<Building size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Category"
                  value={listing.category || "None"}
                  icon={<Tag size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Khasra Number"
                  value={listing.khasraNumber}
                  icon={<FileText size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Murabba Number"
                  value={listing.murabbaNumber}
                  icon={<FileText size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Khewat Number"
                  value={listing.khewatNumber}
                  icon={<FileText size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Land Zoning"
                  value={listing.landZoning}
                  icon={<Layers size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Soil Type"
                  value={listing.soilType}
                  icon={<Compass size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Water Level (Depth)"
                  value={listing.waterLevel != null ? `${listing.waterLevel} ft` : undefined}
                  icon={<Droplets size={15} className="text-sky-500" />}
                />
                <DetailRow
                  label="Sole Ownership"
                  value={listing.ownershipYes ? "Yes (Sole Owner)" : listing.ownershipYes === false ? "No (Joint / Multiple)" : undefined}
                  icon={<ShieldCheck size={15} className="text-emerald-500" />}
                />
                <DetailRow
                  label="Highway Connectivity"
                  value={listing.highwayConn ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={12} /> Direct Highway Access
                    </span>
                  ) : listing.highwayConn === false ? "No" : undefined}
                  icon={<Compass size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Listed on"
                  value={listing.listedDate ? new Date(listing.listedDate).toLocaleDateString() : undefined}
                />
              </div>
            </CrmSectionCard>

            {/* Road Access & Connectivity */}
            <CrmSectionCard title="Road Access & Connectivity">
              <div className="divide-y divide-[var(--border-color)]">
                <DetailRow
                  label="Direct Road Access"
                  value={listing.roadAccess ? "Yes" : listing.roadAccess === false ? "No" : undefined}
                />
                <DetailRow
                  label="Road Width"
                  value={listing.roadAccessWidth ? `${listing.roadAccessWidth} ft` : undefined}
                />
                <DetailRow
                  label="Distance from Main Road"
                  value={listing.roadAccessDistance ? `${listing.roadAccessDistance} ${listing.roadAccessDistanceUnit || "KM"}` : undefined}
                />
                {listing.landMark && listing.landMark.length > 0 && (
                  <div className="py-2.5">
                    <span className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                      Nearby Landmarks
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {listing.landMark.map((lm) => (
                        <span
                          key={lm}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-dim)] px-2.5 py-1 text-xs font-medium text-[var(--text-main)] border border-[var(--border-color)]"
                        >
                          <MapPin size={12} className="text-[var(--primary)]" />
                          {lm}
                        </span>
                      ))}
                    </div>
                    {listing.landMarkName && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Name / Note: <strong className="text-[var(--text-main)]">{listing.landMarkName}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CrmSectionCard>

            {/* Map & Boundaries */}
            <PropertyDetailMapView
              coordinates={listing.mapCoordinates}
              boundaries={listing.mapBoundaries}
              location={listing.mapLocation}
              title={listing.title}
              address={formatAddress(listing)}
            />

            {/* Description */}
            {listing.description && (
              <CrmSectionCard title="Property Description">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]">
                  {listing.description}
                </p>
              </CrmSectionCard>
            )}

            {/* Amenities */}
            {listing.amenities?.length > 0 && (
              <CrmSectionCard title="Amenities & Features">
                <div className="flex flex-wrap gap-2">
                  {listing.amenities.map((a) => (
                    <CrmSoftBadge key={a} label={a} tone="secondary" />
                  ))}
                </div>
              </CrmSectionCard>
            )}
          </div>

          {/* Right Column (1 Col) */}
          <div className="space-y-6">
            {/* Contact & Lister Info */}
            <CrmSectionCard title="Contact & Lister Details">
              <div className="divide-y divide-[var(--border-color)]">
                <DetailRow
                  label="Lister Type"
                  value={
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {listing.listerType || "Owner"}
                    </span>
                  }
                />
                {listing.contactName && (
                  <DetailRow
                    label="Contact Name"
                    value={
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <User size={14} className="text-[var(--primary)]" />
                        {listing.contactName}
                      </span>
                    }
                  />
                )}
                {listing.contactPhone && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
                      <Phone size={14} /> Phone
                    </span>
                    <a
                      href={`tel:${listing.contactPhone}`}
                      className="text-sm font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
                    >
                      {listing.contactPhone}
                    </a>
                  </div>
                )}
                {listing.whatsappNumber && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-emerald-500" /> WhatsApp
                    </span>
                    <a
                      href={`https://wa.me/${listing.whatsappNumber.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      Chat ({listing.whatsappNumber})
                    </a>
                  </div>
                )}
                {listing.contactEmail && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
                      <Mail size={14} /> Email
                    </span>
                    <a
                      href={`mailto:${listing.contactEmail}`}
                      className="text-sm font-semibold text-[var(--primary)] hover:underline"
                    >
                      {listing.contactEmail}
                    </a>
                  </div>
                )}
              </div>
            </CrmSectionCard>

            {/* Location Summary */}
            <CrmSectionCard title="Location Summary">
              <div className="divide-y divide-[var(--border-color)]">
                <DetailRow label="Address" value={listing.address} />
                <DetailRow label="City / Village" value={listing.city || listing.village} />
                <DetailRow label="Tehsil" value={listing.tehsil} />
                <DetailRow label="District" value={listing.district} />
                <DetailRow label="State" value={listing.state} />
                <DetailRow label="Pincode" value={listing.zipCode} />
                <DetailRow label="Country" value={listing.country || "India"} />
              </div>
            </CrmSectionCard>

            {/* System Info */}
            <CrmSectionCard title="System & Sync Information">
              <div className="divide-y divide-[var(--border-color)] text-xs">
                <DetailRow
                  label="2Bigha Status"
                  value={
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 size={13} /> Synced & Live
                    </span>
                  }
                />
                {listing.twobighaPropertyId && (
                  <DetailRow
                    label="2Bigha ID"
                    value={<span className="font-mono text-xs">{listing.twobighaPropertyId}</span>}
                  />
                )}
                <DetailRow
                  label="Created At"
                  value={listing.createdAt ? new Date(listing.createdAt).toLocaleString() : "—"}
                />
                <DetailRow
                  label="Updated At"
                  value={listing.updatedAt ? new Date(listing.updatedAt).toLocaleString() : "—"}
                />
              </div>
            </CrmSectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
