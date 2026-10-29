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
  CrmRecordCardGrid,
  CrmRecordCard,
  CrmRecordCardSkeleton,
  type CrmViewMode,
} from '@/components/crm/ui';
import { CrmIcon } from '@/lib/crm/shared/icons';
import { CRM_LIST_PAGE } from '@/lib/crm/ui';

const ClientDuplicatesModal = dynamic(() => import('@/components/crm/records/create/ClientDuplicatesModal'), { ssr: false });
const ImportModal = dynamic(() => import('@/components/crm/records/create/ImportModal'), { ssr: false });

interface Client {
  _id: string;
  name: string;
  email: string;
  phone: string;
  whatsappNumber?: string;
  additionalEmails?: string[];
  status: string;
  organization?: {
    _id: string;
    name: string;
  };
  createdAt?: string;
  duplicateInfo?: ClientDuplicateInfo;
}

/** Primary email, else the first additional one — many records only carry the latter. */
function clientDisplayEmail(c: Client): string {
  const primary = String(c.email || '').trim();
  if (primary) return primary;
  return (c.additionalEmails || []).map((e) => String(e || '').trim()).find(Boolean) || '';
}

/** Phone, else the WhatsApp number (often the only number on 2bigha-synced clients). */
function clientDisplayPhone(c: Client): string {
  return String(c.phone || '').trim() || String(c.whatsappNumber || '').trim();
}

type ClientDuplicateReason = 'name' | 'email' | 'phone';

interface ClientDuplicateInfo {
  group: number;
  groupSize: number;
  reasons: ClientDuplicateReason[];
  matches: { _id: string; name: string; email: string; phone: string; reasons: ClientDuplicateReason[] }[];
}

const DUPLICATE_REASON_LABELS: Record<ClientDuplicateReason, string> = {
  email: 'Same email',
  phone: 'Same phone',
  name: 'Same name',
};

function duplicateTooltip(info: ClientDuplicateInfo): string {
  const lines = info.matches.map(
    (m) => `• ${m.name || 'Unnamed'} — ${m.reasons.map((r) => DUPLICATE_REASON_LABELS[r]).join(', ')}`,
  );
  return `Duplicate group ${info.group} (${info.groupSize} records)\n${lines.join('\n')}`;
}

function DuplicateBadge({ info, onMerge }: { info: ClientDuplicateInfo; onMerge?: () => void }) {
  const className =
    'inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900';
  if (!onMerge) {
    return <span title={duplicateTooltip(info)} className={className}>Duplicate ×{info.groupSize}</span>;
  }
  return (
    <button
      type="button"
      title={`${duplicateTooltip(info)}\n\nClick to merge the others into this record`}
      onClick={(e) => { e.stopPropagation(); onMerge(); }}
      className={`${className} cursor-pointer hover:bg-amber-200`}
    >
      Duplicate ×{info.groupSize} · Merge
    </button>
  );
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

type ClientViewMode = Extract<CrmViewMode, 'list' | 'grid' | 'calendar'>;

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
  const [duplicateSummary, setDuplicateSummary] = useState<{ records: number; groups: number } | null>(null);
  const deferredSearch = useDeferredValue(search);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isColumnEditorOpen, setIsColumnEditorOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<Column[]>([]);
  const [viewMode, setViewMode] = useState<ClientViewMode>('list');

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'list' || saved === 'grid' || saved === 'calendar') {
      setViewMode(saved);
    }
  }, []);

  const changeViewMode = useCallback((mode: ClientViewMode) => {
    setViewMode(mode);
    setPage(1);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
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
        setDuplicateSummary(data.duplicateSummary ?? null);
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

  const handleMergeDuplicates = async (client: Client) => {
    const others = client.duplicateInfo?.matches ?? [];
    if (!others.length) return;
    const names = others.map((m) => `• ${m.name || 'Unnamed'}${m.email ? ` (${m.email})` : ''}`).join('\n');
    if (!window.confirm(`Keep "${client.name}" and merge these duplicates into it?\n\n${names}\n\nThe duplicates are moved to trash; their activities, emails and links are kept on this record.`)) return;
    try {
      await crmApi.post('/crm/clients/duplicates/merge', {
        masterId: client._id,
        duplicateIds: others.map((m) => m._id),
      });
      await fetchClients();
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Failed to merge duplicate clients.');
    }
  };

  const handleStatusChange = async (client: Client, status: string) => {
    if (status === client.status) return;
    const previous = client.status;
    setClients((prev) => prev.map((c) => (c._id === client._id ? { ...c, status } : c)));
    try {
      await crmApi.patch(`/crm/clients/${client._id}`, { status });
    } catch (err: any) {
      setClients((prev) => prev.map((c) => (c._id === client._id ? { ...c, status: previous } : c)));
      window.alert(err?.response?.data?.message || 'Failed to update client status.');
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
        return (
          <CrmListPersonCell
            name={client.name}
            initials={initials}
            trailing={client.duplicateInfo ? <DuplicateBadge info={client.duplicateInfo} onMerge={() => void handleMergeDuplicates(client)} /> : undefined}
          />
        );
      }
      case 'email': return <CrmListMutedText className="crm-cell-wrap block">{clientDisplayEmail(client) || '—'}</CrmListMutedText>;
      case 'phone': return <CrmListMutedText className="crm-cell-wrap block">{clientDisplayPhone(client) || '—'}</CrmListMutedText>;
      case 'status':
        if (!hasAccess('clients:edit')) return <CrmListStatusBadge label={client.status || '—'} />;
        return (
          <span className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
            <CrmListStatusBadge label={client.status || '—'} className="pr-4" />
            <select
              aria-label={`Status for ${client.name}`}
              title="Change status"
              value={client.status || 'active'}
              onChange={(e) => void handleStatusChange(client, e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="prospective">Prospective</option>
            </select>
            <span className="pointer-events-none absolute right-1 text-[9px] text-white">▾</span>
          </span>
        );
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
      <div className="crm-list-content">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                  value={viewMode}
                  onChange={(mode) =>
                    changeViewMode(mode === 'calendar' ? 'calendar' : mode === 'grid' ? 'grid' : 'list')
                  }
                  modes={['list', 'grid', 'calendar']}
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

          {duplicateSummary && duplicateSummary.records > 0 && (
            <div
              role="status"
              className="mt-1.5 flex items-center gap-2 rounded-[var(--crm-radius-ui)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <span className="font-semibold">
                {duplicateSummary.records} clients look like duplicates ({duplicateSummary.groups}{' '}
                {duplicateSummary.groups === 1 ? 'group' : 'groups'}).
              </span>
              <span>Highlighted rows share a name, email or phone. Exports include a duplicate column.</span>
              {hasAccess('clients:edit') && (
                <button
                  type="button"
                  onClick={() => setIsDuplicatesOpen(true)}
                  className="ml-auto shrink-0 rounded-[var(--crm-radius-ui)] bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Manage duplicates
                </button>
              )}
            </div>
          )}

          {viewMode === 'calendar' ? (
              <div className="crm-view-panel mt-1.5 min-h-0 flex-1 overflow-auto custom-scrollbar">
                <CRMCalendarView items={clients} titleField="name" />
              </div>
            ) : viewMode === 'grid' ? (
              <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-3 overflow-auto custom-scrollbar">
                {loading ? (
                  <CrmRecordCardSkeleton />
                ) : paginated.length === 0 ? (
                  <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white py-20 text-center text-sm font-medium text-[#707070]">
                    No clients found
                  </div>
                ) : (
                  <CrmRecordCardGrid>
                    {paginated.map((client) => {
                      const initials = client.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();
                      const orgName = client.organization?.name || '';
                      return (
                        <CrmRecordCard
                          key={client._id}
                          initials={initials}
                          toneSeed={`${client.name}${client._id}`}
                          title={client.name}
                          subtitle={orgName || undefined}
                          onClick={() => router.push(`/crm/clients/${client._id}`)}
                          actions={
                            <CrmTableActionMenu
                              onEdit={() => router.push(`/crm/clients/${client._id}`)}
                              onEmail={clientDisplayEmail(client) ? () => setEmailClient(client) : undefined}
                            />
                          }
                          meta={[
                            { key: 'email', icon: <CrmIcon.Mail size={15} />, label: clientDisplayEmail(client) || '—' },
                            { key: 'phone', icon: <CrmIcon.Phone size={15} />, label: clientDisplayPhone(client) || '—' },
                          ]}
                          footerLeft={
                            <div className="flex items-center gap-1.5">
                              <CrmListStatusBadge label={client.status || '—'} />
                              {client.duplicateInfo ? <DuplicateBadge info={client.duplicateInfo} onMerge={() => void handleMergeDuplicates(client)} /> : null}
                            </div>
                          }
                          footerRight={
                            client.createdAt ? (
                              <CrmListMutedText className="text-xs">
                                {new Date(client.createdAt).toLocaleDateString(undefined, {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </CrmListMutedText>
                            ) : null
                          }
                        />
                      );
                    })}
                  </CrmRecordCardGrid>
                )}
                <Pagination
                  total={paginationTotal}
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
          <div className="crm-view-panel mt-1.5 min-h-0 flex-1">
              <>
              <CrmTableShell scrollClassName="custom-scrollbar overflow-x-auto">
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
                          className={`group cursor-pointer transition-colors ${
                            client.duplicateInfo ? 'crm-table-row-duplicate' : ''
                          }`}
                          title={client.duplicateInfo ? duplicateTooltip(client.duplicateInfo) : undefined}
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
                              onEmail={clientDisplayEmail(client) ? () => setEmailClient(client) : undefined}
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
      <ClientDuplicatesModal
        isOpen={isDuplicatesOpen}
        onClose={() => setIsDuplicatesOpen(false)}
        onMerged={() => void fetchClients()}
      />
      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchClients}
        client={selectedClient}
      />

      <SendEmailModal
        isOpen={!!emailClient}
        onClose={() => setEmailClient(null)}
        recipientEmail={emailClient ? clientDisplayEmail(emailClient) : ''}
        recipientName={emailClient ? emailClient.name : ''}
        module="clients"
        entityId={emailClient?._id}
      />
    </div>
  );
}
