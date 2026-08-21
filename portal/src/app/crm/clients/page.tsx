"use client";

import { useState, useEffect, useRef, useCallback, useDeferredValue, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Search, Plus, UserCheck, MoreHorizontal, Settings2, GripVertical, X, Check, Trash2, Mail, Phone, LayoutGrid, List, Calendar, Upload, Loader2, Download } from 'lucide-react';
import ClientModal from '@/components/crm/records/create/ClientModal';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import Pagination from '@/components/suite/shell/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import CRMSavedViews, { SavedViewData } from '@/components/crm/segments/CRMSavedViews';
import CRMCalendarView from '@/components/crm/calendar/CRMCalendarView';
import { CRM_API_URL } from '@/lib/crm/config';
import { FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { buildCrmListSearchParams, mergeDateRangeFilter } from '@/lib/crm/list-query';
import CRMDateRangePicker from '@/components/crm/records/forms/CRMDateRangePicker';
import crmApi from '@/lib/crm/api';
import { CrmPropertyManagerModal } from '@/components/crm/records/detail/CrmPropertyManagerModal';
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
  CrmListStatusBadge,
  CrmListMutedText,
  CrmTableActionMenu,
} from '@/components/crm/ui';
import { CrmIcon } from '@/lib/crm/shared/icons';
import { CRM_LIST_PAGE } from '@/lib/crm/ui';

const ImportModal = dynamic(() => import('@/components/crm/records/create/ImportModal'), { ssr: false });

interface Client {
  _id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  organization?: {
    _id: string;
    name: string;
  };
  createdAt?: string;
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
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added Date' },
];

const STORAGE_KEY = 'client_columns_v1';

function loadColumns(): Column[] {
  if (typeof window === 'undefined') return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: true }));
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: true }));
}

function saveColumns(cols: Column[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

const VIEW_MODE_KEY = 'crm_clients_view_mode_v1';

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [emailClient, setEmailClient] = useState<Client | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [serverTotal, setServerTotal] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isColumnEditorOpen, setIsColumnEditorOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<Column[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(VIEW_MODE_KEY) as any) || 'list';
    }
    return 'list';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    }
  }, [viewMode]);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { hasAccess, isAdmin, isLoaded } = usePermissions();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isAdmin) {
      router.replace('/unauthorized?module=crm-clients');
    }
  }, [isLoaded, isAdmin, router]);

  const needsClientFullList = viewMode === 'calendar';
  const apiFilters = useMemo(
    () => mergeDateRangeFilter(filters, dateRange),
    [filters, dateRange],
  );

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildCrmListSearchParams({
        page: needsClientFullList ? undefined : page,
        pageSize: needsClientFullList ? undefined : pageSize,
        search: deferredSearch,
        filters: apiFilters,
      });
      const qs = params.toString();
      const { data } = await crmApi.get(`/crm/clients${qs ? `?${qs}` : ''}`);
      if (data && typeof data === 'object' && 'data' in data && typeof data.total === 'number') {
        setClients(data.data);
        setServerTotal(data.total);
      } else {
        const list = Array.isArray(data) ? data : [];
        setClients(list);
        setServerTotal(list.length);
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  }, [needsClientFullList, page, pageSize, deferredSearch, apiFilters]);

  useEffect(() => {
    setColumns(loadColumns());
  }, []);

  useEffect(() => {
    if (!isLoaded || !isAdmin) return;
    void fetchClients();
  }, [fetchClients, isLoaded, isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, needsClientFullList]);

  const handleExport = async () => {
    setExporting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/export/clients`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const csvContent = await res.text();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.csv`);
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

  const visibleCols = columns.filter(c => c.visible);

  const paginated = useMemo(
    () =>
      needsClientFullList
        ? clients.slice((page - 1) * pageSize, page * pageSize)
        : clients,
    [needsClientFullList, clients, page, pageSize],
  );

  const paginationTotal = needsClientFullList ? clients.length : serverTotal;

  const handleToggleDraft = (key: string) => {
    setDraftColumns(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const handleApplyView = (view: SavedViewData | null) => {
    if (!view) { setFilters([]); return; }
    setFilters(view.filters || []);
    if (view.columns) {
      setColumns(view.columns);
      saveColumns(view.columns);
    }
  };

  const handleSaveColumns = () => {
    setColumns(draftColumns);
    saveColumns(draftColumns);
    setIsColumnEditorOpen(false);
  };

  const renderCell = (client: Client, key: string) => {
    switch (key) {
      case 'name': {
        const initials = client.name.split(' ').map(n => n[0]).join('').slice(0, 2);
        return <CrmListPersonCell name={client.name} initials={initials} />;
      }
      case 'email': return <CrmListMutedText>{client.email || '—'}</CrmListMutedText>;
      case 'phone': return <CrmListMutedText>{client.phone || '—'}</CrmListMutedText>;
      case 'status': return <CrmListStatusBadge label={client.status || '—'} />;
      case 'createdAt': return (
        <CrmListMutedText>
          {client.createdAt ? new Date(client.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </CrmListMutedText>
      );
      default: return null;
    }
  }

  if (!isLoaded || !isAdmin) return null;

  return (
    <div className={CRM_LIST_PAGE}>
      <div className="flex flex-1 h-full overflow-hidden relative min-w-0">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <CrmPageHeader
            bordered={false}
            title="Clients"
            badge={<CrmCountBadge>{paginationTotal}</CrmCountBadge>}
            breadcrumbs={[
              { label: 'Home', href: '/crm/workspace/summary' },
              { label: 'Clients' },
            ]}
            actions={
              <CrmHeaderTools
                leading={
                  hasAccess("clients:read") ? (
                    <CrmButton variant="secondary" onClick={() => router.push('/client-portals')}>
                      Client Portals
                    </CrmButton>
                  ) : null
                }
                canExport={hasAccess("clients:export")}
                onExport={handleExport}
                exporting={exporting}
                onRefresh={() => void fetchClients()}
                canImport={hasAccess("clients:import")}
                onImport={() => setIsImportModalOpen(true)}
                trailing={
                  hasAccess("clients:write") && viewMode === "list" ? (
                    <CrmButton
                      variant="icon"
                      onClick={() => {
                        setDraftColumns(columns);
                        setIsColumnEditorOpen(true);
                      }}
                      title="Edit Columns"
                      leftIcon={<Settings2 size={16} />}
                    />
                  ) : null
                }
              />
            }
          />

          <CrmListToolbar
            filter={
              <CRMFilterBar module="clients" filters={filters} onChange={setFilters} onClear={() => setFilters([])} onPropertiesReady={setFilterProperties} />
            }
            searchProps={{
              placeholder: 'Search',
              value: search,
              onChange: (e) => { setSearch(e.target.value); setPage(1); },
            }}
            leftExtra={
              <>
                <CRMSavedViews module="clients" currentFilters={filters} currentColumns={columns} onApplyView={handleApplyView} />
                <CRMDateRangePicker onChange={setDateRange} compact />
              </>
            }
            right={
              <>
                <CrmViewToggle
                  value={viewMode === 'calendar' ? 'calendar' : 'list'}
                  onChange={(mode) => setViewMode(mode === 'calendar' ? 'calendar' : 'list')}
                  modes={['list', 'calendar']}
                />
                {hasAccess("clients:write") && (
                  <CrmButton
                    variant="primary"
                    onClick={() => {
                      setSelectedClient(null);
                      setIsModalOpen(true);
                    }}
                    leftIcon={<CrmIcon.AddFilled size={16} />}
                  >
                    Add Client
                  </CrmButton>
                )}
              </>
            }
          />

          {viewMode === 'list' ? (
          <div className="crm-view-panel mt-2">
              <>
              <CrmTableShell>
                  <CrmTable>
                    <thead>
                      <tr>
                        {visibleCols.map(col => (
                          <th key={col.key} className="sticky top-0 z-10">{col.label}</th>
                        ))}
                        <th className="crm-table-actions sticky top-0 z-10 text-right text-[13px] font-semibold text-[#1f2020]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        [1, 2, 3, 4, 5].map(i => (
                          <tr key={i} className="animate-pulse">
                            {visibleCols.map(c => (
                              <td key={c.key}><div className="h-4 bg-slate-100 rounded-lg w-3/4" /></td>
                            ))}
                            <td className="crm-table-actions" />
                          </tr>
                        ))
                      ) : paginated.length === 0 ? (
                        <tr>
                          <td colSpan={visibleCols.length + 1} className="py-20 text-center text-sm font-medium text-[#707070]">
                            No clients found
                          </td>
                        </tr>
                      ) : paginated.map(client => (
                        <tr
                          key={client._id}
                          className="group cursor-pointer transition-colors"
                          onClick={() => router.push(`/crm/clients/${client._id}`)}
                        >
                          {visibleCols.map(col => (
                            <td key={col.key}>
                              {renderCell(client, col.key)}
                            </td>
                          ))}
                          <td className="crm-table-actions">
                            <CrmTableActionMenu
                              onEdit={() => router.push(`/crm/clients/${client._id}`)}
                              onEmail={client.email ? () => setEmailClient(client) : undefined}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </CrmTable>
              </CrmTableShell>

                <Pagination
                  total={paginationTotal}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                />
              </>
          </div>
            ) : (
              <div className="mt-2 min-h-0 flex-1">
                <CRMCalendarView items={clients} titleField="name" />
              </div>
            )}
        </div>
      </div>

      <CrmPropertyManagerModal
        isOpen={isColumnEditorOpen}
        onClose={() => setIsColumnEditorOpen(false)}
        onSave={handleSaveColumns}
        title="Edit columns"
        subtitle="Show or hide columns in the table"
        saveLabel="Save columns"
      >
        <div className="space-y-1">
          {draftColumns.map(col => (
            <button
              key={col.key}
              type="button"
              onClick={() => handleToggleDraft(col.key)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2.5 text-left transition-colors hover:border-[var(--primary)] hover:bg-white"
            >
              <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-all ${col.visible ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-color)] bg-white'}`}>
                {col.visible && <Check size={10} className="text-white" strokeWidth={3} />}
              </div>
              <span className={`text-sm font-medium ${col.visible ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{col.label}</span>
            </button>
          ))}
        </div>
      </CrmPropertyManagerModal>

      {isImportModalOpen && (
        <ImportModal isOpen onClose={() => setIsImportModalOpen(false)} onSuccess={fetchClients} type="clients" />
      )}
      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchClients}
        client={selectedClient}
      />

      <SendEmailModal
        isOpen={!!emailClient}
        onClose={() => setEmailClient(null)}
        recipientEmail={emailClient?.email || ''}
        recipientName={emailClient ? emailClient.name : ''}
        module="clients"
        entityId={emailClient?._id}
      />
    </div>
  );
}
