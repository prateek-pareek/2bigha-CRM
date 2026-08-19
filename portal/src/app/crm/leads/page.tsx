"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Plus,
  LayoutGrid,
  List,
  Calendar,
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Settings2,
  Columns3,
  Trash2,
  Check,
  X,
  ChevronRight,
  Facebook,
  Linkedin,
  Users,
  Loader2,
  Upload,
  FileSpreadsheet,
  GitBranch,
  Mail,
  User,
  Building2,
  Phone,
  Globe,
  Briefcase,
  ChevronDown,
  GripVertical,
  Tag,
  Target,
  Eye,
  EyeOff,
  Timer,
  MailOpen,
  Reply,
  MailX,
  FilterX,
  Activity,
  MailPlus,
  MapPin,
  IndianRupee,
  Banknote,
} from 'lucide-react';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import CRMSavedViews, { SavedViewData } from '@/components/crm/segments/CRMSavedViews';
import Pagination from '@/components/suite/shell/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import CRMCalendarView from '@/components/crm/calendar/CRMCalendarView';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import CallLeadModal from '@/components/crm/records/detail/CallLeadModal';
import LeadActivityPopup from '@/components/crm/records/detail/LeadActivityPopup';
import WebsiteLeadsPanel from '@/components/crm/records/list/WebsiteLeadsPanel';
import { contactWhatsappUrl, contactWhatsappWaId } from '@/lib/crm/crm-messaging-links';
import LeadCreatePanel from '@/components/crm/records/create/LeadCreatePanel';
import CRMDateRangePicker from '@/components/crm/records/forms/CRMDateRangePicker';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { buildCrmListSearchParams, mergeDateRangeFilter, mergeLeadCategoryFilter, CRM_BOARD_PAGE_SIZE, unwrapCrmListPayload } from '@/lib/crm/list-query';
import {
  hasOutboundEmailSent,
  type CrmEmailEngagementStats,
} from '@/lib/crm/crmEmailEngagementStats';
import { fetchEmailEngagementBatch } from '@/lib/crm/fetchEmailEngagementBatch';
import {
  CRM_CARD_DEFAULT_FIELDS,
  loadCrmCardCustomizations,
  resolveCrmCardFieldValue,
} from '@/lib/crm/card-customization';
import { CRM_API_URL } from '@/lib/crm/config';
import {
  crmCacheGet,
  crmCacheKeys,
  crmCachePeek,
  crmCacheSet,
  crmCacheShouldRevalidate,
  resolveActivePipelineId,
} from '@/lib/crm/shared/prefetch-cache';
import { invalidateCrmAfterMutation } from '@/lib/crm/shared/invalidate-on-mutation';
import { cn } from '@/lib/utils';
import CrmEmailEngagementIcons from '@/components/crm/email/engagement/CrmEmailEngagementIcons';
import { BulkEmailToolbarButton } from '@/components/crm/email/composer/BulkEmailToolbarButton';
import LeadStageRulesPanel from '@/components/crm/records/detail/LeadStageRulesPanel';
import { buildBulkEmailRecipients } from '@/lib/crm/bulk-email';

/** Hover/focus hint for icon-only CRM toolbar filters (native title is slow; this matches CustomFieldModal-style tips). */
const CRM_ICON_FILTER_TIP =
  'pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 w-max max-w-[min(260px,calc(100vw-32px))] -translate-x-1/2 rounded-lg bg-text-main px-2.5 py-1.5 text-left text-[10px] font-semibold leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  CrmScopeToggle,
  CrmTableShell,
  CrmTable,
  CrmListPersonCell,
  CrmListOrgCell,
  CrmListOwnerCell,
  CrmListStatusBadge,
  CrmTableCheck,
  CrmTableActionMenu,
  CrmHoverActionIcon,
  CrmKanbanBoard,
  CrmKanbanColumn,
  CrmKanbanCard,
  CrmKanbanCardHead,
  CrmKanbanMetaRow,
  CrmKanbanMetaList,
  CrmKanbanCardFooter,
  CrmKanbanAvatar,
  crmKanbanAvatarTone,
} from '@/components/crm/ui';
import { CrmIcon, CrmNavIcon } from '@/lib/crm/shared/icons';
import { CRM_LIST_PAGE, CRM_MENU_ITEM, CRM_TOOLBAR_SELECT, CRM_TOOLBAR_ICON_GROUP, CRM_TOOLBAR_ICON_BTN, CRM_TOOLBAR_ICON_BTN_ACTIVE, CRM_TOOLBAR_CHIP, CRM_TOOLBAR_CHIP_ACTIVE, CRM_BTN_MANAGE_COLUMNS } from '@/lib/crm/ui';

const ImportModal = dynamic(() => import('@/components/crm/records/create/ImportModal'), { ssr: false });

interface Lead {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mobileNo?: string;
  organization: string;
  status: string; // This is the stage name
  stage?: string;
  callStatus?: string;
  source?: string;
  pipeline?: string;
  priority?: string;
  createdAt?: string;
  customFields?: Record<string, any>;
  leadOwner?: string;
  createdBy?: string;
  createdByName?: string;
  leadScore?: number;
  lastEmailActivityAt?: string | null;
  clientId?: string;
  leadCategory?: string;
  group?: string;
  notes?: string;
}

interface Column {
  key: string;
  label: string;
  visible: boolean;
}

const BUILT_IN_COLUMNS: Omit<Column, 'visible'>[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'organization', label: 'Organization' },
  { key: 'status', label: 'Status' },
  { key: 'stage', label: 'Stage' },
  { key: 'callStatus', label: 'Call Status' },
  { key: 'source', label: 'Lead Source' },
  { key: 'leadCategory', label: 'Lead Type' },
  { key: 'group', label: 'Group' },
  { key: 'priority', label: 'Priority' },
  { key: 'leadOwner', label: 'Lead Owner' },
  { key: 'createdByName', label: 'Created By' },
  { key: 'leadScore', label: 'Score' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'createdAt', label: 'Created Date' },
  { key: 'lastEmailActivityAt', label: 'Last Email Activity' },
];

const STORAGE_KEY = 'leads_columns_v2';

/** Matches Mongo ObjectId hex strings; avoids sending bad `pipeline` query params. */
function isMongoObjectIdString(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value.trim());
}

function leadScoreBadgeClass(score: number) {
  if (score >= 70) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (score >= 40) return 'bg-amber-50 text-amber-900 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-[var(--border-color)]';
}

function loadColumns(): Column[] {
  if (typeof window === 'undefined') return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: true }));
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: Column[] = JSON.parse(saved);
      // Only keep columns that are either built-in or custom (cf_ or custom_)
      const builtInKeys = new Set(BUILT_IN_COLUMNS.map(c => c.key));
      const filtered = parsed.filter(c => builtInKeys.has(c.key) || c.key.startsWith('cf_') || c.key.startsWith('custom_'));
      
      const filteredKeys = new Set(filtered.map(c => c.key));
      const missingBuiltIn = BUILT_IN_COLUMNS.filter(c => !filteredKeys.has(c.key)).map(c => ({ ...c, visible: true }));
      
      return [...filtered, ...missingBuiltIn];
    }
  } catch { /* ignore */ }
  return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: true }));
}

function saveColumns(cols: Column[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

const VIEW_MODE_KEY = 'crm_leads_view_mode_v1';
const INITIAL_STAGE_CARD_LIMIT = 100;
const STAGE_CARD_INCREMENT = 100;
/** Board bucket for leads whose stage/status does not match any pipeline column. */
const BOARD_UNASSIGNED_STAGE_KEY = '__unassigned__';

function normalizeBoardStageKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Map a lead stage/status onto a pipeline column name (case/punctuation tolerant). */
function resolveBoardStageName(
  leadStage: string | undefined | null,
  pipelineStageNames: string[],
): string {
  const raw = String(leadStage || '').trim();
  if (!raw || !pipelineStageNames.length) return BOARD_UNASSIGNED_STAGE_KEY;
  const exact = pipelineStageNames.find((s) => s === raw);
  if (exact) return exact;
  const want = normalizeBoardStageKey(raw);
  const hit = pipelineStageNames.find((s) => normalizeBoardStageKey(s) === want);
  return hit || BOARD_UNASSIGNED_STAGE_KEY;
}

export default function LeadsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar'>(() => {
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  /** Lead-type tab bar (All Leads / Reference / Investor / Lead / Buyer lead, etc.) — '' = All Leads. */
  const [leadCategoryTabs, setLeadCategoryTabs] = useState<Array<{ _id: string; label: string }>>([]);
  const [activeLeadCategory, setActiveLeadCategory] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [serverTotal, setServerTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<Column[]>([]);
  const [newColLabel, setNewColLabel] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isLeadPanelOpen, setIsLeadPanelOpen] = useState(false);
  const [emailLead, setEmailLead] = useState<Lead | null>(null);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [showWebsiteLeads, setShowWebsiteLeads] = useState(false);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [showMyLeadsOnly, setShowMyLeadsOnly] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [lastActivityFilter, setLastActivityFilter] = useState<'all' | 'today' | 'last7' | 'last30' | 'last90' | 'no-activity'>('all');
  const [emailOpenFilterMode, setEmailOpenFilterMode] = useState<
    | 'all'
    | 'opened'
    | 'opened-in-days'
    | 'last-sent-unopened-days'
    | 'no-open-since-days'
  >('all');
  const [emailOpenFilterDays, setEmailOpenFilterDays] = useState(7);
  const [emailReplyFilter, setEmailReplyFilter] = useState<'all' | 'replied' | 'not-replied'>('all');
  const [emailSentFilter, setEmailSentFilter] = useState<'all' | 'not-sent'>('all');
  const [leadEmailStatsById, setLeadEmailStatsById] = useState<Record<string, CrmEmailEngagementStats>>({});
  const [exporting, setExporting] = useState(false);
  const { hasAccess, user, isAdmin } = usePermissions();
  const canMoveLeadsAcrossPipelines =
    hasAccess('leads:write') || hasAccess('leads:move_pipeline');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [bulkMovePipelineId, setBulkMovePipelineId] = useState('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOwner, setAssignOwner] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [stageRulesPanelOpen, setStageRulesPanelOpen] = useState(false);

  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const kanbanBoardRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const deleteAnimationTimersRef = useRef<Map<string, number>>(new Map());
  const [exitingLeadIds, setExitingLeadIds] = useState<Set<string>>(new Set());

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const d = params.get('date');
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        setDateRange({ from: d, to: d });
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const handleKanbanDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const board = kanbanBoardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const EDGE = 120;
    const SPEED = 12;
    const x = e.clientX;
    let velocity = 0;
    if (x < rect.left + EDGE) {
      velocity = -SPEED * (1 - (x - rect.left) / EDGE);
    } else if (x > rect.right - EDGE) {
      velocity = SPEED * (1 - (rect.right - x) / EDGE);
    }
    stopAutoScroll();
    if (velocity !== 0) {
      const scroll = () => {
        board.scrollLeft += velocity;
        autoScrollRafRef.current = requestAnimationFrame(scroll);
      };
      autoScrollRafRef.current = requestAnimationFrame(scroll);
    }
  };

  // Card Customization: load fields from localStorage and keep in sync
  const [cardFields, setCardFields] = useState<string[]>(() => {
    if (typeof window === 'undefined') return CRM_CARD_DEFAULT_FIELDS.leads;
    return loadCrmCardCustomizations().leads;
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'crmCardCustomizations' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.leads) setCardFields(parsed.leads);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Custom fields state for column manager
  const [customFieldDefs, setCustomFieldDefs] = useState<any[]>([]);
  const [customFieldsLoaded, setCustomFieldsLoaded] = useState(false);
  const leadsCacheRef = useRef<Map<string, Lead[]>>(new Map());

  const readSharedLeadsCache = useCallback(
    (cacheKey: string): Lead[] | null => {
      const local = leadsCacheRef.current.get(cacheKey);
      if (local?.length) return local;
      const payload = crmCacheGet<{ data?: Lead[]; total?: number } | Lead[]>(cacheKey);
      if (!payload) return null;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.data)) {
        leadsCacheRef.current.set(cacheKey, payload.data);
        return payload.data;
      }
      return null;
    },
    [],
  );
  const leadsFetchAbortRef = useRef<AbortController | null>(null);
  // Use refs (not state) for drag index so onDrop always reads the live value
  const cfDragRef = useRef<number | null>(null);
  const [cfDragVisualIdx, setCfDragVisualIdx] = useState<number | null>(null);
  const [cfDragOverVisualIdx, setCfDragOverVisualIdx] = useState<number | null>(null);
  // Add property popover in table header
  const [showAddColPopover, setShowAddColPopover] = useState(false);
  const [addColName, setAddColName] = useState('');
  const [addColType, setAddColType] = useState('text');
  const [addColSaving, setAddColSaving] = useState(false);
  const [cfMergeDeleteField, setCfMergeDeleteField] = useState<{ _id: string; name: string; key: string } | null>(null);
  const [stageVisibleCounts, setStageVisibleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const stored = localStorage.getItem('crmHeaderCollapsed');
    if (stored === 'true') setHeaderCollapsed(true);
    const onCollapsed = (e: Event) => {
      const detail = (e as CustomEvent<{ collapsed?: boolean }>).detail;
      if (typeof detail?.collapsed === 'boolean') setHeaderCollapsed(detail.collapsed);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('crm-header:collapsed', onCollapsed);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('crm-header:collapsed', onCollapsed);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  // For large datasets, keep list mode server-paged unless heavy client-only filters are active.
  const apiFilters = useMemo(
    () => mergeLeadCategoryFilter(mergeDateRangeFilter(filters, dateRange), activeLeadCategory),
    [filters, dateRange, activeLeadCategory],
  );

  const needsClientFullList = viewMode !== 'list';

  const emailEngagement = useMemo(
    () => ({
      lastActivity: lastActivityFilter,
      emailOpenMode: emailOpenFilterMode,
      emailOpenDays: emailOpenFilterDays,
      emailReply: emailReplyFilter,
      emailSent: emailSentFilter,
    }),
    [lastActivityFilter, emailOpenFilterMode, emailOpenFilterDays, emailReplyFilter, emailSentFilter],
  );

  const leadNeedsOutreach = useCallback(
    (_leadId: string) => {
      if (emailSentFilter === 'not-sent') return true;
      const stats = leadEmailStatsById[_leadId];
      if (!stats) return false;
      return !hasOutboundEmailSent(stats);
    },
    [leadEmailStatsById, emailSentFilter],
  );

  /** List table: “Last email activity” column visibility. */
  const listShowsLastEmailColumn = useMemo(
    () => viewMode === 'list' && columns.some((c) => c.visible && c.key === 'lastEmailActivityAt'),
    [viewMode, columns],
  );
  /** Kanban + list name badges; list last-activity column; last-email / reply filters. */
  const needsLeadEmailActivityFetch = useMemo(
    () =>
      viewMode === 'kanban' ||
      viewMode === 'list' ||
      listShowsLastEmailColumn,
    [viewMode, listShowsLastEmailColumn],
  );

  /** Apply custom-field definitions to column state (shared by initial load and refresh). */
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

  const pipelineCacheKey = useCallback(
    (pipelineId: string | null | undefined, opts?: { page?: number; pageSize?: number; search?: string; full?: boolean; filtersStr?: string; emailEngStr?: string; mine?: boolean }) => {
      const base = isMongoObjectIdString(pipelineId) ? String(pipelineId).trim() : '__all__';
      const f = opts?.filtersStr ? `|f=${opts.filtersStr}` : '';
      const e = opts?.emailEngStr ? `|e=${opts.emailEngStr}` : '';
      const m = opts?.mine ? `|m=1` : '';
      const key = opts?.full ? `${base}|full${f}${e}${m}` : `${base}|p=${opts?.page || 1}|ps=${opts?.pageSize || 25}|q=${opts?.search || ''}${f}${e}${m}`;
      return `leads:${key}`;
    },
    [],
  );

  /** Lead-type tab bar options — see Settings > Lead Type & Group. */
  const fetchLeadCategoryTabs = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=leadCategory`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = res.ok ? await res.json() : [];
      setLeadCategoryTabs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setLeadCategoryTabs([]);
    }
  }, []);

  useEffect(() => {
    void fetchLeadCategoryTabs();
  }, [fetchLeadCategoryTabs]);

  const fetchCustomFields = useCallback(async () => {
    if (customFieldsLoaded) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=leads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        ingestCustomFieldDefinitions(await res.json());
        setCustomFieldsLoaded(true);
      }
    } catch (err) {
      console.error(err);
    }
  }, [ingestCustomFieldDefinitions, customFieldsLoaded]);

  /** Loads leads; pass a pipeline id to scope on the server (much faster than fetching every lead). */
  const fetchLeadsList = useCallback(async (pipelineId: string | null) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    const filtersStr = apiFilters.length ? JSON.stringify(apiFilters) : '';
    const emailEngStr = Object.values(emailEngagement).join(',');
    const cacheKey = pipelineCacheKey(pipelineId, {
      page,
      pageSize,
      search: debouncedSearch,
      full: needsClientFullList,
      filtersStr,
      emailEngStr,
      mine: showMyLeadsOnly,
    });
    const cached = readSharedLeadsCache(cacheKey);
    if (cached?.length) {
      setLeads(cached);
      setLoading(false);
    }
    leadsFetchAbortRef.current?.abort();
    const controller = new AbortController();
    leadsFetchAbortRef.current = controller;
    try {
      const params = buildCrmListSearchParams({
        page: needsClientFullList ? 1 : page,
        pageSize: needsClientFullList ? CRM_BOARD_PAGE_SIZE : pageSize,
        search: debouncedSearch,
        filters: apiFilters,
        emailEngagement,
        extra: {
          pipeline: isMongoObjectIdString(pipelineId)
            ? String(pipelineId).trim()
            : undefined,
          mine: showMyLeadsOnly ? '1' : undefined,
        },
      });
      const url = `${CRM_API_URL}/crm/leads?${params.toString()}`;
      const shared = crmCachePeek<{ data?: Lead[]; total?: number } | Lead[]>(cacheKey);
      if (
        shared &&
        !crmCacheShouldRevalidate(shared.ageMs) &&
        !cached?.length
      ) {
        return;
      }
      const res = await fetch(url, { headers, cache: 'no-store', signal: controller.signal });
      if (res.ok) {
        const payload = await res.json();
        crmCacheSet(cacheKey, payload);
        const unwrapped = unwrapCrmListPayload<Lead>(payload);
        leadsCacheRef.current.set(cacheKey, unwrapped.data);
        setLeads(unwrapped.data);
        setServerTotal(unwrapped.total);
      }
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pipelineCacheKey, page, pageSize, debouncedSearch, needsClientFullList, showMyLeadsOnly, apiFilters, emailEngagement, readSharedLeadsCache]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    let storedUser: { assignedLeadsPipeline?: string } | null = null;
    try {
      const raw = localStorage.getItem('user');
      if (raw) storedUser = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    try {
      const cachedPipelines = crmCachePeek<any[]>(crmCacheKeys.pipelines('leads'));
      if (cachedPipelines?.data?.length) {
        setPipelines(cachedPipelines.data);
      }

      let pipelinesData: any[] | null = cachedPipelines?.data ?? null;
      const shouldFetchPipelines =
        !cachedPipelines || crmCacheShouldRevalidate(cachedPipelines.ageMs);
      if (shouldFetchPipelines) {
        const pRes = await fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, {
          headers,
          cache: 'no-store',
        });
        if (pRes.ok) {
          pipelinesData = await pRes.json();
          if (Array.isArray(pipelinesData)) {
            setPipelines(pipelinesData);
            crmCacheSet(crmCacheKeys.pipelines('leads'), pipelinesData);
          }
        }
      }

      let initialPipelineId = '';

      if (pipelinesData?.length) {
        const { pipelineId } = resolveActivePipelineId('leads', pipelinesData, storedUser);
        initialPipelineId = pipelineId;
        setSelectedPipelineId(pipelineId);
      }

      const filtersStr = apiFilters.length ? JSON.stringify(apiFilters) : '';
      const emailEngStr = Object.values(emailEngagement).join(',');
      const leadListKey = pipelineCacheKey(initialPipelineId, {
        page,
        pageSize,
        search: debouncedSearch,
        full: needsClientFullList,
        filtersStr,
        emailEngStr,
        mine: showMyLeadsOnly,
      });
      const cachedLeads = readSharedLeadsCache(leadListKey);
      if (cachedLeads?.length) {
        setLeads(cachedLeads);
        setLoading(false);
      }

      const leadParams = buildCrmListSearchParams({
        page: needsClientFullList ? 1 : page,
        pageSize: needsClientFullList ? CRM_BOARD_PAGE_SIZE : pageSize,
        search: debouncedSearch,
        filters: apiFilters,
        emailEngagement,
        extra: {
          pipeline: isMongoObjectIdString(initialPipelineId)
            ? initialPipelineId.trim()
            : undefined,
          mine: showMyLeadsOnly ? '1' : undefined,
        },
      });
      const leadsUrl = `${CRM_API_URL}/crm/leads?${leadParams.toString()}`;
      const sharedLeads = crmCachePeek<{ data?: Lead[]; total?: number } | Lead[]>(leadListKey);
      if (
        sharedLeads &&
        !crmCacheShouldRevalidate(sharedLeads.ageMs) &&
        cachedLeads?.length
      ) {
        return;
      }
      const lRes = await fetch(leadsUrl, { headers, cache: 'no-store' });
      if (lRes.ok) {
        const payload = await lRes.json();
        crmCacheSet(leadListKey, payload);
        const unwrapped = unwrapCrmListPayload<Lead>(payload);
        setLeads(unwrapped.data);
        setServerTotal(unwrapped.total);
        leadsCacheRef.current.set(
          pipelineCacheKey(initialPipelineId, {
            page,
            pageSize,
            search: debouncedSearch,
            full: needsClientFullList,
            filtersStr,
            emailEngStr,
            mine: showMyLeadsOnly,
          }),
          unwrapped.data,
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pipelineCacheKey, page, pageSize, debouncedSearch, needsClientFullList, showMyLeadsOnly, apiFilters, emailEngagement, readSharedLeadsCache]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setColumns(loadColumns());
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedPipelineId && typeof window !== 'undefined') {
      localStorage.setItem('crm_active_pipeline_leads', selectedPipelineId);
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    const handleCrmDataChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const scope = detail?.scope;
      if (!scope || scope.startsWith('leads')) {
        leadsCacheRef.current.clear();
      }
    };
    window.addEventListener('crm-data-changed', handleCrmDataChanged);
    return () => window.removeEventListener('crm-data-changed', handleCrmDataChanged);
  }, []);

  // Listen for custom field reorder events dispatched by LeadCreatePanel
  useEffect(() => {
    const handler = () => fetchCustomFields();
    window.addEventListener('cf-reordered', handler);
    return () => window.removeEventListener('cf-reordered', handler);
  }, [fetchCustomFields]);

  useEffect(() => {
    return () => {
      deleteAnimationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      deleteAnimationTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (isColumnsOpen) {
      setDraftColumns(columns.map(c => ({ ...c })));
    }
  }, [isColumnsOpen]);

  useEffect(() => {
    setPage(1);
  }, [selectedPipelineId, debouncedSearch, needsClientFullList, emailEngagement, showMyLeadsOnly]);

  useEffect(() => {
    if (viewMode === 'list' || isColumnsOpen) {
      void fetchCustomFields();
    }
  }, [viewMode, isColumnsOpen, fetchCustomFields]);

  useEffect(() => {
    if (!pipelines.length || !selectedPipelineId) return;
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    const otherPipelineIds = pipelines
      .map((p: any) => String(p?._id || ''))
      .filter((pid: string) => pid && pid !== selectedPipelineId)
      .slice(0, 2);
    const runPrefetch = () => {
      void Promise.allSettled(
        otherPipelineIds
          .filter((pid) =>
            !leadsCacheRef.current.has(
              pipelineCacheKey(pid, { page: 1, pageSize, search: '', full: false }),
            ),
          )
          .map(async (pid) => {
            const res = await fetch(`${CRM_API_URL}/crm/leads?pipeline=${encodeURIComponent(pid)}&page=1&pageSize=${pageSize}`, {
              headers,
              cache: 'no-store',
            });
            if (res.ok) {
              const payload = await res.json();
              const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
              leadsCacheRef.current.set(
                pipelineCacheKey(pid, { page: 1, pageSize, search: '', full: false }),
                data,
              );
            }
          }),
      );
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    const cic = (window as any).cancelIdleCallback as ((handle: number) => void) | undefined;
    if (ric && cic) {
      const handle = ric(runPrefetch, { timeout: 1200 });
      return () => cic(handle);
    }
    const timeoutHandle = window.setTimeout(runPrefetch, 600);
    return () => window.clearTimeout(timeoutHandle);
  }, [pipelines, selectedPipelineId, pipelineCacheKey, pageSize]);

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
      const res = await fetch(`${CRM_API_URL}/crm/leads/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setLeads(prev => prev.filter(l => !selectedIds.has(l._id)));
        setSelectedIds(new Set());
        setShowConfirmDelete(false);
        invalidateCrmAfterMutation('leads', 'workspace', 'attention');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err?.message || 'Could not delete selected leads. Check permissions and try again.');
      }
    } catch (err) {
      console.error('Bulk delete failed', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const openAssignDialog = () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one lead');
      return;
    }
    setAssignOwner('');
    setAssignOpen(true);
  };

  useEffect(() => {
    if (!assignOpen) return;
    let cancelled = false;
    setOwnersLoading(true);
    void fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
      headers: {
        Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      })
      .then((users: Array<{ firstName?: string; lastName?: string; email?: string }>) => {
        if (cancelled) return;
        const labels = users
          .map((u) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || String(u.email || '').trim())
          .filter(Boolean);
        setOwnerOptions(Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {
        if (!cancelled) setOwnerOptions([]);
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignOpen]);

  const handleBulkAssign = async () => {
    const ownerName = assignOwner.trim();
    if (!ownerName) {
      toast.error('Choose an owner');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Select at least one lead');
      return;
    }
    setAssigning(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/leads/bulk-assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ownerName,
          ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to assign leads');
      }
      const modified = Number(data?.modified ?? 0);
      toast.success(
        `Assigned ${modified} lead${modified === 1 ? '' : 's'} to ${ownerName}`,
      );
      setLeads((prev) =>
        prev.map((l) =>
          selectedIds.has(l._id) ? { ...l, leadOwner: ownerName } : l,
        ),
      );
      setAssignOpen(false);
      setSelectedIds(new Set());
      invalidateCrmAfterMutation('leads', 'workspace', 'attention');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign leads');
    } finally {
      setAssigning(false);
    }
  };

  const handleBulkMovePipeline = async () => {
    if (!canMoveLeadsAcrossPipelines || selectedIds.size === 0 || !isMongoObjectIdString(bulkMovePipelineId)) return;
    const token = localStorage.getItem('token');
    const targetPipeline = pipelines.find((p: any) => String(p?._id) === String(bulkMovePipelineId));
    const firstStageName = Array.isArray(targetPipeline?.stages)
      ? [...targetPipeline.stages]
          .sort((a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0))[0]?.name
      : undefined;
    const patch: Record<string, any> = { pipeline: bulkMovePipelineId };
    if (firstStageName) {
      patch.stage = String(firstStageName).trim();
      patch.status = String(firstStageName).trim();
    }
    setIsBulkMoving(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`${CRM_API_URL}/crm/leads/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(patch),
          }),
        ),
      );
      const failed = results.filter((res) => !res.ok).length;
      if (failed > 0) {
        alert(`Could not move ${failed} lead(s). Check permissions or try again.`);
      } else {
        setSelectedIds(new Set());
      }
      await fetchLeadsList(selectedPipelineId || null);
    } catch (err) {
      console.error('Bulk pipeline move failed', err);
    } finally {
      setIsBulkMoving(false);
    }
  };

  const toggleSelectAll = () => {
    const currentItems = paginated.map(l => l._id);
    const allSelected = currentItems.every(id => selectedIds.has(id));

    const next = new Set(selectedIds);
    if (allSelected) {
      currentItems.forEach(id => next.delete(id));
    } else {
      currentItems.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectStage = (stageLeadIds: string[]) => {
    if (stageLeadIds.length === 0) return;
    const next = new Set(selectedIds);
    const allSelected = stageLeadIds.every((id) => next.has(id));
    if (allSelected) {
      stageLeadIds.forEach((id) => next.delete(id));
    } else {
      stageLeadIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const handleApplyView = (view: SavedViewData | null) => {
    if (!view) { setFilters([]); return; }
    setFilters(view.filters || []);
    if (view.columns?.length) {
      const viewColMap = new Map(view.columns.map(c => [c.key, c]));
      const next = columns.map(c => ({ ...c, visible: viewColMap.has(c.key) ? viewColMap.get(c.key)!.visible : c.visible }));
      setColumns(next);
      saveColumns(next);
    }
    setPage(1);
  };

  const handleAddColumn = () => {
    const label = newColLabel.trim();
    if (!label) return;
    const key = `custom_${label.toLowerCase().replace(/\s+/g, '_')}`;
    if (draftColumns.find(c => c.key === key)) return;
    setDraftColumns([...draftColumns, { key, label, visible: true }]);
    setNewColLabel('');
  };

  // Handles the inline "+" add column button in the table header
  const handleAddCustomField = async () => {
    if (!addColName.trim()) return;
    setAddColSaving(true);
    const token = localStorage.getItem('token');
    try {
      const key = addColName.trim().toLowerCase().replace(/\s+/g, '_');
      const res = await fetch(`${CRM_API_URL}/custom-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: addColName.trim(), key, type: addColType, module: 'leads', required: false })
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

  // Reorder custom fields via drag-and-drop in the column manager (uses ref to avoid stale closure)
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids: reordered.map((f: any) => f._id) })
      });
      await fetchCustomFields();
      window.dispatchEvent(new CustomEvent('cf-reordered'));
    } catch (err) { console.error(err); }
  };

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageName: string) => {
    e.preventDefault();
    if (!canMoveLeadsAcrossPipelines) return;
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;

    const cleanStage = stageName.trim();

    const updated = leads.map(l => l._id === leadId ? { ...l, status: cleanStage, stage: cleanStage } : l);
    setLeads(updated);

    const body: Record<string, string> = { status: cleanStage, stage: cleanStage };
    const moved = leads.find((l) => l._id === leadId);
    if (moved && !String(moved.pipeline || '').trim() && selectedPipelineId) {
      body.pipeline = String(selectedPipelineId);
    }

    try {
      const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      invalidateCrmAfterMutation('leads', 'workspace', 'attention');
    } catch (err) {
      console.error(err);
      alert('Could not move this lead. Check permissions or try again.');
      fetchData();
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const token = localStorage.getItem('token');
    try {
      const params = new URLSearchParams();
      if (selectedIds.size > 0) {
        params.set('ids', Array.from(selectedIds).join(','));
      } else if (isMongoObjectIdString(selectedPipelineId)) {
        params.set('pipelineId', selectedPipelineId.trim());
      }
      const url = `${CRM_API_URL}/crm/export/leads${
        params.toString() ? `?${params.toString()}` : ''
      }`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const csvContent = await res.text();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
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

  /** Opens the lead's WhatsApp thread inside the CRM inbox (not an external
   *  wa.me deep link) so the message actually gets logged against the lead
   *  instead of happening entirely outside the CRM. */
  const openLeadWhatsApp = (lead: Lead) => {
    const waId = contactWhatsappWaId(lead);
    if (waId) router.push(`/crm/whatsapp?wa=${encodeURIComponent(waId)}`);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Move this lead to Trash? Only an admin can restore it.')) return;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/leads/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setExitingLeadIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        const existingTimer = deleteAnimationTimersRef.current.get(id);
        if (existingTimer) window.clearTimeout(existingTimer);
        const timerId = window.setTimeout(() => {
          setLeads((prev) => prev.filter((lead) => lead._id !== id));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setExitingLeadIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          deleteAnimationTimersRef.current.delete(id);
        }, 280);
        deleteAnimationTimersRef.current.set(id, timerId);
        invalidateCrmAfterMutation('leads', 'workspace', 'attention');
      }
    } catch (err) {
      console.error('Failed to delete lead:', err);
    }
  };

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p._id === selectedPipelineId),
    [pipelines, selectedPipelineId],
  );

  const pipelineStages = useMemo(
    () =>
      selectedPipeline
        ? [...selectedPipeline.stages].sort((a, b) => a.order - b.order)
        : [],
    [selectedPipeline],
  );

  const pipelineNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of pipelines) {
      if (p?._id && p?.name) byId.set(String(p._id), String(p.name));
    }
    return byId;
  }, [pipelines]);

  const ownerFiltered = useMemo(() => {
    if (!showMyLeadsOnly || !user) return leads;
    return leads.filter(
      (l) =>
        l.leadOwner === `${user.firstName} ${user.lastName}` ||
        (typeof l.createdBy === 'string'
          ? l.createdBy === user._id
          : (l.createdBy as any)?._id === user._id),
    );
  }, [showMyLeadsOnly, user, leads]);

  const pipelineLeads = useMemo(
    () =>
      ownerFiltered.filter((l) => {
        if ((l as any).converted === true)
          return false;
        const leadPipeline = l.pipeline?.toString();
        const targetPipeline = selectedPipelineId?.toString();
        return leadPipeline === targetPipeline || !leadPipeline;
      }),
    [ownerFiltered, selectedPipelineId],
  );

  const filteredLeads = useMemo(() => {
    const base = needsClientFullList
      ? applyFilters(pipelineLeads, apiFilters, filterProperties)
      : pipelineLeads;
    return base.filter((l) => {
      if (!needsClientFullList || !search.trim()) return true;
      const q = search.toLowerCase();
      const name = `${l.firstName || ''} ${l.lastName || ''}`.trim();
      const hay = [
        name,
        l.email,
        l.organization,
        l.mobileNo,
        l.phone,
        l.stage,
        l.status,
        l.source,
        l.leadOwner,
        l.leadScore != null ? String(l.leadScore) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pipelineLeads, apiFilters, filterProperties, search, needsClientFullList]);

  const boardLeads = filteredLeads;

  const stageLeadsByStage = useMemo(() => {
    const grouped = new Map<string, Lead[]>();
    const stageNames = pipelineStages
      .map((s: { name?: string }) => String(s.name || '').trim())
      .filter(Boolean);
    for (const lead of boardLeads) {
      const key = resolveBoardStageName(lead.stage || lead.status, stageNames);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(lead);
      else grouped.set(key, [lead]);
    }
    return grouped;
  }, [boardLeads, pipelineStages]);

  const boardColumns = useMemo(() => {
    const cols: Array<{ key: string; name: string; isUnassigned: boolean }> =
      pipelineStages.map((s: { name: string }) => ({
        key: String(s.name).trim(),
        name: String(s.name),
        isUnassigned: false,
      }));
    const unassignedCount =
      stageLeadsByStage.get(BOARD_UNASSIGNED_STAGE_KEY)?.length || 0;
    if (unassignedCount > 0) {
      cols.push({
        key: BOARD_UNASSIGNED_STAGE_KEY,
        name: 'Unassigned',
        isUnassigned: true,
      });
    }
    return cols;
  }, [pipelineStages, stageLeadsByStage]);

  useEffect(() => {
    setStageVisibleCounts({});
  }, [selectedPipelineId, search, filters, dateRange, lastActivityFilter, emailOpenFilterMode, emailOpenFilterDays, emailReplyFilter, emailSentFilter]);

  const paginated = useMemo(
    () => (needsClientFullList ? boardLeads.slice((page - 1) * pageSize, page * pageSize) : boardLeads),
    [needsClientFullList, boardLeads, page, pageSize],
  );

  const leadIdsForEmailStatsFetch = useMemo(() => {
    if (!needsLeadEmailActivityFetch) return [];
    if (viewMode === 'kanban') {
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const col of boardColumns) {
        const stageLeads = stageLeadsByStage.get(col.key) || [];
        const visibleCount = stageVisibleCounts[col.key] || INITIAL_STAGE_CARD_LIMIT;
        for (const l of stageLeads.slice(0, visibleCount)) {
          if (!seen.has(l._id)) {
            seen.add(l._id);
            ids.push(l._id);
          }
        }
      }
      return ids;
    }
    if (viewMode === 'list' && !needsClientFullList) {
      return paginated.map((l) => l._id);
    }
    return leads.map((l) => l._id);
  }, [
    needsLeadEmailActivityFetch,
    viewMode,
    needsClientFullList,
    leads,
    boardColumns,
    stageLeadsByStage,
    stageVisibleCounts,
    paginated,
  ]);

  const mergePartialEmailStats = useMemo(
    () => viewMode === 'kanban' || (viewMode === 'list' && !needsClientFullList),
    [viewMode, needsClientFullList],
  );

  const deferEmailStatsNetwork = mergePartialEmailStats;

  useEffect(() => {
    if (!needsLeadEmailActivityFetch) {
      setLeadEmailStatsById({});
      return;
    }
    if (!leads.length) {
      setLeadEmailStatsById({});
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;
    let cancelSchedule: (() => void) | undefined;

    const runFetch = () => {
      if (cancelled) return;
      void (async () => {
        if (cancelled) return;
        const ids = leadIdsForEmailStatsFetch;
        if (!ids.length) {
          if (!mergePartialEmailStats) setLeadEmailStatsById({});
          return;
        }
        const byId = await fetchEmailEngagementBatch(token, ids, 'leads');
        if (cancelled) return;
        if (mergePartialEmailStats) {
          setLeadEmailStatsById((prev) => {
            const next = { ...prev };
            for (const id of ids) {
              next[id] = byId[id];
            }
            return next;
          });
        } else {
          setLeadEmailStatsById(byId);
        }
      })();
    };

    if (deferEmailStatsNetwork && typeof window !== 'undefined') {
      const ric = (
        window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
          cancelIdleCallback?: (id: number) => void;
        }
      ).requestIdleCallback;
      const cic = (
        window as unknown as { cancelIdleCallback?: (id: number) => void }
      ).cancelIdleCallback;
      if (ric && cic) {
        const id = ric(() => runFetch(), { timeout: 1400 });
        cancelSchedule = () => cic(id);
      } else {
        const t = window.setTimeout(runFetch, 0);
        cancelSchedule = () => window.clearTimeout(t);
      }
    } else {
      runFetch();
    }

    return () => {
      cancelled = true;
      cancelSchedule?.();
    };
  }, [
    leads,
    needsLeadEmailActivityFetch,
    leadIdsForEmailStatsFetch,
    mergePartialEmailStats,
    deferEmailStatsNetwork,
  ]);

  const displayedTotal = needsClientFullList ? filteredLeads.length : serverTotal;

  const visibleCols = useMemo(
    () => columns.filter((c) => c.visible),
    [columns],
  );

  const isAllPaginatedSelected = useMemo(
    () =>
      paginated.length > 0 && paginated.every((l) => selectedIds.has(l._id)),
    [paginated, selectedIds],
  );

  const bulkRecipients = useMemo(
    () => buildBulkEmailRecipients(selectedIds, leads, "leads"),
    [selectedIds, leads],
  );

  const renderCell = useCallback((lead: Lead, key: string) => {
    switch (key) {
      case 'name': {
        const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || '—';
        const initials = `${lead.firstName?.[0] || ''}${lead.lastName?.[0] || ''}`.trim() || fullName[0] || '?';
        return (
          <CrmListPersonCell
            name={fullName}
            initials={initials}
            toneSeed={`${lead.firstName}${lead.lastName}${lead._id}`}
            trailing={<CrmEmailEngagementIcons stats={leadEmailStatsById[lead._id]} />}
          />
        );
      }
      case 'email': return <span className="text-sm text-[#707070]">{lead.email || '—'}</span>;
      case 'phone': return <span className="text-sm text-[#707070]">{lead.mobileNo || lead.phone || '—'}</span>;
      case 'organization': return <CrmListOrgCell name={lead.organization || '—'} />;
      case 'source': return <span className="text-sm text-[#707070]">{lead.source || '—'}</span>;
      case 'priority': return <span className="text-sm text-[#707070]">{lead.priority || '—'}</span>;
      case 'leadOwner': return <CrmListOwnerCell name={lead.leadOwner || ''} />;
      case 'leadScore': {
        const s = lead.leadScore;
        if (s == null || Number.isNaN(s)) {
          return <span className="text-sm text-[#707070]">—</span>;
        }
        return (
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${leadScoreBadgeClass(s)}`}>
            <Target size={10} className="opacity-70 shrink-0" aria-hidden />
            {s}
          </span>
        );
      }
      case 'pipeline': {
        const name = lead.pipeline ? pipelineNameById.get(String(lead.pipeline)) : undefined;
        return <span className="text-sm text-[#707070]">{name || '—'}</span>;
      }
      case 'status': return <CrmListStatusBadge label={lead.status || '—'} />;
      case 'stage': return <CrmListStatusBadge label={lead.stage || lead.status || '—'} />;
      case 'callStatus': return <CrmListStatusBadge label={lead.callStatus || 'Not Called'} />;
      case 'leadCategory': return <span className="text-sm text-[#707070]">{lead.leadCategory || '—'}</span>;
      case 'group': return <span className="text-sm text-[#707070]">{lead.group || '—'}</span>;
      case 'createdByName': return <span className="text-sm text-[#707070]">{lead.createdByName || lead.leadOwner || '—'}</span>;
      case 'createdAt': return <span className="text-sm text-[#707070]">{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>;
      case 'lastEmailActivityAt': {
        const iso = leadEmailStatsById[lead._id]?.latestActivityIso;
        return <span className="text-sm text-[#707070]">{iso ? new Date(iso).toLocaleString() : 'No activity'}</span>;
      }
      default: {
        if (key.startsWith('cf_')) {
          const cfKey = key.replace('cf_', '');
          const def = customFieldDefs.find((f: any) => f.key === cfKey);
          const raw = lead.customFields?.[cfKey];
          return (
            <span className="text-text-muted font-medium text-sm inline-flex min-w-0 max-w-[220px]">
              <CrmCustomFieldValue value={raw} type={def?.type} />
            </span>
          );
        }
        return null;
      }
    }
  }, [pipelineNameById, customFieldDefs, leadEmailStatsById]);

  return (
    <div className={CRM_LIST_PAGE}>
      <div className="flex flex-1 h-full relative min-w-0">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <CrmPageHeader
            bordered={false}
            title="Leads"
            badge={<CrmCountBadge>{displayedTotal}</CrmCountBadge>}
            breadcrumbs={[
              { label: 'Home', href: '/crm/workspace/summary' },
              { label: 'Leads' },
            ]}
            actions={
              <CrmHeaderTools
                leading={
                  <>
                {selectedIds.size > 0 && canMoveLeadsAcrossPipelines && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={bulkMovePipelineId}
                      onChange={(e) => setBulkMovePipelineId(e.target.value)}
                      aria-label="Target pipeline for bulk move"
                      className={cn(CRM_TOOLBAR_SELECT, "min-w-[132px] max-w-[200px] px-2.5 text-xs")}
                    >
                      <option value="">Pipeline…</option>
                      {pipelines.map((p: any) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <CrmButton
                      variant="icon"
                      onClick={handleBulkMovePipeline}
                      disabled={!bulkMovePipelineId || isBulkMoving}
                      title={
                        bulkMovePipelineId
                          ? `Move ${selectedIds.size} selected lead(s) to the chosen pipeline`
                          : 'Choose a pipeline, then move selected leads'
                      }
                      aria-label={`Move ${selectedIds.size} selected leads to pipeline`}
                      leftIcon={
                        isBulkMoving ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <CrmIcon.GitBranch size={16} aria-hidden />
                        )
                      }
                    />
                  </div>
                )}
                {selectedIds.size > 0 && hasAccess('leads:write') && (
                  <CrmButton
                    variant="secondary"
                    onClick={openAssignDialog}
                    title={`Assign ${selectedIds.size} selected lead(s) to an owner`}
                    aria-label={`Assign ${selectedIds.size} selected leads`}
                    leftIcon={<Users className="h-4 w-4" aria-hidden />}
                  >
                    Assign {selectedIds.size}
                  </CrmButton>
                )}
                {selectedIds.size > 0 && hasAccess('leads:delete') && (
                  <CrmButton
                    variant="danger"
                    onClick={() => setShowConfirmDelete(true)}
                    title={`Delete ${selectedIds.size} selected lead(s)`}
                    aria-label={`Delete ${selectedIds.size} selected leads`}
                    leftIcon={<CrmIcon.Trash size={16} aria-hidden />}
                  >
                    Delete {selectedIds.size}
                  </CrmButton>
                )}
                <BulkEmailToolbarButton
                  selectedCount={selectedIds.size}
                  recipientCount={bulkRecipients.length}
                  entityLabel="lead"
                  onClick={() => setIsBulkEmailOpen(true)}
                />
                {/* Stage automation — disabled for now, not needed yet. Re-enable by uncommenting.
                {hasAccess('leads:write') && isMongoObjectIdString(selectedPipelineId) && (
                  <CrmButton
                    variant="icon"
                    onClick={() => setStageRulesPanelOpen(true)}
                    title={
                      selectedIds.size > 0
                        ? `Stage rules — preview or apply for ${selectedIds.size} selected lead(s)`
                        : 'Stage rules — preview or apply for this pipeline'
                    }
                    aria-label="Open stage automation rules"
                    leftIcon={<CrmIcon.GitBranch size={16} aria-hidden />}
                  />
                )}
                */}
                  </>
                }
                canExport={hasAccess('leads:export')}
                exporting={exporting}
                exportMenuRef={exportMenuRef}
                exportMenuOpen={isExportMenuOpen}
                onExportMenuToggle={() => setIsExportMenuOpen((o) => !o)}
                exportMenu={
                  hasAccess('leads:export') ? (
                  <div className="absolute right-0 z-50 mt-2 w-56 animate-in slide-in-from-top-2 duration-200 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-2 shadow-[var(--crm-shadow-raised)]">
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsExportMenuOpen(false);
                          void handleExport();
                        }}
                        className={CRM_MENU_ITEM}
                      >
                        <CrmIcon.FileXls size={16} aria-hidden />
                        Export as Excel
                      </button>
                  </div>
                  ) : undefined
                }
                onRefresh={() => void fetchLeadsList(selectedPipelineId || null)}
                canImport={hasAccess('leads:import')}
                onImport={() => setIsImportModalOpen(true)}
                onCollapse={() => {
                  window.dispatchEvent(new CustomEvent('crm-header:toggle-collapse'));
                }}
                collapsed={headerCollapsed}
              />
            }
          />

          <CrmListToolbar
            filter={
              <CRMFilterBar module="leads" filters={filters} onChange={setFilters} onClear={() => setFilters([])} onPropertiesReady={setFilterProperties} />
            }
            searchProps={{
              placeholder: 'Search Keyword',
              'aria-label': 'Search leads',
              value: search,
              onChange: (e) => {
                setSearch(e.target.value);
                setPage(1);
              },
            }}
            leftExtra={
              <>
                <CRMSavedViews
                  module="leads"
                  currentFilters={filters}
                  currentColumns={columns}
                  onApplyView={handleApplyView}
                  preferAllView
                />
                <CRMDateRangePicker onChange={setDateRange} compact />
                <CrmScopeToggle
                  allLabel="All Leads"
                  mineLabel="My Leads"
                  showMineOnly={showMyLeadsOnly}
                  onShowAll={() => { setShowMyLeadsOnly(false); setPage(1); }}
                  onShowMine={() => { setShowMyLeadsOnly(true); setPage(1); }}
                  onClearAll={() => { setSearch(''); setFilters([]); setDateRange(null); }}
                />
                <button
                  type="button"
                  onClick={() => setShowWebsiteLeads((prev) => !prev)}
                  aria-pressed={showWebsiteLeads}
                  className={cn(
                    'shrink-0 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-semibold transition-colors',
                    showWebsiteLeads
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]',
                  )}
                >
                  Website Leads
                </button>
                {viewMode === 'list' && hasAccess('leads:write') ? (
                  <button
                    type="button"
                    onClick={() => setIsColumnsOpen(true)}
                    className={CRM_BTN_MANAGE_COLUMNS}
                  >
                    <CrmIcon.Columns size={16} aria-hidden />
                    Manage Columns
                  </button>
                ) : null}
                <div className="relative">
                  <CrmIcon.Activity
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-hidden
                  />
                  <select
                    value={lastActivityFilter}
                    onChange={(e) => {
                      setLastActivityFilter(e.target.value as any);
                      setPage(1);
                    }}
                    aria-label="Filter leads by last tracked or CRM email activity"
                    className={cn(CRM_TOOLBAR_SELECT, 'min-w-[148px] max-w-[180px] pl-8 pr-7')}
                    title="Last tracked or CRM email activity on the lead."
                  >
                    <option value="all">Activity: Any</option>
                    <option value="today">Today</option>
                    <option value="last7">Last 7 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="last90">Last 90 days</option>
                    <option value="no-activity">No activity</option>
                  </select>
                  <CrmIcon.ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />
                </div>
                {!(user as any)?.assignedLeadsPipeline ? (
                  <div className="relative">
                    <CrmIcon.GitBranch
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    />
                    <select
                      value={selectedPipelineId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedPipelineId(v);
                        setPage(1);
                        void fetchLeadsList(v || null);
                      }}
                      aria-label="Pipeline"
                      className={cn(CRM_TOOLBAR_SELECT, 'min-w-[160px] max-w-[220px] pl-8 pr-7')}
                    >
                      {pipelines.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <CrmIcon.ChevronDown
                      size={12}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    />
                  </div>
                ) : null}
              </>
            }
            secondary={
              <>
                <span className="mr-0.5 shrink-0 text-xs font-semibold text-[var(--text-muted)]">
                  Email
                </span>
                <div className={CRM_TOOLBAR_ICON_GROUP} role="group" aria-label="Email open filters">
                  {(
                    [
                      'all',
                      'opened',
                      'opened-in-days',
                      'last-sent-unopened-days',
                      'no-open-since-days',
                    ] as const
                  ).map((mode) => {
                    const openTip =
                      mode === 'all'
                        ? 'Do not filter by opens. Click to clear this filter group.'
                        : mode === 'opened'
                          ? 'Keep leads who have opened at least one tracked email from us. Click again to turn off.'
                          : mode === 'opened-in-days'
                            ? 'Keep leads who opened a tracked email in the last N days. Set N in the box to the right. Click again to turn off.'
                            : mode === 'last-sent-unopened-days'
                              ? 'Keep leads whose latest tracked send is still unopened for at least N days. Set N in the box to the right. Click again to turn off.'
                              : 'Keep leads with no recipient open in the last N days (needs outbound email). Set N in the box to the right. Click again to turn off.';
                    return (
                      <div key={mode} className="group relative inline-flex shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEmailOpenFilterMode((m) => (m === mode ? 'all' : mode));
                            setPage(1);
                          }}
                          className={cn(
                            CRM_TOOLBAR_ICON_BTN,
                            mode !== 'all' && emailOpenFilterMode === mode && CRM_TOOLBAR_ICON_BTN_ACTIVE,
                          )}
                          aria-pressed={emailOpenFilterMode === mode}
                          aria-label={openTip}
                        >
                          {mode === 'all' ? <CrmIcon.Mail size={14} /> : null}
                          {mode === 'opened' ? <CrmIcon.Eye size={14} /> : null}
                          {mode === 'opened-in-days' ? (
                            <CrmIcon.MailOpen size={14} />
                          ) : null}
                          {mode === 'last-sent-unopened-days' ? (
                            <CrmIcon.EyeOff size={14} />
                          ) : null}
                          {mode === 'no-open-since-days' ? <CrmIcon.Timer size={14} /> : null}
                        </button>
                        <span className={CRM_ICON_FILTER_TIP} role="tooltip">
                          {openTip}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {emailOpenFilterMode === 'opened-in-days' ||
                emailOpenFilterMode === 'last-sent-unopened-days' ||
                emailOpenFilterMode === 'no-open-since-days' ? (
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={emailOpenFilterDays}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number.parseInt(raw, 10);
                      setEmailOpenFilterDays(
                        Number.isFinite(n) ? Math.max(1, Math.min(365, n)) : 7,
                      );
                      setPage(1);
                    }}
                    className="h-[38px] w-11 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-1 text-center text-xs font-semibold text-[var(--text-main)] tabular-nums shadow-[var(--crm-shadow-input)] outline-none focus:ring-1 focus:ring-[var(--primary)]/20"
                    aria-label="Days for opens filter"
                    title="Days (N)"
                  />
                ) : null}
                <div className={CRM_TOOLBAR_ICON_GROUP} role="group" aria-label="Email reply filters">
                  {(['all', 'replied', 'not-replied'] as const).map((mode) => {
                    const replyTip =
                      mode === 'all'
                        ? 'Do not filter by thread replies. Click to clear this filter group.'
                        : mode === 'replied'
                          ? 'Keep leads where someone replied in the email thread after our tracked send (inbox sync). Click again to turn off.'
                          : 'Keep leads with no logged thread reply yet. Click again to turn off.';
                    return (
                      <div key={mode} className="group relative inline-flex shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEmailReplyFilter((m) => (m === mode ? 'all' : mode));
                            setPage(1);
                          }}
                          className={cn(
                            CRM_TOOLBAR_ICON_BTN,
                            mode !== 'all' && emailReplyFilter === mode && CRM_TOOLBAR_ICON_BTN_ACTIVE,
                          )}
                          aria-pressed={emailReplyFilter === mode}
                          aria-label={replyTip}
                        >
                          {mode === 'all' ? <CrmIcon.FilterOff size={14} /> : null}
                          {mode === 'replied' ? <CrmIcon.Reply size={14} /> : null}
                          {mode === 'not-replied' ? <CrmIcon.MailX size={14} /> : null}
                        </button>
                        <span className={CRM_ICON_FILTER_TIP} role="tooltip">
                          {replyTip}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            }
            right={
              <>
                <CrmViewToggle
                  value={viewMode}
                  onChange={(mode) => {
                    if (mode === 'grid') return;
                    setViewMode(mode);
                  }}
                  modes={['list', 'kanban', 'calendar']}
                />
                {hasAccess('leads:write') && (
                  <CrmButton
                    variant="primary"
                    onClick={() => setIsLeadPanelOpen(true)}
                    leftIcon={<CrmIcon.AddFilled size={16} aria-hidden />}
                  >
                    Add Lead
                  </CrmButton>
                )}
              </>
            }
          />

          {leadCategoryTabs.length > 0 && (
            <div
              className="flex items-center gap-1 overflow-x-auto px-4 pt-2.5 pb-1 shrink-0"
              role="tablist"
              aria-label="Lead type"
            >
              {[{ _id: '__all__', label: 'All Leads' }, ...leadCategoryTabs].map((tab) => {
                const isAll = tab._id === '__all__';
                const isActive = isAll ? !activeLeadCategory : activeLeadCategory === tab.label;
                return (
                  <button
                    key={tab._id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveLeadCategory(isAll ? '' : tab.label);
                      setPage(1);
                    }}
                    className={cn(
                      'shrink-0 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]',
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-auto custom-scrollbar">
            {showWebsiteLeads ? (
              <WebsiteLeadsPanel />
            ) : loading ? (
              <div className="w-full h-64 flex items-center justify-center"><Loader2 size={40} className="animate-spin text-text-muted" /></div>
            ) : viewMode === 'kanban' ? (
              <CrmKanbanBoard
                ref={kanbanBoardRef}
                onDragOver={handleKanbanDragOver}
                onDragEnd={stopAutoScroll}
                onDrop={stopAutoScroll}
                className="min-h-full bg-[#f7f8f9] p-4"
                style={{ scrollBehavior: 'auto' }}
              >
                {boardColumns.map((col) => {
                  const stageLeads = stageLeadsByStage.get(col.key) || [];
                  const visibleCount = stageVisibleCounts[col.key] || INITIAL_STAGE_CARD_LIMIT;
                  const visibleStageLeads = stageLeads.slice(0, visibleCount);
                  const stageLeadIds = stageLeads.map((l) => l._id);
                  const isAllStageSelected =
                    stageLeadIds.length > 0 && stageLeadIds.every((id) => selectedIds.has(id));
                  const remainingCount = stageLeads.length - visibleStageLeads.length;
                  const stageValueTotal = stageLeads.reduce((sum, lead) => {
                    const raw =
                      Number((lead as any).expectedDealValue) ||
                      Number((lead as any).dealValueINR) ||
                      Number((lead as any).dealValue) ||
                      Number((lead as any).amount) ||
                      0;
                    return sum + (Number.isFinite(raw) ? raw : 0);
                  }, 0);
                  return (
                    <CrmKanbanColumn
                      key={col.key}
                      title={col.name}
                      stageKey={col.name}
                      summary={
                        <>
                          {stageLeads.length} Lead{stageLeads.length === 1 ? '' : 's'}
                          {stageValueTotal > 0
                            ? ` - ₹${stageValueTotal.toLocaleString('en-IN')}`
                            : ''}
                        </>
                      }
                      onDragOver={col.isUnassigned ? undefined : handleDragOver}
                      onDrop={
                        col.isUnassigned
                          ? undefined
                          : (e) => handleDrop(e, col.name)
                      }
                      onAdd={
                        hasAccess('leads:write')
                          ? () => setIsLeadPanelOpen(true)
                          : undefined
                      }
                      headerExtra={
                        stageLeadIds.length > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectStage(stageLeadIds);
                            }}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-2 transition-all ${isAllStageSelected ? 'border-primary bg-primary text-white' : 'border-[var(--border-color)] bg-white hover:border-primary/40'}`}
                            title={isAllStageSelected ? 'Deselect section' : 'Select all in section'}
                            aria-label={isAllStageSelected ? 'Deselect all leads in section' : 'Select all leads in section'}
                          >
                            {isAllStageSelected && <Check size={10} strokeWidth={4} />}
                          </button>
                        ) : null
                      }
                      style={{ minHeight: 400 }}
                    >
                        {visibleStageLeads.map((lead) => {
                          const getFieldValue = (field: string): string =>
                            resolveCrmCardFieldValue('leads', lead as unknown as Record<string, unknown>, field);
                          const valueField = cardFields.find((f) => /value|amount|revenue|deal/i.test(f));
                          const value = valueField ? getFieldValue(valueField) : '';
                          const leadName =
                            `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Untitled';

                          return (
                          <CrmKanbanCard
                            key={lead._id}
                            stageKey={col.name}
                            draggable={canMoveLeadsAcrossPipelines && !exitingLeadIds.has(lead._id)}
                            onDragStart={canMoveLeadsAcrossPipelines ? (e) => handleDragStart(e, lead._id) : undefined}
                            className={cn(
                              canMoveLeadsAcrossPipelines ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                              selectedIds.has(lead._id) ? 'ring-2 ring-[var(--primary)]/25' : '',
                              leadNeedsOutreach(lead._id) && !selectedIds.has(lead._id) && 'ring-1 ring-amber-300',
                              exitingLeadIds.has(lead._id) && 'pointer-events-none translate-x-8 -rotate-2 scale-95 opacity-0',
                            )}
                            onClick={() => !exitingLeadIds.has(lead._id) && router.push(`/crm/leads/${lead._id}`)}
                          >
                            <CrmKanbanCardHead
                              tone={crmKanbanAvatarTone(`${lead.firstName}${lead.lastName}${lead._id}`)}
                              initials={`${(lead.firstName?.[0] || '?').toUpperCase()}${(lead.lastName?.[0] || '').toUpperCase()}`}
                              title={leadName}
                              trailing={
                                <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleSelect(lead._id, e)}
                                    className={`flex h-6 w-6 items-center justify-center rounded border transition-all ${selectedIds.has(lead._id) ? 'border-primary bg-primary text-white' : 'border-[var(--border-color)] bg-white text-transparent hover:border-primary/40'}`}
                                    aria-label={selectedIds.has(lead._id) ? 'Deselect lead' : 'Select lead'}
                                  >
                                    <Check size={10} strokeWidth={4} className={selectedIds.has(lead._id) ? 'opacity-100' : 'opacity-40 text-[var(--text-muted)]'} />
                                  </button>
                                  {(lead.mobileNo || lead.phone) ? (
                                    <button
                                      type="button"
                                      onClick={() => setCallLead(lead)}
                                      className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                                      aria-label="Call lead"
                                    >
                                      <Phone size={13} />
                                    </button>
                                  ) : null}
                                  {contactWhatsappUrl(lead) ? (
                                    <button
                                      type="button"
                                      onClick={() => openLeadWhatsApp(lead)}
                                      className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                                      aria-label="Message on WhatsApp"
                                    >
                                      <CrmNavIcon.WhatsApp size={13} />
                                    </button>
                                  ) : null}
                                  {hasAccess('leads:delete') ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(lead._id)}
                                      className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-rose-50 hover:text-rose-500"
                                      aria-label="Delete lead"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  ) : null}
                                </div>
                              }
                            />
                            <CrmKanbanMetaList>
                              {value ? (
                                <CrmKanbanMetaRow icon={<Banknote size={15} strokeWidth={1.75} />}>
                                  {value}
                                </CrmKanbanMetaRow>
                              ) : null}
                              {lead.email ? (
                                <CrmKanbanMetaRow icon={<Mail size={15} strokeWidth={1.75} />}>
                                  {lead.email}
                                </CrmKanbanMetaRow>
                              ) : null}
                              {(lead.mobileNo || lead.phone) ? (
                                <CrmKanbanMetaRow icon={<Phone size={15} strokeWidth={1.75} />}>
                                  {lead.mobileNo || lead.phone}
                                </CrmKanbanMetaRow>
                              ) : null}
                              {lead.organization ? (
                                <CrmKanbanMetaRow icon={<MapPin size={15} strokeWidth={1.75} />}>
                                  {lead.organization}
                                </CrmKanbanMetaRow>
                              ) : null}
                            </CrmKanbanMetaList>
                            <CrmKanbanCardFooter
                              left={
                                <CrmKanbanAvatar size="sm">
                                  {(lead.organization?.[0] || lead.firstName?.[0] || '?').toUpperCase()}
                                </CrmKanbanAvatar>
                              }
                              actions
                            />
                          </CrmKanbanCard>
                          );
                        })}
                        {remainingCount > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setStageVisibleCounts((prev) => ({
                                ...prev,
                                [col.key]:
                                  (prev[col.key] || INITIAL_STAGE_CARD_LIMIT) +
                                  STAGE_CARD_INCREMENT,
                              }))
                            }
                            className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-left text-xs font-semibold text-primary transition hover:bg-primary/5 shadow-[var(--crm-shadow-input)]"
                          >
                            Show more ({remainingCount} remaining)
                          </button>
                        )}
                    </CrmKanbanColumn>
                  );
                })}
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
                        <th className="crm-table-actions sticky top-0 z-10 text-left text-[13px] font-semibold text-[#1f2020]">
                          Action
                        </th>
                        {visibleCols.map(col => (
                          <th
                            key={col.key}
                            className={cn(
                              'sticky top-0 z-10 cursor-grab active:cursor-grabbing',
                              dragOverColKey === col.key && 'relative z-20 border-l-2 border-primary bg-primary/5',
                            )}
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
                              
                              // Internal table column reorder
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

                              // Drop from form fields helper (LeadCreatePanel custom field or core field)
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
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr><td colSpan={visibleCols.length + 2} className="py-20 text-center text-sm font-medium text-[#707070]">No leads found</td></tr>
                      ) : (
                        paginated.map(lead => (
                          <tr
                            key={lead._id}
                            className={cn(
                              'group cursor-pointer transition-colors',
                              selectedIds.has(lead._id) && 'crm-table-row-selected',
                              !selectedIds.has(lead._id) && leadNeedsOutreach(lead._id) && 'bg-amber-50/40',
                            )}
                            onClick={() => router.push(`/crm/leads/${lead._id}`)}
                          >
                            <td className="crm-table-check">
                              <CrmTableCheck
                                checked={selectedIds.has(lead._id)}
                                onChange={(e) => toggleSelect(lead._id, e as React.MouseEvent)}
                                ariaLabel={selectedIds.has(lead._id) ? 'Deselect lead' : 'Select lead'}
                              />
                            </td>
                            <td className="crm-table-actions">
                              <div className="flex items-center justify-start gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {(lead.mobileNo || lead.phone) ? (
                                  <CrmHoverActionIcon
                                    icon={<CrmIcon.PhoneCall size={12} />}
                                    label="Call"
                                    value={(lead.mobileNo || lead.phone)!}
                                    tone="primary"
                                    onClick={() => setCallLead(lead)}
                                  />
                                ) : null}
                                {contactWhatsappUrl(lead) ? (
                                  <CrmHoverActionIcon
                                    icon={<CrmNavIcon.WhatsApp size={12} />}
                                    label="WhatsApp"
                                    value={(lead.mobileNo || lead.phone)!}
                                    tone="whatsapp"
                                    onClick={() => openLeadWhatsApp(lead)}
                                  />
                                ) : null}
                                <CrmTableActionMenu
                                  menuAlign="left"
                                  onEdit={() => router.push(`/crm/leads/${lead._id}`)}
                                  onNotes={() => setActivityLead(lead)}
                                  onReassign={
                                    hasAccess('leads:write')
                                      ? () => {
                                          setSelectedIds(new Set([lead._id]));
                                          setAssignOwner('');
                                          setAssignOpen(true);
                                        }
                                      : undefined
                                  }
                                  onDelete={
                                    hasAccess('leads:delete')
                                      ? () => handleDelete(lead._id)
                                      : undefined
                                  }
                                />
                              </div>
                            </td>
                            {visibleCols.map(col => <td key={col.key}>{renderCell(lead, col.key)}</td>)}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </CrmTable>
              </CrmTableShell>
                <Pagination total={displayedTotal} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
              </>
            ) : (
              <CRMCalendarView items={filteredLeads} onItemClick={(item) => router.push(`/crm/leads/${item._id}`)} />
            )}
          </div>
        </div>
      </div>

      <LeadCreatePanel 
        isOpen={isLeadPanelOpen} 
        onClose={() => setIsLeadPanelOpen(false)}
        initialPipelineId={selectedPipelineId}
        onSuccess={() => {
            setIsLeadPanelOpen(false);
            fetchData();
        }}
      />

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
              className={`flex items-center gap-3 rounded-[var(--radius-md)] border p-2.5 transition-all cursor-grab active:cursor-grabbing ${
                cfDragOverVisualIdx === i ? 'border-[var(--primary)] bg-[var(--primary-light)]' : cfDragVisualIdx === i ? 'border-dashed border-[var(--border-color)] opacity-40' : 'border-transparent hover:bg-[var(--surface-dim)]'
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
                    if (def) {
                      setCfMergeDeleteField({ _id: def._id, name: def.name, key: def.key });
                    }
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
        title="Delete leads permanently?"
        loading={isDeleting}
        description={
          <>
            You are about to remove{' '}
            <span className="font-medium text-[var(--error)]">{selectedIds.size} records</span>. This action is final and
            cannot be undone.
          </>
        }
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md rounded-md">
          <DialogHeader>
            <DialogTitle>Assign leads to owner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-[var(--text-muted)]">
              Reassign {selectedIds.size} selected lead
              {selectedIds.size === 1 ? '' : 's'} to another CRM user.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">New owner</span>
              {ownersLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading users…
                </div>
              ) : (
                <select
                  value={assignOwner}
                  onChange={(e) => setAssignOwner(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                >
                  <option value="">Select a teammate…</option>
                  {ownerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {!ownersLoading && ownerOptions.length === 0 ? (
              <p className="text-xs text-amber-700">
                No CRM users found. You can still type an owner name below.
              </p>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Or enter owner name
              </span>
              <input
                value={assignOwner}
                onChange={(e) => setAssignOwner(e.target.value)}
                placeholder="First Last"
                className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={assigning || !assignOwner.trim()}
              onClick={() => void handleBulkAssign()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {assigning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" aria-hidden />
              )}
              Assign
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isImportModalOpen && (
        <ImportModal
          isOpen
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={fetchData}
          type="leads"
        />
      )}
      <LeadActivityPopup
        open={!!activityLead}
        onClose={() => setActivityLead(null)}
        lead={activityLead}
        onUpdated={() => void fetchLeadsList(selectedPipelineId || null)}
      />
      <SendEmailModal
        isOpen={!!emailLead}
        onClose={() => setEmailLead(null)}
        recipientEmail={emailLead?.email || ''}
        recipientName={`${emailLead?.firstName} ${emailLead?.lastName}`}
        module="leads"
        entityId={emailLead?._id}
        crmInboxMode
      />
      <CallLeadModal
        open={!!callLead}
        onClose={() => setCallLead(null)}
        phone={callLead?.mobileNo || callLead?.phone}
        leadId={callLead?._id}
        leadName={`${callLead?.firstName || ''} ${callLead?.lastName || ''}`.trim()}
        relatedType="Lead"
      />
      <SendEmailModal
        isOpen={isBulkEmailOpen && selectedIds.size > 0}
        onClose={() => {
          setIsBulkEmailOpen(false);
          setSelectedIds(new Set());
        }}
        recipientEmail={bulkRecipients.map((r) => r.email).join(", ")}
        recipientName={`${selectedIds.size} selected leads`}
        module="leads"
        entityId={Array.from(selectedIds)[0]}
        crmInboxMode
        bulkRecipients={bulkRecipients}
      />

      <DeleteCustomFieldMergeDialog
        open={!!cfMergeDeleteField}
        onOpenChange={(open) => !open && setCfMergeDeleteField(null)}
        field={cfMergeDeleteField}
        module="leads"
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

      {/* Stage automation — disabled for now, not needed yet. Re-enable by uncommenting
          (and the matching "Stage rules" button above).
      <LeadStageRulesPanel
        isOpen={stageRulesPanelOpen}
        onClose={() => setStageRulesPanelOpen(false)}
        pipelineId={selectedPipelineId}
        pipelineName={selectedPipeline?.name || 'Pipeline'}
        selectedLeadIds={Array.from(selectedIds)}
        canEditRules={
          hasAccess('workflows:write') ||
          hasAccess('settings:write') ||
          hasAccess('settings-workflows:write')
        }
        onApplied={() => {
          void fetchLeadsList(selectedPipelineId || null);
          invalidateCrmAfterMutation('leads', 'workspace', 'attention');
        }}
      />
      */}
    </div>
  );
}
