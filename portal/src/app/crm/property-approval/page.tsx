"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  Filter,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmButton,
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmListMutedText,
  CrmPageHeader,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
  CrmViewToggle,
  crmStatusToneFromLabel,
  type CrmViewMode,
} from "@/components/crm/ui";
import {
  fetchApprovalQueue,
  decidePropertyApproval,
  type ApprovalQueueBucket,
  type ApprovalQueueProperty,
} from "@/lib/crm/property-listings/approval-queue-api";
import { PropertyRejectionModal } from "@/components/crm/property-listings/PropertyRejectionModal";
import { PropertyReviewModal } from "@/components/crm/property-listings/PropertyReviewModal";
import { useAuthStore } from "@/store/pm/auth-store";

const BUCKET_KEY = "crm_property_approval_bucket_v1";

const BUCKETS: { key: ApprovalQueueBucket; label: string; icon: typeof Clock3; color: string }[] = [
  { key: "pending", label: "Pending", icon: Clock3, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
  { key: "approved", label: "Approved", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
  { key: "rejected", label: "Rejected", icon: XCircle, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40" },
];

function parseBucket(raw: string | null): ApprovalQueueBucket {
  if (raw === "approved" || raw === "rejected") return raw;
  return "pending";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PropertyApprovalQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <PropertyApprovalQueuePageContent />
    </Suspense>
  );
}

function PropertyApprovalQueuePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [bucket, setBucket] = useState<ApprovalQueueBucket>(() =>
    parseBucket(searchParams.get("bucket")),
  );
  const [rows, setRows] = useState<ApprovalQueueProperty[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<CrmViewMode>("list");
  const { user } = useAuthStore();

  const currentUserId = user?.id || user?.userId;

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [reviewItem, setReviewItem] = useState<ApprovalQueueProperty | null>(null);
  const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);
  const [rejectionTargetTitle, setRejectionTargetTitle] = useState<string>("");

  useEffect(() => {
    const fromUrl = searchParams.get("bucket");
    if (fromUrl) {
      setBucket(parseBucket(fromUrl));
      return;
    }
    try {
      const saved = localStorage.getItem(BUCKET_KEY);
      if (saved) setBucket(parseBucket(saved));
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  const changeBucket = useCallback(
    (next: ApprovalQueueBucket) => {
      setBucket(next);
      setPage(1);
      setSelectedIds(new Set());
      try {
        localStorage.setItem(BUCKET_KEY, next);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("bucket", next);
      router.replace(`/crm/property-approval?${params.toString()}`);
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchApprovalQueue(bucket, { page, limit: pageSize });
      if (!result) {
        setConfigured(false);
        setRows([]);
        setTotal(0);
        return;
      }
      setConfigured(true);
      setRows(result.data || []);
      setTotal(result.meta?.total ?? result.data?.length ?? 0);
    } catch {
      toast.error("Failed to load the approval queue");
    } finally {
      setLoading(false);
    }
  }, [bucket, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((r) => {
        const p = r.property;
        return (
          p.title?.toLowerCase().includes(q) ||
          p.propertyName?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.khasraNumber?.toLowerCase().includes(q) ||
          p.ownerName?.toLowerCase().includes(q) ||
          p.id?.toLowerCase().includes(q)
        );
      });
    }
    if (typeFilter !== "all") {
      list = list.filter((r) =>
        (r.property.propertyType || "").toLowerCase().includes(typeFilter.toLowerCase()) ||
        (r.property.category || "").toLowerCase().includes(typeFilter.toLowerCase())
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => (r.property.status || "").toLowerCase() === statusFilter.toLowerCase());
    }
    return list;
  }, [rows, search, typeFilter, statusFilter]);

  const handleApprove = async (id: string) => {
    try {
      await decidePropertyApproval({ id, status: "Approved" });
      setRows((prev) => prev.filter((r) => r.property.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success("Property approved successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to approve property");
    }
  };

  const handleRejectClick = (id: string, title?: string) => {
    setRejectionTargetId(id);
    setRejectionTargetTitle(title || "Property Listing");
  };

  const handleConfirmRejection = async (reason: string) => {
    if (!rejectionTargetId) return;
    try {
      await decidePropertyApproval({
        id: rejectionTargetId,
        status: "Rejected",
        message: reason,
      });
      setRows((prev) => prev.filter((r) => r.property.id !== rejectionTargetId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(rejectionTargetId);
        return next;
      });
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success("Property submission rejected");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to reject property");
    } finally {
      setRejectionTargetId(null);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredRows.map((r) => r.property.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    const selectedRows = rows.filter((r) => selectedIds.has(r.property.id));
    const validRowsToApprove = selectedRows.filter(
      (r) => !currentUserId || !r.property.createdBy || String(r.property.createdBy) !== String(currentUserId),
    );
    const selfCount = selectedRows.length - validRowsToApprove.length;

    if (validRowsToApprove.length === 0) {
      toast.error("Self-approval prohibited: You cannot approve your own submissions.");
      return;
    }

    let successCount = 0;
    for (const r of validRowsToApprove) {
      try {
        await decidePropertyApproval({ id: r.property.id, status: "Approved" });
        successCount++;
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.message || `Failed to approve ${r.property.title}`);
      }
    }
    if (selfCount > 0) {
      toast.warning(`Approved ${successCount} property submission(s). Skipped ${selfCount} self-submission(s).`);
    } else {
      toast.success(`Approved ${successCount} property submission(s)`);
    }
    setSelectedIds(new Set());
    void load();
  };

  const bucketMeta = BUCKETS.find((b) => b.key === bucket)!;

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title="Property Approval Queue"
        icon={<ClipboardCheck size={18} className="text-emerald-600" />}
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Live moderation queue for 2Bigha property submissions — review details, verify legal compliance, approve or reject in real time."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Approval Queue" },
        ]}
        actions={<CrmHeaderTools onRefresh={() => void load()} />}
        className="mb-3"
      />

      {!configured && !loading ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            2Bigha credentials are not configured on this backend environment. The queue displays sample/stubbed state until live API keys are present.
          </p>
        </div>
      ) : null}

      {/* Moderation KPI Header Banner */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {BUCKETS.map((b) => {
          const isActive = bucket === b.key;
          const Icon = b.icon;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => changeBucket(b.key)}
              className={cn(
                "relative flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200",
                isActive
                  ? "border-emerald-500 bg-white shadow-md ring-2 ring-emerald-500/20 dark:bg-slate-900"
                  : "border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50",
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", b.color)}>
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{b.label} Submissions</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {isActive ? total : "Queue"}
                  </p>
                </div>
              </div>
              {isActive && (
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950" />
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar & Search Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, location, address, property ID..."
            className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Property Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="all">All Property Types</option>
            <option value="Agricultural">Agricultural Land</option>
            <option value="Plot">Plot / Land</option>
            <option value="Farmhouse">Farmhouse</option>
            <option value="Farmland">Farmland</option>
            <option value="Commercial">Commercial</option>
            <option value="Residential">Residential</option>
          </select>

          {/* Market Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="all">All Market Statuses</option>
            <option value="Available">Available</option>
            <option value="Sold">Sold</option>
            <option value="Under Offer">Under Offer</option>
            <option value="Managed">Managed</option>
          </select>

          {(search || typeFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setStatusFilter("all");
              }}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-950/30"
            >
              <X size={13} /> Reset
            </button>
          )}

          {selectedIds.size > 0 && bucket === "pending" && (
            <button
              type="button"
              onClick={handleBulkApprove}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle2 size={14} /> Approve Selected ({selectedIds.size})
            </button>
          )}
          <CrmViewToggle value={viewMode} onChange={setViewMode} modes={["list", "grid"]} />
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <CrmTableShell>
          <CrmTable>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6}>
                    <div className="h-5 w-3/4 rounded-md bg-slate-100 dark:bg-slate-800" />
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      ) : filteredRows.length === 0 ? (
        <CrmEmptyState
          icon={<bucketMeta.icon className="h-8 w-8 text-slate-400" strokeWidth={1.5} />}
          title={`No ${bucketMeta.label.toLowerCase()} properties`}
          description={
            search
              ? "No property submissions match your current search."
              : configured
                ? `There are currently no property submissions in the ${bucketMeta.label.toLowerCase()} moderation queue.`
                : "Configure 2Bigha credentials to load live approval queue items."
          }
          action={
            search ? (
              <CrmButton variant="secondary" onClick={() => setSearch("")}>
                Clear Search
              </CrmButton>
            ) : null
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRows.map((row) => {
            const p = row.property;
            const isSelected = selectedIds.has(p.id);
            const isSelfSubmission = Boolean(
              currentUserId && p.createdBy && String(p.createdBy) === String(currentUserId),
            );
            return (
              <div
                key={p.id}
                className={cn(
                  "group relative flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900",
                  isSelected
                    ? "border-emerald-500 ring-2 ring-emerald-500/20"
                    : "border-slate-200/80 dark:border-slate-800",
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <CrmStatusBadge tone={crmStatusToneFromLabel(p.approvalStatus || bucket)}>
                        {p.approvalStatus || bucketMeta.label}
                      </CrmStatusBadge>
                      {isSelfSubmission && (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40">
                          Self Submission
                        </span>
                      )}
                    </div>
                    {bucket === "pending" && (
                      <input
                        type="checkbox"
                        disabled={isSelfSubmission}
                        checked={isSelected}
                        onChange={() => toggleSelectOne(p.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-[var(--surface-dim)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-color)]">
                      {p.propertyType || "Property"}
                    </span>
                    {p.khasraNumber && (
                      <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        Khasra: {p.khasraNumber}
                      </span>
                    )}
                  </div>

                  <h4 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                    {p.title || p.propertyName || "Untitled Property"}
                  </h4>

                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 truncate">
                    <MapPin size={12} className="shrink-0 text-slate-400" />
                    {[p.address, p.city, p.state].filter(Boolean).join(", ") || "—"}
                  </p>

                  {p.ownerName && (
                    <p className="mt-1 text-[11px] text-slate-500 truncate">
                      Seller: <strong className="text-slate-700 dark:text-slate-300">{p.ownerName}</strong>
                      {p.ownerPhone ? ` · ${p.ownerPhone}` : ""}
                    </p>
                  )}

                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-medium text-slate-400">Price</span>
                      <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        {p.price != null ? `₹${p.price.toLocaleString("en-IN")}` : "—"}
                      </p>
                    </div>
                    {p.area && (
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {p.area} {p.areaUnit || ""}
                      </span>
                    )}
                  </div>

                  {p.approvalMessage && (
                    <div className="mt-2.5 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                      Feedback: {p.approvalMessage}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setReviewItem(row)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    <Eye size={13} /> Inspect
                  </button>

                  <div className="flex items-center gap-1">
                    {bucket !== "approved" && (
                      <button
                        type="button"
                        disabled={isSelfSubmission}
                        onClick={() => handleApprove(p.id)}
                        title={
                          isSelfSubmission
                            ? "Self-approval disabled: Another reviewer must approve this listing"
                            : "Approve listing"
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 transition-colors"
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                    )}
                    {bucket !== "rejected" && (
                      <button
                        type="button"
                        disabled={isSelfSubmission}
                        onClick={() => handleRejectClick(p.id, p.title || p.propertyName)}
                        title={
                          isSelfSubmission
                            ? "Self-approval disabled: Another reviewer must reject this listing"
                            : "Reject listing"
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-50 transition-colors"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                {bucket === "pending" && (
                  <th className="w-10 sticky top-0 z-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredRows.length > 0 &&
                        filteredRows.every((r) => selectedIds.has(r.property.id))
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                )}
                <th className="sticky top-0 z-10">Property Details</th>
                <th className="sticky top-0 z-10">Location</th>
                <th className="sticky top-0 z-10">Listing Price</th>
                <th className="sticky top-0 z-10">Status</th>
                <th className="sticky top-0 z-10">Submitted</th>
                <th className="sticky top-0 z-10 text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const p = row.property;
                const location = [p.city, p.state].filter(Boolean).join(", ") || "—";
                const isSelected = selectedIds.has(p.id);
                const isSelfSubmission = Boolean(
                  currentUserId && p.createdBy && String(p.createdBy) === String(currentUserId),
                );

                return (
                  <tr
                    key={p.id}
                    onClick={() => setReviewItem(row)}
                    className={cn(
                      "group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
                      isSelected && "bg-emerald-50/40 dark:bg-emerald-950/20",
                    )}
                  >
                    {bucket === "pending" && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={isSelfSubmission}
                          checked={isSelected}
                          onChange={() => toggleSelectOne(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>
                    )}
                    <td>
                      <div className="min-w-0 max-w-[320px]">
                        <div className="flex flex-wrap items-center gap-1 mb-1">
                          <span className="rounded bg-[var(--surface-dim)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-color)]">
                            {p.propertyType || "Property"}
                          </span>
                          {p.khasraNumber && (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                              Khasra: {p.khasraNumber}
                            </span>
                          )}
                          {p.isVerified && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              Verified
                            </span>
                          )}
                          {isSelfSubmission && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40">
                              Self Submission
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {p.title || p.propertyName || "Untitled Property"}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {p.address || "No address listed"}
                        </p>
                        {p.ownerName && (
                          <p className="truncate text-[11px] text-slate-400 mt-0.5">
                            Seller: <span className="text-slate-600 dark:text-slate-300 font-medium">{p.ownerName}</span>
                            {p.ownerPhone ? ` · ${p.ownerPhone}` : ""}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <CrmListMutedText>{location}</CrmListMutedText>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {p.price != null ? `₹${p.price.toLocaleString("en-IN")}` : "—"}
                        </span>
                        {p.area ? (
                          <span className="text-[11px] text-slate-500">
                            {p.area} {p.areaUnit || ""}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <CrmStatusBadge tone={crmStatusToneFromLabel(p.approvalStatus || bucket)}>
                          {p.approvalStatus || bucketMeta.label}
                        </CrmStatusBadge>
                        {p.approvalMessage ? (
                          <span className="max-w-[160px] truncate text-[11px] text-rose-600 dark:text-rose-400">
                            {p.approvalMessage}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <CrmListMutedText>{formatDate(p.createdAt)}</CrmListMutedText>
                    </td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReviewItem(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                          <Eye size={13} /> Details
                        </button>

                        {bucket !== "approved" && (
                          <button
                            type="button"
                            disabled={isSelfSubmission}
                            onClick={() => handleApprove(p.id)}
                            title={
                              isSelfSubmission
                                ? "Self-approval disabled: Another reviewer must approve this listing"
                                : "Approve listing"
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 transition-colors"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        )}

                        {bucket !== "rejected" && (
                          <button
                            type="button"
                            disabled={isSelfSubmission}
                            onClick={() => handleRejectClick(p.id, p.title || p.propertyName)}
                            title={
                              isSelfSubmission
                                ? "Self-approval disabled: Another reviewer must reject this listing"
                                : "Reject listing"
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-50 transition-colors dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      {/* Detailed Inspection Modal */}
      <PropertyReviewModal
        isOpen={!!reviewItem}
        onClose={() => setReviewItem(null)}
        item={reviewItem}
        isSelfSubmission={Boolean(
          currentUserId &&
            reviewItem?.property?.createdBy &&
            String(reviewItem.property.createdBy) === String(currentUserId),
        )}
        onApprove={handleApprove}
        onReject={(id) => {
          const title = reviewItem?.property?.title || reviewItem?.property?.propertyName;
          handleRejectClick(id, title);
        }}
      />

      {/* Structured Rejection Modal */}
      <PropertyRejectionModal
        isOpen={!!rejectionTargetId}
        onClose={() => setRejectionTargetId(null)}
        propertyTitle={rejectionTargetTitle}
        onConfirm={handleConfirmRejection}
      />
    </div>
  );
}
