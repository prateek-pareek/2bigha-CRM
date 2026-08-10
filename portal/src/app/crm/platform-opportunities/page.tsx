"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  ExternalLink,
  Loader2,
  Trash2,
  Check,
  User,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import PlatformOpportunityCreatePanel from "@/components/crm/platform/PlatformOpportunityCreatePanel";
import Pagination from "@/components/suite/shell/Pagination";
import { platformEngagementLabel } from "@/lib/crm/platform-opportunity";
import { sortPipelineStages } from "@/lib/crm/platform-opportunity-pipeline";
import { useOpportunitySourcePlatforms } from '@/lib/crm/hooks/useOpportunitySourcePlatforms';
import { CRM_API_URL } from '@/lib/crm/config';
import crmApi from "@/lib/crm/api";
import { resolveActivePipelineId } from "@/lib/crm/shared/prefetch-cache";
import { isMongoObjectIdString } from "@/lib/crm/shared/is-mongo-object-id";
import { CrmBulkDeleteConfirmModal } from "@/components/crm/records/detail/CrmBulkDeleteConfirmModal";
import { cn } from "@/lib/utils";
import CRMFilterBar from "@/components/crm/segments/CRMFilterBar";
import CRMDateRangePicker from "@/components/crm/records/forms/CRMDateRangePicker";
import { FilterCriteria, FilterProperty } from "@/lib/crm/filter-config";
import { mergeDateRangeFilter } from "@/lib/crm/list-query";
import {
  CrmPageHeader,
  CrmCountBadge,
  CrmButton,
  CrmViewToggle,
  CrmHeaderTools,
  CrmListToolbar,
  CrmTableShell,
  CrmTable,
  CrmKanbanBoard,
  CrmKanbanColumn,
  CrmKanbanCard,
  CrmKanbanCardHead,
  CrmKanbanAvatar,
  CrmKanbanMetaRow,
  CrmKanbanMetaList,
  CrmKanbanCardFooter,
  CrmListPersonCell,
  CrmListOwnerCell,
  CrmListStatusBadge,
  CrmListMutedText,
  CrmTableCheck,
  CrmTableActionMenu,
} from "@/components/crm/ui";
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from "@/lib/crm/ui";

type PlatformRow = {
  _id: string;
  title: string;
  opportunitySourcePlatform?: string;
  opportunityListingUrl?: string;
  platformClientLabel?: string;
  platformEngagementStatus?: string;
  stage?: string;
  pipeline?: string;
  platformLastEngagedAt?: string;
  ownerLabel?: string;
  notes?: string;
  updatedAt?: string;
};

type Pipeline = {
  _id: string;
  name: string;
  isDefault?: boolean;
  stages: Array<{ name: string; order: number; isDefault?: boolean }>;
};

const VIEW_MODE_KEY = "crm_platform_opps_view_mode_v1";
const PIPELINE_STORAGE_KEY = "crm_active_pipeline_platform_opportunities";

export default function PlatformOpportunitiesPage() {
  const router = useRouter();
  const { hasAccess, isLoaded, isAdmin, user } = usePermissions();
  const canRead =
    isAdmin ||
    hasAccess("platform-opportunities:read") ||
    hasAccess("leads:read");
  const canWrite =
    isAdmin ||
    hasAccess("platform-opportunities:write") ||
    hasAccess("leads:write");
  const canDelete = hasAccess("platform-opportunities:delete");
  const canExport = hasAccess("platform-opportunities:export");

  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(VIEW_MODE_KEY) as "kanban" | "list") || "kanban";
    }
    return "kanban";
  });

  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [showMyOnly, setShowMyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);

  const apiFilters = useMemo(
    () => mergeDateRangeFilter(filters, dateRange),
    [filters, dateRange],
  );

  const recordPlatforms = useMemo(
    () =>
      rows
        .map((r) => r.opportunitySourcePlatform?.trim())
        .filter((p): p is string => Boolean(p)),
    [rows],
  );
  const { options: platformOptions } = useOpportunitySourcePlatforms(recordPlatforms);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!isLoaded || !canRead) return;
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/pipelines?type=platform_opportunities`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Pipeline[]) => {
        setPipelines(Array.isArray(data) ? data : []);
        const { pipelineId } = resolveActivePipelineId(
          "platform_opportunities",
          data,
          user,
        );
        if (pipelineId) setSelectedPipelineId(pipelineId);
      })
      .catch(() => setPipelines([]));
  }, [isLoaded, canRead, user]);

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p._id === selectedPipelineId),
    [pipelines, selectedPipelineId],
  );

  const pipelineStages = useMemo(
    () => sortPipelineStages(selectedPipeline?.stages || []),
    [selectedPipeline],
  );

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (debouncedSearch) q.set("search", debouncedSearch);
      if (isMongoObjectIdString(selectedPipelineId)) {
        q.set("pipeline", selectedPipelineId);
      }
      if (stageFilter) q.set("stage", stageFilter);
      if (platformFilter) q.set("platform", platformFilter);
      if (showMyOnly) q.set("mine", "1");

      if (viewMode === "list") {
        q.set("page", String(page));
        q.set("pageSize", String(pageSize));
      } else {
        // Board: capped window — never request unbounded dumps at crore scale.
        q.set("page", "1");
        q.set("pageSize", "500");
      }
      if (apiFilters.length > 0) {
        q.set("filters", JSON.stringify(apiFilters));
      }

      const { data } = await crmApi.get<{ data: PlatformRow[]; total: number } | PlatformRow[]>(
        `/crm/platform-opportunities?${q.toString()}`,
      );
      if (data && typeof data === "object" && "data" in data) {
        setRows(Array.isArray(data.data) ? data.data : []);
        setTotal(Number(data.total) || 0);
      } else {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setTotal(list.length);
      }
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    canRead,
    page,
    pageSize,
    debouncedSearch,
    selectedPipelineId,
    stageFilter,
    platformFilter,
    showMyOnly,
    viewMode,
    apiFilters,
  ]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  const updateStage = async (id: string, stage: string) => {
    setUpdatingId(id);
    try {
      const patch: Record<string, string> = { stage };
      if (isMongoObjectIdString(selectedPipelineId)) {
        patch.pipeline = selectedPipelineId;
      }
      const { data } = await crmApi.patch<PlatformRow>(
        `/crm/platform-opportunities/${id}`,
        patch,
      );
      setRows((prev) =>
        prev.map((r) => (r._id === id ? { ...r, ...data } : r)),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const rowsByStage = useMemo(() => {
    const map = new Map<string, PlatformRow[]>();
    for (const s of pipelineStages) {
      map.set(s.name, []);
    }
    for (const row of rows) {
      const key =
        row.stage ||
        platformEngagementLabel(row.platformEngagementStatus) ||
        pipelineStages[0]?.name ||
        "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [rows, pipelineStages]);

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectStage = (stageIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = stageIds.every((id) => next.has(id));
      if (allSelected) stageIds.forEach((id) => next.delete(id));
      else stageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await crmApi.post("/crm/platform-opportunities/bulk-delete", {
        ids: Array.from(selectedIds),
      });
      setSelectedIds(new Set());
      setShowConfirmDelete(false);
      await load();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/platform-opportunities/export/csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const csv = await res.text();
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "platform-opportunities.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!canWrite) return;
    e.dataTransfer.setData("platformOppId", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, stageName: string) => {
    e.preventDefault();
    if (!canWrite) return;
    const id = e.dataTransfer.getData("platformOppId");
    if (!id) return;
    await updateStage(id, stageName);
  };

  const displayedTotal = viewMode === "list" ? total : rows.length;

  if (!isLoaded) return null;

  if (!canRead) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-lg font-semibold">Platform opportunities</h1>
        <p className="mt-2 text-sm text-neutral-600">
          You need <code className="text-xs">platform-opportunities:read</code> (or ask an admin to enable it under Staff → CRM).
        </p>
        <Link href="/crm/workspace" className="mt-4 inline-block text-sm font-medium text-primary">
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className={CRM_LIST_PAGE}>
      <CrmPageHeader
        bordered={false}
        title="Platform opportunities"
        badge={<CrmCountBadge>{displayedTotal}</CrmCountBadge>}
        description="Upwork, Freelancer, and similar boards"
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Platform opportunities" },
        ]}
        actions={
          <CrmHeaderTools
            leading={
              <>
                <CrmViewToggle
                  value={viewMode}
                  onChange={(mode) => setViewMode(mode === "list" ? "list" : "kanban")}
                  modes={["kanban", "list"]}
                />
                {selectedIds.size > 0 && canDelete ? (
                  <CrmButton
                    variant="icon"
                    onClick={() => setShowConfirmDelete(true)}
                    title={`Delete ${selectedIds.size} selected`}
                    className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                  />
                ) : null}
                {canWrite ? (
                  <CrmButton
                    variant="primary"
                    onClick={() => setCreateOpen(true)}
                    leftIcon={<Plus className="h-4 w-4" />}
                  >
                    Add opportunity
                  </CrmButton>
                ) : null}
              </>
            }
            onExport={canExport ? () => void handleExport() : undefined}
            canExport={canExport}
            exporting={exporting}
            onRefresh={() => void load()}
          />
        }
      />

      <CrmListToolbar
        filter={
          <CRMFilterBar
            module="platform-opportunities"
            filters={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
            pipelineId={selectedPipelineId}
          />
        }
        searchProps={{
          placeholder: "Search title, platform, client…",
          value: search,
          onChange: (e) => {
            setSearch(e.target.value);
            setPage(1);
          },
        }}
        leftExtra={
          <>
            {pipelines.length > 0 ? (
              <select
                value={selectedPipelineId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedPipelineId(id);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(PIPELINE_STORAGE_KEY, id);
                  }
                  setStageFilter("");
                  setPage(1);
                }}
                className={cn(CRM_TOOLBAR_SELECT, "max-w-[220px]")}
                aria-label="Pipeline"
              >
                {pipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                    {p.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
              className={CRM_TOOLBAR_SELECT}
              aria-label="Filter by stage"
              disabled={!pipelineStages.length}
            >
              <option value="">All stages</option>
              {pipelineStages.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={platformFilter}
              onChange={(e) => {
                setPlatformFilter(e.target.value);
                setPage(1);
              }}
              className={cn(CRM_TOOLBAR_SELECT, "max-w-[180px]")}
              aria-label="Filter by platform"
            >
              <option value="">All platforms</option>
              {platformOptions
                .filter((p) => p !== "Other / custom" && Boolean(p))
                .map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
            </select>
            <CrmButton
              variant={showMyOnly ? "primary" : "secondary"}
              onClick={() => {
                setShowMyOnly((v) => !v);
                setPage(1);
              }}
              leftIcon={<User className="h-3.5 w-3.5" />}
            >
              My records
            </CrmButton>
            <CRMDateRangePicker
              onChange={(range) => {
                setDateRange(range);
                setPage(1);
              }}
              compact
            />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No platform opportunities yet. Add one from Upwork, Freelancer, or another board.
          </p>
        ) : viewMode === "kanban" && !pipelineStages.length ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] bg-white p-8 text-center max-w-md">
            <p className="text-sm font-semibold text-[var(--text-main)]">
              No platform pipeline configured
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Create a pipeline under{" "}
              <Link href="/crm/settings/pipelines" className="text-[var(--primary)] font-semibold hover:underline">
                CRM Settings → Pipelines
              </Link>{" "}
              (Platform Pipelines tab).
            </p>
          </div>
        ) : viewMode === "kanban" ? (
          <CrmKanbanBoard>
            {pipelineStages
              .filter((stage) => !stageFilter || stage.name === stageFilter)
              .map((stage) => {
                const stageRows = rowsByStage.get(stage.name) ?? [];
                const stageIds = stageRows.map((r) => r._id);
                const allStageSelected =
                  stageIds.length > 0 && stageIds.every((id) => selectedIds.has(id));
                return (
                  <CrmKanbanColumn
                    key={stage.name}
                    title={stage.name}
                    count={stageRows.length}
                    stageKey={stage.name}
                    onDragOver={handleDragOver}
                    onDrop={(e) => void handleDrop(e, stage.name)}
                    headerExtra={
                      canWrite && stageIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleSelectStage(stageIds)}
                          className="text-[10px] font-bold text-primary hover:underline shrink-0"
                        >
                          {allStageSelected ? "Deselect" : "Select all"}
                        </button>
                      ) : null
                    }
                  >
                    {stageRows.map((row) => {
                      const initials = (row.title || "?")
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?";
                      return (
                        <CrmKanbanCard
                          key={row._id}
                          stageKey={stage.name}
                          draggable={canWrite}
                          onDragStart={(e) => handleDragStart(e, row._id)}
                          onClick={() =>
                            router.push(`/crm/platform-opportunities/${row._id}`)
                          }
                          className={cn(
                            selectedIds.has(row._id) &&
                              "border-primary/50 bg-primary/[0.04]",
                          )}
                        >
                          <CrmKanbanCardHead
                            initials={initials}
                            title={<span className="truncate block">{row.title}</span>}
                            subtitle={
                              [row.opportunitySourcePlatform, row.platformClientLabel]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            leading={
                              canWrite ? (
                                <button
                                  type="button"
                                  onClick={(e) => toggleSelect(row._id, e)}
                                  className={`w-4 h-4 rounded-[var(--radius-sm)] border-2 flex items-center justify-center shrink-0 ${
                                    selectedIds.has(row._id)
                                      ? "bg-primary border-primary text-white"
                                      : "border-[var(--border-color)] opacity-0 group-hover:opacity-100"
                                  }`}
                                >
                                  {selectedIds.has(row._id) && (
                                    <Check className="h-2.5 w-2.5" strokeWidth={4} />
                                  )}
                                </button>
                              ) : null
                            }
                          />
                          <CrmKanbanMetaList>
                            {row.ownerLabel && (
                              <CrmKanbanMetaRow icon={<User className="h-3.5 w-3.5" />}>
                                {row.ownerLabel}
                              </CrmKanbanMetaRow>
                            )}
                            {row.opportunityListingUrl && (
                              <CrmKanbanMetaRow icon={<ExternalLink className="h-3.5 w-3.5" />}>
                                <a
                                  href={row.opportunityListingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-semibold text-primary hover:underline"
                                >
                                  Listing
                                </a>
                              </CrmKanbanMetaRow>
                            )}
                          </CrmKanbanMetaList>
                          <CrmKanbanCardFooter
                            left={
                              <CrmKanbanAvatar size="sm">
                                {(row.opportunitySourcePlatform?.[0] || row.title[0] || "P").toUpperCase()}
                              </CrmKanbanAvatar>
                            }
                            actions
                          />
                        </CrmKanbanCard>
                      );
                    })}
                  </CrmKanbanColumn>
                );
              })}
          </CrmKanbanBoard>
        ) : (
          <CrmTableShell>
            <CrmTable>
              <thead>
                <tr>
                  {canWrite && (
                    <th className="crm-table-check sticky top-0 z-10">
                      <span className="sr-only">Select</span>
                    </th>
                  )}
                  <th className="sticky top-0 z-10">Opportunity</th>
                  <th className="sticky top-0 z-10">Platform</th>
                  <th className="sticky top-0 z-10">Client</th>
                  <th className="sticky top-0 z-10">Stage</th>
                  <th className="sticky top-0 z-10">Owner</th>
                  <th className="sticky top-0 z-10">Listing</th>
                  <th className="crm-table-actions sticky top-0 z-10 text-right text-[13px] font-semibold text-[#1f2020]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const title = row.title || "Untitled";
                  return (
                  <tr
                    key={row._id}
                    className={cn(
                      "group cursor-pointer transition-colors",
                      selectedIds.has(row._id) && "crm-table-row-selected",
                    )}
                    onClick={() =>
                      router.push(`/crm/platform-opportunities/${row._id}`)
                    }
                  >
                    {canWrite && (
                      <td className="crm-table-check">
                        <CrmTableCheck
                          checked={selectedIds.has(row._id)}
                          onChange={(e) => toggleSelect(row._id, e as React.MouseEvent)}
                          ariaLabel={selectedIds.has(row._id) ? "Deselect" : "Select"}
                        />
                      </td>
                    )}
                    <td>
                      <CrmListPersonCell
                        name={title}
                        initials={title.slice(0, 2)}
                      />
                    </td>
                    <td>
                      <CrmListMutedText>{row.opportunitySourcePlatform || "—"}</CrmListMutedText>
                    </td>
                    <td>
                      <CrmListMutedText>{row.platformClientLabel || "—"}</CrmListMutedText>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canWrite && pipelineStages.length ? (
                        <select
                          className="h-8 max-w-[200px] rounded-[5px] border border-[var(--border-color)] bg-white px-2 text-xs shadow-[var(--crm-shadow-input)]"
                          value={row.stage || pipelineStages[0]?.name || ""}
                          disabled={updatingId === row._id}
                          onChange={(e) => void updateStage(row._id, e.target.value)}
                        >
                          {pipelineStages.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <CrmListStatusBadge
                          label={
                            row.stage ||
                            platformEngagementLabel(row.platformEngagementStatus) ||
                            "—"
                          }
                        />
                      )}
                    </td>
                    <td>
                      <CrmListOwnerCell name={row.ownerLabel || ""} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {row.opportunityListingUrl ? (
                        <a
                          href={row.opportunityListingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <CrmListMutedText>—</CrmListMutedText>
                      )}
                    </td>
                    <td className="crm-table-actions">
                      <CrmTableActionMenu
                        onEdit={() =>
                          router.push(`/crm/platform-opportunities/${row._id}`)
                        }
                        onDelete={
                          canWrite
                            ? () => {
                                setSelectedIds(new Set([row._id]));
                                setShowConfirmDelete(true);
                              }
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </CrmTable>
          </CrmTableShell>
        )}
        {viewMode === "list" && !loading && total > pageSize && (
          <div className="mt-4">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      <CrmBulkDeleteConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={() => void handleBulkDelete()}
        title="Delete platform opportunities?"
        confirmLabel="Delete"
        loading={bulkDeleting}
        description={
          <>
            You are about to remove{' '}
            <span className="font-medium text-[var(--error)]">{selectedIds.size}</span> platform
            opportunit{selectedIds.size === 1 ? 'y' : 'ies'}. This cannot be undone.
          </>
        }
      />

      <PlatformOpportunityCreatePanel
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => void load()}
        defaultPipelineId={selectedPipelineId}
        pipelineStages={pipelineStages}
      />
    </div>
  );
}
