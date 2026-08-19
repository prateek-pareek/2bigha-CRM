"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bath,
  Bed,
  Check,
  Home,
  Mail,
  Phone,
  Ruler,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import { CrmPageHeader, CrmSectionCard, CrmSoftBadge, CrmStatusBadge } from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import {
  formatAddress,
  formatPrice,
  statusBadgeTone,
  approvalStatusBadgeTone,
  type PropertyListingRecord,
  type PropertyListingApprovalStatus,
} from "@/lib/crm/property-listings/types";

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { Authorization: `Bearer ${token}` };
}

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
  const [savingApproval, setSavingApproval] = useState(false);
  const [linkedLead, setLinkedLead] = useState<{ _id: string; firstName?: string; lastName?: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/${id}`, {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to load property listing");
        return;
      }
      setListing(data);
      setActiveImage(0);

      if (data?.leadId) {
        fetch(`${CRM_API_URL}/crm/leads/${data.leadId}`, { headers: authHeaders() })
          .then((r) => (r.ok ? r.json() : null))
          .then((lead) => setLinkedLead(lead))
          .catch(() => setLinkedLead(null));
      } else {
        setLinkedLead(null);
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
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to delete listing");
        return;
      }
      toast.success("Listing deleted");
      router.push("/crm/property-listings");
    } catch {
      toast.error("Failed to delete listing");
    }
  };

  const setApprovalStatus = async (approvalStatus: PropertyListingApprovalStatus) => {
    setSavingApproval(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/${id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to update approval status");
        return;
      }
      toast.success(
        approvalStatus === "Approved"
          ? "Listing approved — now visible in the main Listing view."
          : "Listing rejected.",
      );
      setListing(data);
    } catch {
      toast.error("Failed to update approval status");
    } finally {
      setSavingApproval(false);
    }
  };

  if (loading || !listing) {
    return <CrmRecordDetailSkeleton />;
  }

  const leadName = linkedLead
    ? [linkedLead.firstName, linkedLead.lastName].filter(Boolean).join(" ") || "Linked lead"
    : null;

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<Home size={18} />}
        title={listing.title}
        badge={
          <div className="flex items-center gap-1.5">
            <CrmStatusBadge tone={statusBadgeTone(listing.status)}>{listing.status}</CrmStatusBadge>
            <CrmStatusBadge tone={approvalStatusBadgeTone(listing.approvalStatus)}>
              {listing.approvalStatus}
            </CrmStatusBadge>
            <CrmSoftBadge label={`For ${listing.listedFor}`} tone="secondary" />
          </div>
        }
        description={formatAddress(listing)}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings", href: "/crm/property-listings" },
          { label: listing.title },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {listing.approvalStatus !== "Approved" ? (
              <button
                type="button"
                disabled={savingApproval}
                onClick={() => void setApprovalStatus("Approved")}
                className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 shadow-[var(--crm-shadow-input)] transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                <Check size={14} /> Approve
              </button>
            ) : null}
            {listing.approvalStatus !== "Rejected" ? (
              <button
                type="button"
                disabled={savingApproval}
                onClick={() => void setApprovalStatus("Rejected")}
                className="inline-flex h-[38px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error)] disabled:opacity-50"
              >
                <X size={14} /> Reject
              </button>
            ) : null}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CrmSectionCard title="Overview">
            <DetailRow label="Price" value={formatPrice(listing.price, listing.currency)} />
            <DetailRow label="Property type" value={listing.propertyType} />
            <DetailRow label="Listed for" value={listing.listedFor} />
            <DetailRow
              label="Bedrooms"
              value={
                typeof listing.bedrooms === "number" ? (
                  <span className="inline-flex items-center gap-1">
                    <Bed size={13} /> {listing.bedrooms}
                  </span>
                ) : undefined
              }
            />
            <DetailRow
              label="Bathrooms"
              value={
                typeof listing.bathrooms === "number" ? (
                  <span className="inline-flex items-center gap-1">
                    <Bath size={13} /> {listing.bathrooms}
                  </span>
                ) : undefined
              }
            />
            <DetailRow
              label="Area"
              value={
                typeof listing.areaSqft === "number" ? (
                  <span className="inline-flex items-center gap-1">
                    <Ruler size={13} /> {listing.areaSqft} sqft
                  </span>
                ) : undefined
              }
            />
            <DetailRow
              label="Listed on"
              value={listing.listedDate ? new Date(listing.listedDate).toLocaleDateString() : undefined}
            />
          </CrmSectionCard>

          <CrmSectionCard title="Location & contact">
            <DetailRow label="Address" value={listing.address} />
            <DetailRow label="City" value={listing.city} />
            <DetailRow label="State" value={listing.state} />
            <DetailRow label="Zip code" value={listing.zipCode} />
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

        {leadName && (
          <CrmSectionCard title="Linked lead">
            <button
              type="button"
              onClick={() => router.push(`/crm/leads/${listing.leadId}`)}
              className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2.5 text-left transition-colors hover:border-[var(--primary)]/40"
            >
              <span className="text-sm font-medium text-[var(--text-main)]">{leadName}</span>
              <ArrowUpRight size={15} className="shrink-0 text-[var(--text-muted)]" />
            </button>
          </CrmSectionCard>
        )}

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
