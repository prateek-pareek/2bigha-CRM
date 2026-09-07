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
  IndianRupee,
  Clock,
  AlertCircle,
  Share2,
  Check,
  Edit3,
  ExternalLink,
  Copy,
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
import PmPaymentHistorySection from "@/components/crm/subscriptions/PmPaymentHistorySection";
import PmActivityLogSection from "@/components/crm/subscriptions/PmActivityLogSection";
import { fetchPmPayments } from "@/lib/crm/subscriptions/backend-api";
import type { PmPaymentRecord } from "@/lib/crm/subscriptions/types";
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
  normalizeApprovalStatus,
  normalizeListingStatus,
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
  const [pmPayments, setPmPayments] = useState<PmPaymentRecord[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

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
        setPmPayments([]);
      } else if (data.leadId && data.listingBucket === "pm") {
        setSub(null);
        fetchPmPayments(data.leadId).then(setPmPayments).catch(() => setPmPayments([]));
      } else {
        setSub(null);
        setPmPayments([]);
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
  const isLivePm = String(id).startsWith("pm_");
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

  const normStatus = normalizeListingStatus(listing.status);
  const normApproval = normalizeApprovalStatus(listing.approvalStatus);
  const isApproved = normApproval.toLowerCase() === "approved";
  const isPending = normApproval.toLowerCase() === "pending";
  const isRejected = normApproval.toLowerCase() === "rejected";

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success("Listing link copied to clipboard");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-6xl animate-in fade-in duration-500 pb-16">
      {/* Back Button & Breadcrumbs */}
      <div className="mb-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(`/crm/property-listings?bucket=${listing.listingBucket || "properties"}`)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
        >
          <ArrowLeft size={14} /> Back to Property Listings
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] font-mono">
            ID: {listing._id}
          </span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
            title="Copy Listing URL"
          >
            {copiedLink ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copiedLink ? "Copied" : "Copy ID"}
          </button>
        </div>
      </div>

      {/* Main Header */}
      <CrmPageHeader
        icon={<Home size={20} />}
        title={listing.title || "Untitled Property Listing"}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-dim)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-muted)] border border-[var(--border-color)]">
              <Tag size={12} className="text-[var(--primary)]" />
              {bucketLabel}
            </span>

            {/* Marketplace Status (Dynamic) */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold shadow-xs border transition-colors",
                normStatus === "Available"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                  : normStatus === "Sold"
                    ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800"
                    : normStatus === "Managed"
                      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                      : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              {normStatus === "Available" && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
              {normStatus === "Sold" && <CheckCircle2 size={13} className="text-sky-600" />}
              {normStatus === "Managed" && <Building size={13} className="text-amber-600" />}
              {normStatus}
            </span>

            {/* Moderation Status (Dynamic) */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold shadow-xs border transition-colors",
                isApproved
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                  : isPending
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
              )}
            >
              {isApproved && <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />}
              {isPending && <Clock size={13} className="text-amber-600 dark:text-amber-400" />}
              {isRejected && <AlertCircle size={13} className="text-rose-600 dark:text-rose-400" />}
              Moderation: {normApproval}
            </span>

            {listing.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">
                <CheckCircle2 size={12} className="text-blue-600 dark:text-blue-400" /> Verified
              </span>
            ) : null}

            {listing.pmPlan ? (
              <CrmSoftBadge label={`Plan: ${listing.pmPlan}`} tone="secondary" />
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
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 text-xs font-semibold text-sky-800 shadow-sm transition-colors hover:bg-sky-100 disabled:opacity-60"
              >
                {requestBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Request Legal Verification
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-main)] shadow-sm transition-colors hover:bg-[var(--surface-dim)]"
              title="Copy Listing Link"
            >
              {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Share2 size={14} />}
              <span>{copiedLink ? "Copied" : "Share"}</span>
            </button>
            {!isLivePm ? (
              <button
                type="button"
                onClick={() => router.push(`/crm/property-listings/${id}/edit`)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3.5 text-xs font-semibold text-[var(--text-main)] shadow-sm transition-colors hover:bg-[var(--surface-dim)]"
              >
                <Edit3 size={14} />
                Edit Listing
              </button>
            ) : null}
            {!isLivePm ? (
              <button
                type="button"
                onClick={() => void remove()}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:bg-rose-950/30 dark:border-rose-900"
              >
                <Trash2 size={14} /> Delete
              </button>
            ) : null}
          </div>
        }
        className="mb-5"
      />

      {/* Premium KPI Stats Strip */}
      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Price */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-500/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Total Price
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <IndianRupee size={16} />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-[var(--text-main)]">
              {formatIndianLandAmount(listing.price)}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              {formatPrice(listing.price, listing.currency)}
            </p>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-muted)]">
            <span>Listing Bucket</span>
            <strong className="text-[var(--text-main)] capitalize">{listing.listingBucket || "Property"}</strong>
          </div>
        </div>

        {/* Card 2: Price / Unit */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:shadow-md hover:border-blue-500/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Price / Unit
            </span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Tag size={16} />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-[var(--text-main)]">
              {listing.pricePerUnit ? `₹${Number(listing.pricePerUnit).toLocaleString("en-IN")}` : "—"}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              per {listing.areaUnit || "Unit"}
            </p>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-muted)]">
            <span>Unit Measure</span>
            <strong className="text-[var(--text-main)]">{listing.areaUnit || "Custom"}</strong>
          </div>
        </div>

        {/* Card 3: Total Area */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:shadow-md hover:border-purple-500/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Total Area
            </span>
            <div className="rounded-xl bg-purple-50 p-2 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <Layers size={16} />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-extrabold tracking-tight text-[var(--text-main)]">
              {listing.areaValue != null
                ? `${listing.areaValue.toLocaleString()} ${listing.areaUnit || "Bigha"}`
                : formatListingArea(listing)}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              {listing.propertyType || "Agricultural"} Land
            </p>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-muted)]">
            <span>Property Type</span>
            <strong className="text-[var(--text-main)]">{listing.propertyType || "Agricultural"}</strong>
          </div>
        </div>

        {/* Card 4: Moderation Status (Dynamic Theme!) */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md",
            isApproved
              ? "border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-[var(--card-bg)] to-[var(--card-bg)] hover:border-emerald-400 dark:border-emerald-900/50"
              : isPending
                ? "border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-[var(--card-bg)] to-[var(--card-bg)] hover:border-amber-400 dark:border-amber-900/50"
                : "border-rose-200/80 bg-gradient-to-br from-rose-50/50 via-[var(--card-bg)] to-[var(--card-bg)] hover:border-rose-400 dark:border-rose-900/50"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Moderation Status
            </span>
            <div
              className={cn(
                "rounded-xl p-2",
                isApproved
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : isPending
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              )}
            >
              {isApproved ? <ShieldCheck size={16} /> : isPending ? <Clock size={16} /> : <AlertCircle size={16} />}
            </div>
          </div>
          <div className="mt-2.5">
            <p
              className={cn(
                "text-2xl font-extrabold tracking-tight flex items-center gap-1.5",
                isApproved
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isPending
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
              )}
            >
              {isApproved ? <CheckCircle2 size={20} /> : isPending ? <Clock size={20} /> : <AlertCircle size={20} />}
              {normApproval}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              Listed for {listing.listedFor || "Sale"} • {normStatus}
            </p>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-color)] pt-2 text-[11px] text-[var(--text-muted)]">
            <span>Market Status</span>
            <strong
              className={cn(
                normStatus === "Available"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-[var(--text-main)]"
              )}
            >
              {normStatus}
            </strong>
          </div>
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
            <ManagedPropertySummaryCard
              propertyId={listing.userPropertyId || listing.twobighaPropertyId || id}
            />
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
            {isPm ? (
              <ActivePropertyPlanCard
                propertyId={listing.twobighaPropertyId || listing.userPropertyId || id}
              />
            ) : null}
            {isPm && listing.leadId ? (
              <CrmSectionCard title="PM payment history">
                <PmPaymentHistorySection payments={pmPayments} compact />
              </CrmSectionCard>
            ) : null}
            {isPm ? (
              <CrmSectionCard title="PM activity log">
                <PmActivityLogSection
                  leadId={listing.leadId}
                  propertyListingId={id}
                />
              </CrmSectionCard>
            ) : null}

            {/* Land & Regulatory Details */}
            <CrmSectionCard title="Land & Regulatory Specifications">
              <div className="divide-y divide-[var(--border-color)]">
                {isPm ? (
                  <>
                    <DetailRow
                      label="PM Plan"
                      value={listing.pmPlan}
                      icon={<ShieldCheck size={15} className="text-[var(--primary)]" />}
                    />
                    <DetailRow
                      label="PM Stage"
                      value={listing.pmStage}
                      icon={<Tag size={15} className="text-[var(--primary)]" />}
                    />
                  </>
                ) : null}
                <DetailRow
                  label="Property Type"
                  value={listing.propertyType}
                  icon={<Building size={15} className="text-[var(--text-muted)]" />}
                />
                <DetailRow
                  label="Category"
                  value={listing.category}
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
              geoJson={listing.geoJson}
              calculatedArea={listing.calculatedArea}
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
              <div className="space-y-4">
                {/* Profile Header */}
                <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-dim)] p-3 border border-[var(--border-color)]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-sm font-bold text-white shadow-sm">
                    {listing.contactName
                      ? listing.contactName
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "2B"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-[var(--text-main)]">
                        {listing.contactName || "2Bigha Verified Lister"}
                      </p>
                    </div>
                    <span className="inline-block mt-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {listing.listerType || "Owner / Lister"}
                    </span>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {listing.contactPhone && (
                    <a
                      href={`tel:${listing.contactPhone}`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 transition-colors shadow-xs"
                    >
                      <Phone size={13} /> Call
                    </a>
                  )}
                  {listing.whatsappNumber && (
                    <a
                      href={`https://wa.me/${listing.whatsappNumber.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                    >
                      <MessageSquare size={13} /> WhatsApp
                    </a>
                  )}
                </div>

                {/* Contact Rows */}
                <div className="divide-y divide-[var(--border-color)] text-xs">
                  {listing.contactPhone && (
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                        <Phone size={13} /> Phone
                      </span>
                      <a href={`tel:${listing.contactPhone}`} className="font-mono font-medium text-[var(--primary)] hover:underline">
                        {listing.contactPhone}
                      </a>
                    </div>
                  )}
                  {listing.whatsappNumber && (
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                        <MessageSquare size={13} className="text-emerald-500" /> WhatsApp
                      </span>
                      <a
                        href={`https://wa.me/${listing.whatsappNumber.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-medium text-emerald-600 hover:underline"
                      >
                        {listing.whatsappNumber}
                      </a>
                    </div>
                  )}
                  {listing.contactEmail && (
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                        <Mail size={13} /> Email
                      </span>
                      <a href={`mailto:${listing.contactEmail}`} className="font-medium text-[var(--primary)] hover:underline truncate max-w-[180px]">
                        {listing.contactEmail}
                      </a>
                    </div>
                  )}
                </div>
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
