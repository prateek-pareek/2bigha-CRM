"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bath,
  Bed,
  Home,
  Loader2,
  MapPin,
  Plus,
  Ruler,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import {
  PROPERTY_STATUSES,
  formatAddress,
  formatPrice,
  statusTone,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";

export default function PropertyListingsPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [listings, setListings] = useState<PropertyListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`${CRM_API_URL}/crm/property-listings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to load property listings");
        return;
      }
      setListings(Array.isArray(data?.data) ? data.data : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
    } catch {
      toast.error("Failed to load property listings");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this property listing?")) return;
    setBusyId(id);
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
      setListings((prev) => prev.filter((l) => l._id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      toast.error("Failed to delete listing");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => listings, [listings]);
  const statusOptions = ["all", ...PROPERTY_STATUSES];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-text-main">Property Listings</h1>
          <p className="text-sm font-medium text-text-muted">
            {total} propert{total === 1 ? "y" : "ies"} listed. Click a listing to see full details.
          </p>
        </div>
        <Link href="/crm/property-listings/new">
          <CrmButton variant="primary" className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus size={14} /> New listing
          </CrmButton>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, address, city…"
            className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {statusOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition",
                statusFilter === s
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-border bg-white text-text-muted hover:bg-slate-50",
              )}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-xs text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Home className="mx-auto mb-3 text-text-muted opacity-30" size={28} />
            <p className="text-sm font-semibold text-text-main">No property listings yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Add your first listing to start tracking available, sold, and rented properties.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((p) => (
              <li key={p._id} className="flex items-start justify-between gap-3 px-4 py-3.5">
                <Link href={`/crm/property-listings/${p._id}`} className="flex min-w-0 flex-1 gap-3">
                  {p.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.images[0]}
                      alt={p.title}
                      className="h-16 w-20 shrink-0 rounded-[var(--radius-md)] border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-slate-50">
                      <Home size={20} className="text-text-muted opacity-40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text-main">{p.title}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          statusTone(p.status),
                        )}
                      >
                        {p.status}
                      </span>
                      <span className="shrink-0 rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                        For {p.listedFor}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                      <MapPin size={11} className="shrink-0" /> {formatAddress(p)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                      <span className="font-semibold text-text-main">
                        {formatPrice(p.price, p.currency)}
                      </span>
                      <span>{p.propertyType}</span>
                      {typeof p.bedrooms === "number" && (
                        <span className="flex items-center gap-1">
                          <Bed size={11} /> {p.bedrooms}
                        </span>
                      )}
                      {typeof p.bathrooms === "number" && (
                        <span className="flex items-center gap-1">
                          <Bath size={11} /> {p.bathrooms}
                        </span>
                      )}
                      {typeof p.areaSqft === "number" && (
                        <span className="flex items-center gap-1">
                          <Ruler size={11} /> {p.areaSqft} sqft
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === p._id}
                    onClick={() => void remove(p._id)}
                    className="rounded-full p-2 text-text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    title="Delete listing"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
