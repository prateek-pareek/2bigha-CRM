"use client";

import { useDeferredValue, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Search, Plus, MoreHorizontal, Download, Loader2, Upload, Settings2, X, Check, ChevronDown, User, Mail, LayoutGrid, List, Calendar as CalendarIcon, GripVertical, Trash2, RefreshCw, ArrowDown, ArrowUp } from 'lucide-react';
import CrmEmailEngagementIcons from '@/components/crm/email/engagement/CrmEmailEngagementIcons';
import { ContactCreatePanel } from '@/components/crm/records/create/LeadCreatePanel';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import CRMSavedViews, { SavedViewData } from '@/components/crm/segments/CRMSavedViews';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import CallLeadModal from '@/components/crm/records/detail/CallLeadModal';
import { contactWhatsappUrl } from '@/lib/crm/crm-messaging-links';
import { BulkEmailToolbarButton } from '@/components/crm/email/composer/BulkEmailToolbarButton';
import { buildBulkEmailRecipients } from '@/lib/crm/bulk-email';
import Pagination from '@/components/suite/shell/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import { CRM_API_URL } from '@/lib/crm/config';
import {
  crmCacheKeys,
  crmCachePeek,
  crmCacheSet,
  crmCacheShouldRevalidate,
} from '@/lib/crm/shared/prefetch-cache';
import { invalidateCrmAfterMutation } from '@/lib/crm/shared/invalidate-on-mutation';
import { CrmCustomFieldValue } from '@/components/crm/records/forms/CrmCustomFieldValue';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { buildCrmListSearchParams, CRM_BOARD_PAGE_SIZE, unwrapCrmListPayload } from '@/lib/crm/list-query';
import {
  emptyCrmEmailEngagementStats,
  mergeCrmEmailEngagementStats,
  type CrmEmailEngagementStats,
} from '@/lib/crm/crmEmailEngagementStats';
import { fetchEmailEngagementBatch } from '@/lib/crm/fetchEmailEngagementBatch';
import CRMCalendarView from '@/components/crm/calendar/CRMCalendarView';
import { CrmPropertyManagerModal } from '@/components/crm/records/detail/CrmPropertyManagerModal';
import { CrmBulkDeleteConfirmModal } from '@/components/crm/records/detail/CrmBulkDeleteConfirmModal';
import {
  CrmPageHeader,
  CrmCountBadge,
  CrmButton,
  CrmViewToggle,
  CrmListToolbar,
  CrmHeaderTools,
  CrmScopeToggle,
  CrmTableShell,
  CrmTable,
  CrmListPersonCell,
  CrmListOrgCell,
  CrmListMutedText,
  CrmTableCheck,
  CrmTableActionMenu,
  CrmSoftBadge,
  CrmRecordCardGrid,
  CrmRecordCard,
  CrmRecordCardSkeleton,
} from '@/components/crm/ui';
import { CrmIcon, CrmNavIcon } from '@/lib/crm/shared/icons';
import { CRM_LIST_PAGE, CRM_MENU_ITEM, CRM_TOOLBAR_SELECT } from '@/lib/crm/ui';

const ImportModal = dynamic(() => import('@/components/crm/records/create/ImportModal'), { ssr: false });

interface Contact {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobileNo?: string;
  organization?: any;
  jobTitle: string;
  createdAt: string;
  customFields?: Record<string, any>;
  createdBy?: string;
  contactOwner?: string;
  /** Linked lead id when this contact was synced/converted from a lead. */
  sourceLead?: string | { _id: string } | null;
  lastEmailActivityAt?: string | null;
}

function contactSourceLeadId(contact: Contact): string | null {
  const sl = contact.sourceLead;
  if (!sl) return null;
  if (typeof sl === 'string') {
    const id = sl.trim();
    return id || null;
  }
  if (typeof sl === 'object' && sl._id) {
    const id = String(sl._id).trim();
    return id || null;
  }
  return null;
}

interface Column {
  key: string;
  label: string;
  visible: boolean;
}

const DEFAULT_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', visible: true },
  { key: 'email', label: 'Email', visible: true },
  { key: 'phone', label: 'Phone', visible: true },
  { key: 'jobTitle', label: 'Job Title', visible: true },
  { key: 'organization', label: 'Organization', visible: true },
  { key: 'createdAt', label: 'Created', visible: true },
  { key: 'lastEmailActivityAt', label: 'Last Email Activity', visible: true },
];

const STORAGE_KEY = 'contacts_columns_v2';
const VIEW_MODE_KEY = 'crm_contacts_view_mode_v1';

type ContactViewMode = 'list' | 'grid' | 'calendar';

function loadColumns(): Column[] {
  if (typeof window === 'undefined') return DEFAULT_COLUMNS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: Column[] = JSON.parse(saved);
      const builtInKeys = new Set(DEFAULT_COLUMNS.map((c) => c.key));
      const filtered = parsed.filter(
        (c) => builtInKeys.has(c.key) || c.key.startsWith('cf_'),
      );
      const filteredKeys = new Set(filtered.map((c) => c.key));
      const missingBuiltIn = DEFAULT_COLUMNS.filter((c) => !filteredKeys.has(c.key)).map((c) => ({
        ...c,
        visible: true,
      }));
      return [...filtered, ...missingBuiltIn];
    }
  } catch { /* ignore */ }
  return DEFAULT_COLUMNS;
}

function saveColumns(cols: Column[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  /** Total row count from the server when using paged fetch (list view, no heavy client filters). */
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const { hasAccess, isAdmin, user } = usePermissions();

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailContact, setEmailContact] = useState<Contact | null>(null);
  const [callContact, setCallContact] = useState<Contact | null>(null);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Pagination & Columns
  const [viewMode, setViewMode] = useState<ContactViewMode>('list');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<Column[]>([]);
  const [newColLabel, setNewColLabel] = useState('');
  const [showMyContactsOnly, setShowMyContactsOnly] = useState(false);
  const [lastActivityFilter, setLastActivityFilter] = useState<'all' | 'today' | 'last7' | 'last30' | 'last90' | 'no-activity'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'lastEmailActivityAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [contactEmailStatsById, setContactEmailStatsById] = useState<
    Record<string, CrmEmailEngagementStats>
  >({});

  // Actions menu
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [contactCfDefs, setContactCfDefs] = useState<{ key: string; type?: string }[]>([]);
  const cfDragRef = useRef<number | null>(null);
  const [cfDragVisualIdx, setCfDragVisualIdx] = useState<number | null>(null);
  const [cfDragOverVisualIdx, setCfDragOverVisualIdx] = useState<number | null>(null);

  /** Calendar and email-activity filters need the full set client-side; default list uses server pagination. */
  const needsClientFullList = viewMode === 'calendar';

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'list' || saved === 'grid' || saved === 'calendar') setViewMode(saved);
  }, []);

  const changeViewMode = useCallback((mode: ContactViewMode) => {
    setViewMode(mode);
    setPage(1);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
  }, []);

  const emailEngagement = useMemo(
    () => ({ lastActivity: lastActivityFilter }),
    [lastActivityFilter],
  );

  const listShowsLastEmailColumn = useMemo(
    () => viewMode === 'list' && columns.some((c) => c.visible && c.key === 'lastEmailActivityAt'),
    [viewMode, columns],
  );
  /** List name badges + last-activity column + activity-range filters (same signals as leads board). */
  const needsContactEmailActivityFetch = useMemo(
    () => viewMode === 'list' || viewMode === 'grid' || listShowsLastEmailColumn,
    [viewMode, listShowsLastEmailColumn],
  );

  useEffect(() => {
    if (!needsContactEmailActivityFetch) {
      setContactEmailStatsById({});
      return;
    }
    if (!contacts.length) {
      setContactEmailStatsById({});
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const ids = contacts.map((c) => c._id);
      const sourceLeadIds = [
        ...new Set(
          contacts
            .map((c) => contactSourceLeadId(c))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const [contactById, leadById] = await Promise.all([
        fetchEmailEngagementBatch(token, ids, 'contacts'),
        sourceLeadIds.length
          ? fetchEmailEngagementBatch(token, sourceLeadIds, 'leads')
          : Promise.resolve({} as Record<string, CrmEmailEngagementStats>),
      ]);
      if (cancelled) return;
      // Merge linked-lead outreach into contact stats (same badge rules as leads).
      const merged: Record<string, CrmEmailEngagementStats> = {};
      for (const contact of contacts) {
        const leadId = contactSourceLeadId(contact);
        merged[contact._id] =
          mergeCrmEmailEngagementStats(
            contactById[contact._id],
            leadId ? leadById[leadId] : undefined,
          ) ?? emptyCrmEmailEngagementStats();
      }
      setContactEmailStatsById(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts, needsContactEmailActivityFetch]);

  const applyContactsPayload = useCallback(
    (payload: { data?: Contact[]; total?: number } | Contact[]) => {
      const unwrapped = unwrapCrmListPayload<Contact>(payload);
      setContacts(unwrapped.data);
      setServerTotal(unwrapped.total);
    },
    [],
  );

  const fetchContacts = useCallback(async (opts?: { force?: boolean }) => {
    const force = !!opts?.force;
    if (force) {
      invalidateCrmAfterMutation('contacts');
    }
    const filtersStr = filters.length ? JSON.stringify(filters) : '';
    const emailEngStr = Object.values(emailEngagement).join(',');
    const listKey = crmCacheKeys.contactsList({
      page: needsClientFullList ? 1 : page,
      pageSize: needsClientFullList ? CRM_BOARD_PAGE_SIZE : pageSize,
      search: debouncedSearch,
      filtersStr,
      emailEngStr,
      mine: showMyContactsOnly,
      sortBy,
      sortOrder,
    });
    const cached = force
      ? null
      : crmCachePeek<{ data?: Contact[]; total?: number } | Contact[]>(listKey);
    if (cached?.data && !needsClientFullList) {
      applyContactsPayload(cached.data);
      setLoading(false);
    }

    const shouldFetch = force || !cached || crmCacheShouldRevalidate(cached.ageMs);
    if (!shouldFetch && cached?.data) return;

    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    try {
      const params = buildCrmListSearchParams({
        page: needsClientFullList ? 1 : page,
        pageSize: needsClientFullList ? CRM_BOARD_PAGE_SIZE : pageSize,
        search: debouncedSearch,
        filters,
        emailEngagement,
        extra: {
          mine: showMyContactsOnly ? '1' : undefined,
          sortBy,
          sortOrder,
        },
      });
      const res = await fetch(`${CRM_API_URL}/crm/contacts?${params.toString()}`, {
        headers,
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        crmCacheSet(listKey, data);
        applyContactsPayload(data);
      }
    } catch (err) {
      console.error('Failed to fetch contacts', err);
    } finally {
      setLoading(false);
    }
  }, [needsClientFullList, page, pageSize, debouncedSearch, showMyContactsOnly, filters, emailEngagement, sortBy, sortOrder, applyContactsPayload]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, needsClientFullList, showMyContactsOnly, lastActivityFilter, filters, sortBy, sortOrder]);
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/contacts/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setShowConfirmDelete(false);
        invalidateCrmAfterMutation('contacts', 'workspace', 'attention');
        void fetchContacts();
      }
    } catch (err) {
      console.error('Bulk delete failed', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    const currentItems = paginated.map(c => c._id);
    const allSelected = currentItems.every(id => selectedIds.has(id));

    const next = new Set(selectedIds);
    if (allSelected) {
      currentItems.forEach(id => next.delete(id));
    } else {
      currentItems.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  useEffect(() => {
    void fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    setColumns(loadColumns());
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${CRM_API_URL}/custom-fields?module=contacts`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: any[]) => {
          setContactCfDefs((rows || []).map((f) => ({ key: f.key, type: f.type })));
          // Merge custom fields into columns state
          const cfCols: Column[] = (rows || []).map(f => ({ key: `cf_${f.key}`, label: f.name, visible: true }));
          setColumns(prev => {
            const builtInKeys = new Set(DEFAULT_COLUMNS.map(c => c.key));
            const base = prev.filter(c => builtInKeys.has(c.key));
            const existingCfKeys = new Set(prev.filter(c => !builtInKeys.has(c.key)).map(c => c.key));
            const merged = cfCols.map(c => existingCfKeys.has(c.key) ? prev.find(p => p.key === c.key)! : c);
            const updated = [...base, ...merged];
            saveColumns(updated);
            return updated;
          });
        })
        .catch(() => setContactCfDefs([]));
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visibleCols = columns.filter(c => c.visible);

  const searchFiltered = useMemo(() => {
    if (!needsClientFullList) return contacts;
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    return contacts.filter((contact) =>
      `${contact.firstName} ${contact.lastName} ${contact.email} ${contact.jobTitle} ${contact.phone || ""}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [needsClientFullList, contacts, deferredSearch]);

  const ownerFiltered = useMemo(() => {
    if (!needsClientFullList) return searchFiltered;
    if (!showMyContactsOnly || !user) return searchFiltered;
    return searchFiltered.filter((c) => {
      const createdId =
        typeof c.createdBy === "string"
          ? c.createdBy
          : c.createdBy && typeof c.createdBy === "object" && "_id" in c.createdBy
            ? String((c.createdBy as { _id: string })._id)
            : "";
      return (
        c.contactOwner === `${user.firstName} ${user.lastName}` || createdId === user._id
      );
    });
  }, [needsClientFullList, showMyContactsOnly, user, searchFiltered]);

  const filtered = useMemo(() => {
    if (!needsClientFullList) return contacts;
    return applyFilters(ownerFiltered, filters, filterProperties);
  }, [needsClientFullList, contacts, ownerFiltered, filters, filterProperties]);

  const paginated = useMemo(() => {
    if (needsClientFullList) {
      return filtered.slice((page - 1) * pageSize, page * pageSize);
    }
    return filtered;
  }, [needsClientFullList, filtered, page, pageSize]);

  const displayedTotal = needsClientFullList ? filtered.length : serverTotal;

  const handleSaveColumns = () => {
    setColumns(draftColumns);
    saveColumns(draftColumns);
    setIsColumnsOpen(false);
  };

  const handleApplyView = (view: SavedViewData | null) => {
    if (!view) {
      setFilters([]);
      return;
    }
    setFilters(view.filters || []);
    if (view.sortBy === 'lastEmailActivityAt' || view.sortBy === 'createdAt') {
      setSortBy(view.sortBy);
    }
    if (view.sortOrder === 'asc' || view.sortOrder === 'desc') {
      setSortOrder(view.sortOrder);
    }
    if (view.columns?.length) {
      const viewColMap = new Map(view.columns.map(c => [c.key, c]));
      const nextCols = columns.map(c => ({
        ...c,
        visible: viewColMap.has(c.key) ? viewColMap.get(c.key)!.visible : c.visible,
      }));
      setColumns(nextCols);
      saveColumns(nextCols);
    }
    setPage(1);
  };

  const handleAddColumn = async () => {
    const label = newColLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, '_');

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: label, key, module: 'contacts', type: 'text' })
      });
      if (res.ok) {
        setDraftColumns([...draftColumns, { key: `cf_${key}`, label, visible: true }]);
        setNewColLabel('');
      }
    } catch (err) {
      console.error('Failed to add custom property', err);
    }
  };

  const handleCfDrop = (visualIdx: number) => {
    if (cfDragRef.current === null || cfDragRef.current === visualIdx) return;
    const next = [...draftColumns];
    const [moved] = next.splice(cfDragRef.current, 1);
    next.splice(visualIdx, 0, moved);
    setDraftColumns(next);
  };

  const handleExport = async () => {
    setExporting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/export/contacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const csvContent = await res.text();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `contacts_export_${new Date().toISOString().split('T')[0]}.csv`);
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

  const renderCell = (contact: Contact, colKey: string) => {
    if (colKey === 'name') {
      const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || '—';
      const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.trim() || fullName[0] || '?';
      return (
        <CrmListPersonCell
          name={fullName}
          initials={initials}
          trailing={
            <CrmEmailEngagementIcons
              stats={contactEmailStatsById[contact._id]}
              className="shrink-0"
            />
          }
        />
      );
    }
    if (colKey === 'email') return <CrmListMutedText>{contact.email || '—'}</CrmListMutedText>;
    if (colKey === 'phone') return <CrmListMutedText>{contact.phone || '—'}</CrmListMutedText>;
    if (colKey === 'jobTitle') return <CrmListMutedText>{contact.jobTitle || '—'}</CrmListMutedText>;
    if (colKey === 'organization') {
      const orgName = contact.organization?.name || contact.organization || '—';
      return <CrmListOrgCell name={typeof orgName === 'string' ? orgName : '—'} />;
    }
    if (colKey === 'createdAt') return (
      <CrmListMutedText>
        {new Date(contact.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
      </CrmListMutedText>
    );
    if (colKey === 'lastEmailActivityAt') {
      const iso = contactEmailStatsById[contact._id]?.latestActivityIso;
      return <CrmListMutedText>{iso ? new Date(iso).toLocaleString() : 'No activity'}</CrmListMutedText>;
    }

    if (colKey.startsWith('cf_')) {
      const cfKey = colKey.replace('cf_', '');
      const def = contactCfDefs.find((f) => f.key === cfKey);
      const raw = contact.customFields?.[cfKey];
      return (
        <span className="text-text-muted font-medium text-sm inline-flex min-w-0 max-w-[220px]">
          <CrmCustomFieldValue value={raw} type={def?.type} />
        </span>
      );
    }
    return null;
  };

  const isAllPaginatedSelected = useMemo(
    () => paginated.length > 0 && paginated.every(c => selectedIds.has(c._id)),
    [paginated, selectedIds],
  );

  const bulkRecipients = useMemo(
    () => buildBulkEmailRecipients(selectedIds, contacts, "contacts"),
    [selectedIds, contacts],
  );

  return (
    <div className={CRM_LIST_PAGE}>
      <CrmPageHeader
        bordered={false}
        title="Contacts"
        badge={<CrmCountBadge>{displayedTotal}</CrmCountBadge>}
        breadcrumbs={[
          { label: 'Home', href: '/crm/workspace/summary' },
          { label: 'Contacts' },
        ]}
        actions={
          <CrmHeaderTools
            leading={
              <>
                {selectedIds.size > 0 && isAdmin && (
                  <CrmButton variant="danger" onClick={() => setShowConfirmDelete(true)} leftIcon={<CrmIcon.Trash size={14} />}>
                    Delete {selectedIds.size}
                  </CrmButton>
                )}
                <BulkEmailToolbarButton
                  selectedCount={selectedIds.size}
                  recipientCount={bulkRecipients.length}
                  entityLabel="contact"
                  onClick={() => setIsBulkEmailOpen(true)}
                />
              </>
            }
            exportMenuRef={actionsRef}
            exportMenuOpen={isActionsOpen}
            onExportMenuToggle={() => setIsActionsOpen(!isActionsOpen)}
            exportMenu={
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-[var(--radius-md)] shadow-[var(--crm-shadow-raised)] border border-[var(--border-color)] p-2 z-50 animate-in slide-in-from-top-2 duration-200">
                {hasAccess('admin:manage') && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsActionsOpen(false);
                      handleExport();
                    }}
                    className={CRM_MENU_ITEM}
                  >
                    <CrmIcon.FileXls size={16} />
                    Export as Excel
                  </button>
                )}
              </div>
            }
            onRefresh={() => void fetchContacts({ force: true })}
            canImport={hasAccess('admin:manage')}
            onImport={() => setIsImportModalOpen(true)}
            trailing={
              viewMode === 'list' ? (
                <CrmButton
                  variant="icon"
                  onClick={() => { setDraftColumns(columns.map(c => ({ ...c }))); setIsColumnsOpen(true); }}
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
          <CRMFilterBar
            module="contacts"
            filters={filters}
            onChange={setFilters}
            onClear={() => setFilters([])}
            onPropertiesReady={setFilterProperties}
          />
        }
        searchProps={{
          placeholder: 'Search Keyword',
          value: search,
          onChange: (e) => { setSearch(e.target.value); setPage(1); },
        }}
        leftExtra={
          <>
            <CRMSavedViews
              module="contacts"
              currentFilters={filters}
              currentColumns={columns}
              onApplyView={handleApplyView}
            />
            <CrmScopeToggle
              allLabel="All Contacts"
              mineLabel="My Contacts"
              showMineOnly={showMyContactsOnly}
              onShowAll={() => { setShowMyContactsOnly(false); setPage(1); }}
              onShowMine={() => { setShowMyContactsOnly(true); setPage(1); }}
              onClearAll={() => { setSearch(''); setFilters([]); }}
            />
            <select
              value={lastActivityFilter}
              onChange={(e) => { setLastActivityFilter(e.target.value as any); setPage(1); }}
              title="Filter contacts by last tracked or CRM email activity on the record."
              aria-label="Filter contacts by last email activity"
              className={CRM_TOOLBAR_SELECT}
            >
              <option value="all">Last Email: Any</option>
              <option value="today">Last Email: Today</option>
              <option value="last7">Last Email: 7 Days</option>
              <option value="last30">Last Email: 30 Days</option>
              <option value="last90">Last Email: 90 Days</option>
              <option value="no-activity">Last Email: No Activity</option>
            </select>
          </>
        }
        right={
          <>
            <CrmViewToggle
              value={viewMode}
              onChange={(mode) => changeViewMode(mode === 'calendar' ? 'calendar' : mode === 'grid' ? 'grid' : 'list')}
              modes={['list', 'grid', 'calendar']}
            />
            {hasAccess('contacts:write') && (
              <CrmButton
                variant="primary"
                onClick={() => setIsModalOpen(true)}
                leftIcon={<CrmIcon.AddFilled size={16} />}
              >
                Add Contact
              </CrmButton>
            )}
          </>
        }
      />

      {/* Table / content — CRMS white panel under toolbar */}
      {viewMode === 'calendar' ? (
        <CRMCalendarView
          items={filtered}
          onItemClick={(contact) => router.push(`/crm/contacts/${contact._id}`)}
        />
      ) : viewMode === 'grid' ? (
        <div className="flex flex-col gap-4">
          {loading ? (
            <CrmRecordCardSkeleton />
          ) : paginated.length === 0 ? (
            <div className="rounded-[5px] border border-[#e2e8f0] bg-white py-20 text-center text-sm font-medium text-[#707070]">
              No contacts found
            </div>
          ) : (
            <CrmRecordCardGrid>
              {paginated.map((contact) => {
                const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unnamed contact';
                const initials =
                  `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.trim() || fullName[0] || '?';
                const orgName =
                  typeof contact.organization === 'string'
                    ? contact.organization
                    : contact.organization?.name || '';
                return (
                  <CrmRecordCard
                    key={contact._id}
                    initials={initials}
                    toneSeed={`${fullName}${contact._id}`}
                    title={fullName}
                    subtitle={contact.jobTitle || undefined}
                    selectable
                    selected={selectedIds.has(contact._id)}
                    onSelectedChange={() => toggleSelect(contact._id)}
                    onClick={() => router.push(`/crm/contacts/${contact._id}`)}
                    actions={
                      <CrmTableActionMenu
                        onEdit={() => router.push(`/crm/contacts/${contact._id}`)}
                        onEmail={contact.email ? () => setEmailContact(contact) : undefined}
                        onCall={
                          (contact.mobileNo || contact.phone)
                            ? () => setCallContact(contact)
                            : undefined
                        }
                        onWhatsApp={
                          contactWhatsappUrl(contact)
                            ? () => window.open(contactWhatsappUrl(contact)!, '_blank', 'noopener,noreferrer')
                            : undefined
                        }
                        onDelete={
                          isAdmin
                            ? () => { setSelectedIds(new Set([contact._id])); setShowConfirmDelete(true); }
                            : undefined
                        }
                      />
                    }
                    meta={[
                      { key: 'email', icon: <CrmIcon.Mail size={15} />, label: contact.email || '—' },
                      { key: 'phone', icon: <CrmIcon.Phone size={15} />, label: contact.phone || '—' },
                      { key: 'org', icon: <CrmNavIcon.Building size={15} />, label: orgName || '—' },
                    ]}
                    footerLeft={orgName ? <CrmSoftBadge label={orgName} tone="info" /> : null}
                    footerRight={
                      <CrmEmailEngagementIcons stats={contactEmailStatsById[contact._id]} className="shrink-0" />
                    }
                  />
                );
              })}
            </CrmRecordCardGrid>
          )}
          <Pagination
            total={displayedTotal}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
      <div className="crm-view-panel">
          <CrmTableShell scrollClassName="custom-scrollbar">
            <CrmTable>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="crm-table-check">
                    <CrmTableCheck
                      checked={isAllPaginatedSelected}
                      onChange={toggleSelectAll}
                      ariaLabel={isAllPaginatedSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  {visibleCols.map(col => {
                    const sortable =
                      col.key === 'lastEmailActivityAt' || col.key === 'createdAt';
                    const isActive = sortable && sortBy === col.key;
                    return (
                      <th key={col.key}>
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (sortBy === col.key) {
                                setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
                              } else {
                                setSortBy(col.key as 'createdAt' | 'lastEmailActivityAt');
                                setSortOrder('desc');
                              }
                              setPage(1);
                            }}
                            className={`inline-flex items-center gap-1.5 transition-colors ${
                              isActive
                                ? 'font-semibold text-primary'
                                : 'hover:text-[#1f2020]'
                            }`}
                            title={
                              col.key === 'lastEmailActivityAt'
                                ? 'Sort by last email engagement'
                                : 'Sort by created date'
                            }
                          >
                            {col.label}
                            {isActive ? (
                              sortOrder === 'desc' ? (
                                <CrmIcon.ChevronDown size={12} />
                              ) : (
                                <CrmIcon.ChevronDown size={12} className="rotate-180" />
                              )
                            ) : null}
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    );
                  })}
                  <th className="crm-table-actions text-[13px] font-semibold text-[#1f2020]">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td className="crm-table-check"><div className="mx-auto h-3 w-3 rounded bg-slate-100" /></td>
                      {visibleCols.map(c => (
                        <td key={c.key}><div className="h-3 w-full rounded-md bg-[var(--surface-dim)]" /></td>
                      ))}
                      <td className="crm-table-actions" />
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.length + 2} className="py-20 text-center text-sm font-medium text-[#707070]">
                      No contacts found
                    </td>
                  </tr>
                ) : paginated.map(contact => (
                  <tr
                    key={contact._id}
                    className={`group cursor-pointer transition-colors ${selectedIds.has(contact._id) ? 'crm-table-row-selected' : ''}`}
                    onClick={() => router.push(`/crm/contacts/${contact._id}`)}
                  >
                    <td className="crm-table-check">
                      <CrmTableCheck
                        checked={selectedIds.has(contact._id)}
                        onChange={(e) => toggleSelect(contact._id, e as React.MouseEvent)}
                        ariaLabel={selectedIds.has(contact._id) ? 'Deselect contact' : 'Select contact'}
                      />
                    </td>
                    {visibleCols.map(col => (
                      <td key={col.key}>
                        {renderCell(contact, col.key)}
                      </td>
                    ))}
                    <td className="crm-table-actions">
                      <CrmTableActionMenu
                        onEdit={() => router.push(`/crm/contacts/${contact._id}`)}
                        onEmail={contact.email ? () => setEmailContact(contact) : undefined}
                        onCall={
                          (contact.mobileNo || contact.phone)
                            ? () => setCallContact(contact)
                            : undefined
                        }
                        onWhatsApp={
                          contactWhatsappUrl(contact)
                            ? () => window.open(contactWhatsappUrl(contact)!, '_blank', 'noopener,noreferrer')
                            : undefined
                        }
                        onDelete={
                          isAdmin ? () => { setSelectedIds(new Set([contact._id])); setShowConfirmDelete(true); } : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </CrmTable>
          </CrmTableShell>

        <div className="shrink-0">
          <Pagination
            total={displayedTotal}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
      )}

      <CrmBulkDeleteConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleBulkDelete}
        title="Delete contacts permanently?"
        loading={isDeleting}
        description={
          <>
            You are about to remove{' '}
            <span className="font-medium text-[var(--error)]">{selectedIds.size} records</span>. This action is final and
            cannot be undone.
          </>
        }
      />

      <CrmPropertyManagerModal
        isOpen={isColumnsOpen}
        onClose={() => setIsColumnsOpen(false)}
        onSave={handleSaveColumns}
        footerExtra={
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New attribute name…"
              className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/30"
              value={newColLabel}
              onChange={e => setNewColLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddColumn()}
            />
            <button
              type="button"
              onClick={handleAddColumn}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
            >
              Add
            </button>
          </div>
        }
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
                  onClick={async () => {
                    const cfKey = col.key.replace('cf_', '');
                    const token = localStorage.getItem('token');
                    if (confirm(`Permanently delete attribute "${col.label}"? This cannot be undone.`)) {
                      try {
                        const res = await fetch(`${CRM_API_URL}/custom-fields/by-key/${cfKey}?module=contacts`, {
                          method: 'DELETE',
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                          setColumns(prev => prev.filter(c => c.key !== col.key));
                          setDraftColumns(prev => prev.filter(c => c.key !== col.key));
                          setContactCfDefs(prev => prev.filter(f => f.key !== cfKey));
                        }
                      } catch (err) { console.error(err); }
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
      <ContactCreatePanel
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchContacts}
      />
      {isImportModalOpen && (
        <ImportModal isOpen onClose={() => setIsImportModalOpen(false)} type="contacts" onSuccess={fetchContacts} />
      )}
      <SendEmailModal
        isOpen={!!emailContact}
        onClose={() => setEmailContact(null)}
        recipientEmail={emailContact?.email}
        recipientName={emailContact ? `${emailContact.firstName} ${emailContact.lastName}` : ''}
        module="contacts"
        entityId={emailContact?._id}
      />
      <CallLeadModal
        open={!!callContact}
        onClose={() => setCallContact(null)}
        phone={callContact?.mobileNo || callContact?.phone}
        leadId={callContact?._id}
        leadName={callContact ? `${callContact.firstName} ${callContact.lastName}`.trim() : ''}
        relatedType="Contact"
      />
      <SendEmailModal
        isOpen={isBulkEmailOpen && selectedIds.size > 0}
        onClose={() => {
          setIsBulkEmailOpen(false);
          setSelectedIds(new Set());
        }}
        recipientEmail={bulkRecipients.map((r) => r.email).join(", ")}
        recipientName={`${selectedIds.size} selected contacts`}
        module="contacts"
        entityId={Array.from(selectedIds)[0]}
        crmInboxMode
        bulkRecipients={bulkRecipients}
      />
    </div>
  );
}
