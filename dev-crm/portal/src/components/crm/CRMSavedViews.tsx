"use client";

import { useState, useEffect, useRef } from 'react';
import { LayoutList, ChevronDown, Plus, Check, Trash2, Star, X, Loader2 } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import { FilterCriteria } from '@/lib/crm/filter-config';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { cn } from '@/lib/pm/utils';

export interface SavedViewData {
  _id: string;
  name: string;
  filters: FilterCriteria[];
  columns: { key: string; label: string; visible: boolean }[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isDefault?: boolean;
}

interface CRMSavedViewsProps {
  module: 'leads' | 'contacts' | 'organizations' | 'deals' | 'clients' | 'inbox' | 'activities';
  currentFilters: FilterCriteria[];
  currentColumns: { key: string; label: string; visible: boolean }[];
  onApplyView: (view: SavedViewData | null) => void;
  disabled?: boolean;
  /** When true, do not auto-apply a user's default saved view on load — keep "All {module}" selected. */
  preferAllView?: boolean;
}

const MODULE_LABELS: Record<string, string> = {
  leads: 'Leads',
  contacts: 'Contacts',
  organizations: 'Organizations',
  deals: 'Deals',
  clients: 'Clients',
  inbox: 'Inbox',
  activities: 'Activities',
};

export default function CRMSavedViews({
  module,
  currentFilters,
  currentColumns,
  onApplyView,
  disabled = false,
  preferAllView = false,
}: CRMSavedViewsProps) {
  const [views, setViews] = useState<SavedViewData[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasAppliedDefault = useRef(false);

  const label = MODULE_LABELS[module] || module;

  const fetchViews = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/saved-views/${module}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setViews(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch views', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchViews();
  }, [module]);

  useEffect(() => {
    if (preferAllView || views.length === 0 || hasAppliedDefault.current) return;
    hasAppliedDefault.current = true;
    const defaultView = views.find(v => v.isDefault);
    if (defaultView) {
      setActiveViewId(defaultView._id);
      onApplyView(defaultView);
    }
  }, [views, preferAllView]);

  const handleSelectView = (view: SavedViewData | null) => {
    setActiveViewId(view?._id || null);
    onApplyView(view);
    setIsOpen(false);
  };

  const handleSaveView = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/saved-views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          module,
          name,
          filters: currentFilters,
          columns: currentColumns,
          isDefault: views.length === 0,
        }),
      });
      if (res.ok) {
        const newView = await res.json();
        setViews(prev => [...prev, newView]);
        handleSelectView(newView);
        setSaveName('');
        setIsSaveOpen(false);
      }
    } catch (err) {
      console.error('Failed to save view', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (viewId: string) => {
    const token = localStorage.getItem('token');
    try {
      await fetch(`${CRM_API_URL}/crm/saved-views/${viewId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isDefault: true }),
      });
      fetchViews();
    } catch (err) {
      console.error('Failed to set default', err);
    }
  };

  const handleDeleteView = async (viewId: string) => {
    if (!confirm('Delete this view?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/saved-views/${viewId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setViews(prev => prev.filter(v => v._id !== viewId));
        if (activeViewId === viewId) {
          setActiveViewId(null);
          onApplyView(null);
        }
        setIsManageOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete view', err);
    }
  };

  const activeView = views.find(v => v._id === activeViewId);

  const savedViewsHint = `Saved views for ${label}. Click to pick a view, save the current filters and columns, or manage views.`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || loading}
        title={savedViewsHint}
        aria-label={savedViewsHint}
        className={`flex items-center gap-2 px-4 h-10 rounded-[3px] text-sm font-bold transition-all border ${
          activeView
            ? 'bg-primary/10 text-primary border-primary/20'
            : 'bg-card text-text-muted border-[#dfe1e6] hover:border-slate-300 hover:text-text-main'
        }`}
      >
        <LayoutList size={16} strokeWidth={2.5} />
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <>
            {activeView ? activeView.name : `All ${label}`}
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div className="absolute top-full left-0 mt-2 z-50 w-56 bg-card rounded-[3px] border border-[#ebecf0] shadow-xl overflow-hidden">
            <button
              onClick={() => handleSelectView(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold transition-all ${
                !activeViewId ? 'bg-primary/10 text-primary' : 'hover:bg-surface-dim text-text-main'
              }`}
            >
              {!activeViewId && <Check size={16} strokeWidth={2.5} />}
              All {label}
            </button>
            {views.map(v => (
              <button
                key={v._id}
                onClick={() => handleSelectView(v)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold transition-all hover:bg-surface-dim ${
                  activeViewId === v._id ? 'bg-primary/10 text-primary' : 'text-text-main'
                }`}
              >
                <span className="truncate">{v.name}</span>
                {activeViewId === v._id && <Check size={16} strokeWidth={2.5} />}
              </button>
            ))}
            <div className="border-t border-[#ebecf0] p-2 space-y-1">
              <button
                onClick={() => { setIsSaveOpen(true); setIsOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[3px] text-sm font-bold text-primary hover:bg-primary/10 transition-all"
              >
                <Plus size={16} />
                Save current view
              </button>
              <button
                onClick={() => { setIsManageOpen(true); setIsOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[3px] text-sm font-bold text-text-muted hover:bg-surface-dim hover:text-text-main transition-all"
              >
                <LayoutList size={16} />
                Manage views
              </button>
            </div>
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
        </>
      )}

      {isSaveOpen && (
        <div className={cn(crmModalChrome.overlay, 'z-[999] flex items-center justify-center p-4')}>
          <div className={crmModalChrome.backdrop} onClick={() => setIsSaveOpen(false)} />
          <div className={cn(crmModalChrome.centerShell, 'max-w-sm crm-jira-modal')}>
            <div className={crmModalChrome.centerHeader}>
              <div>
                <h3 className={crmModalChrome.centerTitle}>Save current view</h3>
                <p className={crmModalChrome.centerLead}>Save filters and columns for quick access.</p>
              </div>
            </div>
            <div className={crmModalChrome.centerBody}>
            <input
              type="text"
              placeholder="View name (e.g. My Contacts)"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveView()}
              className="mb-0 h-8 w-full rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm text-[#172b4d] outline-none focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30"
            />
            </div>
            <div className={cn(crmModalChrome.centerFooter, 'gap-2')}>
              <button
                type="button"
                onClick={() => setIsSaveOpen(false)}
                className="inline-flex h-8 flex-1 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-white text-sm font-medium text-[#42526e] hover:bg-[#f4f5f7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveView}
                disabled={saving || !saveName.trim()}
                className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-[3px] bg-[#0c66e4] text-sm font-medium text-white hover:bg-[#0055cc] disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isManageOpen && (
        <div className={cn(crmModalChrome.overlay, 'z-[999] flex items-center justify-center p-4')}>
          <div className={crmModalChrome.backdrop} onClick={() => setIsManageOpen(false)} />
          <div className={cn(crmModalChrome.centerShell, 'max-w-md crm-jira-modal flex flex-col')}>
            <div className={crmModalChrome.centerHeader}>
              <div>
                <h3 className={crmModalChrome.centerTitle}>Manage views</h3>
                <p className={crmModalChrome.centerLead}>Rename, delete, or set default view.</p>
              </div>
            </div>
            <div className={cn(crmModalChrome.centerBody, 'max-h-64 space-y-1.5 px-4 py-3')}>
              {views.length === 0 ? (
                <p className="text-sm text-text-muted py-8 text-center">No saved views yet.</p>
              ) : (
                views.map(v => (
                  <div
                    key={v._id}
                    className="flex items-center justify-between gap-3 rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] p-3"
                  >
                    <span className="font-bold text-text-main truncate flex-1">{v.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleSetDefault(v._id)}
                        className={`p-2 rounded-lg transition-all ${v.isDefault ? 'text-amber-500' : 'text-text-muted hover:text-amber-500'}`}
                        title={v.isDefault ? 'Default view' : 'Set as default'}
                      >
                        <Star size={16} fill={v.isDefault ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => handleDeleteView(v._id)}
                        className="p-2 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-50 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={crmModalChrome.centerFooter}>
              <button
                type="button"
                onClick={() => setIsManageOpen(false)}
                className="inline-flex h-8 w-full items-center justify-center rounded-[3px] bg-[#0c66e4] text-sm font-medium text-white hover:bg-[#0055cc]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
