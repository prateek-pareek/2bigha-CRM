"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Plus, DollarSign, Calendar, Download, Loader2, Upload, GitBranch, LayoutGrid, List, Settings2, Trash2, Check, X, ChevronDown, Search, GripVertical, Building2, Tag, Info, IndianRupee, MapPin, Banknote } from 'lucide-react';
import DealCreatePanel from '@/components/crm/records/create/DealCreatePanel';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import CRMSavedViews, { SavedViewData } from '@/components/crm/segments/CRMSavedViews';
import Pagination from '@/components/suite/shell/Pagination';
import { CrmCustomFieldValue } from '@/components/crm/records/forms/CrmCustomFieldValue';
import DeleteCustomFieldMergeDialog from '@/components/crm/records/detail/DeleteCustomFieldMergeDialog';
import { CrmPropertyManagerModal } from '@/components/crm/records/detail/CrmPropertyManagerModal';
import { CrmBulkDeleteConfirmModal } from '@/components/crm/records/detail/CrmBulkDeleteConfirmModal';
import {
  CrmPageHeader,
  CrmCountBadge,
  CrmButton,
  CrmViewToggle,
  CrmSearchInput,
  CrmListToolbar,
  CrmHeaderTools,
  CrmTableShell,
  CrmTable,
  CrmListPersonCell,
  CrmListOrgCell,
  CrmListOwnerCell,
  CrmListStatusBadge,
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
import {
  crmCacheGet,
  crmCacheKeys,
  crmCachePeek,
  crmCacheSet,
  crmCacheShouldRevalidate,
  resolveActivePipelineId,
  runWhenIdle,
} from '@/lib/crm/shared/prefetch-cache';
import { invalidateCrmAfterMutation } from '@/lib/crm/shared/invalidate-on-mutation';
import {
  CRM_CARD_DEFAULT_FIELDS,
  loadCrmCardCustomizations,
} from '@/lib/crm/card-customization';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { buildCrmListSearchParams, mergeDateRangeFilter, CRM_BOARD_PAGE_SIZE, unwrapCrmListPayload } from '@/lib/crm/list-query';
import CRMCalendarView from '@/components/crm/calendar/CRMCalendarView';
import CRMDateRangePicker from '@/components/crm/records/forms/CRMDateRangePicker';
import { cn } from '@/lib/utils';

const ImportModal = dynamic(() => import('@/components/crm/records/create/ImportModal'), { ssr: false });

interface Deal {
  _id: string;
  organization: any;
  dealValue: number;
  pricingType?: 'fixed' | 'monthly';
  contractMonths?: number;
  status: string; // This is the stage name
  probability: number;
  expectedClosureDate: string;
  pipeline: string; // Pipeline ID
  title?: string;
  priority?: string;
  createdAt?: string;
  dealOwner?: string;
  createdBy?: string;
  expectedDealValue?: number;
  customFields?: Record<string, any>;
  currency?: string;
  exchangeRate?: number;
  dealValueUSD?: number;
  dealValueINR?: number;
}

interface Stage {
  name: string;
  probability: number;
  order: number;
  isDefault: boolean;
}

interface Pipeline {
  _id: string;
  name: string;
  stages: Stage[];
  isDefault: boolean;
}

interface Column {
  key: string;
  label: string;
  visible: boolean;
}

const BUILT_IN_COLUMNS: Omit<Column, 'visible'>[] = [
  { key: 'title', label: 'Deal Name' },
  { key: 'organization', label: 'Organization' },
  { key: 'dealValue', label: 'Amount' },
  { key: 'status', label: 'Stage' },
  { key: 'probability', label: 'Probability' },
  { key: 'priority', label: 'Priority' },
  { key: 'dealOwner', label: 'Owner' },
  { key: 'expectedClosureDate', label: 'Close Date' },
  { key: 'createdAt', label: 'Created' },
];

const STORAGE_KEY = 'deals_columns_v2';

function loadColumns(): Column[] {
  if (typeof window === 'undefined') return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: i < 6 }));
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: Column[] = JSON.parse(saved);
      const existingKeys = new Set(parsed.map(c => c.key));
      const extras = BUILT_IN_COLUMNS.filter(c => !existingKeys.has(c.key)).map(c => ({ ...c, visible: false }));
      return [...parsed, ...extras];
    }
  } catch { /* ignore */ }
  return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: i < 6 }));
}

function saveColumns(cols: Column[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

const VIEW_MODE_KEY = 'crm_deals_view_mode_v1';
const INITIAL_STAGE_CARD_LIMIT = 40;
const STAGE_CARD_INCREMENT = 40;

function pipelineIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

function isMongoObjectIdString(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value.trim());
}

export default function DealsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'grid' | 'calendar'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(VIEW_MODE_KEY) as any) || 'kanban';
    }
    return 'kanban';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    }
  }, [viewMode]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDealPanelOpen, setIsDealPanelOpen] = useState(false);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const { hasAccess, isAdmin, user, canViewCrmRevenue } = usePermissions();
  const canMoveDealStage =
    hasAccess('deals:write') || hasAccess('deals:move_pipeline');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  // Pagination & Columns
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [serverTotal, setServerTotal] = useState(0);
  const [columns, setColumns] = useState<Column[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<Column[]>([]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [customFieldDefs, setCustomFieldDefs] = useState<any[]>([]);
  const cfDragRef = useRef<number | null>(null);
  const [cfDragVisualIdx, setCfDragVisualIdx] = useState<number | null>(null);
  const [cfDragOverVisualIdx, setCfDragOverVisualIdx] = useState<number | null>(null);
  const [showAddColPopover, setShowAddColPopover] = useState(false);
  const [addColName, setAddColName] = useState('');
  const [addColType, setAddColType] = useState('text');
  const [addColSaving, setAddColSaving] = useState(false);
  const [cfMergeDeleteField, setCfMergeDeleteField] = useState<{ _id: string; name: string; key: string } | null>(null);
  const [stageVisibleCounts, setStageVisibleCounts] = useState<Record<string, number>>({});
  const dealsCacheRef = useRef<Map<string, Deal[]>>(new Map());

  // Card Customization: load fields from localStorage and keep in sync
  const [cardFields, setCardFields] = useState<string[]>(() => {
    if (typeof window === 'undefined') return CRM_CARD_DEFAULT_FIELDS.deals;
    return loadCrmCardCustomizations().deals;
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'crmCardCustomizations' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.deals) setCardFields(parsed.deals);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const ingestCustomFieldDefinitions = useCallback((cfs: any[]) => {
    setCustomFieldDefs(cfs);
    const cfCols: Column[] = cfs.map((f: any) => ({ key: `cf_${f.key}`, label: f.name, visible: true }));
    setColumns((prev) => {
      const builtInKeys = new Set(BUILT_IN_COLUMNS.map((c) => c.key));
      const base = prev.filter((c) => builtInKeys.has(c.key));
      const existingCfKeys = new Set(
        prev.filter((c) => !builtInKeys.has(c.key)).map((c) => c.key),
      );
      const merged = cfCols.map((c) =>
        existingCfKeys.has(c.key) ? prev.find((p) => p.key === c.key)! : c,
      );
      const updated = [...base, ...merged];
      saveColumns(updated);
      return updated;
    });
  }, []);

  const fetchCustomFields = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=deals`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) ingestCustomFieldDefinitions(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [ingestCustomFieldDefinitions]);

  const needsClientFullList = viewMode === 'kanban' || viewMode === 'calendar';
  const apiFilters = useMemo(
    () => mergeDateRangeFilter(filters, dateRange),
    [filters, dateRange],
  );

  const dealsListCacheKey = useCallback(
    (pipelineId: string | null, isDefaultPipeline: boolean) =>
      crmCacheKeys.dealsList(pipelineId || '', {
        page: needsClientFullList ? 1 : page,
        pageSize: needsClientFullList ? CRM_BOARD_PAGE_SIZE : pageSize,
        unassigned: isDefaultPipeline,
      }),
    [needsClientFullList, page, pageSize],
  );

  const readSharedDealsCache = useCallback((cacheKey: string): Deal[] | null => {
    const local = dealsCacheRef.current.get(cacheKey);
    if (local?.length) return local;
    const payload = crmCacheGet<{ data?: Deal[]; total?: number } | Deal[]>(cacheKey);
    if (!payload) return null;
    if (Array.isArray(payload)) {
      dealsCacheRef.current.set(cacheKey, payload);
      return payload;
    }
    if (Array.isArray(payload.data)) {
      dealsCacheRef.current.set(cacheKey, payload.data);
      return payload.data;
    }
    return null;
  }, []);

  const fetchDealsList = useCallback(
    async (pipelineId: string | null, isDefaultPipeline: boolean) => {
      const listKey = dealsListCacheKey(pipelineId, isDefaultPipeline);
      const cachedRows = readSharedDealsCache(listKey);
      if (cachedRows?.length && !needsClientFullList) {
        setDeals(cachedRows);
        setLoading(false);
      }

      const shared = crmCachePeek<{ data?: Deal[]; total?: number } | Deal[]>(listKey);
      if (
        shared &&
        !crmCacheShouldRevalidate(shared.ageMs) &&
        cachedRows?.length &&
        !needsClientFullList
      ) {
        return;
      }

      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
      try {
        const params = buildCrmListSearchParams({
          page: needsClientFullList ? 1 : page,
          pageSize: needsClientFullList ? CRM_BOARD_PAGE_SIZE : pageSize,
          search: deferredSearch,
          filters: needsClientFullList ? undefined : apiFilters,
          extra: {
            pipeline: isMongoObjectIdString(pipelineId)
              ? String(pipelineId).trim()
              : undefined,
            unassigned: isDefaultPipeline ? '1' : undefined,
          },
        });
        const q = params.toString();
        const res = await fetch(
          `${CRM_API_URL}/crm/deals${q ? `?${q}` : ''}`,
          { headers, cache: 'no-store' },
        );
        if (res.ok) {
          const payload = await res.json();
          crmCacheSet(listKey, payload);
          const unwrapped = unwrapCrmListPayload<Deal>(payload);
          dealsCacheRef.current.set(listKey, unwrapped.data);
          setDeals(unwrapped.data);
          setServerTotal(unwrapped.total);
        }
      } catch (err) {
        console.error('Failed to fetch deals', err);
      } finally {
        setLoading(false);
      }
    },
    [
      needsClientFullList,
      page,
      pageSize,
      deferredSearch,
      apiFilters,
      dealsListCacheKey,
      readSharedDealsCache,
    ],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    let storedUser: { assignedDealsPipeline?: string } | null = null;
    try {
      const raw = localStorage.getItem('user');
      if (raw) storedUser = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    try {
      const cachedPipelines = crmCachePeek<Pipeline[]>(crmCacheKeys.pipelines('deals'));
      if (cachedPipelines?.data?.length) {
        setPipelines(cachedPipelines.data);
      }

      let pipelinesData: Pipeline[] | null = cachedPipelines?.data ?? null;
      const shouldFetchPipelines =
        !cachedPipelines || crmCacheShouldRevalidate(cachedPipelines.ageMs);

      const cfRes = await fetch(`${CRM_API_URL}/custom-fields?module=deals`, {
        headers,
        cache: 'no-store',
      });

      if (shouldFetchPipelines) {
        const pipelinesRes = await fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, {
          headers,
          cache: 'no-store',
        });
        if (pipelinesRes.ok) {
          const data = (await pipelinesRes.json()) as Pipeline[];
          pipelinesData = data;
          setPipelines(data);
          crmCacheSet(crmCacheKeys.pipelines('deals'), data);
        }
      }

      if (cfRes.ok) ingestCustomFieldDefinitions(await cfRes.json());

      let initialPipelineId = '';
      let initialIsDefault = false;
      if (pipelinesData && pipelinesData.length > 0) {
        const resolved = resolveActivePipelineId('deals', pipelinesData, storedUser);
        initialPipelineId = resolved.pipelineId;
        initialIsDefault = resolved.isDefault;
        setSelectedPipelineId(initialPipelineId);
      }

      if (initialPipelineId) {
        await fetchDealsList(initialPipelineId, initialIsDefault);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, [ingestCustomFieldDefinitions, fetchDealsList]);

  useEffect(() => {
    setColumns(loadColumns());
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedPipelineId) return;
    const row = pipelines.find((p) => pipelineIdEq(p._id, selectedPipelineId));
    void fetchDealsList(selectedPipelineId, !!row?.isDefault);
  }, [
    selectedPipelineId,
    pipelines,
    fetchDealsList,
    viewMode,
    page,
    pageSize,
    deferredSearch,
    filters,
    dateRange,
  ]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, viewMode, filters, dateRange, selectedPipelineId]);

  useEffect(() => {
    if (selectedPipelineId && typeof window !== 'undefined') {
      localStorage.setItem('crm_active_pipeline_deals', selectedPipelineId);
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    if (!pipelines.length || !selectedPipelineId || needsClientFullList) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    const otherPipelineIds = pipelines
      .map((p) => String(p._id || ''))
      .filter((pid) => pid && !pipelineIdEq(pid, selectedPipelineId))
      .slice(0, 2);
    const runPrefetch = () => {
      void Promise.allSettled(
        otherPipelineIds
          .map((pid) => {
            const row = pipelines.find((p) => pipelineIdEq(p._id, pid));
            const isDefault = !!row?.isDefault;
            const key = dealsListCacheKey(pid, isDefault);
            if (dealsCacheRef.current.has(key) || crmCachePeek(key)) return Promise.resolve();
            const params = buildCrmListSearchParams({
              page: 1,
              pageSize: 25,
              extra: {
                pipeline: pid,
                unassigned: isDefault ? '1' : undefined,
              },
            });
            return fetch(`${CRM_API_URL}/crm/deals?${params.toString()}`, {
              headers,
              cache: 'no-store',
            }).then(async (res) => {
              if (!res.ok) return;
              const payload = await res.json();
              crmCacheSet(key, payload);
              const rows = Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                  ? payload
                  : [];
              if (rows.length) dealsCacheRef.current.set(key, rows);
            });
          }),
      );
    };
    return runWhenIdle(runPrefetch);
  }, [pipelines, selectedPipelineId, dealsListCacheKey, needsClientFullList]);

  useEffect(() => {
    const handler = () => fetchCustomFields();
    window.addEventListener('cf-reordered', handler);
    return () => window.removeEventListener('cf-reordered', handler);
  }, [fetchCustomFields]);

  useEffect(() => {
    if (isColumnsOpen) setDraftColumns(columns.map((c) => ({ ...c })));
  }, [isColumnsOpen]);

  const handleSaveColumns = () => {
    setColumns(draftColumns);
    saveColumns(draftColumns);
    setIsColumnsOpen(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setDeals((prev) => prev.filter((d) => !selectedIds.has(d._id)));
        setSelectedIds(new Set());
        setShowConfirmDelete(false);
        invalidateCrmAfterMutation('deals', 'workspace', 'attention');
      }
    } catch (err) {
      console.error('Bulk delete failed', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    const currentItems = paginated.map((d) => d._id);
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

  const handleApplyView = (view: SavedViewData | null) => {
    if (!view) { setFilters([]); return; }
    setFilters(view.filters || []);
    if (view.columns?.length) {
      const viewColMap = new Map(view.columns.map((c: { key: string; visible: boolean }) => [c.key, c]));
      const nextCols = columns.map(c => ({ ...c, visible: viewColMap.has(c.key) ? viewColMap.get(c.key)!.visible : c.visible }));
      setColumns(nextCols);
      saveColumns(nextCols);
    }
    setPage(1);
  };

  const handleAddCustomField = async () => {
    if (!addColName.trim()) return;
    setAddColSaving(true);
    const token = localStorage.getItem('token');
    try {
      const key = addColName.trim().toLowerCase().replace(/\s+/g, '_');
      const res = await fetch(`${CRM_API_URL}/custom-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: addColName.trim(), key, type: addColType, module: 'deals', required: false }),
      });
      if (res.ok) {
        setAddColName('');
        setAddColType('text');
        setShowAddColPopover(false);
        await fetchCustomFields();
        window.dispatchEvent(new CustomEvent('cf-reordered'));
      }
    } catch (err) { console.error(err); }
    finally { setAddColSaving(false); }
  };

  const handleCfDrop = async (overIndex: number) => {
    const fromIndex = cfDragRef.current;
    cfDragRef.current = null;
    setCfDragVisualIdx(null);
    setCfDragOverVisualIdx(null);
    if (fromIndex === null || fromIndex === overIndex) return;
    const reordered = [...customFieldDefs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(overIndex, 0, moved);
    setCustomFieldDefs(reordered);
    const token = localStorage.getItem('token');
    try {
      await fetch(`${CRM_API_URL}/custom-fields/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: reordered.map((f: any) => f._id) }),
      });
      await fetchCustomFields();
      window.dispatchEvent(new CustomEvent('cf-reordered'));
    } catch (err) { console.error(err); }
  };

  const handleExport = async () => {
    setExporting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/export/deals`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const csvContent = await res.text();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `deals_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageName: string) => {
    e.preventDefault();
    if (!canMoveDealStage) return;
    const dealId = e.dataTransfer.getData('dealId');
    if (!dealId) return;

    const targetStage = pipelineStages.find(s => s.name === stageName);
    const newProbability = targetStage?.probability ?? undefined;

    const updatedDeals = deals.map(d =>
      d._id === dealId ? { ...d, status: stageName, probability: newProbability ?? d.probability } : d
    );
    setDeals(updatedDeals);

    try {
      const body: any = { stage: stageName };
      if (newProbability !== undefined) body.probability = newProbability;

      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to update deal status');
    } catch (err) {
      console.error(err);
      alert('Failed to update deal status');
      fetchData();
    }
  };

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => pipelineIdEq(p._id, selectedPipelineId)),
    [pipelines, selectedPipelineId],
  );

  const pipelineStages = useMemo(
    () =>
      selectedPipeline
        ? [...(selectedPipeline.stages || [])].sort((a, b) => a.order - b.order)
        : [],
    [selectedPipeline],
  );

  const pipelineDeals = useMemo(
    () =>
      deals.filter((d) => {
        const dealPipeline = d.pipeline != null ? String(d.pipeline) : '';
        const targetPipeline = selectedPipelineId ? String(selectedPipelineId) : '';
        return (
          dealPipeline === targetPipeline ||
          (!dealPipeline && selectedPipeline?.isDefault)
        );
      }),
    [deals, selectedPipelineId, selectedPipeline],
  );

  const filteredDeals = useMemo(() => {
    if (!needsClientFullList) {
      return pipelineDeals;
    }
    return applyFilters(pipelineDeals, apiFilters, filterProperties).filter((d) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const org =
        typeof d.organization === 'string'
          ? d.organization
          : (d.organization as { name?: string } | undefined)?.name || '';
      const title = (d.title || '').toLowerCase();
      const stage = (d.status || (d as { stage?: string }).stage || '').toLowerCase();
      const owner = (d.dealOwner || '').toLowerCase();
      const hay = [
        title,
        org.toLowerCase(),
        stage,
        owner,
        String(d.dealValue ?? ''),
        String(d.probability ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pipelineDeals, apiFilters, filterProperties, search, needsClientFullList]);

  const boardDeals = filteredDeals;
  const boardDealsByStage = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    for (const deal of boardDeals) {
      const stageName = String(deal.status || (deal as any).stage || '').trim();
      if (!stageName) continue;
      const bucket = grouped.get(stageName);
      if (bucket) bucket.push(deal);
      else grouped.set(stageName, [deal]);
    }
    return grouped;
  }, [boardDeals]);

  const paginated = useMemo(
    () =>
      needsClientFullList
        ? boardDeals.slice((page - 1) * pageSize, page * pageSize)
        : boardDeals,
    [needsClientFullList, boardDeals, page, pageSize],
  );

  const listPaginationTotal = needsClientFullList
    ? filteredDeals.length
    : serverTotal;

  const visibleCols = useMemo(() => {
    const cols = columns.filter((c) => c.visible);
    if (canViewCrmRevenue) return cols;
    return cols.filter(
      (c) =>
        c.key !== 'dealValue' &&
        c.key !== 'expectedDealValue' &&
        c.key !== 'annualRevenue',
    );
  }, [columns, canViewCrmRevenue]);

  useEffect(() => {
    setStageVisibleCounts({});
  }, [selectedPipelineId, search, filters, dateRange]);

  const isAllPaginatedSelected = useMemo(
    () =>
      paginated.length > 0 && paginated.every((d) => selectedIds.has(d._id)),
    [paginated, selectedIds],
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm('Move this deal to Trash? Only an admin can restore it.')) return;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to delete deal:', err);
    }
  };

  const renderCell = (deal: Deal, key: string) => {
    switch (key) {
      case 'title': {
        const title = deal.title || 'Untitled Deal';
        return (
          <CrmListPersonCell
            name={title}
            initials={title.slice(0, 2)}
          />
        );
      }
      case 'organization': {
        const orgName = typeof deal.organization === 'string' ? deal.organization : deal.organization?.name;
        return <CrmListOrgCell name={orgName || '—'} />;
      }
      case 'dealValue': {
        if (!canViewCrmRevenue) return <span className="text-sm text-[#707070]">—</span>;
        const inrVal = Number(deal.dealValueINR) || Number(deal.dealValue) || 0;
        const isMonthly = String((deal as any).pricingType || '').toLowerCase() === 'monthly';
        return (
          <span className="text-sm font-semibold text-[#1f2020]">
            ₹{inrVal.toLocaleString('en-IN')}
            {isMonthly ? <span className="ml-1 text-[10px] font-medium uppercase text-[#707070]">/mo</span> : null}
          </span>
        );
      }
      case 'status': {
        const stageLabel = deal.status || (deal as any).stage || 'New Deal';
        return <CrmListStatusBadge label={stageLabel} />;
      }
      case 'probability': {
        const prob = deal.probability ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 min-w-[72px] flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#2f80ed] transition-all"
                style={{ width: `${prob}%` }}
              />
            </div>
            <span className="w-9 text-xs font-medium text-[#707070]">{prob}%</span>
          </div>
        );
      }
      case 'priority': {
        const p = deal.priority || 'Medium';
        const tone =
          /high|urgent/i.test(p) ? 'danger' : /low/i.test(p) ? 'secondary' : 'warning';
        return <CrmSoftBadge label={p} tone={tone} />;
      }
      case 'dealOwner':
      case 'owner':
        return <CrmListOwnerCell name={deal.dealOwner || ''} />;
      case 'expectedClosureDate': return (
        <div className="flex items-center gap-1.5 text-sm text-[#707070]">
          <CrmIcon.Calendar size={14} aria-hidden />
          {deal.expectedClosureDate ? new Date(deal.expectedClosureDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
        </div>
      );
      case 'createdAt': return <span className="text-sm text-[#707070]">{deal.createdAt ? new Date(deal.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>;
      default: {
        if (key.startsWith('cf_')) {
          const cfKey = key.replace('cf_', '');
          const def = customFieldDefs.find((f: any) => f.key === cfKey);
          const raw = deal.customFields?.[cfKey];
          return (
            <span className="text-text-muted font-medium text-sm inline-flex min-w-0 max-w-[220px]">
              <CrmCustomFieldValue value={raw} type={def?.type} />
            </span>
          );
        }
        return null;
      }
    }
  };

  return (
    <div className={CRM_LIST_PAGE}>
      <div className="flex flex-1 h-full relative min-w-0">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <CrmPageHeader
            bordered={false}
            title="Deals"
            badge={<CrmCountBadge>{filteredDeals.length}</CrmCountBadge>}
            breadcrumbs={[
              { label: 'Home', href: '/crm/workspace/summary' },
              { label: 'Deals' },
            ]}
            actions={
              <CrmHeaderTools
                leading={
                  selectedIds.size > 0 && hasAccess('deals:delete') ? (
                    <CrmButton
                      variant="danger"
                      onClick={() => setShowConfirmDelete(true)}
                      leftIcon={<CrmIcon.Trash size={14} />}
                    >
                      Delete {selectedIds.size}
                    </CrmButton>
                  ) : null
                }
                canExport={hasAccess('deals:export')}
                onExport={handleExport}
                exporting={exporting}
                onRefresh={() => void fetchDealsList(selectedPipelineId, !!(pipelines.find((p) => pipelineIdEq(p._id, selectedPipelineId))?.isDefault))}
                canImport={hasAccess('deals:import')}
                onImport={() => setIsImportModalOpen(true)}
                trailing={
                  hasAccess('deals:write') && viewMode === 'list' ? (
                    <CrmButton
                      variant="icon"
                      onClick={() => setIsColumnsOpen(true)}
                      title="Edit Columns"
                      leftIcon={<CrmIcon.Settings size={16} />}
                    />
                  ) : null
                }
              />
            }
          />

          <CrmListToolbar
            filter={
              <CRMFilterBar module="deals" filters={filters} onChange={setFilters} onClear={() => setFilters([])} onPropertiesReady={setFilterProperties} pipelineId={selectedPipelineId} />
            }
            searchProps={{
              placeholder: 'Search Keyword',
              value: search,
              onChange: (e) => {
                setSearch(e.target.value);
                setPage(1);
              },
            }}
            leftExtra={
              <>
                <CRMSavedViews module="deals" currentFilters={filters} currentColumns={columns} onApplyView={handleApplyView} />
                <CRMDateRangePicker onChange={setDateRange} compact />
                {!(user as any)?.assignedDealsPipeline && (
                  <div className="relative group">
                    <CrmIcon.GitBranch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <select
                      value={selectedPipelineId ? String(selectedPipelineId) : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedPipelineId(v);
                        setPage(1);
                        const row = pipelines.find((p) => pipelineIdEq(p._id, v));
                        void fetchDealsList(v || null, !!row?.isDefault);
                      }}
                      className={cn(CRM_TOOLBAR_SELECT, "min-w-[160px] cursor-pointer pl-9 pr-8")}
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
                )}
              </>
            }
            right={
              <>
                <CrmViewToggle
                  value={viewMode}
                  onChange={(mode) => { setViewMode(mode); setPage(1); }}
                  modes={['list', 'grid', 'kanban', 'calendar']}
                />
                {hasAccess('deals:write') && (
                  <CrmButton
                    variant="primary"
                    onClick={() => setIsDealPanelOpen(true)}
                    leftIcon={<CrmIcon.AddFilled size={16} />}
                  >
                    Add Deal
                  </CrmButton>
                )}
              </>
            }
          />

          <div className="flex-1 overflow-auto custom-scrollbar">
            {loading ? (
              <div className="w-full h-64 flex items-center justify-center"><Loader2 size={40} className="animate-spin text-text-muted" /></div>
            ) : viewMode === 'kanban' ? (
          <CrmKanbanBoard className="min-h-full bg-[#f7f8f9] p-4">
            {pipelineStages.length > 0 ? (
              pipelineStages.map(stage => {
                const stageDeals = boardDealsByStage.get(stage.name) || [];
                const visibleCount = stageVisibleCounts[stage.name] || INITIAL_STAGE_CARD_LIMIT;
                const visibleStageDeals = stageDeals.slice(0, visibleCount);
                const inrTotal = canViewCrmRevenue
                  ? stageDeals.reduce((sum, d) => sum + (Number(d.dealValueINR) || Number(d.dealValue) || 0), 0)
                  : 0;
                return (
                  <CrmKanbanColumn
                    key={stage.name}
                    title={stage.name}
                    stageKey={stage.name}
                    summary={
                      <>
                        {stageDeals.length} Deal{stageDeals.length === 1 ? '' : 's'}
                        {canViewCrmRevenue ? ` - ₹${inrTotal.toLocaleString('en-IN')}` : ''}
                      </>
                    }
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, stage.name)}
                    onAdd={hasAccess('deals:write') ? () => setIsDealPanelOpen(true) : undefined}
                    style={{ minHeight: 400 }}
                  >
                      {visibleStageDeals.map((deal) => {
                        const dealTitle = deal.title || (typeof deal.organization === 'string' ? deal.organization : deal.organization?.name) || 'Untitled Deal';
                        const orgLine = typeof deal.organization === 'string' ? deal.organization : deal.organization?.name || '';
                        const titleParts = dealTitle.trim().split(/\s+/).filter(Boolean);
                        const i1 = (titleParts[0]?.[0] || '?').toUpperCase();
                        const i2 = (titleParts[1]?.[0] || (titleParts[0] && titleParts[0].length > 1 ? titleParts[0][1] : '') || '').toUpperCase();

                            return (
                              <CrmKanbanCard
                                key={deal._id}
                                stageKey={stage.name}
                                draggable={canMoveDealStage}
                                onDragStart={canMoveDealStage ? (e) => handleDragStart(e, deal._id) : undefined}
                                className={cn(
                                  canMoveDealStage ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                                )}
                                onClick={() => router.push(`/crm/deals/${deal._id}`)}
                              >
                                <CrmKanbanCardHead
                                  tone={crmKanbanAvatarTone(dealTitle + deal._id)}
                                  initials={`${i1}${i2}`}
                                  title={dealTitle}
                                  trailing={
                                    hasAccess('deals:delete') ? (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleDelete(deal._id); }}
                                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-rose-50 hover:text-rose-500"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    ) : null
                                  }
                                />
                                <CrmKanbanMetaList>
                                  {canViewCrmRevenue ? (
                                    <CrmKanbanMetaRow icon={<Banknote size={15} strokeWidth={1.75} />}>
                                      ₹{(Number(deal.dealValueINR) || Number(deal.dealValue) || 0).toLocaleString('en-IN')}
                                    </CrmKanbanMetaRow>
                                  ) : null}
                                  {orgLine ? (
                                    <CrmKanbanMetaRow icon={<MapPin size={15} strokeWidth={1.75} />}>
                                      {orgLine}
                                    </CrmKanbanMetaRow>
                                  ) : null}
                                  {deal.priority ? (
                                    <CrmKanbanMetaRow icon={<Tag size={15} strokeWidth={1.75} />}>
                                      {deal.priority}
                                    </CrmKanbanMetaRow>
                                  ) : null}
                                  {deal.expectedClosureDate ? (
                                    <CrmKanbanMetaRow icon={<Calendar size={15} strokeWidth={1.75} />}>
                                      {new Date(deal.expectedClosureDate).toLocaleDateString()}
                                    </CrmKanbanMetaRow>
                                  ) : null}
                                </CrmKanbanMetaList>
                                <CrmKanbanCardFooter
                                  left={
                                    <CrmKanbanAvatar size="sm">
                                      {(orgLine?.[0] || dealTitle[0] || 'D').toUpperCase()}
                                    </CrmKanbanAvatar>
                                  }
                                  actions
                                />
                              </CrmKanbanCard>
                            );
                          })}
                        {visibleStageDeals.length < stageDeals.length && (
                          <button
                            type="button"
                            onClick={() =>
                              setStageVisibleCounts((prev) => ({
                                ...prev,
                                [stage.name]:
                                  (prev[stage.name] || INITIAL_STAGE_CARD_LIMIT) +
                                  STAGE_CARD_INCREMENT,
                              }))
                            }
                            className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-left text-xs font-semibold text-primary transition hover:bg-primary/5 shadow-[var(--crm-shadow-input)]"
                          >
                            Show more deals
                          </button>
                        )}
                  </CrmKanbanColumn>
                    );
                  })
                ) : (
                  <div className="w-full flex flex-col items-center justify-center text-text-muted py-20">
                    <GitBranch size={48} className="mb-4 opacity-50" />
                    <h3 className="text-lg font-bold text-text-main">No Pipeline Available</h3>
                    <p className="max-w-xs text-center mt-2">Create a pipeline in Settings to get started.</p>
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
                        {visibleCols.map(col => (
                          <th
                            key={col.key}
                            className={`sticky top-0 z-10 cursor-grab active:cursor-grabbing ${dragOverColKey === col.key ? 'relative z-20 border-l-2 border-primary bg-primary/5' : ''}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('crm/table-col-key', col.key);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverColKey !== col.key) setDragOverColKey(col.key);
                            }}
                            onDragLeave={() => setDragOverColKey(null)}
                            onDragEnd={() => setDragOverColKey(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverColKey(null);
                              const dropKey = col.key;
                              const tableColKey = e.dataTransfer.getData('crm/table-col-key');
                              if (tableColKey && tableColKey !== dropKey) {
                                const fromIdx = columns.findIndex(c => c.key === tableColKey);
                                const dropIdx = columns.findIndex(c => c.key === dropKey);
                                if (fromIdx !== -1 && dropIdx !== -1) {
                                  const reordered = [...columns];
                                  const [moved] = reordered.splice(fromIdx, 1);
                                  reordered.splice(dropIdx, 0, moved);
                                  setColumns(reordered);
                                  saveColumns(reordered);
                                }
                                return;
                              }
                              const tableHelperKey = e.dataTransfer.getData('crm/table-col-key-helper');
                              if (tableHelperKey && tableHelperKey !== dropKey) {
                                const fromIdx = columns.findIndex(c => c.key === tableHelperKey);
                                const dropIdx = columns.findIndex(c => c.key === dropKey);
                                if (fromIdx !== -1 && dropIdx !== -1) {
                                  const reordered = [...columns];
                                  reordered[fromIdx].visible = true;
                                  const [moved] = reordered.splice(fromIdx, 1);
                                  reordered.splice(dropIdx, 0, moved);
                                  setColumns(reordered);
                                  saveColumns(reordered);
                                }
                              }
                            }}
                          >
                            <span className="pointer-events-none">{col.label}</span>
                          </th>
                        ))}
                        <th className="crm-table-actions sticky top-0 z-10 text-right text-[13px] font-semibold text-[#1f2020]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr><td colSpan={visibleCols.length + 2} className="py-20 text-center text-sm font-medium text-[#707070]">No deals found</td></tr>
                      ) : (
                        paginated.map(deal => (
                          <tr
                            key={deal._id}
                            className={`group cursor-pointer transition-colors ${selectedIds.has(deal._id) ? 'crm-table-row-selected' : ''}`}
                            onClick={() => router.push(`/crm/deals/${deal._id}`)}
                          >
                            <td className="crm-table-check">
                              <CrmTableCheck
                                checked={selectedIds.has(deal._id)}
                                onChange={(e) => toggleSelect(deal._id, e as React.MouseEvent)}
                                ariaLabel={selectedIds.has(deal._id) ? 'Deselect deal' : 'Select deal'}
                              />
                            </td>
                            {visibleCols.map(col => <td key={col.key}>{renderCell(deal, col.key)}</td>)}
                            <td className="crm-table-actions">
                              <CrmTableActionMenu
                                onEdit={() => router.push(`/crm/deals/${deal._id}`)}
                                onDelete={
                                  hasAccess('deals:delete')
                                    ? () => handleDelete(deal._id)
                                    : undefined
                                }
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </CrmTable>
              </CrmTableShell>
                <Pagination total={listPaginationTotal} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
              </>
            ) : viewMode === 'grid' ? (
              <div className="flex flex-col gap-4 p-4">
                {paginated.length === 0 ? (
                  <div className="rounded-[5px] border border-[#e2e8f0] bg-white py-20 text-center text-sm font-medium text-[#707070]">
                    No deals found
                  </div>
                ) : (
                  <CrmRecordCardGrid>
                    {paginated.map((deal) => {
                      const dealTitle =
                        deal.title ||
                        (typeof deal.organization === 'string' ? deal.organization : deal.organization?.name) ||
                        'Untitled Deal';
                      const orgName =
                        typeof deal.organization === 'string' ? deal.organization : deal.organization?.name || '';
                      const titleParts = dealTitle.trim().split(/\s+/).filter(Boolean);
                      const i1 = (titleParts[0]?.[0] || '?').toUpperCase();
                      const i2 = (
                        titleParts[1]?.[0] ||
                        (titleParts[0] && titleParts[0].length > 1 ? titleParts[0][1] : '')
                      ).toUpperCase();
                      const stageLabel = deal.status || (deal as any).stage || 'New Deal';
                      const inrValue = Number(deal.dealValueINR) || Number(deal.dealValue) || 0;
                      const meta = [
                        canViewCrmRevenue
                          ? {
                              key: 'value',
                              icon: <Banknote size={15} strokeWidth={1.75} />,
                              label: `₹${inrValue.toLocaleString('en-IN')}`,
                            }
                          : null,
                        orgName
                          ? { key: 'org', icon: <Building2 size={15} strokeWidth={1.75} />, label: orgName }
                          : null,
                        deal.priority
                          ? { key: 'priority', icon: <Tag size={15} strokeWidth={1.75} />, label: deal.priority }
                          : null,
                        deal.expectedClosureDate
                          ? {
                              key: 'close',
                              icon: <Calendar size={15} strokeWidth={1.75} />,
                              label: new Date(deal.expectedClosureDate).toLocaleDateString(undefined, {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              }),
                            }
                          : null,
                      ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string }[];

                      return (
                        <CrmRecordCard
                          key={deal._id}
                          markShape="square"
                          initials={`${i1}${i2}`}
                          toneSeed={`${dealTitle}${deal._id}`}
                          title={dealTitle}
                          subtitle={orgName || undefined}
                          selectable
                          selected={selectedIds.has(deal._id)}
                          onSelectedChange={() => toggleSelect(deal._id)}
                          onClick={() => router.push(`/crm/deals/${deal._id}`)}
                          actions={
                            <CrmTableActionMenu
                              onEdit={() => router.push(`/crm/deals/${deal._id}`)}
                              onDelete={hasAccess('deals:delete') ? () => handleDelete(deal._id) : undefined}
                            />
                          }
                          headTrailing={<CrmListStatusBadge label={stageLabel} />}
                          meta={meta}
                          footerLeft={
                            <span className="text-xs font-medium text-[#707070]">
                              {deal.probability ?? 0}% probability
                            </span>
                          }
                          footerRight={
                            deal.dealOwner ? (
                              <CrmKanbanAvatar size="sm">
                                {deal.dealOwner
                                  .split(/\s+/)
                                  .map((p) => p[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </CrmKanbanAvatar>
                            ) : null
                          }
                        />
                      );
                    })}
                  </CrmRecordCardGrid>
                )}
                <Pagination
                  total={listPaginationTotal}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
              </div>
            ) : (
              <CRMCalendarView
                  items={filteredDeals}
                  titleField="title"
                  dateField="expectedClosureDate"
                  onItemClick={(item) => router.push(`/crm/deals/${item._id}`)}
                />
            )}
          </div>
        </div>
      </div>

      <CrmPropertyManagerModal
        isOpen={isColumnsOpen}
        onClose={() => setIsColumnsOpen(false)}
        onSave={handleSaveColumns}
      >
        <div className="space-y-1">
          {draftColumns.map((col, i) => (
            <div
              key={col.key}
              draggable
              onDragStart={() => { cfDragRef.current = i; setCfDragVisualIdx(i); }}
              onDragOver={e => { e.preventDefault(); setCfDragOverVisualIdx(i); }}
              onDrop={(e) => { e.preventDefault(); handleCfDrop(i); }}
              onDragEnd={() => { cfDragRef.current = null; setCfDragVisualIdx(null); setCfDragOverVisualIdx(null); }}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] border p-2.5 transition-all cursor-grab active:cursor-grabbing ${cfDragOverVisualIdx === i ? 'border-[var(--primary)] bg-[var(--primary-light)]' : cfDragVisualIdx === i ? 'border-dashed border-[var(--border-color)] opacity-40' : 'border-transparent hover:bg-[var(--surface-dim)]'
                }`}
            >
              <GripVertical size={14} className="shrink-0 text-[var(--text-muted)]" />
              <button
                type="button"
                onClick={() => setDraftColumns(prev => prev.map(c => c.key === col.key ? { ...c, visible: !c.visible } : c))}
                className={`flex flex-1 items-center justify-between rounded-[var(--radius-md)] p-2 text-sm font-medium transition-all ${col.visible ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
              >
                <span className="truncate">{col.label}</span>
                <div className={`relative h-5 w-9 rounded-full transition-all ${col.visible ? 'bg-[var(--primary)]' : 'bg-[var(--border-color)]'}`}>
                  <div className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${col.visible ? 'right-1' : 'left-1'}`} />
                </div>
              </button>
              {col.key.startsWith('cf_') && isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const cfKey = col.key.replace('cf_', '');
                    const def = customFieldDefs.find(f => f.key === cfKey);
                    if (def) setCfMergeDeleteField({ _id: def._id, name: def.name, key: def.key });
                  }}
                  className="shrink-0 rounded-[var(--radius-md)] p-1.5 text-[var(--text-muted)] transition-all hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                  title="Move to Trash"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </CrmPropertyManagerModal>

      <CrmBulkDeleteConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleBulkDelete}
        title="Delete deals permanently?"
        loading={isDeleting}
        description={
          <>
            You are about to remove{' '}
            <span className="font-medium text-[var(--error)]">{selectedIds.size} records</span>. This action is final and
            cannot be undone.
          </>
        }
      />

      <DealCreatePanel
        isOpen={isDealPanelOpen}
        onClose={() => setIsDealPanelOpen(false)}
        initialPipelineId={selectedPipelineId}
        onSuccess={fetchData}
      />
      {isImportModalOpen && (
        <ImportModal isOpen onClose={() => setIsImportModalOpen(false)} onSuccess={fetchData} type="deals" />
      )}

      <DeleteCustomFieldMergeDialog
        open={!!cfMergeDeleteField}
        onOpenChange={(open) => !open && setCfMergeDeleteField(null)}
        field={cfMergeDeleteField}
        module="deals"
        siblingCustomFields={customFieldDefs
          .filter((f: { _id: string }) => f._id !== cfMergeDeleteField?._id)
          .map((f: { _id: string; name: string; key: string }) => ({
            _id: f._id,
            name: f.name,
            key: f.key,
          }))}
        onSuccess={() => {
          setCfMergeDeleteField(null);
          fetchCustomFields();
          window.dispatchEvent(new CustomEvent('cf-reordered'));
        }}
      />
    </div>
  );
}
