"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bath,
  Bed,
  Building2,
  CheckCircle2,
  Clock3,
  Home,
  MapPin,
  Ruler,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CRM_TOOLBAR_CHIP, CRM_TOOLBAR_CHIP_ACTIVE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmButton,
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmKpiCard,
  CrmListMutedText,
  CrmListToolbar,
  CrmPageHeader,
  CrmStatusBadge,
  CrmTable,
  CrmTableActionMenu,
  CrmTableShell,
  CrmViewToggle,
  type CrmViewMode,
} from "@/components/crm/ui";
import {
  PROPERTY_STATUSES,
  formatAddress,
  formatCompactPrice,
  formatPrice,
  statusBadgeTone,
  type PropertyListingRecord,
  type PropertyListingStats,
} from "@/lib/crm/property-listings/types";

const VIEW_MODE_KEY = "crm_property_listings_view_mode_v1";

const CARD =
  "group relative flex h-full flex-col overflow-hidden rounded-[5px] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]";

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { Authorization: `Bearer ${token}` };
}

function PropertyCardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={cn(CARD, "animate-pulse")}>
          <div className="h-36 w-full bg-[var(--surface-dim)]" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-3/4 rounded bg-[var(--surface-dim)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--surface-dim)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--surface-dim)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PropertyCard({
  listing,
  onClick,
  onDelete,
}: {
  listing: PropertyListingRecord;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(CARD, "cursor-pointer")}
    >
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-[var(--surface-dim)]">
        {listing.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.images[0]}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Home size={26} className="text-[var(--text-muted)] opacity-30" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <CrmStatusBadge tone={statusBadgeTone(listing.status)} variant="solid">
            {listing.status}
          </CrmStatusBadge>
        </div>
        <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
          <CrmTableActionMenu onEdit={onClick} onDelete={onDelete} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-[var(--text-main)]">{listing.title}</p>
          <span className="shrink-0 rounded-[6px] bg-[var(--surface-dim)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            {listing.listedFor}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--text-muted)]">
          <MapPin size={11} className="shrink-0" /> {formatAddress(listing)}
        </p>

        <p className="mt-2 text-base font-bold text-[var(--text-main)]">
          {formatPrice(listing.price, listing.currency)}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border-color)] pt-3 text-xs text-[var(--text-muted)]">
          <span>{listing.propertyType}</span>
          <div className="flex items-center gap-2.5">
            {typeof listing.bedrooms === "number" && (
              <span className="flex items-center gap-1">
                <Bed size={12} /> {listing.bedrooms}
              </span>
            )}
            {typeof listing.bathrooms === "number" && (
              <span className="flex items-center gap-1">
                <Bath size={12} /> {listing.bathrooms}
              </span>
            )}
            {typeof listing.areaSqft === "number" && (
              <span className="flex items-center gap-1">
                <Ruler size={12} /> {listing.areaSqft}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PropertyListingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [listedForFilter, setListedForFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<CrmViewMode>("grid");
  const [listings, setListings] = useState<PropertyListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [stats, setStats] = useState<PropertyListingStats | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const changeViewMode = useCallback((mode: CrmViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (listedForFilter !== "all") params.set("listedFor", listedForFilter);

      const res = await fetch(`${CRM_API_URL}/crm/property-listings?${params}`, {
        headers: authHeaders(),
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
  }, [page, pageSize, search, statusFilter, listedForFilter]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/stats`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.ok) setStats(await res.json());
    } catch {
      /* stats are a nice-to-have — silent fail */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, listedForFilter]);

  const remove = async (id: string) => {
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
      setListings((prev) => prev.filter((l) => l._id !== id));
      setTotal((t) => Math.max(0, t - 1));
      void loadStats();
    } catch {
      toast.error("Failed to delete listing");
    }
  };

  const availableCount = stats?.byStatus?.["Available"] ?? 0;
  const underOfferCount = stats?.byStatus?.["Under Offer"] ?? 0;

  const statusOptions = useMemo(() => ["all", ...PROPERTY_STATUSES], []);

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title="Property Listings"
        icon={<Home size={18} />}
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Track every listing in your portfolio — click one to see full details."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings" },
        ]}
        actions={
          <CrmHeaderTools
            onRefresh={() => {
              void load();
              void loadStats();
            }}
          />
        }
        className="mb-4"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CrmKpiCard label="Total listings" value={stats?.total ?? total} icon={<Building2 size={17} />} />
        <CrmKpiCard label="Available" value={availableCount} icon={<CheckCircle2 size={17} />} />
        <CrmKpiCard label="Under offer" value={underOfferCount} icon={<Clock3 size={17} />} />
        <CrmKpiCard
          label="Portfolio value"
          value={formatCompactPrice(stats?.totalValue ?? 0)}
          sub={`${formatCompactPrice(stats?.availableValue ?? 0)} available`}
          icon={<Wallet size={17} />}
        />
      </div>

      <CrmListToolbar
        searchProps={{
          placeholder: "Search by title, address, city…",
          value: search,
          onChange: (e) => setSearch(e.target.value),
        }}
        leftExtra={
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {statusOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(CRM_TOOLBAR_CHIP, statusFilter === s && CRM_TOOLBAR_CHIP_ACTIVE)}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>
            <select
              value={listedForFilter}
              onChange={(e) => setListedForFilter(e.target.value)}
              className={cn(CRM_TOOLBAR_SELECT, "shrink-0")}
            >
              <option value="all">Sale &amp; Rent</option>
              <option value="Sale">For sale</option>
              <option value="Rent">For rent</option>
            </select>
          </>
        }
        right={
          <>
            <CrmViewToggle value={viewMode} onChange={changeViewMode} modes={["grid", "list"]} />
            <CrmButton
              variant="primary"
              onClick={() => router.push("/crm/property-listings/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              New listing
            </CrmButton>
          </>
        }
      />

      {loading ? (
        viewMode === "grid" ? (
          <PropertyCardSkeleton />
        ) : (
          <CrmTableShell>
            <CrmTable>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td>
                      <div className="h-4 w-3/4 rounded-md bg-[var(--surface-dim)]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </CrmTable>
          </CrmTableShell>
        )
      ) : listings.length === 0 ? (
        <CrmEmptyState
          icon={<Home className="h-7 w-7" strokeWidth={1.5} />}
          title="No property listings yet"
          description="Add your first listing to start tracking available, sold, and rented properties."
          action={
            <CrmButton
              variant="primary"
              onClick={() => router.push("/crm/property-listings/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Add listing
            </CrmButton>
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {listings.map((p) => (
            <PropertyCard
              key={p._id}
              listing={p}
              onClick={() => router.push(`/crm/property-listings/${p._id}`)}
              onDelete={() => void remove(p._id)}
            />
          ))}
        </div>
      ) : (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10">Property</th>
                <th className="sticky top-0 z-10">Price</th>
                <th className="sticky top-0 z-10">Type</th>
                <th className="sticky top-0 z-10">Specs</th>
                <th className="sticky top-0 z-10">Status</th>
                <th className="crm-table-actions sticky top-0 z-10 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((p) => (
                <tr
                  key={p._id}
                  className="group cursor-pointer transition-colors"
                  onClick={() => router.push(`/crm/property-listings/${p._id}`)}
                >
                  <td>
                    <div className="flex min-w-0 max-w-[280px] items-center gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-dim)]">
                        {p.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Home size={16} className="text-[var(--text-muted)] opacity-40" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-main)]">{p.title}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">{formatAddress(p)}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm font-semibold text-[var(--text-main)]">
                      {formatPrice(p.price, p.currency)}
                    </span>
                  </td>
                  <td>
                    <CrmListMutedText>
                      {p.propertyType} · {p.listedFor}
                    </CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>
                      {[
                        typeof p.bedrooms === "number" ? `${p.bedrooms} bd` : null,
                        typeof p.bathrooms === "number" ? `${p.bathrooms} ba` : null,
                        typeof p.areaSqft === "number" ? `${p.areaSqft} sqft` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </CrmListMutedText>
                  </td>
                  <td>
                    <CrmStatusBadge tone={statusBadgeTone(p.status)}>{p.status}</CrmStatusBadge>
                  </td>
                  <td className="crm-table-actions" onClick={(e) => e.stopPropagation()}>
                    <CrmTableActionMenu
                      onEdit={() => router.push(`/crm/property-listings/${p._id}`)}
                      onDelete={() => void remove(p._id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        className="mt-3 rounded-[var(--crm-radius-ui)] border-t-0"
      />
    </div>
  );
}
