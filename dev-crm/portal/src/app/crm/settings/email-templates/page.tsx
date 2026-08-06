"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Plus, Search, Edit2, Trash2, ChevronLeft, X, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CRM_API_URL } from '@/lib/crm/config';
import { EMAIL_TEMPLATE_MERGE_GROUPS } from '@/lib/crm/email-template-merge-fields';
import { emailTemplateBodyToEditorHtml } from '@/lib/crm/email-template-fill';
import RichTextEditor from '@/components/suite/editors/RichTextEditor';
import { cn } from '@/lib/utils';
import { crmModalChrome } from '@/lib/crm/chrome';
import type { CategoryAudience, CategoryMaterial } from '@/lib/crm/snippet-template-categories';
import { formatCategorySummary } from '@/lib/crm/snippet-template-categories';

interface ServiceOfferingRef {
  _id: string;
  name?: string;
}

interface Template {
  _id: string;
  name: string;
  subject: string;
  body?: string;
  type: string;
  isActive: boolean;
  updatedAt: string;
  serviceOfferingIds?: string[] | ServiceOfferingRef[];
  categoryAudience?: CategoryAudience | string;
  categoryMaterial?: CategoryMaterial | string;
}

const EMPTY_FORM = {
  name: '',
  subject: '',
  body: '',
  type: 'transactional',
  serviceOfferingIds: [] as string[],
  categoryAudience: 'all' as CategoryAudience,
  categoryMaterial: 'all' as CategoryMaterial,
};

function normalizeTemplateServiceIds(t: Template): string[] {
  const raw = t.serviceOfferingIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) =>
    typeof x === 'object' && x !== null && '_id' in x
      ? String((x as ServiceOfferingRef)._id)
      : String(x),
  );
}

type ServiceRow = { _id: string; name: string; isActive?: boolean };

export default function EmailTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const saveAndAddAnotherRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/email-templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) { router.push('/auth/login?error=unauthorized'); return; }
      if (res.ok) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : [];
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/service-offerings?includeInactive=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setServices(Array.isArray(data) ? data : []);
      }
    } catch {
      setServices([]);
    }
  };

  useEffect(() => { fetchTemplates(); fetchServices(); }, []);

  const openCreate = () => {
    setEditingTemplate(null);
    setFormData({ ...EMPTY_FORM });
    setIsModalOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditingTemplate(t);
    setFormData({
      name: t.name,
      subject: t.subject,
      body: emailTemplateBodyToEditorHtml(t.body || ''),
      type: (t.type || 'transactional').toLowerCase(),
      serviceOfferingIds: normalizeTemplateServiceIds(t),
      categoryAudience: (t.categoryAudience as CategoryAudience) || 'all',
      categoryMaterial: (t.categoryMaterial as CategoryMaterial) || 'all',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const method = editingTemplate ? 'PUT' : 'POST';
      const url = editingTemplate
        ? `${CRM_API_URL}/email-templates/${editingTemplate._id}`
        : `${CRM_API_URL}/email-templates`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: formData.name,
          subject: formData.subject,
          body: formData.body,
          type: formData.type,
          serviceOfferingIds: formData.serviceOfferingIds,
          categoryAudience: formData.categoryAudience,
          categoryMaterial: formData.categoryMaterial,
        })
      });
      if (res.ok) {
        toast.success(editingTemplate ? 'Template updated successfully!' : 'Template created successfully!');
        if (saveAndAddAnotherRef.current && !editingTemplate) {
          setFormData(EMPTY_FORM);
          fetchTemplates();
        } else {
          setIsModalOpen(false);
          fetchTemplates();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || 'Failed to save template');
      }
    } catch (e) {
      console.error(e);
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${CRM_API_URL}/email-templates/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      toast.success('Template deleted');
      fetchTemplates();
    } else {
      toast.error('Failed to delete template');
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/crm/settings" className="p-2 hover:bg-slate-100 rounded-[var(--radius-md)] transition-colors">
            <ChevronLeft size={20} className="text-text-muted" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-main)] tracking-tight">Email Templates</h1>
            <p className="text-sm text-text-muted mt-0.5 font-normal">Create reusable templates with merge fields (e.g. {'{{firstName}}'})</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)] text-white px-5 py-2.5 rounded-[var(--radius-md)] text-sm font-bold shadow-sm transition-all active:scale-95"
        >
          <Plus size={18} />
          New Template
        </button>
      </div>

      <div className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-50 bg-surface-dim/50">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Search templates..."
              className="pl-10 pr-4 h-10 w-full bg-surface-dim border border-border/60 rounded-[var(--radius-md)] text-sm font-medium text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6">
          {loading ? (
            [1, 2, 3].map(i => <div key={i} className="h-48 bg-surface-dim rounded-[var(--crm-radius-ui)] animate-pulse" />)
          ) : filteredTemplates.length === 0 ? (
            <div className="col-span-full py-20 text-center opacity-40">
              <Mail size={48} className="mx-auto mb-4" />
              <p className="font-bold text-xl text-text-main">No templates found</p>
              <p className="text-text-muted mt-2">Click "New Template" to create one</p>
            </div>
          ) : (
            filteredTemplates.map(template => (
              <div key={template._id} className="group bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-[var(--radius-md)] flex items-center justify-center shrink-0">
                      <Mail size={20} />
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${template.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-surface-dim text-text-muted border-[var(--border-color)]'}`}>
                      {template.type}
                    </span>
                  </div>
                  <h3 className="font-bold text-text-main group-hover:text-rose-600 transition-colors tracking-tight line-clamp-1">{template.name}</h3>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mt-1.5">{formatCategorySummary(template.categoryAudience, template.categoryMaterial)}</p>
                  <p className="text-sm font-medium text-text-muted mt-2 line-clamp-1">{template.subject}</p>
                  <p className="text-xs font-medium text-text-muted mt-1.5 line-clamp-2">
                    {(() => {
                      const raw = template.serviceOfferingIds;
                      if (!Array.isArray(raw) || raw.length === 0) {
                        return <span className="opacity-70">No services linked</span>;
                      }
                      const labels = raw.map((x) => {
                        if (typeof x === 'object' && x !== null && 'name' in x) {
                          return String((x as ServiceOfferingRef).name || '').trim();
                        }
                        const id = String(x);
                        return services.find((s) => s._id === id)?.name || '';
                      }).filter(Boolean);
                      return labels.length ? labels.join(' · ') : 'Services';
                    })()}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div className="text-xs font-black text-text-muted">
                    Updated {new Date(template.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(template)} className="p-2 hover:bg-surface-dim rounded-[var(--radius-md)] text-text-muted hover:text-primary transition-all" title="Edit"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(template._id)} className="p-2 hover:bg-surface-dim rounded-[var(--radius-md)] text-text-muted hover:text-rose-600 transition-all" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className={`${crmModalChrome.overlay} z-50 flex items-center justify-center p-4`}>
          <div className={crmModalChrome.backdrop} onClick={() => setIsModalOpen(false)} />
          <div ref={formRef} className={`${crmModalChrome.centerShell} max-w-2xl max-h-[min(90vh,56rem)] crm-modal flex flex-col`}>
            <div className={crmModalChrome.centerHeader}>
              <h2 className={crmModalChrome.centerTitle}>{editingTemplate ? 'Edit template' : 'New email template'}</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className={crmModalChrome.closeBtn} aria-label="Close">
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className={`${crmModalChrome.centerBody} space-y-4`}>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-muted)]">Template Name <span className="text-[#f2545b]">*</span></label>
                <input
                  className="w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all font-medium"
                  placeholder="e.g. Welcome Email"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-muted)]">Subject Line <span className="text-[#f2545b]">*</span></label>
                <input
                  className="w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all font-medium"
                  placeholder="e.g. Welcome to our platform!"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-muted)]">Type</label>
                <select
                  className="w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all appearance-none font-medium"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="Transactional">Transactional</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Notification">Notification</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-muted)]">Body</label>
                <RichTextEditor
                  key={editingTemplate?._id ?? 'new'}
                  content={formData.body}
                  onChange={(html) => setFormData((prev) => ({ ...prev, body: html }))}
                  placeholder="Write your template… Use merge tokens like {{firstName}} in the text."
                  className="min-h-[min(280px,40vh)] max-h-[min(480px,50vh)] border-0 rounded-none bg-transparent shadow-none"
                />
              </div>
              <details className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4 text-xs">
                <summary className="cursor-pointer font-bold text-text-main select-none">Personalization (merge fields)</summary>
                <p className="mt-2 text-text-muted text-xs leading-relaxed">
                  Use tokens like <code className="font-mono bg-surface-dim px-1 rounded">{'{{firstName}}'}</code> in the subject or body. Optional fallback if empty:{' '}
                  <code className="font-mono bg-surface-dim px-1 rounded">{'{{firstName|there}}'}</code>. Available fields depend on the record (lead, contact, deal, etc.).
                </p>
                <div className="mt-3 max-h-44 overflow-y-auto space-y-2.5 text-xs border-t border-[var(--border-color)] pt-3">
                  {EMAIL_TEMPLATE_MERGE_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="font-black uppercase tracking-wide text-text-muted">{g.title}</p>
                      <p className="font-mono text-text-main leading-relaxed mt-0.5 break-words opacity-90">
                        {g.fields.map((f) => `{{${f}}}`).join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div className={cn(crmModalChrome.centerFooter, 'gap-2')}>
              <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex h-8 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]">Cancel</button>
              {!editingTemplate && (
                <button
                  onClick={() => { saveAndAddAnotherRef.current = true; handleSave(); }}
                  disabled={saving || !formData.name || !formData.subject}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)] disabled:opacity-60"
                >
                  {saving && saveAndAddAnotherRef.current ? <Loader2 size={15} className="animate-spin" /> : null}
                  {saving && saveAndAddAnotherRef.current ? 'Saving…' : 'Create & Add Another'}
                </button>
              )}
              <button
                onClick={() => { saveAndAddAnotherRef.current = false; handleSave(); }}
                disabled={saving || !formData.name || !formData.subject}
                className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] text-sm font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-60"
              >
                {saving && !saveAndAddAnotherRef.current ? <Loader2 size={16} className="animate-spin" /> : <Save size={14} />}
                {saving && !saveAndAddAnotherRef.current ? 'Saving…' : editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
