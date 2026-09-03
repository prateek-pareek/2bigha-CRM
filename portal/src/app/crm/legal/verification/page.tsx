"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Gavel, Loader2, Phone, Search, User } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmCountBadge,
  CrmKanbanAvatar,
  CrmKanbanBoard,
  CrmKanbanCard,
  CrmKanbanCardFooter,
  CrmKanbanCardHead,
  CrmKanbanColumn,
  CrmKanbanMetaList,
  CrmKanbanMetaRow,
  CrmPageHeader,
  CrmSoftBadge,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
  CrmTextarea,
  CrmViewToggle,
  crmKanbanAvatarTone,
} from "@/components/crm/ui";
import { crmModalChrome } from "@/lib/crm/chrome";
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";
import {
  LEGAL_REVIEWER_POOL,
  decidePropertyLegalVerification,
  fetchLegalVerificationQueue,
} from "@/lib/crm/property-listings/third-party-api";
import {
  formatAddress,
  formatListingArea,
  legalStatusBadgeTone,
  type PropertyLegalStatus,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { key: "queued" | PropertyLegalStatus; label: string }[] = [
  { key: "queued", label: "All queue" },
  { key: "Pending", label: "Pending" },
  { key: "Verified", label: "Verified" },
  { key: "Rejected", label: "Rejected" },
];

/** Fixed 3-stage board — Legal Verification doesn't use the configurable Pipeline model. */
const BOARD_STAGES: PropertyLegalStatus[] = ["Pending", "Verified", "Rejected"];

const VIEW_MODE_KEY = "crm_legal_verification_view_mode_v1";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function LegalVerificationDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <LegalVerificationDashboardContent />
    </Suspense>
  );
}

function LegalVerificationDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get("status") || "queued") as
    | "queued"
    | PropertyLegalStatus;
  const sortParam = (searchParams.get("sort") || "requestedAt_desc") as
    | "requestedAt_desc"
    | "requestedAt_asc";
  const rangeParam = searchParams.get("range") || "all";
  const assigneeParam = searchParams.get("assignee") || "all";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PropertyListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(VIEW_MODE_KEY) as "list" | "kanban") || "list";
    }
    return "list";
  });
  const [movingId, setMovingId] = useState<string | null>(null);
  const [rejectDraft, setRejectDraft] = useState<{ propertyId: string; reason: string } | null>(
    null,
  );
  const [rejectBusy, setRejectBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const legalRequestedAfter = useMemo(() => {
    if (rangeParam === "7d") return daysAgoIso(7);
    if (rangeParam === "30d") return daysAgoIso(30);
    return undefined;
  }, [rangeParam]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLegalVerificationQueue({
        page: 1,
        // Kanban shows every stage as its own column, so it needs the full queue
        // regardless of the status pill filter (which only applies to the list view).
        pageSize: viewMode === "kanban" ? 200 : 50,
        search: search.trim() || undefined,
        legalStatus: viewMode === "kanban" ? "queued" : statusParam,
        legalSort: sortParam,
        legalRequestedAfter,
        legalAssignee: assigneeParam === "all" ? undefined : assigneeParam,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch {
      toast.error("Failed to load legal verification queue");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, statusParam, sortParam, legalRequestedAfter, assigneeParam, viewMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const boardRowsByStage = useMemo(() => {
    const map = new Map<PropertyLegalStatus, PropertyListingRecord[]>();
    for (const stage of BOARD_STAGES) map.set(stage, []);
    for (const row of rows) {
      const status = row.propertyLegal?.status;
      if (!status) continue;
      const bucket = map.get(status);
      if (bucket) bucket.push(row);
    }
    return map;
  }, [rows]);

  const applyDecision = useCallback(
    async (propertyId: string, status: PropertyLegalStatus, rejectionReason?: string) => {
      const current = rows.find((r) => r._id === propertyId);
      if (!current || current.propertyLegal?.status === status) return;
      setMovingId(propertyId);
      try {
        const updated = await decidePropertyLegalVerification(propertyId, {
          status,
          reviewedBy: current.propertyLegal?.assignedTo,
          notes: current.propertyLegal?.notes,
          rejectionReason,
        });
        setRows((prev) => prev.map((r) => (r._id === propertyId ? updated : r)));
        toast.success(
          status === "Verified"
            ? "Property verified"
            : status === "Rejected"
              ? "Property rejected"
              : "Moved back to Pending",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update status");
      } finally {
        setMovingId(null);
      }
    },
    [rows],
  );

  const handleDragStart = (e: React.DragEvent, propertyId: string) => {
    e.dataTransfer.setData("text/plain", propertyId);
    e.dataTransfer.setData("propertyId", propertyId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, status: PropertyLegalStatus) => {
    e.preventDefault();
    e.stopPropagation();
    const propertyId = e.dataTransfer.getData("propertyId") || e.dataTransfer.getData("text/plain");
    if (!propertyId) return;
    if (status === "Rejected") {
      // Rejection reason is required and shown back to the client — collect it first.
      setRejectDraft({ propertyId, reason: "" });
      return;
    }
    void applyDecision(propertyId, status);
  };

  const patchQuery = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all" || (k === "status" && v === "queued")) {
        q.delete(k);
      } else {
        q.set(k, v);
      }
    }
    const qs = q.toString();
    router.push(qs ? `/crm/legal/verification?${qs}` : "/crm/legal/verification");
  };

  return (
    <div className={cn(CRM_LIST_PAGE, "theme-crm-hubspot animate-in fade-in duration-500")}>
      <CrmPageHeader
        icon={<Gavel size={18} />}
        title="Legal Verification"
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Subscription-bundled property legal reviews — Pending, Verified, or Rejected."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Legal Verification" },
        ]}
        className="mb-4"
      />

      {viewMode === "list" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = statusParam === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => patchQuery({ status: f.key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--surface-dim)]",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CrmViewToggle
          value={viewMode}
          onChange={(mode) => setViewMode(mode === "kanban" ? "kanban" : "list")}
          modes={["list", "kanban"]}
        />
        <select
          className={cn(CRM_TOOLBAR_SELECT, "h-9")}
          value={sortParam}
          onChange={(e) => patchQuery({ sort: e.target.value })}
          aria-label="Sort by submitted date"
        >
          <option value="requestedAt_desc">Newest submitted</option>
          <option value="requestedAt_asc">Oldest submitted</option>
        </select>
        <select
          className={cn(CRM_TOOLBAR_SELECT, "h-9")}
          value={rangeParam}
          onChange={(e) => patchQuery({ range: e.target.value === "all" ? null : e.target.value })}
          aria-label="Date range"
        >
          <option value="all">Any time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <select
          className={cn(CRM_TOOLBAR_SELECT, "h-9")}
          value={assigneeParam}
          onChange={(e) =>
            patchQuery({ assignee: e.target.value === "all" ? null : e.target.value })
          }
          aria-label="Assignee"
        >
          <option value="all">All reviewers</option>
          <option value="unassigned">Unassigned</option>
          {LEGAL_REVIEWER_POOL.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            className={cn(CRM_TOOLBAR_SELECT, "h-9 w-full pl-8")}
            placeholder="Search property, city, owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link
          href="/crm/legal"
          className="text-xs font-semibold text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          Legal cases →
        </Link>
      </div>

      {loading ? (
        <CrmTableShell>
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading queue…
          </div>
        </CrmTableShell>
      ) : viewMode === "kanban" ? (
        <CrmKanbanBoard className="min-h-full bg-[#f7f8f9] p-4">
          {BOARD_STAGES.map((stage) => {
            const stageRows = boardRowsByStage.get(stage) || [];
            return (
              <CrmKanbanColumn
                key={stage}
                title={stage}
                stageKey={stage}
                summary={`${stageRows.length} propert${stageRows.length === 1 ? "y" : "ies"}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage)}
                style={{ minHeight: 400 }}
              >
                {stageRows.map((row) => {
                  const legal = row.propertyLegal!;
                  const title = row.title || "Untitled property";
                  const initials = (row.contactName?.[0] || title[0] || "P").toUpperCase();
                  const moving = movingId === row._id;
                  return (
                    <CrmKanbanCard
                      key={row._id}
                      stageKey={stage}
                      draggable={!moving}
                      onDragStart={(e) => handleDragStart(e, row._id)}
                      className={cn(moving ? "cursor-wait opacity-60" : "cursor-grab active:cursor-grabbing")}
                      onClick={() => router.push(`/crm/legal/verification/${row._id}`)}
                    >
                      <CrmKanbanCardHead
                        tone={crmKanbanAvatarTone(title + row._id)}
                        initials={initials}
                        title={title}
                        subtitle={formatAddress(row)}
                      />
                      <CrmKanbanMetaList>
                        <CrmKanbanMetaRow icon={<User size={15} strokeWidth={1.75} />}>
                          {row.contactName || "No contact"}
                        </CrmKanbanMetaRow>
                        <CrmKanbanMetaRow icon={<Phone size={15} strokeWidth={1.75} />}>
                          {row.contactPhone || row.contactEmail || "—"}
                        </CrmKanbanMetaRow>
                        <CrmKanbanMetaRow icon={<Calendar size={15} strokeWidth={1.75} />}>
                          Requested {new Date(legal.requestedAt).toLocaleDateString()}
                        </CrmKanbanMetaRow>
                      </CrmKanbanMetaList>
                      <CrmKanbanCardFooter
                        left={
                          <CrmKanbanAvatar size="sm">
                            {(legal.assignedTo?.[0] || "S").toUpperCase()}
                          </CrmKanbanAvatar>
                        }
                      >
                        <span className="truncate text-xs text-[#707070]">
                          {legal.assignedTo || "Shared queue"}
                        </span>
                      </CrmKanbanCardFooter>
                    </CrmKanbanCard>
                  );
                })}
              </CrmKanbanColumn>
            );
          })}
        </CrmKanbanBoard>
      ) : (
        <CrmTableShell>
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-[var(--text-muted)]">
              No legal verification requests in this filter.
            </div>
          ) : (
            <CrmTable>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Owner / client</th>
                  <th>Submitted</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const legal = row.propertyLegal!;
                  return (
                    <tr
                      key={row._id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/crm/legal/verification/${row._id}`)}
                    >
                      <td>
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--text-main)]">{row.title}</p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {formatAddress(row)} · {formatListingArea(row)}
                          </p>
                          <div className="mt-1">
                            <CrmSoftBadge
                              label={row.listingBucket.toUpperCase()}
                              tone="secondary"
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm font-medium text-[var(--text-main)]">
                          {row.contactName || "—"}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {row.contactPhone || row.contactEmail || "—"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap text-sm text-[var(--text-muted)]">
                        {new Date(legal.requestedAt).toLocaleString()}
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">
                        {legal.assignedTo || "Shared"}
                      </td>
                      <td>
                        <CrmStatusBadge tone={legalStatusBadgeTone(legal.status)}>
                          {legal.status}
                        </CrmStatusBadge>
                      </td>
                      <td className="max-w-[220px] truncate text-xs text-[var(--text-muted)]">
                        {legal.rejectionReason || legal.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </CrmTable>
          )}
        </CrmTableShell>
      )}

      {rejectDraft ? (
        <div className={cn(crmModalChrome.overlay, "z-[1000] flex items-center justify-center p-4")}>
          <div
            className={crmModalChrome.backdrop}
            onClick={() => !rejectBusy && setRejectDraft(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className={cn(crmModalChrome.centerShell, "max-w-md crm-modal")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 p-5">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text-main)]">
                  Reject legal verification
                </h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  This reason is shown back to the client/owner.
                </p>
              </div>
              <CrmTextarea
                rows={3}
                autoFocus
                value={rejectDraft.reason}
                disabled={rejectBusy}
                onChange={(e) => setRejectDraft({ ...rejectDraft, reason: e.target.value })}
                placeholder="Why is this being rejected?"
              />
              <div className="flex justify-end gap-2">
                <CrmButton
                  type="button"
                  variant="secondary"
                  disabled={rejectBusy}
                  onClick={() => setRejectDraft(null)}
                >
                  Cancel
                </CrmButton>
                <CrmButton
                  type="button"
                  variant="danger"
                  loading={rejectBusy}
                  disabled={rejectBusy || !rejectDraft.reason.trim()}
                  onClick={async () => {
                    setRejectBusy(true);
                    await applyDecision(rejectDraft.propertyId, "Rejected", rejectDraft.reason.trim());
                    setRejectBusy(false);
                    setRejectDraft(null);
                  }}
                >
                  Reject
                </CrmButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
