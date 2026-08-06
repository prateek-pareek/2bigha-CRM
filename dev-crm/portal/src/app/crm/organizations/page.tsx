"use client";

import { useDeferredValue, useMemo, useState, useEffect, useRef, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, Building2, MoreHorizontal, Settings2, GripVertical, X, Check, Trash2, ChevronDown, Mail, Upload } from 'lucide-react';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import CRMSavedViews, { SavedViewData } from '@/components/crm/segments/CRMSavedViews';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import Pagination from '@/components/suite/shell/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import crmApi from '@/lib/crm/api';
import { mapPool } from '@/lib/crm/shared/mapPool';
import { FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';
import { buildCrmListSearchParams } from '@/lib/crm/list-query';
import { CrmPropertyManagerModal } from '@/components/crm/records/detail/CrmPropertyManagerModal';
import {
  CrmPageHeader,
  CrmCountBadge,
  CrmButton,
  CrmListToolbar,
  CrmHeaderTools,
  CrmTableShell,
  CrmTable,
  CrmListOrgCell,
  CrmSoftBadge,
  CrmListMutedText,
  CrmTableActionMenu,
  CrmViewToggle,
  CrmRecordCardGrid,
  CrmRecordCard,
  CrmRecordCardSkeleton,
} from '@/components/crm/ui';
import { CrmIcon } from '@/lib/crm/shared/icons';
import { CRM_LIST_PAGE, CRM_TOOLBAR_SELECT } from '@/lib/crm/ui';
import { cn } from '@/lib/utils';

const OrgCreatePanel = dynamic(() => import('@/components/crm/records/create/OrgCreatePanel'), { ssr: false });
const ImportModal = dynamic(() => import('@/components/crm/records/create/ImportModal'), { ssr: false });

interface Organization {
 _id: string;
 /** HubSpot-style company id (use in URLs once set). */
 recordId?: string;
 name: string;
 website: string;
 industry: string;
 phone: string;
 email: string;
 territory?: string;
 noOfEmployees?: string;
 annualRevenue?: number;
 address?: string;
 createdAt?: string;
 lastEmailActivityAt?: string | null;
}

interface Column {
 key: string;
 label: string;
 visible: boolean;
}

const BUILT_IN_COLUMNS: Omit<Column, 'visible'>[] = [
 { key: 'name', label: 'Name' },
 { key: 'recordId', label: 'Record ID' },
 { key: 'website', label: 'Website' },
 { key: 'industry', label: 'Industry' },
 { key: 'phone', label: 'Phone' },
 { key: 'email', label: 'Email' },
 { key: 'territory', label: 'Territory' },
 { key: 'noOfEmployees', label: 'Employees' },
 { key: 'annualRevenue', label: 'Annual Revenue' },
 { key: 'address', label: 'Address' },
 { key: 'createdAt', label: 'Created' },
 { key: 'lastEmailActivityAt', label: 'Last Email Activity' },
];

const STORAGE_KEY = 'org_columns_v2';
const VIEW_MODE_KEY = 'crm_organizations_view_mode_v1';

type OrgViewMode = 'list' | 'grid';

function orgInitials(name: string): string {
 const parts = (name || '').trim().split(/\s+/).filter(Boolean);
 const first = parts[0]?.[0] || '?';
 const second = parts[1]?.[0] || (parts[0] && parts[0].length > 1 ? parts[0][1] : '');
 return `${first}${second}`.toUpperCase();
}

function loadColumns(): Column[] {
 if (typeof window === 'undefined') return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: i < 5 }));
 try {
 const saved = localStorage.getItem(STORAGE_KEY);
 if (saved) {
 const parsed: Column[] = JSON.parse(saved);
 // Merge with builtIn to catch new columns
 const existingKeys = new Set(parsed.map(c => c.key));
 const extras = BUILT_IN_COLUMNS.filter(c => !existingKeys.has(c.key)).map(c => ({ ...c, visible: false }));
 return [...parsed, ...extras];
 }
 } catch { /* ignore */ }
 return BUILT_IN_COLUMNS.map((c, i) => ({ ...c, visible: i < 5 }));
}

function saveColumns(cols: Column[]) {
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

function renderCell(org: Organization, key: string) {
 switch (key) {
 case 'name': return (
 <CrmListOrgCell name={org.name} subtitle={org.address || undefined} />
 );
 case 'recordId': return <CrmListMutedText className="font-mono text-xs">{org.recordId || '—'}</CrmListMutedText>;
 case 'website': return org.website ? (
 <a href={`https://${org.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline" onClick={e => e.stopPropagation()}>{org.website}</a>
 ) : <CrmListMutedText>—</CrmListMutedText>;
 case 'industry': return org.industry ? <CrmSoftBadge label={org.industry} tone="success" /> : <CrmListMutedText>—</CrmListMutedText>;
 case 'phone': return <CrmListMutedText>{org.phone || '—'}</CrmListMutedText>;
 case 'email': return <CrmListMutedText>{org.email || '—'}</CrmListMutedText>;
 case 'territory': return <CrmListMutedText>{org.territory || '—'}</CrmListMutedText>;
 case 'noOfEmployees': return <CrmListMutedText>{org.noOfEmployees || '—'}</CrmListMutedText>;
 case 'annualRevenue': return (
 <span className="text-sm font-semibold text-[#1f2020]">
 {org.annualRevenue ? `$${org.annualRevenue.toLocaleString()}` : '—'}
 </span>
 );
 case 'address': return <CrmListMutedText>{org.address || '—'}</CrmListMutedText>;
 case 'createdAt': return (
 <CrmListMutedText>
 {org.createdAt ? new Date(org.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
 </CrmListMutedText>
 );
 case 'lastEmailActivityAt': return (
 <CrmListMutedText>
 {org.lastEmailActivityAt ? new Date(org.lastEmailActivityAt).toLocaleString() : 'No activity'}
 </CrmListMutedText>
 );
 default: return null;
 }
}

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<div className="p-10 animate-pulse"><div className="h-64 bg-slate-100 rounded-[var(--radius-md)]" /></div>}>
      <OrganizationsPageContent />
    </Suspense>
  );
}

function OrganizationsPageContent() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [serverTotal, setServerTotal] = useState(0);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isColumnEditorOpen, setIsColumnEditorOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [draftColumns, setDraftColumns] = useState<Column[]>([]);
  const [emailOrg, setEmailOrg] = useState<Organization | null>(null);
  const [lastActivityFilter, setLastActivityFilter] = useState<'all' | 'today' | 'last7' | 'last30' | 'last90' | 'no-activity'>('all');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<OrgViewMode>('list');
  const { hasAccess, canViewCrmRevenue } = usePermissions();
  const searchParams = useSearchParams();

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
  }, []);

  const changeViewMode = useCallback((mode: OrgViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearch(searchParam);
    }
  }, [searchParams]);

  const normalizedSearch = useMemo(
    () => deferredSearch.trim(),
    [deferredSearch],
  );

  const emailEngagement = useMemo(
    () => ({ lastActivity: lastActivityFilter }),
    [lastActivityFilter],
  );

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      // Skip incomplete rules (e.g. Company Name equals with no value selected).
      const activeFilters = filters.filter((f) => {
        const op = String(f.operator || '');
        if (
          ['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'].includes(
            op,
          )
        ) {
          return true;
        }
        return String(f.value ?? '').trim().length > 0;
      });
      const params = buildCrmListSearchParams({
        page,
        pageSize,
        search: normalizedSearch,
        filters: activeFilters,
        emailEngagement,
      });
      const qs = params.toString();
      const { data } = await crmApi.get(`/crm/organizations${qs ? `?${qs}` : ''}`);
      if (data && typeof data === 'object' && Array.isArray(data.data) && typeof data.total === 'number') {
        setOrgs(data.data);
        setServerTotal(data.total);
      } else {
        const orgList = Array.isArray(data) ? data : (data?.data || []);
        const list = Array.isArray(orgList) ? orgList : [];
        setOrgs(list);
        setServerTotal(list.length);
      }
    } catch (err) {
      console.error('Failed to fetch orgs', err);
      setOrgs([]);
      setServerTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, normalizedSearch, filters, emailEngagement]);

  useEffect(() => {
    setColumns(loadColumns());
  }, []);

  useEffect(() => {
    void fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, lastActivityFilter, filters]);

  const handleFiltersChange = useCallback((next: FilterCriteria[]) => {
    setFilters(next);
    setPage(1);
  }, []);

  useEffect(() => {
    if (isColumnEditorOpen) setDraftColumns(columns.map((c) => ({ ...c })));
  }, [isColumnEditorOpen]);

  const orgsRef = useRef<Organization[]>([]);
  orgsRef.current = orgs;

  const needsOrgEmailEnrichment = useMemo(
    () => columns.some((c) => c.visible && c.key === 'lastEmailActivityAt'),
    [columns],
  );

  const orgIdsKey = useMemo(() => orgs.map((o) => o._id).join('|'), [orgs]);

  useEffect(() => {
    if (!needsOrgEmailEnrichment || !orgIdsKey) return;
    let cancelled = false;
    void (async () => {
      const snapshot = orgsRef.current;
      if (snapshot.map((o) => o._id).join('|') !== orgIdsKey) return;
      const EMAIL_ACTIVITY_CONCURRENCY = 12;
      const enriched = await mapPool(snapshot, EMAIL_ACTIVITY_CONCURRENCY, async (org: Organization) => {
        try {
          const r = await crmApi.get(`/communications/emails/entity/${org._id}`);
          const emails = Array.isArray(r?.data) ? r.data : [];
          const latest = emails.reduce((best: string | null, row: any) => {
            const candidate = row?.updatedAt || row?.createdAt || null;
            if (!candidate) return best;
            const ts = new Date(candidate).getTime();
            if (Number.isNaN(ts)) return best;
            if (!best) return new Date(candidate).toISOString();
            return ts > new Date(best).getTime() ? new Date(candidate).toISOString() : best;
          }, null);
          return { ...org, lastEmailActivityAt: latest };
        } catch {
          return { ...org, lastEmailActivityAt: null };
        }
      });
      if (cancelled) return;
      setOrgs((prev) => {
        const prevKey = prev.map((o) => o._id).join('|');
        if (prevKey !== orgIdsKey) return prev;
        return enriched;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [needsOrgEmailEnrichment, orgIdsKey]);

  const visibleCols = useMemo(() => {
    const cols = columns.filter((c) => c.visible);
    if (canViewCrmRevenue) return cols;
    return cols.filter((c) => c.key !== 'annualRevenue');
  }, [columns, canViewCrmRevenue]);
  const paginated = orgs;
  const paginationTotal = serverTotal;

 const handleToggleDraft = (key: string) => {
 setDraftColumns(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
 };

 const handleDeleteDraftColumn = (key: string) => {
 setDraftColumns(prev => prev.filter(c => c.key !== key));
 };

 const handleAddColumn = () => {
 const label = newColumnLabel.trim();
 if (!label) return;
 const key = `custom_${label.toLowerCase().replace(/\s+/g, '_')}`;
 if (draftColumns.find(c => c.key === key)) return;
 setDraftColumns(prev => [...prev, { key, label, visible: true }]);
 setNewColumnLabel('');
 };

 const handleSaveColumns = () => {
 setColumns(draftColumns);
 saveColumns(draftColumns);
 setIsColumnEditorOpen(false);
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

 return (
 <div className={CRM_LIST_PAGE}>
 <CrmPageHeader
   bordered={false}
   title="Companies"
   badge={<CrmCountBadge>{paginationTotal}</CrmCountBadge>}
   breadcrumbs={[
     { label: 'Home', href: '/crm/workspace/summary' },
     { label: 'Companies' },
   ]}
   actions={
     <CrmHeaderTools
       canImport={hasAccess('admin:manage')}
       onImport={() => setIsImportOpen(true)}
       onRefresh={() => void fetchOrgs()}
       trailing={
         viewMode === 'list' ? (
           <CrmButton
             variant="icon"
             onClick={() => { setIsColumnEditorOpen(true); }}
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
       module="organizations"
       filters={filters}
       onChange={handleFiltersChange}
       onClear={() => handleFiltersChange([])}
       onPropertiesReady={setFilterProperties}
     />
   }
   searchProps={{
     placeholder: 'Search',
     value: search,
     onChange: (e) => { setSearch(e.target.value); setPage(1); },
   }}
   leftExtra={
     <>
       <CRMSavedViews module="organizations" currentFilters={filters} currentColumns={columns} onApplyView={handleApplyView} />
       <select
         value={lastActivityFilter}
         onChange={(e) => { setLastActivityFilter(e.target.value as any); setPage(1); }}
         className={cn(CRM_TOOLBAR_SELECT, 'shrink-0')}
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
         onChange={(mode) => changeViewMode(mode === 'grid' ? 'grid' : 'list')}
         modes={['list', 'grid']}
       />
       {hasAccess('organizations:write') ? (
         <CrmButton
           variant="primary"
           onClick={() => setIsModalOpen(true)}
           leftIcon={<CrmIcon.AddFilled size={16} />}
         >
           Add Company
         </CrmButton>
       ) : null}
     </>
   }
 />

 {/* Card view */}
 {viewMode === 'grid' ? (
   loading ? (
     <CrmRecordCardSkeleton />
   ) : paginated.length === 0 ? (
     <div className="rounded-[5px] border border-[#e2e8f0] bg-white py-20 text-center text-sm font-medium text-[#707070]">
       No companies found
     </div>
   ) : (
     <CrmRecordCardGrid>
       {paginated.map((org) => (
         <CrmRecordCard
           key={org._id}
           markShape="square"
           initials={orgInitials(org.name)}
           toneSeed={`${org.name}${org._id}`}
           title={org.name}
           subtitle={org.website || org.industry || undefined}
           onClick={() => router.push(`/crm/organizations/${org.recordId || org._id}`)}
           actions={
             <CrmTableActionMenu
               onEdit={() => router.push(`/crm/organizations/${org.recordId || org._id}`)}
               onEmail={org.email ? () => setEmailOrg(org) : undefined}
             />
           }
           meta={[
             { key: 'email', icon: <CrmIcon.Mail size={15} />, label: org.email || '—' },
             { key: 'phone', icon: <CrmIcon.Phone size={15} />, label: org.phone || '—' },
             {
               key: 'location',
               icon: <CrmIcon.MapPin size={15} />,
               label: org.address || org.territory || '—',
             },
           ]}
           footerLeft={org.industry ? <CrmSoftBadge label={org.industry} tone="success" /> : null}
           footerRight={
             canViewCrmRevenue && org.annualRevenue ? (
               <span className="text-sm font-semibold text-[#1f2020]">
                 ${org.annualRevenue.toLocaleString()}
               </span>
             ) : org.noOfEmployees ? (
               <CrmListMutedText>{org.noOfEmployees} employees</CrmListMutedText>
             ) : null
           }
         />
       ))}
     </CrmRecordCardGrid>
   )
 ) : (
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
 <td key={c.key}><div className="h-4 w-3/4 rounded-md bg-slate-100" /></td>
 ))}
 <td className="crm-table-actions" />
 </tr>
 ))
 ) : paginated.length === 0 ? (
 <tr>
 <td colSpan={visibleCols.length + 1} className="py-20 text-center text-sm font-medium text-[#707070]">
 No companies found
 </td>
 </tr>
 ) : paginated.map(org => (
 <tr
 key={org._id}
 className="group cursor-pointer transition-colors"
 onClick={() => router.push(`/crm/organizations/${org.recordId || org._id}`)}
 >
 {visibleCols.map(col => (
 <td key={col.key}>
 {renderCell(org, col.key)}
 </td>
 ))}
 <td className="crm-table-actions">
 <CrmTableActionMenu
 onEdit={() => router.push(`/crm/organizations/${org.recordId || org._id}`)}
 onEmail={org.email ? () => setEmailOrg(org) : undefined}
 />
 </td>
 </tr>
 ))}
 </tbody>
 </CrmTable>
 </CrmTableShell>
 )}

 {/* Pagination */}
 <Pagination
 total={paginationTotal}
 page={page}
 pageSize={pageSize}
 onPageChange={setPage}
 onPageSizeChange={size => { setPageSize(size); setPage(1); }}
 />

 {/* Column Editor Modal */}
 <CrmPropertyManagerModal
   isOpen={isColumnEditorOpen}
   onClose={() => setIsColumnEditorOpen(false)}
   onSave={handleSaveColumns}
   title="Edit columns"
   subtitle="Show, hide, or add columns to the table"
   saveLabel="Save columns"
   footerExtra={
     <div className="flex gap-2">
       <input
         type="text"
         placeholder="Add custom column name…"
         className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/30"
         value={newColumnLabel}
         onChange={e => setNewColumnLabel(e.target.value)}
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
     {draftColumns.map(col => (
       <div key={col.key} className="group/col flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2.5 transition-colors hover:border-[var(--primary)] hover:bg-white">
         <button
           type="button"
           onClick={() => handleToggleDraft(col.key)}
           className="flex flex-1 items-center gap-3 text-left"
         >
           <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-all ${col.visible ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-color)] bg-white'}`}>
             {col.visible && <Check size={10} className="text-white" strokeWidth={3} />}
           </div>
           <span className={`text-sm font-medium ${col.visible ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{col.label}</span>
         </button>
         <button
           type="button"
           onClick={() => handleDeleteDraftColumn(col.key)}
           className="rounded-[var(--radius-md)] p-1.5 text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--error-light)] hover:text-[var(--error)] group-hover/col:opacity-100"
           title="Remove column"
         >
           <Trash2 size={13} />
         </button>
       </div>
     ))}
   </div>
 </CrmPropertyManagerModal>

 {isModalOpen && (
   <OrgCreatePanel isOpen onClose={() => setIsModalOpen(false)} onSuccess={fetchOrgs} />
 )}
 {isImportOpen && (
   <ImportModal
     isOpen
     onClose={() => setIsImportOpen(false)}
     onSuccess={fetchOrgs}
     type="organizations"
   />
 )}
 <SendEmailModal
 isOpen={!!emailOrg}
 onClose={() => setEmailOrg(null)}
 recipientEmail={emailOrg?.email}
 recipientName={emailOrg?.name}
 module="organizations"
 entityId={emailOrg?._id}
 />
 </div>
 );
}

