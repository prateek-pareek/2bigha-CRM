"use client";

import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, GitBranch, Calendar, Tag, User, Building2 } from 'lucide-react';
import LegalCaseCreatePanel from '@/components/crm/records/create/LegalCaseCreatePanel';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import Pagination from '@/components/suite/shell/Pagination';
import { CrmBulkDeleteConfirmModal } from '@/components/crm/records/detail/CrmBulkDeleteConfirmModal';
import {
  CrmPageHeader,
  CrmCountBadge,
  CrmButton,
  CrmViewToggle,
  CrmListToolbar,
  CrmHeaderTools,
  CrmTableShell,
  CrmTable,
  CrmListPersonCell,
  CrmListOwnerCell,
  CrmSoftBadge,
  CrmTableCheck,
  CrmTableActionMenu,
  CrmKanbanBoard,
  CrmKanbanColumn,
  CrmKanbanCard,
  CrmKanbanCardHead,
  CrmKanbanMetaRow,
  CrmKanbanMetaList,
  CrmKanbanCardFooter,
  CrmKanbanAvatar,
  crmKanbanAvatarTone,
  CrmRecordCardGrid,
  CrmRecordCard,
} from '@/components/crm/ui';
import { CrmIcon } from '@/lib/crm/shared/icons';
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from '@/lib/crm/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { CRM_API_URL } from '@/lib/crm/config';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { buildCrmListSearchParams, mergeDateRangeFilter, CRM_BOARD_PAGE_SIZE, unwrapCrmListPayload } from '@/lib/crm/list-query';
import CRMCalendarView from '@/components/crm/calendar/CRMCalendarView';
import CRMDateRangePicker from '@/components/crm/records/forms/CRMDateRangePicker';
import { CASE_TYPE_OPTIONS } from '@/components/crm/records/forms/CRMLegalCaseFormFields';
import type { LegalCase } from '@/lib/crm/legal-cases-api';
import { cn } from '@/lib/utils';

interface Stage {
  name: string;
  order: number;
  isDefault: boolean;
}

interface Pipeline {
  _id: string;
  name: string;
  stages: Stage[];
  isDefault: boolean;
}

const VIEW_MODE_KEY = 'crm_legal_view_mode_v1';
const INITIAL_STAGE_CARD_LIMIT = 40;
const STAGE_CARD_INCREMENT = 40;

function pipelineIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

function caseTypeLabel(value?: string): string {
  return CASE_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || 'Other';
}

function priorityTone(priority?: string): 'danger' | 'warning' | 'secondary' | 'primary' {
  const p = (priority || '').toLowerCase();
  if (p === 'urgent' || p === 'high') return 'danger';
  if (p === 'medium') return 'warning';
  return 'secondary';
}

export default function LegalCasesPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'grid' | 'calendar'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(VIEW_MODE_KEY) as any) || 'kanban';
    }
    return 'kanban';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const [cases, setCases] = useState<LegalCase[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<LegalCase | null>(null);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const { hasAccess } = usePermissions();
  const canMoveStage = hasAccess('legal:write') || hasAccess('legal:move_pipeline');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [stageVisibleCounts, setStageVisibleCounts] = useState<Record<string, number>>({});

  const apiFilters = useMemo(() => mergeDateRangeFilter(filters, dateRange), [filters, dateRange]);

  const fetchCasesList = useCallback(
    async (pipelineId: string | null) => {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
      try {
        const params = buildCrmListSearchParams({
          page: 1,
          pageSize: CRM_BOARD_PAGE_SIZE,
          search: deferredSearch,
          extra: {
            pipeline: pipelineId || undefined,
          },
        });
        const q = params.toString();
        const res = await fetch(`${CRM_API_URL}/crm/legal-cases${q ? `?${q}` : ''}`, {
          headers,
          cache: 'no-store',
        });
        if (res.ok) {
          const payload = await res.json();
          const unwrapped = unwrapCrmListPayload<LegalCase>(payload);
          setCases(unwrapped.data);
        }
      } catch (err) {
        console.error('Failed to fetch legal cases', err);
      } finally {
        setLoading(false);
      }
    },
    [deferredSearch],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    try {
      const pipelinesRes = await fetch(`${CRM_API_URL}/crm/pipelines?type=legal`, {
        headers,
        cache: 'no-store',
      });
      let pipelinesData: Pipeline[] = [];
      if (pipelinesRes.ok) {
        pipelinesData = await pipelinesRes.json();
        setPipelines(pipelinesData);
      }

      let initialPipelineId = '';
      if (pipelinesData.length > 0) {
        const saved =
          typeof window !== 'undefined' ? localStorage.getItem('crm_active_pipeline_legal') : null;
        const resolved =
          (saved && pipelinesData.find((p) => pipelineIdEq(p._id, saved))) ||
          pipelinesData.find((p) => p.isDefault) ||
          pipelinesData[0];
        initialPipelineId = String(resolved._id);
        setSelectedPipelineId(initialPipelineId);
      }

      if (initialPipelineId) await fetchCasesList(initialPipelineId);
      else setLoading(false);
    } catch (err) {
      console.error('Failed to fetch data', err);
      setLoading(false);
    }
  }, [fetchCasesList]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) return;
    void fetchCasesList(selectedPipelineId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on pipeline/search change only
  }, [selectedPipelineId, deferredSearch]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, viewMode, filters, dateRange, selectedPipelineId]);

  useEffect(() => {
    if (selectedPipelineId && typeof window !== 'undefined') {
      localStorage.setItem('crm_active_pipeline_legal', selectedPipelineId);
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    setStageVisibleCounts({});
  }, [selectedPipelineId, search, filters, dateRange]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/legal-cases/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setCases((prev) => prev.filter((c) => !selectedIds.has(c._id)));
        setSelectedIds(new Set());
        setShowConfirmDelete(false);
      }
    } catch (err) {
      console.error('Bulk delete failed', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Move this legal case to Trash? Only an admin can restore it.')) return;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) fetchCasesList(selectedPipelineId);
    } catch (err) {
      console.error('Failed to delete legal case:', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, caseId: string) => {
    e.dataTransfer.setData('text/plain', caseId);
    e.dataTransfer.setData('legalCaseId', caseId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageName: string) => {
    e.preventDefault();
    if (!canMoveStage) return;
    const caseId = e.dataTransfer.getData('legalCaseId') || e.dataTransfer.getData('text/plain');
    if (!caseId) return;

    const updated = cases.map((c) => (c._id === caseId ? { ...c, stage: stageName } : c));
    setCases(updated);

    try {
      const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${caseId}/stage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ stage: stageName }),
      });
      if (!res.ok) throw new Error('Failed to update stage');
    } catch (err) {
      console.error(err);
      alert('Failed to update legal case stage');
      fetchCasesList(selectedPipelineId);
    }
  };

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => pipelineIdEq(p._id, selectedPipelineId)),
    [pipelines, selectedPipelineId],
  );

  const pipelineStages = useMemo(
    () => (selectedPipeline ? [...(selectedPipeline.stages || [])].sort((a, b) => a.order - b.order) : []),
    [selectedPipeline],
  );

  const filteredCases = useMemo(
    () => applyFilters(cases, apiFilters, filterProperties),
    [cases, apiFilters, filterProperties],
  );

  const boardCasesByStage = useMemo(() => {
    const grouped = new Map<string, LegalCase[]>();
    for (const c of filteredCases) {
      const stageName = String(c.stage || '').trim();
      if (!stageName) continue;
      const bucket = grouped.get(stageName);
      if (bucket) bucket.push(c);
      else grouped.set(stageName, [c]);
    }
    return grouped;
  }, [filteredCases]);

  const paginated = useMemo(
    () => filteredCases.slice((page - 1) * pageSize, page * pageSize),
    [filteredCases, page, pageSize],
  );

  const isAllPaginatedSelected = useMemo(
    () => paginated.length > 0 && paginated.every((c) => selectedIds.has(c._id)),
    [paginated, selectedIds],
  );

  const toggleSelectAll = () => {
    const currentItems = paginated.map((c) => c._id);
    const allSelected = currentItems.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) currentItems.forEach((id) => next.delete(id));
    else currentItems.forEach((id) => next.add(id));
    setSelectedIds(next);
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const renderCell = (c: LegalCase, key: string) => {
    switch (key) {
      case 'title':
        return <CrmListPersonCell name={c.title || 'Untitled Case'} initials={(c.title || '?').slice(0, 2)} />;
      case 'caseType':
        return <CrmSoftBadge label={caseTypeLabel(c.caseType)} tone="info" />;
      case 'priority':
        return <CrmSoftBadge label={c.priority || 'Medium'} tone={priorityTone(c.priority)} />;
      case 'counterpartyName':
        return <span className="text-sm text-[#707070]">{c.counterpartyName || '—'}</span>;
      case 'stage':
        return <CrmSoftBadge label={c.stage || 'Intake'} tone="primary" />;
      case 'caseOwner':
        return <CrmListOwnerCell name={c.caseOwner || ''} />;
      case 'expiryDate':
        return (
          <div className="flex items-center gap-1.5 text-sm text-[#707070]">
            <CrmIcon.Calendar size={14} aria-hidden />
            {c.expiryDate
              ? new Date(c.expiryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </div>
        );
      default:
        return null;
    }
  };

  const LIST_COLUMNS = [
    { key: 'title', label: 'Case' },
    { key: 'caseType', label: 'Type' },
    { key: 'priority', label: 'Priority' },
    { key: 'counterpartyName', label: 'Counterparty' },
    { key: 'stage', label: 'Stage' },
    { key: 'caseOwner', label: 'Owner' },
    { key: 'expiryDate', label: 'Expiry' },
  ];

  return (
    <div className={CRM_LIST_PAGE}>
      <div className="flex flex-1 h-full relative min-w-0">
        <div className="flex-1 flex flex-col min-w-0">
          <CrmPageHeader
            bordered={false}
            title="Legal"
            badge={<CrmCountBadge>{filteredCases.length}</CrmCountBadge>}
            breadcrumbs={[
              { label: 'Home', href: '/crm/workspace/summary' },
              { label: 'Legal' },
            ]}
            actions={
              <CrmHeaderTools
                leading={
                  selectedIds.size > 0 && hasAccess('legal:delete') ? (
                    <CrmButton
                      variant="danger"
                      onClick={() => setShowConfirmDelete(true)}
                      leftIcon={<CrmIcon.Trash size={14} />}
                    >
                      Delete {selectedIds.size}
                    </CrmButton>
                  ) : null
                }
                onRefresh={() => void fetchCasesList(selectedPipelineId)}
              />
            }
          />

          <CrmListToolbar
            filter={
              <CRMFilterBar
                module="legal"
                filters={filters}
                onChange={setFilters}
                onClear={() => setFilters([])}
                onPropertiesReady={setFilterProperties}
                pipelineId={selectedPipelineId}
              />
            }
            searchProps={{
              placeholder: 'Search legal cases',
              value: search,
              onChange: (e) => {
                setSearch(e.target.value);
                setPage(1);
              },
            }}
            leftExtra={
              <>
                <CRMDateRangePicker onChange={setDateRange} compact />
                <div className="relative group">
                  <CrmIcon.GitBranch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  <select
                    value={selectedPipelineId ? String(selectedPipelineId) : ''}
                    onChange={(e) => setSelectedPipelineId(e.target.value)}
                    className={cn(CRM_TOOLBAR_SELECT, 'min-w-[160px] cursor-pointer pl-9 pr-8')}
                  >
                    {pipelines.length === 0 ? (
                      <option value="">No pipelines</option>
                    ) : (
                      pipelines.map((p) => (
                        <option key={String(p._id)} value={String(p._id)}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                  <CrmIcon.ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </>
            }
            right={
              <>
                <CrmViewToggle
                  value={viewMode}
                  onChange={(mode) => {
                    setViewMode(mode);
                    setPage(1);
                  }}
                  modes={['list', 'grid', 'kanban', 'calendar']}
                />
                {hasAccess('legal:write') && (
                  <CrmButton
                    variant="primary"
                    onClick={() => {
                      setEditingCase(null);
                      setIsPanelOpen(true);
                    }}
                    leftIcon={<CrmIcon.AddFilled size={16} />}
                  >
                    Add Legal Case
                  </CrmButton>
                )}
              </>
            }
          />

          <div className="flex-1 overflow-auto custom-scrollbar">
            {loading ? (
              <div className="w-full h-64 flex items-center justify-center">
                <Loader2 size={40} className="animate-spin text-text-muted" />
              </div>
            ) : viewMode === 'kanban' ? (
              <CrmKanbanBoard className="min-h-full bg-[#f7f8f9] p-4">
                {pipelineStages.length > 0 ? (
                  pipelineStages.map((stage) => {
                    const stageCases = boardCasesByStage.get(stage.name) || [];
                    const visibleCount = stageVisibleCounts[stage.name] || INITIAL_STAGE_CARD_LIMIT;
                    const visibleStageCases = stageCases.slice(0, visibleCount);
                    return (
                      <CrmKanbanColumn
                        key={stage.name}
                        title={stage.name}
                        stageKey={stage.name}
                        summary={`${stageCases.length} case${stageCases.length === 1 ? '' : 's'}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, stage.name)}
                        onAdd={
                          hasAccess('legal:write')
                            ? () => {
                                setEditingCase(null);
                                setIsPanelOpen(true);
                              }
                            : undefined
                        }
                        style={{ minHeight: 400 }}
                      >
                        {visibleStageCases.map((c) => {
                          const title = c.title || 'Untitled Case';
                          const parts = title.trim().split(/\s+/).filter(Boolean);
                          const i1 = (parts[0]?.[0] || '?').toUpperCase();
                          const i2 = (parts[1]?.[0] || (parts[0] && parts[0].length > 1 ? parts[0][1] : '') || '').toUpperCase();
                          return (
                            <CrmKanbanCard
                              key={c._id}
                              stageKey={stage.name}
                              draggable={canMoveStage}
                              onDragStart={canMoveStage ? (e) => handleDragStart(e, c._id) : undefined}
                              className={cn(canMoveStage ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
                              onClick={() => router.push(`/crm/legal/${c._id}`)}
                            >
                              <CrmKanbanCardHead
                                tone={crmKanbanAvatarTone(title + c._id)}
                                initials={`${i1}${i2}`}
                                title={title}
                                trailing={
                                  hasAccess('legal:delete') ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(c._id);
                                      }}
                                      className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-rose-50 hover:text-rose-500"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  ) : null
                                }
                              />
                              <CrmKanbanMetaList>
                                <CrmKanbanMetaRow icon={<Tag size={15} strokeWidth={1.75} />}>
                                  {caseTypeLabel(c.caseType)}
                                </CrmKanbanMetaRow>
                                <CrmKanbanMetaRow icon={<GitBranch size={15} strokeWidth={1.75} />}>
                                  {c.priority || 'Medium'} priority
                                </CrmKanbanMetaRow>
                                {c.counterpartyName ? (
                                  <CrmKanbanMetaRow icon={<Building2 size={15} strokeWidth={1.75} />}>
                                    {c.counterpartyName}
                                  </CrmKanbanMetaRow>
                                ) : null}
                                {c.caseOwner ? (
                                  <CrmKanbanMetaRow icon={<User size={15} strokeWidth={1.75} />}>
                                    {c.caseOwner}
                                  </CrmKanbanMetaRow>
                                ) : null}
                                {c.expiryDate ? (
                                  <CrmKanbanMetaRow icon={<Calendar size={15} strokeWidth={1.75} />}>
                                    Expires {new Date(c.expiryDate).toLocaleDateString()}
                                  </CrmKanbanMetaRow>
                                ) : null}
                              </CrmKanbanMetaList>
                              <CrmKanbanCardFooter
                                left={
                                  <CrmKanbanAvatar size="sm">
                                    {(c.counterpartyName?.[0] || title[0] || 'L').toUpperCase()}
                                  </CrmKanbanAvatar>
                                }
                              />
                            </CrmKanbanCard>
                          );
                        })}
                        {visibleStageCases.length < stageCases.length && (
                          <button
                            type="button"
                            onClick={() =>
                              setStageVisibleCounts((prev) => ({
                                ...prev,
                                [stage.name]: (prev[stage.name] || INITIAL_STAGE_CARD_LIMIT) + STAGE_CARD_INCREMENT,
                              }))
                            }
                            className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-left text-xs font-semibold text-primary transition hover:bg-primary/5 shadow-[var(--crm-shadow-input)]"
                          >
                            Show more cases
                          </button>
                        )}
                      </CrmKanbanColumn>
                    );
                  })
                ) : (
                  <div className="w-full flex flex-col items-center justify-center text-text-muted py-20">
                    <GitBranch size={48} className="mb-4 opacity-50" />
                    <h3 className="text-lg font-bold text-text-main">No Pipeline Available</h3>
                    <p className="max-w-xs text-center mt-2">Create a legal pipeline in Settings to get started.</p>
                  </div>
                )}
              </CrmKanbanBoard>
            ) : viewMode === 'list' ? (
              <>
                <CrmTableShell>
                  <CrmTable>
                    <thead>
                      <tr>
                        <th className="crm-table-check sticky top-0 z-10">
                          <CrmTableCheck
                            checked={isAllPaginatedSelected}
                            onChange={toggleSelectAll}
                            ariaLabel={isAllPaginatedSelected ? 'Deselect all' : 'Select all'}
                          />
                        </th>
                        {LIST_COLUMNS.map((col) => (
                          <th key={col.key} className="sticky top-0 z-10">
                            {col.label}
                          </th>
                        ))}
                        <th className="crm-table-actions sticky top-0 z-10 text-right text-[13px] font-semibold text-[#1f2020]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan={LIST_COLUMNS.length + 2} className="py-20 text-center text-sm font-medium text-[#707070]">
                            No legal cases found
                          </td>
                        </tr>
                      ) : (
                        paginated.map((c) => (
                          <tr
                            key={c._id}
                            className={`group cursor-pointer transition-colors ${selectedIds.has(c._id) ? 'crm-table-row-selected' : ''}`}
                            onClick={() => router.push(`/crm/legal/${c._id}`)}
                          >
                            <td className="crm-table-check">
                              <CrmTableCheck
                                checked={selectedIds.has(c._id)}
                                onChange={(e) => toggleSelect(c._id, e as React.MouseEvent)}
                                ariaLabel={selectedIds.has(c._id) ? 'Deselect case' : 'Select case'}
                              />
                            </td>
                            {LIST_COLUMNS.map((col) => (
                              <td key={col.key}>{renderCell(c, col.key)}</td>
                            ))}
                            <td className="crm-table-actions">
                              <CrmTableActionMenu
                                onEdit={() => router.push(`/crm/legal/${c._id}`)}
                                onDelete={hasAccess('legal:delete') ? () => handleDelete(c._id) : undefined}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </CrmTable>
                </CrmTableShell>
                <Pagination
                  total={filteredCases.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </>
            ) : viewMode === 'grid' ? (
              <div className="flex flex-col gap-4 p-4">
                {paginated.length === 0 ? (
                  <div className="rounded-[5px] border border-[#e2e8f0] bg-white py-20 text-center text-sm font-medium text-[#707070]">
                    No legal cases found
                  </div>
                ) : (
                  <CrmRecordCardGrid>
                    {paginated.map((c) => {
                      const title = c.title || 'Untitled Case';
                      const parts = title.trim().split(/\s+/).filter(Boolean);
                      const i1 = (parts[0]?.[0] || '?').toUpperCase();
                      const i2 = (parts[1]?.[0] || (parts[0] && parts[0].length > 1 ? parts[0][1] : '') || '').toUpperCase();
                      const meta = [
                        { key: 'type', icon: <Tag size={15} strokeWidth={1.75} />, label: caseTypeLabel(c.caseType) },
                        c.counterpartyName
                          ? { key: 'counterparty', icon: <Building2 size={15} strokeWidth={1.75} />, label: c.counterpartyName }
                          : null,
                        c.expiryDate
                          ? {
                              key: 'expiry',
                              icon: <Calendar size={15} strokeWidth={1.75} />,
                              label: new Date(c.expiryDate).toLocaleDateString(undefined, {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              }),
                            }
                          : null,
                      ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string }[];

                      return (
                        <CrmRecordCard
                          key={c._id}
                          markShape="square"
                          initials={`${i1}${i2}`}
                          toneSeed={`${title}${c._id}`}
                          title={title}
                          subtitle={c.counterpartyName || undefined}
                          selectable
                          selected={selectedIds.has(c._id)}
                          onSelectedChange={() => toggleSelect(c._id)}
                          onClick={() => router.push(`/crm/legal/${c._id}`)}
                          actions={
                            <CrmTableActionMenu
                              onEdit={() => router.push(`/crm/legal/${c._id}`)}
                              onDelete={hasAccess('legal:delete') ? () => handleDelete(c._id) : undefined}
                            />
                          }
                          headTrailing={<CrmSoftBadge label={c.priority || 'Medium'} tone={priorityTone(c.priority)} />}
                          meta={meta}
                          footerLeft={<span className="text-xs font-medium text-[#707070]">{c.stage || 'Intake'}</span>}
                          footerRight={
                            c.caseOwner ? (
                              <CrmKanbanAvatar size="sm">
                                {c.caseOwner.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                              </CrmKanbanAvatar>
                            ) : null
                          }
                        />
                      );
                    })}
                  </CrmRecordCardGrid>
                )}
                <Pagination
                  total={filteredCases.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </div>
            ) : (
              <CRMCalendarView
                items={filteredCases}
                titleField="title"
                dateField="expiryDate"
                onItemClick={(item) => router.push(`/crm/legal/${item._id}`)}
              />
            )}
          </div>
        </div>
      </div>

      <CrmBulkDeleteConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleBulkDelete}
        title="Delete legal cases permanently?"
        loading={isDeleting}
        description={
          <>
            You are about to remove{' '}
            <span className="font-medium text-[var(--error)]">{selectedIds.size} records</span>. This action is final and
            cannot be undone.
          </>
        }
      />

      <LegalCaseCreatePanel
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setEditingCase(null);
        }}
        initialPipelineId={selectedPipelineId}
        editingCase={editingCase}
        onSuccess={() => fetchCasesList(selectedPipelineId)}
      />
    </div>
  );
}
