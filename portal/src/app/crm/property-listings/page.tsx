"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Home,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_TOOLBAR_CHIP, CRM_TOOLBAR_CHIP_ACTIVE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmButton,
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmKpiCard,
  CrmKanbanBoard,
  CrmKanbanCard,
  CrmKanbanCardHead,
  CrmKanbanColumn,
  CrmKanbanMetaList,
  CrmKanbanMetaRow,
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
  PropertyListingsCarousel,
} from "@/components/crm/property-listings/PropertyListingCard";
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
import { fetchTwoBighaFarms, mapTwoBighaFarmToRecord } from "@/lib/crm/property-listings/backend-api";
import {
  LISTING_BUCKETS,
  PROPERTY_STATUSES,
  formatAddress,
  formatCompactPrice,
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
  pmStageBadgeTone,
  type PmPipelineStage,
} from "@/lib/crm/property-management/types";

const VIEW_MODE_KEY = "crm_property_listings_view_mode_v1";
const PM_VIEW_MODE_KEY = "crm_pm_listings_view_mode_v1";
const BUCKET_KEY = "crm_property_listings_bucket_v1";

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

function PropertyListingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pmStageFilter, setPmStageFilter] = useState<string>("all");
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
      setBucket(next);
      setPage(1);
      setPmStageFilter("all");
      try {
        localStorage.setItem(BUCKET_KEY, next);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("bucket", next);
      router.replace(`/crm/property-listings?${params.toString()}`);
    },
    [router, searchParams],
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
  const pmBoardMode = bucket === "pm" && viewMode === "kanban";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (bucket === "farm") {
        const { data, total: farmTotal } = await fetchTwoBighaFarms({
          page,
          limit: pageSize,
          searchTerm: search.trim() || undefined,
        });
        setListings(data.map(mapTwoBighaFarmToRecord));
        setTotal(farmTotal);
        return;
      }
      if (bucket === "properties") {
        // Live 2bigha GraphQL properties
        const data = await fetchThirdPartyPropertyListings({
          page,
          pageSize,
          search: search.trim() || undefined,
          listingBucket: bucket,
          status: statusFilter !== "all" ? statusFilter : undefined,
        });
        setListings(data.data);
        setTotal(data.total);
        return;
      }
      // PM bucket — still uses the older mock/local store
      const data = await fetchThirdPartyPropertyListings({
        page: pmBoardMode ? 1 : page,
        pageSize: pmBoardMode ? 200 : pageSize,
        search: search.trim() || undefined,
        status: marketplace && statusFilter !== "all" ? statusFilter : undefined,
        pmStage:
          !marketplace && !pmBoardMode && pmStageFilter !== "all" ? pmStageFilter : undefined,
        listingBucket: bucket,
        approvalStatus: marketplace ? "Approved" : undefined,
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
    bucket,
    marketplace,
    pmBoardMode,
  ]);

  const loadStats = useCallback(async () => {
    try {
      if (bucket === "farm" || bucket === "properties") {
        // 2bigha's API has no aggregate-stats query — compute from loaded page
        const availableCount = listings.filter((l) => l.status === "Available").length;
        setStats({
          total,
          byStatus: { Available: availableCount },
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
    setPage(1);
  }, [search, statusFilter, pmStageFilter, bucket]);

  const availableCount = stats?.byStatus?.["Available"] ?? 0;
  const underOfferCount = stats?.byStatus?.["Under Offer"] ?? 0;
  const statusOptions = useMemo(() => ["all", ...PROPERTY_STATUSES], []);

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
  const isLive2bigha = bucket === "farm" || bucket === "properties";
  const editListing = (id: string) => {
    if (isLive2bigha) {
      toast.error("Editing a live 2bigha listing isn't available here yet");
      return;
    }
    router.push(`/crm/property-listings/${id}/edit`);
  };

  const removeListing = async (id: string) => {
    if (isLive2bigha) {
      toast.error("Deleting a live 2bigha listing isn't available here yet");
      return;
    }
    if (!confirm("Delete this listing?")) return;
    try {
      await deleteThirdPartyProperty(id);
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
        title="Property Listings"
        icon={<Home size={18} />}
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description={
          bucketMeta?.description ||
          "Buy, Sell, Farms, and Property Management — separate 2Bigha listing streams."
        }
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

      <div className="mb-4 flex flex-wrap gap-1.5">
        {LISTING_BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => changeBucket(b.key)}
            className={cn(CRM_TOOLBAR_CHIP, bucket === b.key && CRM_TOOLBAR_CHIP_ACTIVE)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {marketplace ? (
          <>
            <CrmKpiCard label="Listings" value={stats?.total ?? total} icon={<Building2 size={17} />} />
            <CrmKpiCard label="Available" value={availableCount} icon={<CheckCircle2 size={17} />} />
            <CrmKpiCard label="Under offer" value={underOfferCount} icon={<Clock3 size={17} />} />
            <CrmKpiCard
              label="Portfolio value"
              value={formatCompactPrice(stats?.totalValue ?? 0)}
              sub={`${formatCompactPrice(stats?.availableValue ?? 0)} available`}
              icon={<Wallet size={17} />}
            />
          </>
        ) : (
          <>
            <CrmKpiCard
              label="PM cases"
              value={stats?.total ?? total}
              icon={<ClipboardList size={17} />}
            />
            <CrmKpiCard
              label="With RM"
              value={stats?.byPmStage?.["Assigned to RM"] ?? 0}
              icon={<Building2 size={17} />}
            />
            <CrmKpiCard
              label="Legal"
              value={stats?.byPmStage?.["Assigned to Legal"] ?? 0}
              icon={<CheckCircle2 size={17} />}
            />
            <CrmKpiCard
              label="Field / visit"
              value={
                (stats?.byPmStage?.["Assigned to Field Agent"] ?? 0) +
                (stats?.byPmStage?.["Visit Report Pending"] ?? 0)
              }
              icon={<Clock3 size={17} />}
            />
          </>
        )}
      </div>

      <CrmListToolbar
        searchProps={{
          placeholder: marketplace
            ? "Search by title, address, city…"
            : "Search by title, khasra, village, district…",
          value: search,
          onChange: (e) => setSearch(e.target.value),
        }}
        leftExtra={
          marketplace ? (
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
          ) : viewMode === "list" ? (
            <select
              value={pmStageFilter}
              onChange={(e) => setPmStageFilter(e.target.value)}
              className={cn(CRM_TOOLBAR_SELECT, "shrink-0")}
            >
              <option value="all">All PM stages</option>
              {PM_PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              Board by PM pipeline stage — drag cards to move
            </span>
          )
        }
        right={
          <>
            {marketplace ? (
              <CrmViewToggle value={viewMode} onChange={changeViewMode} modes={["grid", "list"]} />
            ) : (
              <CrmViewToggle value={viewMode} onChange={changeViewMode} modes={["kanban", "list"]} />
            )}
            <CrmButton
              variant="primary"
              onClick={() => router.push(newHref)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {bucket === "pm" ? "Create PM property" : "New listing"}
            </CrmButton>
          </>
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
            return (
              <CrmKanbanColumn
                key={col.key}
                title={col.key}
                stageKey={col.key}
                summary={
                  <>
                    {cards.length} case{cards.length === 1 ? "" : "s"}
                  </>
                }
                onAdd={() => router.push(newHref)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/pm-id") || draggingId;
                  setDraggingId(null);
                  if (id) void movePmToStage(id, col.key);
                }}
                style={{ minHeight: 400 }}
              >
                {cards.map((p) => (
                  <CrmKanbanCard
                    key={p._id}
                    stageKey={col.key}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(p._id);
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

      {!pmBoardMode ? (
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
      ) : null}

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
