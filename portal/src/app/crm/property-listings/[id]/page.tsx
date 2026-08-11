"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bath,
  Bed,
  ChevronLeft,
  Home,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Ruler,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import {
  formatAddress,
  formatPrice,
  statusTone,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-main">{value}</span>
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

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to load property listing");
        return;
      }
      setListing(data);
      setActiveImage(0);
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
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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

  if (loading || !listing) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-xs text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/crm/property-listings"
            className="mt-0.5 rounded-full p-2 text-text-muted transition-colors hover:bg-slate-100 hover:text-text-main"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-medium tracking-tight text-text-main">{listing.title}</h1>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  statusTone(listing.status),
                )}
              >
                {listing.status}
              </span>
              <span className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                For {listing.listedFor}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-text-muted">
              <MapPin size={13} /> {formatAddress(listing)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void remove()}
            className="flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 text-xs font-semibold text-text-muted hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {listing.images?.length ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.images[activeImage]}
              alt={listing.title}
              className="h-80 w-full object-cover"
            />
          </div>
          {listing.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {listing.images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "h-16 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2",
                    i === activeImage ? "border-emerald-500" : "border-transparent",
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
        <div className="flex h-40 items-center justify-center rounded-[var(--radius-md)] border border-border bg-slate-50">
          <Home size={28} className="text-text-muted opacity-30" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-main">Overview</h2>
          <DetailRow label="Price" value={formatPrice(listing.price, listing.currency)} />
          <DetailRow label="Property type" value={listing.propertyType} />
          <DetailRow label="Listed for" value={listing.listedFor} />
          <DetailRow
            label="Bedrooms"
            value={
              typeof listing.bedrooms === "number" ? (
                <span className="flex items-center gap-1">
                  <Bed size={13} /> {listing.bedrooms}
                </span>
              ) : undefined
            }
          />
          <DetailRow
            label="Bathrooms"
            value={
              typeof listing.bathrooms === "number" ? (
                <span className="flex items-center gap-1">
                  <Bath size={13} /> {listing.bathrooms}
                </span>
              ) : undefined
            }
          />
          <DetailRow
            label="Area"
            value={
              typeof listing.areaSqft === "number" ? (
                <span className="flex items-center gap-1">
                  <Ruler size={13} /> {listing.areaSqft} sqft
                </span>
              ) : undefined
            }
          />
          <DetailRow
            label="Listed on"
            value={listing.listedDate ? new Date(listing.listedDate).toLocaleDateString() : undefined}
          />
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-main">Location</h2>
          <DetailRow label="Address" value={listing.address} />
          <DetailRow label="City" value={listing.city} />
          <DetailRow label="State" value={listing.state} />
          <DetailRow label="Zip code" value={listing.zipCode} />
          <DetailRow label="Country" value={listing.country} />

          {(listing.contactName || listing.contactPhone || listing.contactEmail) && (
            <>
              <h2 className="mb-2 mt-4 text-sm font-bold text-text-main border-t border-border pt-4">
                Contact
              </h2>
              {listing.contactName && (
                <DetailRow
                  label="Name"
                  value={
                    <span className="flex items-center gap-1">
                      <User size={13} /> {listing.contactName}
                    </span>
                  }
                />
              )}
              {listing.contactPhone && (
                <DetailRow
                  label="Phone"
                  value={
                    <span className="flex items-center gap-1">
                      <Phone size={13} /> {listing.contactPhone}
                    </span>
                  }
                />
              )}
              {listing.contactEmail && (
                <DetailRow
                  label="Email"
                  value={
                    <span className="flex items-center gap-1">
                      <Mail size={13} /> {listing.contactEmail}
                    </span>
                  }
                />
              )}
            </>
          )}
        </div>
      </div>

      {listing.description && (
        <div className="rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-main">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-text-main">{listing.description}</p>
        </div>
      )}

      {listing.amenities?.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-main">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {listing.amenities.map((a) => (
              <span
                key={a}
                className="rounded-full border border-border bg-slate-50 px-2.5 py-1 text-xs font-medium text-text-main"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
