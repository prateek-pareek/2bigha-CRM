"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmButton,
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmListMutedText,
  CrmListToolbar,
  CrmPageHeader,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
  CrmViewToggle,
  type CrmViewMode,
} from "@/components/crm/ui";
import {
  PropertyListingCard,
  PropertyListingCardSkeleton,
} from "@/components/crm/property-listings/PropertyListingCard";
import { fetchMyPropertyListings } from "@/lib/crm/property-listings/backend-api";
import { deleteThirdPartyProperty } from "@/lib/crm/property-listings/third-party-api";
import {
  approvalStatusBadgeTone,
  displayPropertyType,
  formatAddress,
  formatListingArea,
  formatPrice,
  statusBadgeTone,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";

const VIEW_MODE_KEY = "crm_my_properties_view_mode_v1";
const PAGE_SIZES = [10, 25, 50];

/** "My Properties" — every listing the signed-in user created, across Properties / Farms / PM. */
export default function MyPropertiesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<PropertyListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [viewMode, setViewMode] = useState<CrmViewMode>("grid");

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_MODE_KEY) === "list") setViewMode("list");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, approvalFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, total: count } = await fetchMyPropertyListings({
        page,
        pageSize,
        search: search || undefined,
        approvalStatus: approvalFilter !== "all" ? approvalFilter : undefined,
      });
      setListings(data);
      setTotal(count);
    } catch {
      toast.error("Failed to load your properties");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, approvalFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeViewMode = (mode: CrmViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const openListing = (id: string) => router.push(`/crm/property-listings/${id}`);
  const editListing = (id: string) => router.push(`/crm/property-listings/${id}/edit`);
  const removeListing = async (id: string) => {
    if (!confirm("Delete this listing?")) return;
    try {
      await deleteThirdPartyProperty(id);
      toast.success("Listing deleted");
      setListings((prev) => prev.filter((l) => l._id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      toast.error("Failed to delete listing");
    }
  };

  const filtersActive = approvalFilter !== "all" || Boolean(search);

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title="My Properties"
        icon={<UserCheck size={18} className="text-emerald-600" />}
        badge={
          loading ? (
            <span className="inline-block h-5 w-8 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          ) : (
            <CrmCountBadge>{total}</CrmCountBadge>
          )
        }
        description="Properties and farms you have listed, with their moderation status."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings", href: "/crm/property-listings?bucket=properties" },
          { label: "My Properties" },
        ]}
        actions={
          <CrmHeaderTools
            onRefresh={() => void load()}
            trailing={
              <CrmButton
                variant="primary"
                onClick={() => router.push("/crm/property-listings/new?bucket=properties")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                New listing
              </CrmButton>
            }
          />
        }
        className="mb-3"
      />

      <CrmListToolbar
        searchProps={{
          placeholder: "Search by title, address, city…",
          value: searchInput,
          onChange: (e) => setSearchInput(e.target.value),
        }}
        leftExtra={
          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value)}
            className={cn(CRM_TOOLBAR_SELECT, "h-[38px] min-w-[140px]")}
          >
            <option value="all">All Moderation</option>
            <option value="Pending">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        }
        right={
          <div className="flex items-center gap-2">
            <CrmViewToggle value={viewMode} onChange={changeViewMode} modes={["grid", "list"]} />
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setApprovalFilter("all");
                  setSearchInput("");
                  setSearch("");
                }}
                className="inline-flex h-[38px] items-center gap-1 rounded-[var(--radius-md)] px-2.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <X size={13} /> Reset
              </button>
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="rounded-2xl bg-[#f4f6f8] p-4 sm:p-6">
          <PropertyListingCardSkeleton count={3} />
        </div>
      ) : listings.length === 0 ? (
        <CrmEmptyState
          icon={<Home className="h-7 w-7" strokeWidth={1.5} />}
          title={filtersActive ? "No properties match these filters" : "You haven't listed any properties yet"}
          description="Properties you add from the listing wizard appear here."
          action={
            <CrmButton
              variant="primary"
              onClick={() => router.push("/crm/property-listings/new?bucket=properties")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Add listing
            </CrmButton>
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {listings.map((p) => (
            <PropertyListingCard
              key={p._id}
              listing={p}
              onClick={() => openListing(p._id)}
              onEdit={() => editListing(p._id)}
              onDelete={() => void removeListing(p._id)}
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
                <th className="sticky top-0 z-10">Area</th>
                <th className="sticky top-0 z-10">Status</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((p) => (
                <tr key={p._id} className="group cursor-pointer transition-colors" onClick={() => openListing(p._id)}>
                  <td>
                    <div className="min-w-0 max-w-[280px]">
                      <p className="truncate text-sm font-medium text-[var(--text-main)]">{p.title}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{formatAddress(p)}</p>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm font-semibold text-[var(--text-main)]">{formatPrice(p.price, p.currency)}</span>
                  </td>
                  <td>
                    <CrmListMutedText>{p.landType || displayPropertyType(p.propertyType)}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{formatListingArea(p)}</CrmListMutedText>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CrmStatusBadge tone={statusBadgeTone(p.status)}>{p.status}</CrmStatusBadge>
                      <CrmStatusBadge tone={approvalStatusBadgeTone(p.approvalStatus)}>{p.approvalStatus}</CrmStatusBadge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      )}

      <div className="mt-auto">
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          pageSizes={PAGE_SIZES}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          className="mt-3 rounded-[var(--crm-radius-ui)] border border-[#e2e8f0]"
        />
      </div>
    </div>
  );
}
