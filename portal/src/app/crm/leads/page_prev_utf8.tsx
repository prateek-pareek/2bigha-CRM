"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, MoreHorizontal, Download, Loader2, Upload, Settings2, X, Check, ChevronDown, LayoutGrid, List, GitBranch } from 'lucide-react';
import QuickAddModal from '@/components/crm/records/create/QuickAddModal';
import ImportModal from '@/components/crm/records/create/ImportModal';
import CRMFilterBar from '@/components/crm/segments/CRMFilterBar';
import Pagination from '@/components/suite/shell/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import crmApi from '@/lib/crm/api';
import { CRM_API_URL } from '@/lib/crm/config';
import { applyFilters, FilterCriteria, FilterProperty } from '@/lib/crm/filter-config';

interface Lead {
 _id: string;
 firstName: string;
 lastName: string;
 email: string;
 status: string;
 stage?: string;
 pipeline?: string;
 phone?: string;
 mobileNo?: string;
 organization: string;
 createdAt: string;
 customFields?: Record<string, any>;
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

const DEFAULT_COLUMNS: Omit<Column, 'visible'>[] = [
 { key: 'name', label: 'Name' },
 { key: 'status', label: 'Status' },
 { key: 'email', label: 'Email' },
 { key: 'organization', label: 'Organization' },
 { key: 'createdAt', label: 'Created' },
];

const STORAGE_KEY = 'leads_columns_v2';

function loadColumns(): Column[] {
 if (typeof window === 'undefined') return DEFAULT_COLUMNS.map(c => ({ ...c, visible: true }));
 try {
 const saved = localStorage.getItem(STORAGE_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 const existingKeys = new Set(parsed.map((c: any) => c.key));
 const extras = DEFAULT_COLUMNS.filter(c => !existingKeys.has(c.key)).map(c => ({ ...c, visible: false }));
 return [...parsed, ...extras];
 }
 } catch { /* ignore */ }
 return DEFAULT_COLUMNS.map(c => ({ ...c, visible: true }));
}

function saveColumns(cols: Column[]) {
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

export default function LeadsPage() {
 const router = useRouter();
 const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
 const [leads, setLeads] = useState<Lead[]>([]);
 const [pipelines, setPipelines] = useState<Pipeline[]>([]);
 const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
 const [loading, setLoading] = useState(true);
 const [exporting, setExporting] = useState(false);
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [isImportModalOpen, setIsImportModalOpen] = useState(false);
 const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterCriteria[]>([]);
  const [filterProperties, setFilterProperties] = useState<FilterProperty[]>([]);
  const { hasAccess } = usePermissions();

 // Pagination & Columns
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(25);
 const [columns, setColumns] = useState<Column[]>([]);
 const [isColumnsOpen, setIsColumnsOpen] = useState(false);
 const [draftColumns, setDraftColumns] = useState<Column[]>([]);
 const [newColLabel, setNewColLabel] = useState('');

 // Actions menu
 const [isActionsOpen, setIsActionsOpen] = useState(false);
 const actionsRef = useRef<HTMLDivElement>(null);

 const fetchData = async () => {
 setLoading(true);
 const token = localStorage.getItem('token');
 try {
 const [pipelinesRes, leadsRes] = await Promise.all([
 fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, { headers: { 'Authorization': `Bearer ${token}` } }),
 crmApi.get('/crm/leads')
 ]);
 if (pipelinesRes.ok) {
 const pipelinesData = await pipelinesRes.json();
 setPipelines(pipelinesData);
 if (pipelinesData.length > 0 && !selectedPipelineId) {
 const defaultPipeline = pipelinesData.find((p: Pipeline) => p.isDefault) || pipelinesData[0];
 setSelectedPipelineId(defaultPipeline._id);
 }
 }
 const { data } = leadsRes;
 if (data) setLeads(data);
 } catch (err) {
 console.error('Failed to fetch data', err);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 setColumns(loadColumns());
 fetchData();
 }, []);

 useEffect(() => {
 if (pipelines.length > 0 && !selectedPipelineId) {
 const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0];
 setSelectedPipelineId(defaultPipeline._id);
 }
 }, [pipelines]);

 useEffect(() => {
 if (isColumnsOpen) setDraftColumns(columns.map(c => ({ ...c })));
 }, [isColumnsOpen]);

 const handleClickOutside = (e: MouseEvent) => {
 if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setIsActionsOpen(false);
 };
 useEffect(() => {
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 const selectedPipeline = pipelines.find(p => p._id === selectedPipelineId);
 const pipelineStages = selectedPipeline ? selectedPipeline.stages.sort((a, b) => a.order - b.order) : [];
 const pipelineLeads = pipelines.length === 0
 ? leads
 : leads.filter(l =>
 l.pipeline === selectedPipelineId ||
 (!l.pipeline && selectedPipeline?.isDefault)
 );

 const visibleCols = columns.filter(c => c.visible);
  const searchFiltered = pipelineLeads.filter(lead =>
   `${lead.firstName} ${lead.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
   (lead.email || '').toLowerCase().includes(search.toLowerCase()) ||
   (lead.organization || '').toLowerCase().includes(search.toLowerCase())
  );
  const filtered = applyFilters(searchFiltered, filters, filterProperties);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

 const handleSaveColumns = () => {
 setColumns(draftColumns);
 saveColumns(draftColumns);
 setIsColumnsOpen(false);
 };

 const handleAddColumn = async () => {
 const label = newColLabel.trim();
 if (!label) return;
 const key = label.toLowerCase().replace(/\s+/g, '_');
 try {
 const res = await crmApi.post('/custom-fields', {
 name: label, key, module: 'leads', type: 'text'
 });
 if (res.status === 201 || res.status === 200) {
 setDraftColumns([...draftColumns, { key: `cf_${key}`, label, visible: true }]);
 setNewColLabel('');
 }
 } catch (err) {
 console.error('Failed to add custom property', err);
 }
 };

 const handleDragStart = (e: React.DragEvent, leadId: string) => {
 e.dataTransfer.setData('leadId', leadId);
 };

 const handleDragOver = (e: React.DragEvent) => {
 e.preventDefault();
 };

 const handleDrop = async (e: React.DragEvent, stageName: string) => {
 e.preventDefault();
 const leadId = e.dataTransfer.getData('leadId');
 if (!leadId) return;

 const lead = leads.find(l => l._id === leadId);
 const currentStage = lead?.stage || lead?.status || 'New';

 const updatedLeads = leads.map(l =>
 l._id === leadId ? { ...l, stage: stageName } : l
 );
 setLeads(updatedLeads);

 try {
 const token = localStorage.getItem('token');
 const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({ stage: stageName, pipeline: selectedPipelineId })
 });
 if (!res.ok) throw new Error('Failed to update lead');
 } catch (err) {
 console.error(err);
 setLeads(leads);
 }
 };

 const renderCell = (lead: Lead, colKey: string) => {
 const stage = lead.stage || lead.status;
 if (colKey === 'name') return (
 <span className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-[3px] bg-slate-100 flex items-center justify-center text-text-muted shrink-0 font-bold text-xs uppercase">
 {lead.firstName?.[0]}{lead.lastName?.[0]}
 </div>
 <span className="font-bold text-text-main group-hover:text-primary transition-colors">{lead.firstName} {lead.lastName}</span>
 </span>
 );
 if (colKey === 'status') return (
 <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase  ${stage === 'New' ? 'bg-primary/5 text-primary' :
 stage === 'Qualified' || stage === 'Converted' ? 'bg-emerald-50 text-emerald-600' :
 'bg-slate-100 text-text-muted'
 }`}>
 {stage || 'New'}
 </span>
 );
 if (colKey === 'email') return <span className="text-text-muted font-medium text-sm">{lead.email}</span>;
 if (colKey === 'organization') return <span className="text-text-muted font-medium text-sm">{lead.organization}</span>;
 if (colKey === 'createdAt') return <span className="text-text-muted text-xs font-medium">{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'ΓÇö'}</span>;
 if (colKey.startsWith('cf_')) {
 const cfKey = colKey.replace('cf_', '');
 return <span className="text-text-muted font-medium text-sm">{lead.customFields?.[cfKey] || 'ΓÇö'}</span>;
 }
 return null;
 };

 return (
 <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
 <div className="relative overflow-hidden bg-card/40 backdrop-blur-xl border border-white/40 p-8 rounded-[40px] shadow-[0_8px_40px_rgba(0,0,0,0.03)] mb-4">
 <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
 <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl animate-pulse delay-1000" />

 <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
 <div>
 <div className="flex items-center gap-3 mb-1">
 <div className="w-8 h-8 rounded-[3px] bg-text-main flex items-center justify-center text-white shadow-lg shadow-slate-900/10">
 <GitBranch size={16} />
 </div>
 <h1 className="text-xl font-medium text-text-main tracking-tight">Leads</h1>
 </div>
 <p className="text-sm text-text-muted font-normal ml-[44px]">{filtered.length} leads in pipeline</p>
 </div>

 <div className="flex flex-wrap items-center gap-3">
 <div className="flex bg-slate-100 p-1 rounded-[3px] border border-[#dfe1e6] shadow-inner">
 <button
 onClick={() => setViewMode('kanban')}
 className={`p-2.5 rounded-[3px] transition-all ${viewMode === 'kanban' ? 'bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
 title="Board View"
 >
 <LayoutGrid size={18} />
 </button>
 <button
 onClick={() => setViewMode('list')}
 className={`p-2.5 rounded-[3px] transition-all ${viewMode === 'list' ? 'bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
 title="Table View"
 >
 <List size={18} />
 </button>
 </div>

 <div className="h-10 w-[1px] bg-slate-200 mx-1 hidden md:block" />

 <div className="relative group">
 <GitBranch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
 <select
 value={selectedPipelineId}
 onChange={(e) => setSelectedPipelineId(e.target.value)}
 className="bg-card border border-[#dfe1e6] text-text-main pl-11 pr-8 py-3 rounded-[3px] text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-blue-500/10 appearance-none cursor-pointer hover:bg-surface-dim transition-all min-w-[160px]"
 >
 {pipelines.map(p => (
 <option key={p._id} value={p._id}>{p.name}</option>
 ))}
 </select>
 <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
 </div>

 {viewMode === 'list' && (
 <button
 onClick={() => setIsColumnsOpen(true)}
 className="p-3 bg-card border border-[#dfe1e6] hover:bg-surface-dim text-text-main rounded-[3px] shadow-sm transition-all"
 title="Edit Columns"
 >
 <Settings2 size={18} />
 </button>
 )}

 <div className="relative" ref={actionsRef}>
 <button
 onClick={() => setIsActionsOpen(!isActionsOpen)}
 className="flex items-center gap-2 bg-card border border-[#dfe1e6] hover:bg-surface-dim text-text-main px-6 py-3 rounded-[3px] text-sm font-black shadow-sm transition-all active:scale-95"
 >
 Actions
 <ChevronDown size={16} className={`transition-transform duration-200 ${isActionsOpen ? 'rotate-180' : ''}`} />
 </button>
 {isActionsOpen && (
 <div className="absolute right-0 mt-3 w-56 bg-card rounded-[3px] shadow-2xl border border-slate-50 p-3 z-50 animate-in slide-in-from-top-2 duration-200">
 {hasAccess('leads:write') && (
 <button
 onClick={() => { setIsActionsOpen(false); setIsImportModalOpen(true); }}
 className="w-full flex items-center gap-3 p-3 rounded-[3px] text-sm font-bold text-text-main hover:bg-surface-dim transition-all"
 >
 <Upload size={18} />
 Import Leads
 </button>
 )}
 <button
 onClick={() => { setIsActionsOpen(false); fetchData(); }}
 className="w-full flex items-center gap-3 p-3 rounded-[3px] text-sm font-bold text-text-main hover:bg-surface-dim transition-all"
 >
 <Loader2 size={18} />
 Restore View
 </button>
 <div className="h-[1px] bg-surface-dim my-2 mx-2" />
 <button
 onClick={() => { setIsActionsOpen(false); setDraftColumns(columns.map(c => ({ ...c }))); setIsColumnsOpen(true); }}
 className="w-full flex items-center gap-3 p-3 rounded-[3px] text-sm font-bold text-primary hover:bg-primary/5 transition-all"
 >
 <Settings2 size={18} />
 Customize Properties
 </button>
 </div>
 )}
 </div>

 {hasAccess('leads:write') && (
 <>
 <button
 onClick={() => setIsModalOpen(true)}
 className="bg-text-main hover:bg-black text-white px-6 py-3 rounded-[3px] flex items-center gap-2 font-black shadow-xl shadow-slate-900/10 transition-all active:scale-95 text-sm"
 >
 <Plus size={18} />
 Add Lead
 </button>
 </>
 )}
 </div>
 </div>

<div className="p-4 border-b border-slate-50 bg-surface-dim/30 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
 <input
 type="text"
 placeholder="Search by name, email, or organization..."
 className="pl-12 pr-4 py-3 w-full bg-card border border-[#dfe1e6] rounded-[3px] text-sm font-bold text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-blue-500/20 outline-none"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 />
        </div>
        <CRMFilterBar
          module="leads"
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters([])}
          onPropertiesReady={setFilterProperties}
        />
      </div>

 <div className="flex-1 min-h-0">
 {loading ? (
 <div className="w-full h-full flex items-center justify-center py-20">
 <Loader2 size={40} className="animate-spin text-text-muted" />
 </div>
 ) : viewMode === 'kanban' ? (
 <div className="flex gap-6 h-full overflow-x-auto pb-4 custom-scrollbar">
 {pipelineStages.length > 0 ? (
 pipelineStages.map(stage => {
 const stageLeads = filtered.filter(l => (l.stage || l.status || 'New') === stage.name);

 return (
 <div
 key={stage.name}
 className="w-80 shrink-0 flex flex-col h-full bg-surface-dim/50 rounded-[32px] border border-[#ebecf0] p-4 transition-colors hover:bg-surface-dim"
 onDragOver={handleDragOver}
 onDrop={(e) => handleDrop(e, stage.name)}
 >
 <div className="flex justify-between items-center mb-6 px-2">
 <div className="flex items-center gap-3">
 <h3 className="font-black text-text-main uppercase text-xs">{stage.name}</h3>
 <span className="bg-card border border-[#dfe1e6] text-text-muted px-2 py-0.5 rounded-lg text-xs font-black">
 {stageLeads.length}
 </span>
 </div>
 {hasAccess('leads:write') && (
 <button
 onClick={() => window.dispatchEvent(new CustomEvent('trigger-quick-add', { detail: { type: 'Lead', pipelineId: selectedPipelineId, stage: stage.name } }))}
 className="p-1 hover:bg-card rounded-lg text-text-muted hover:text-text-main transition-colors"
 >
 <Plus size={14} />
 </button>
 )}
 </div>

 <div className="flex-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
 {stageLeads.map(lead => (
 <div
 key={lead._id}
 draggable
 onDragStart={(e) => handleDragStart(e, lead._id)}
 className="bg-card/80 backdrop-blur-sm p-6 rounded-[24px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(59,130,246,0.12)] hover:border-blue-200 transition-all duration-300 cursor-pointer group relative overflow-hidden"
 onClick={() => router.push(`/crm/leads/${lead._id}`)}
 >
 <div className="flex justify-between items-start mb-3">
 <h4 className="font-black text-slate-800 group-hover:text-primary truncate mr-4 tracking-tight text-sm leading-tight">
 {lead.firstName} {lead.lastName}
 </h4>
 <div className="p-1.5 rounded-lg bg-surface-dim text-text-muted group-hover:text-text-main transition-colors">
 <MoreHorizontal size={14} />
 </div>
 </div>
 <div className="text-xs font-bold text-text-muted truncate mb-2">
 {lead.email}
 </div>
 <div className="text-xs font-bold text-text-muted truncate">
 {lead.organization || 'ΓÇö'}
 </div>
 </div>
 ))}
 </div>
 </div>
 );
 })
 ) : (
 <div className="w-full flex flex-col items-center justify-center text-text-muted py-20">
 <GitBranch size={48} className="mb-4 opacity-50" />
 <h3 className="text-lg font-bold text-text-main">No Lead Pipeline Available</h3>
 <p className="max-w-xs text-center mt-2">Create a lead pipeline in Settings to get started.</p>
 </div>
 )}
 </div>
 ) : (
 <div className="bg-card border border-[#ebecf0] rounded-[32px] overflow-hidden shadow-sm flex flex-col">
 <div className="p-6 border-b border-slate-50 bg-surface-dim/50 flex flex-col md:flex-row gap-4 justify-between items-center">
 <div className="relative w-full md:w-96">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
 <input
 type="text"
 placeholder="Search by name, email, or organization..."
 className="pl-12 pr-4 py-3.5 w-full bg-card border-none rounded-[3px] shadow-sm text-sm font-bold text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-blue-500 transition-all outline-none"
 value={search}
 onChange={(e) => { setSearch(e.target.value); setPage(1); }}
 />
 </div>
 </div>
 <div className="overflow-x-auto flex-1">
 <table className="w-full text-left">
 <thead>
 <tr className="bg-surface-dim/50 text-xs font-black text-text-muted uppercase border-b border-[#ebecf0]">
 {visibleCols.map(col => (
 <th key={col.key} className="px-8 py-5">{col.label}</th>
 ))}
 <th className="px-8 py-5 w-10"></th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-50">
 {loading ? (
 [1, 2, 3, 4, 5].map(i => (
 <tr key={i} className="animate-pulse">
 {visibleCols.map(c => (
 <td key={c.key} className="px-8 py-6"><div className="h-4 bg-slate-100 rounded-lg w-full" /></td>
 ))}
 <td className="px-8 py-6" />
 </tr>
 ))
 ) : paginated.length === 0 ? (
 <tr>
 <td colSpan={visibleCols.length + 1} className="py-20 text-center opacity-40">
 <div className="flex flex-col items-center gap-3">
 <div className="w-20 h-20 bg-surface-dim rounded-full flex items-center justify-center mb-2">
 <Search size={40} />
 </div>
 <h3 className="text-xl font-bold text-text-main uppercase tracking-tight">No leads found</h3>
 </div>
 </td>
 </tr>
 ) : paginated.map(lead => (
 <tr
 key={lead._id}
 className="group hover:bg-surface-dim/50 transition-all cursor-pointer"
 onClick={() => router.push(`/crm/leads/${lead._id}`)}
 >
 {visibleCols.map(col => (
 <td key={col.key} className="px-8 py-6">
 {renderCell(lead, col.key)}
 </td>
 ))}
 <td className="px-8 py-6 text-right">
 <button className="p-2 hover:bg-card border border-transparent hover:border-[#ebecf0] rounded-[3px] text-text-muted hover:text-text-main transition-all shadow-sm">
 <MoreHorizontal size={18} />
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <Pagination
 total={filtered.length}
 page={page}
 pageSize={pageSize}
 onPageChange={setPage}
 onPageSizeChange={setPageSize}
 />
 </div>
 )}
 </div>

 {isColumnsOpen && (
 <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-text-main/40 backdrop-blur-sm" onClick={() => setIsColumnsOpen(false)} />
 <div className="relative bg-card w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
 <div className="p-7 border-b border-slate-50 flex justify-between items-center bg-surface-dim/50">
 <div>
 <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Customize Properties</h2>
 <p className="text-text-muted text-sm font-medium mt-0.5">Manage which properties are visible in the table</p>
 </div>
 <button onClick={() => setIsColumnsOpen(false)} className="p-2 hover:bg-slate-100 rounded-[3px] transition-colors">
 <X size={18} className="text-text-muted" />
 </button>
 </div>
 <div className="p-6 max-h-[50vh] overflow-y-auto space-y-1 custom-scrollbar">
 {draftColumns.map(col => (
 <button
 key={col.key}
 onClick={() => setDraftColumns(prev => prev.map(c => c.key === col.key ? { ...c, visible: !c.visible } : c))}
 className={`w-full flex items-center justify-between p-3.5 rounded-[3px] text-sm font-bold transition-all ${col.visible ? 'bg-primary/5 text-primary' : 'text-text-muted hover:bg-surface-dim'
 }`}
 >
 {col.label}
 {col.visible && <Check size={16} strokeWidth={3} />}
 </button>
 ))}
 </div>
 <div className="p-6 border-t border-slate-50 bg-surface-dim/50 space-y-4">
 <div className="flex gap-2">
 <input
 type="text"
 placeholder="Add a new property (e.g. Lead Source)"
 className="flex-1 px-4 py-3 bg-card border border-[#dfe1e6] rounded-[3px] shadow-sm text-sm font-bold text-text-main outline-none focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-text-muted"
 value={newColLabel}
 onChange={e => setNewColLabel(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleAddColumn()}
 />
 <button
 onClick={handleAddColumn}
 className="px-6 py-3 bg-card border border-[#dfe1e6] hover:bg-surface-dim text-text-main rounded-[3px] text-sm font-black transition-all shadow-sm"
 >
 Add
 </button>
 </div>
 <div className="flex gap-3 pt-2">
 <button onClick={() => setIsColumnsOpen(false)} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 rounded-[3px] text-xs font-black uppercase text-text-main transition-all">Cancel</button>
 <button onClick={handleSaveColumns} className="flex-1 py-4 bg-text-main hover:bg-black text-white rounded-[3px] text-xs font-black uppercase transition-all shadow-lg shadow-slate-900/10">Save Changes</button>
 </div>
 </div>
 </div>
 </div>
 )}

 <QuickAddModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} initialTab="Lead" />
 <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} type="leads" onSuccess={fetchData} />
 </div>
 </div>
 );
}
