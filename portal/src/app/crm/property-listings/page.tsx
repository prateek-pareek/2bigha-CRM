"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Building2, Home, IndianRupee, Landmark, ShieldCheck, Sprout, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmButton,
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmKanbanBoard,
  CrmKanbanCard,
  CrmKanbanCardHead,
  CrmKanbanColumn,
  CrmKanbanMetaList,
  CrmKanbanMetaRow,
  CrmListMutedText,
  CrmListToolbar,
  CrmPageHeader,
  CrmSelect,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
  CrmViewToggle,
  type CrmViewMode,
} from "@/components/crm/ui";
import {
  PropertyListingCard,
  PropertyListingCardSkeleton,
  PropertyListingsCarousel,
} from "@/components/crm/property-listings/PropertyListingCard";
import { SectionTabs, VisitStatPills } from "@/components/crm/visits/visit-chrome";
import { CrmHoverActionIcon, CrmTableActionMenu } from "@/components/crm/ui/CrmListCells";
import { CrmIcon, CrmNavIcon } from "@/lib/crm/shared/icons";
import { contactWhatsappUrl, contactWhatsappWaId } from "@/lib/crm/crm-messaging-links";
import CallLeadModal from "@/components/crm/records/detail/CallLeadModal";
import PropertyActivityPopup from "@/components/crm/records/detail/PropertyActivityPopup";
import {
  deleteThirdPartyProperty,
  fetchThirdPartyPropertyListings,
  fetchThirdPartyPropertyStats,
  updateThirdPartyProperty,
} from "@/lib/crm/property-listings/third-party-api";
import {
  fetchTwoBighaFarms,
  fetchTwoBighaProperties,
  mapTwoBighaFarmToRecord,
  mapTwoBighaPropertyToRecord,
} from "@/lib/crm/property-listings/backend-api";
import { CRM_API_URL } from "@/lib/crm/config";
import {
  LISTING_BUCKETS,
  PROPERTY_STATUSES,
  formatAddress,
  formatListingArea,
  formatPrice,
  isMarketplaceBucket,
  statusBadgeTone,
  approvalStatusBadgeTone,
  type PropertyRecordBucket,
  type PropertyListingRecord,
  type PropertyListingStats,
} from "@/lib/crm/property-listings/types";
import {
  PM_PIPELINE_STAGES,
  PM_PLANS,
  pmStageBadgeTone,
  type PmPipelineStage,
} from "@/lib/crm/property-management/types";

const VIEW_MODE_KEY = "crm_property_listings_view_mode_v1";
const PM_VIEW_MODE_KEY = "crm_pm_listings_view_mode_v1";
const BUCKET_KEY = "crm_property_listings_bucket_v1";
/** Keep list/kanban payloads modest so production never mounts thousands of cards. */
const LISTING_PAGE_SIZES = [10, 25, 50];
const LISTING_PAGE_SIZE_MAX = 50;

const STREAM_TABS: { value: PropertyRecordBucket; label: string }[] = [
  { value: "properties", label: "Properties" },
  { value: "farm", label: "Farms" },
  { value: "pm", label: "Property Management" },
];

/** Board columns for PM — Visit Report Approved/Rejected share one “Visit Report” outcome lane. */
const PM_BOARD_STAGES: { key: string; stages: PmPipelineStage[] }[] = [
  { key: "Property Submitted", stages: ["Property Submitted"] },
  { key: "Assigned to RM", stages: ["Assigned to RM"] },
  { key: "Assigned to Legal", stages: ["Assigned to Legal"] },
  { key: "Assigned to Field Agent", stages: ["Assigned to Field Agent"] },
  {
    key: "Visit Report Pending",
    stages: ["Visit Report Pending"],
  },
  {
    key: "Visit Report Done",
    stages: ["Visit Report Approved", "Visit Report Rejected"],
  },
];

function parseBucket(raw: string | null): PropertyRecordBucket {
  if (raw === "properties" || raw === "farm" || raw === "pm") return raw;
  // Legacy URL compat: treat old buy/sell as properties
  if (raw === "buy" || raw === "sell") return "properties";
  return "properties";
}

function stageForBoardColumn(columnKey: string): PmPipelineStage {
  if (columnKey === "Visit Report Done") return "Visit Report Approved";
  return columnKey as PmPipelineStage;
}

export default function PropertyListingsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <PropertyListingsPageContent />
    </Suspense>
  );
}

function formatRupeesInWords(amount?: number) {
  if (!amount) return "₹0";
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

function PropertyListingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [legalStatusFilter, setLegalStatusFilter] = useState<string>("all");
  const [pmStageFilter, setPmStageFilter] = useState<string>("all");
  const [pmPlanFilter, setPmPlanFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [bucket, setBucket] = useState<PropertyRecordBucket>(() =>
    parseBucket(searchParams.get("bucket")),
  );
  const [viewMode, setViewMode] = useState<CrmViewMode>("grid");
  const [listings, setListings] = useState<PropertyListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [stats, setStats] = useState<PropertyListingStats | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [callProperty, setCallProperty] = useState<PropertyListingRecord | null>(null);
  const [notesProperty, setNotesProperty] = useState<PropertyListingRecord | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("bucket");
    if (fromUrl) {
      setBucket(parseBucket(fromUrl));
      return;
    }
    const saved = localStorage.getItem(BUCKET_KEY);
    if (saved) setBucket(parseBucket(saved));
  }, [searchParams]);

  useEffect(() => {
    if (bucket === "pm") {
      const saved = localStorage.getItem(PM_VIEW_MODE_KEY);
      setViewMode(saved === "list" ? "list" : "kanban");
    } else {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      setViewMode(saved === "list" ? "list" : "grid");
    }
  }, [bucket]);

  const changeBucket = useCallback(
    (next: PropertyRecordBucket) => {
      if (next === bucket) return;
      setBucket(next);
      setListings([]);
      setStats(null);
      setTotal(0);
      setLoading(true);
      setPage(1);
      setPmStageFilter("all");
      setPmPlanFilter("all");
      setStatusFilter("all");
      try {
        localStorage.setItem(BUCKET_KEY, next);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("bucket", next);
      router.replace(`/crm/property-listings?${params.toString()}`);
    },
    [bucket, router, searchParams],
  );

  const changeViewMode = useCallback(
    (mode: CrmViewMode) => {
      setViewMode(mode);
      try {
        localStorage.setItem(bucket === "pm" ? PM_VIEW_MODE_KEY : VIEW_MODE_KEY, mode);
      } catch {
        /* ignore */
      }
    },
    [bucket],
  );

  const marketplace = isMarketplaceBucket(bucket);
  const bucketMeta = LISTING_BUCKETS.find((b) => b.key === bucket);

  const load = useCallback(async () => {
    setLoading(true);
    setListings([]);
    const safePageSize = Math.min(Math.max(1, pageSize), LISTING_PAGE_SIZE_MAX);
    try {
      if (bucket === "farm") {
        const { data, total: farmTotal } = await fetchTwoBighaFarms({
          page,
          limit: safePageSize,
          searchTerm: search.trim() || undefined,
        });
        setListings(data.map(mapTwoBighaFarmToRecord));
        setTotal(farmTotal);
        return;
      }
      if (bucket === "properties") {
        // Live 2bigha GraphQL properties
        const { data, total: propTotal } = await fetchTwoBighaProperties({
          page,
          limit: safePageSize,
          searchTerm: search.trim() || undefined,
        });
        setListings(data.map((raw) => mapTwoBighaPropertyToRecord(raw)));
        setTotal(propTotal);
        return;
      }
      // PM bucket — same page/pageSize in list and kanban so the board never dumps the full set.
      const data = await fetchThirdPartyPropertyListings({
        page,
        pageSize: safePageSize,
        search: search.trim() || undefined,
        pmStage: !marketplace && pmStageFilter !== "all" ? pmStageFilter : undefined,
        listingBucket: bucket,
        pmPlan: !marketplace && pmPlanFilter !== "all" ? pmPlanFilter : undefined,
      });
      setListings(data.data);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load property listings");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    search,
    statusFilter,
    pmStageFilter,
    pmPlanFilter,
    bucket,
    marketplace,
  ]);

  const loadStats = useCallback(async () => {
    try {
      if (bucket === "farm" || bucket === "properties") {
        // 2bigha's API has no aggregate-stats query — compute from loaded page
        const availableCount = listings.filter((l) => l.status === "Available").length;
        setStats({
          total,
          byStatus: {
            Available: listings.filter((l) => l.status === "Available").length,
            "Under Offer": listings.filter((l) => l.status === "Under Offer").length,
            Sold: listings.filter((l) => l.status === "Sold").length,
          },
          totalValue: listings.reduce((sum, l) => sum + (l.price || 0), 0),
          availableValue: listings
            .filter((l) => l.status === "Available")
            .reduce((sum, l) => sum + (l.price || 0), 0),
        });
        return;
      }
      setStats(await fetchThirdPartyPropertyStats(bucket));
    } catch {
      /* silent */
    }
  }, [bucket, listings, total]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pmStageFilter, pmPlanFilter, bucket]);

  const availableCount = stats?.byStatus?.["Available"] ?? 0;
  const underOfferCount = stats?.byStatus?.["Under Offer"] ?? 0;
  const soldCount = stats?.byStatus?.["Sold"] ?? 0;
  const statusOptions = useMemo(() => ["all", ...PROPERTY_STATUSES], []);
  const filtersActive = marketplace
    ? statusFilter !== "all" || approvalFilter !== "all" || typeFilter !== "all" || Boolean(search)
    : pmStageFilter !== "all" || pmPlanFilter !== "all" || legalStatusFilter !== "all" || Boolean(search);

  const listingPills = marketplace
    ? [
        { key: "all", label: "All", value: stats?.total || total },
        { key: "Available", label: "Available", value: availableCount },
        { key: "Under Offer", label: "Under offer", value: underOfferCount },
        { key: "Sold", label: "Sold", value: soldCount },
      ]
    : [
        { key: "all", label: "All cases", value: stats?.total || total },
        { key: "Assigned to RM", label: "With RM", value: stats?.byPmStage?.["Assigned to RM"] ?? 0 },
        { key: "Assigned to Legal", label: "Legal", value: stats?.byPmStage?.["Assigned to Legal"] ?? 0 },
        {
          key: "Assigned to Field Agent",
          label: "Field",
          value: stats?.byPmStage?.["Assigned to Field Agent"] ?? 0,
        },
        {
          key: "Visit Report Pending",
          label: "Visit pending",
          value: stats?.byPmStage?.["Visit Report Pending"] ?? 0,
        },
      ];

  const pmByStage = useMemo(() => {
    const map = new Map<string, PropertyListingRecord[]>();
    for (const col of PM_BOARD_STAGES) map.set(col.key, []);
    for (const p of listings) {
      const stage = p.pmStage || "Property Submitted";
      const col = PM_BOARD_STAGES.find((c) => c.stages.includes(stage));
      const key = col?.key || "Property Submitted";
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [listings]);

  // FARMS rows come live from 2bigha's own marketplace (read-only, not a CRM
  // document) — view/edit/delete below would silently hit the unrelated mock
  // store instead, so they're disabled here rather than failing confusingly.
  const openListing = (id: string) => {
    router.push(`/crm/property-listings/${id}`);
  };
  const editListing = (id: string) => {
    if (bucket === "farm") {
      toast.error("Editing a live 2bigha farm marketplace listing isn't available");
      return;
    }
    router.push(`/crm/property-listings/${id}/edit`);
  };

  const removeListing = async (id: string) => {
    if (bucket === "farm" || id.startsWith("pm_")) {
      toast.error("Deleting this live listing isn't available here");
      return;
    }
    if (!confirm("Delete this listing?")) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/property-listings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await deleteThirdPartyProperty(id);
      }
      toast.success("Listing deleted");
      setListings((prev) => prev.filter((l) => l._id !== id));
      setTotal((t) => Math.max(0, t - 1));
      void loadStats();
    } catch {
      toast.error("Failed to delete listing");
    }
  };

  const movePmToStage = async (id: string, columnKey: string) => {
    const nextStage = stageForBoardColumn(columnKey);
    const prev = listings.find((l) => l._id === id);
    if (!prev || prev.pmStage === nextStage) return;
    if (id.startsWith("pm_")) {
      toast.error("Stage follows 2bigha assignment — assign RM, Legal, or Field on the property.");
      return;
    }
    // Optimistic
    setListings((list) =>
      list.map((l) => (l._id === id ? { ...l, pmStage: nextStage } : l)),
    );
    try {
      const updated = await updateThirdPartyProperty(id, { pmStage: nextStage });
      setListings((list) => list.map((l) => (l._id === id ? updated : l)));
      void loadStats();
      toast.success(`Moved to ${nextStage}`);
    } catch {
      toast.error("Failed to move stage");
      void load();
    }
  };

  const sortedListings = useMemo(() => {
    let result = [...listings];
    if (statusFilter !== "all") {
      result = result.filter((l) => l.status === statusFilter);
    }
    if (approvalFilter !== "all") {
      result = result.filter((l) => (l.approvalStatus || "").toLowerCase() === approvalFilter.toLowerCase());
    }
    if (typeFilter !== "all") {
      result = result.filter((l) =>
        (l.propertyType || "").toLowerCase().includes(typeFilter.toLowerCase()) ||
        (l.category || "").toLowerCase().includes(typeFilter.toLowerCase())
      );
    }
    if (!marketplace && legalStatusFilter !== "all") {
      result = result.filter((l) => (l.propertyLegal?.status || "").toLowerCase() === legalStatusFilter.toLowerCase());
    }
    if (sortBy === "price_asc") {
      result.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === "price_desc") {
      result.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === "area_desc") {
      result.sort((a, b) => (b.areaValue || 0) - (a.areaValue || 0));
    }
    return result;
  }, [listings, marketplace, statusFilter, approvalFilter, typeFilter, legalStatusFilter, sortBy]);

  const newHref =
    bucket === "pm"
      ? "/crm/property-listings/new?bucket=pm"
      : bucket === "farm"
        ? "/crm/property-listings/new?bucket=farm"
        : "/crm/property-listings/new?bucket=properties";

  const showCarousel = false;

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title={bucket === "farm" ? "Farms" : bucket === "pm" ? "Property Management" : "Properties"}
        icon={bucket === "farm" ? <Sprout size={18} className="text-emerald-600" /> : bucket === "pm" ? <ShieldCheck size={18} className="text-blue-600" /> : <Building2 size={18} className="text-amber-600" />}
        badge={loading ? <span className="inline-block h-5 w-8 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" /> : <CrmCountBadge>{total}</CrmCountBadge>}
        description={
          bucket === "pm"
            ? "Subscription verification pipeline — RM, legal, and field visit."
            : bucketMeta?.description || "Marketplace listings from 2Bigha."
        }
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Listings" },
          { label: bucket === "farm" ? "Farms" : bucket === "pm" ? "Property Management" : "Properties" },
        ]}
        actions={
          <CrmHeaderTools
            onRefresh={() => {
              void load();
              void loadStats();
            }}
            trailing={
              <CrmButton
                variant="primary"
                onClick={() => router.push(newHref)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {bucket === "pm" ? "Create PM" : "New listing"}
              </CrmButton>
            }
          />
        }
        className="mb-3"
      />

      {/* KPI Stats Header Banner (Interactive Filter Cards with Skeleton Loading) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={cn(
            "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
            statusFilter === "all"
              ? "border-emerald-500 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900"
              : "border-slate-200/80 bg-gradient-to-br from-white to-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/50",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Inventory</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Landmark size={15} />
            </div>
          </div>
          {loading ? (
            <div className="mt-2 h-6 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
          ) : (
            <p className="mt-1.5 text-xl font-extrabold text-slate-900 dark:text-white">{stats?.total || total}</p>
          )}
          <p className="text-[11px] text-slate-400">Total listed properties</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("Available")}
          className={cn(
            "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
            statusFilter === "Available"
              ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/30 dark:bg-emerald-950/40"
              : "border-slate-200/80 bg-gradient-to-br from-white to-emerald-50/20 hover:border-slate-300 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/50",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Available</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <TrendingUp size={15} />
            </div>
          </div>
          {loading ? (
            <div className="mt-2 h-6 w-12 animate-pulse rounded-lg bg-emerald-200/60 dark:bg-emerald-950/60" />
          ) : (
            <p className="mt-1.5 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{availableCount}</p>
          )}
          <p className="text-[11px] text-slate-400">Active marketplace listings</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("Under Offer")}
          className={cn(
            "text-left transition-all duration-200 rounded-2xl border p-3.5 shadow-sm hover:shadow-md cursor-pointer",
            statusFilter === "Under Offer"
              ? "border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/30 dark:bg-amber-950/40"
              : "border-slate-200/80 bg-gradient-to-br from-white to-amber-50/20 hover:border-slate-300 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/50",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Under Offer</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Home size={15} />
            </div>
          </div>
          {loading ? (
            <div className="mt-2 h-6 w-12 animate-pulse rounded-lg bg-amber-200/60 dark:bg-amber-950/60" />
          ) : (
            <p className="mt-1.5 text-xl font-extrabold text-amber-600 dark:text-amber-400">{underOfferCount}</p>
          )}
          <p className="text-[11px] text-slate-400">Deal in negotiation</p>
        </button>

        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-blue-50/20 p-3.5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Portfolio Value</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <IndianRupee size={15} />
            </div>
          </div>
          {loading ? (
            <div className="mt-2 h-6 w-24 animate-pulse rounded-lg bg-blue-200/60 dark:bg-blue-950/60" />
          ) : (
            <p className="mt-1.5 text-xl font-extrabold text-blue-600 dark:text-blue-400">{formatRupeesInWords(stats?.totalValue)}</p>
          )}
          <p className="text-[11px] text-slate-400">Estimated value</p>
        </div>
      </div>

      <CrmListToolbar
        searchProps={{
          placeholder: marketplace
            ? "Search by title, address, city…"
            : "Search by title, khasra, village, district…",
          value: searchInput,
          onChange: (e) => setSearchInput(e.target.value),
        }}
        leftExtra={
          marketplace ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={cn(CRM_TOOLBAR_SELECT, "h-[38px] min-w-[130px]")}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All Statuses" : s}
                  </option>
                ))}
              </select>

              <select
                value={approvalFilter}
                onChange={(e) => setApprovalFilter(e.target.value)}
                className={cn(CRM_TOOLBAR_SELECT, "h-[38px] min-w-[140px]")}
              >
                <option value="all">All Moderation</option>
                <option value="Approved">Approved</option>
                <option value="Pending">Pending Review</option>
                <option value="Rejected">Rejected</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={cn(CRM_TOOLBAR_SELECT, "h-[38px] min-w-[140px]")}
              >
                <option value="all">All Property Types</option>
                <option value="Agricultural">Agricultural Land</option>
                <option value="Plot">Plot / Land</option>
                <option value="Farmhouse">Farmhouse</option>
                <option value="Farmland">Farmland</option>
                <option value="Commercial">Commercial</option>
                <option value="Residential">Residential</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={cn(CRM_TOOLBAR_SELECT, "h-[38px] w-[140px]")}
              >
                <option value="newest">Newest First</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="area_desc">Area: High to Low</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pmStageFilter}
                onChange={(e) => {
                  setPmStageFilter(e.target.value);
                  if (viewMode === "kanban" && e.target.value !== "all") changeViewMode("list");
                }}
                className={cn(CRM_TOOLBAR_SELECT, "shrink-0")}
              >
                <option value="all">All PM stages</option>
                {PM_PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={pmPlanFilter}
                onChange={(e) => setPmPlanFilter(e.target.value)}
                className={cn(CRM_TOOLBAR_SELECT, "min-w-[120px] shrink-0")}
              >
                <option value="all">All plans</option>
                {PM_PLANS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={legalStatusFilter}
                onChange={(e) => setLegalStatusFilter(e.target.value)}
                className={cn(CRM_TOOLBAR_SELECT, "min-w-[130px] shrink-0")}
              >
                <option value="all">All Legal Statuses</option>
                <option value="Verified">Verified</option>
                <option value="Pending">Pending Verification</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          )
        }
        right={
          <div className="flex items-center gap-2">
            {marketplace ? (
              <CrmViewToggle value={viewMode} onChange={changeViewMode} modes={["grid", "list"]} />
            ) : (
              <CrmViewToggle value={viewMode} onChange={changeViewMode} modes={["kanban", "list"]} />
            )}
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setApprovalFilter("all");
                  setTypeFilter("all");
                  setLegalStatusFilter("all");
                  setPmStageFilter("all");
                  setPmPlanFilter("all");
                  setSearchInput("");
                  setSearch("");
                  setSortBy("newest");
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
        marketplace && viewMode === "grid" ? (
          <div className="rounded-2xl bg-[#f4f6f8] p-4 sm:p-6">
            <PropertyListingCardSkeleton count={3} />
          </div>
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
          title={bucket === "pm" ? "No PM properties yet" : "No listings in this stream"}
          description={
            bucket === "pm"
              ? "Create a PM property from a lead or here to start the verification pipeline."
              : `Add a ${bucketMeta?.label || "listing"} or sync from the third-party platform.`
          }
          action={
            <CrmButton
              variant="primary"
              onClick={() => router.push(newHref)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {bucket === "pm" ? "Create PM property" : "Add listing"}
            </CrmButton>
          }
        />
      ) : bucket === "pm" && viewMode === "kanban" ? (
        <CrmKanbanBoard className="min-h-[480px] rounded-2xl bg-[#f7f8f9] p-4">
          {PM_BOARD_STAGES.map((col) => {
            const cards = pmByStage.get(col.key) || [];
            const stageTotal = col.stages.reduce(
              (sum, stage) => sum + (stats?.byPmStage?.[stage] ?? 0),
              0,
            );
            return (
              <CrmKanbanColumn
                key={col.key}
                title={col.key}
                stageKey={col.key}
                summary={
                  <>
                    {cards.length} on this page
                    {stageTotal > 0 ? ` · ${stageTotal} total` : ""}
                  </>
                }
                onAdd={() => router.push(newHref)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = e.dataTransfer.getData("text/pm-id") || e.dataTransfer.getData("text/plain") || draggingId;
                  setDraggingId(null);
                  if (id) void movePmToStage(id, col.key);
                }}
                className="overflow-hidden"
                style={{ height: 520 }}
              >
                {cards.map((p) => (
                  <CrmKanbanCard
                    key={p._id}
                    stageKey={col.key}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(p._id);
                      e.dataTransfer.setData("text/plain", p._id);
                      e.dataTransfer.setData("text/pm-id", p._id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => openListing(p._id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <CrmKanbanCardHead
                      tone="success"
                      initials={(p.title?.[0] || "P").toUpperCase()}
                      title={p.title}
                      subtitle={p.pmPlan ? `Plan: ${p.pmPlan}` : undefined}
                    />
                    <CrmKanbanMetaList>
                      <CrmKanbanMetaRow>{formatAddress(p)}</CrmKanbanMetaRow>
                      <CrmKanbanMetaRow>{formatListingArea(p)}</CrmKanbanMetaRow>
                      {p.khasraNumber ? (
                        <CrmKanbanMetaRow>Khasra {p.khasraNumber}</CrmKanbanMetaRow>
                      ) : null}
                      {p.rmAssigneeName || p.legalAssigneeName || p.fieldAssigneeName ? (
                        <CrmKanbanMetaRow>
                          {p.fieldAssigneeName || p.legalAssigneeName || p.rmAssigneeName}
                        </CrmKanbanMetaRow>
                      ) : null}
                    </CrmKanbanMetaList>
                    {p.pmStage &&
                    (p.pmStage === "Visit Report Approved" ||
                      p.pmStage === "Visit Report Rejected") ? (
                      <div className="mt-2">
                        <CrmStatusBadge tone={pmStageBadgeTone(p.pmStage)}>
                          {p.pmStage}
                        </CrmStatusBadge>
                      </div>
                    ) : null}
                  </CrmKanbanCard>
                ))}
              </CrmKanbanColumn>
            );
          })}
        </CrmKanbanBoard>
      ) : bucket === "pm" ? (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10">Property</th>
                <th className="sticky top-0 z-10">Plan</th>
                <th className="sticky top-0 z-10">Area</th>
                <th className="sticky top-0 z-10">Khasra</th>
                <th className="sticky top-0 z-10">PM stage</th>
                <th className="sticky top-0 z-10 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((p) => (
                <tr
                  key={p._id}
                  className="group cursor-pointer transition-colors"
                  onClick={() => openListing(p._id)}
                >
                  <td>
                    <div className="min-w-0 max-w-[280px]">
                      <p className="truncate text-sm font-medium text-[var(--text-main)]">{p.title}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{formatAddress(p)}</p>
                    </div>
                  </td>
                  <td>
                    <CrmListMutedText>{p.pmPlan || "—"}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{formatListingArea(p)}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{p.khasraNumber || "—"}</CrmListMutedText>
                  </td>
                  <td>
                    {p.pmStage ? (
                      <CrmStatusBadge tone={pmStageBadgeTone(p.pmStage)}>{p.pmStage}</CrmStatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {p.contactPhone ? (
                        <CrmHoverActionIcon
                          icon={<CrmIcon.PhoneCall size={12} />}
                          label="Call"
                          value={p.contactPhone}
                          tone="primary"
                          onClick={() => setCallProperty(p)}
                        />
                      ) : null}
                      {contactWhatsappUrl({ phone: p.contactPhone }) ? (
                        <CrmHoverActionIcon
                          icon={<CrmNavIcon.WhatsApp size={12} />}
                          label="WhatsApp"
                          value={p.contactPhone!}
                          tone="whatsapp"
                          onClick={() => {
                            const waId = contactWhatsappWaId({ phone: p.contactPhone });
                            if (waId) router.push(`/crm/whatsapp?wa=${waId}`);
                          }}
                        />
                      ) : null}
                      <CrmTableActionMenu
                        onView={() => openListing(p._id)}
                        onEdit={() => editListing(p._id)}
                        onNotes={() => setNotesProperty(p)}
                        onDelete={() => void removeListing(p._id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      ) : showCarousel ? (
        <div className="rounded-2xl bg-[#f4f6f8] p-4 sm:p-6">
          <PropertyListingsCarousel
            listings={listings}
            title={
              bucket === "properties"
                ? "Properties"
                : bucket === "farm"
                  ? "Farms"
                  : "Trending Properties"
            }
            subtitle={
              bucket === "properties"
                ? "Popular listings on 2Bigha"
                : bucket === "farm"
                  ? "Farm listings on 2Bigha"
                  : "Popular sell listings on 2Bigha"
            }
            onOpen={openListing}
            onEdit={editListing}
            onDelete={(id) => void removeListing(id)}
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sortedListings.map((p) => (
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
              {sortedListings.map((p) => (
                <tr
                  key={p._id}
                  className="group cursor-pointer transition-colors"
                  onClick={() => openListing(p._id)}
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
                    <CrmListMutedText>{p.propertyType}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{formatListingArea(p)}</CrmListMutedText>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CrmStatusBadge tone={statusBadgeTone(p.status)}>{p.status}</CrmStatusBadge>
                      {p.approvalStatus !== "Approved" ? (
                        <CrmStatusBadge tone={approvalStatusBadgeTone(p.approvalStatus)}>
                          {p.approvalStatus}
                        </CrmStatusBadge>
                      ) : null}
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
          pageSizes={LISTING_PAGE_SIZES}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(Math.min(size, LISTING_PAGE_SIZE_MAX));
            setPage(1);
          }}
          className="mt-3 rounded-[var(--crm-radius-ui)] border border-[#e2e8f0]"
        />
      </div>

      <CallLeadModal
        open={!!callProperty}
        onClose={() => setCallProperty(null)}
        phone={callProperty?.contactPhone}
        leadId={callProperty?._id}
        leadName={callProperty?.title}
        relatedType="Property"
      />

      <PropertyActivityPopup
        open={!!notesProperty}
        onClose={() => setNotesProperty(null)}
        property={notesProperty}
      />
    </div>
  );
}
