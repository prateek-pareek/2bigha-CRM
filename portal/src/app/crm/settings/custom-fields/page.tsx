"use client";

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Settings2, ChevronLeft, Loader2, Box } from 'lucide-react';
import Link from 'next/link';
import { CRM_API_URL } from '@/lib/crm/config';
import CustomFieldModal from '@/components/crm/records/detail/CustomFieldModal';
import DeleteCustomFieldMergeDialog from '@/components/crm/records/detail/DeleteCustomFieldMergeDialog';
import type { CrmModuleKey } from '@/lib/crm/crm-field-layout';

interface CustomField {
  _id: string;
  name: string;
  key: string;
  type: string;
  module: string;
  required: boolean;
  description: string;
  isActive: boolean;
}

const MODULES = ['leads', 'contacts', 'organizations'];

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  url: 'URL',
  select: 'Dropdown',
  multiselect: 'Multi-select',
  checkbox: 'Checkbox',
  textarea: 'Textarea',
};

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('leads');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | undefined>(undefined);
  const [mergeDeleteField, setMergeDeleteField] = useState<CustomField | null>(null);

  const fetchFields = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=${activeModule}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setFields(await res.json());
    } catch (err) {
      console.error('Failed to fetch custom fields:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFields(); }, [activeModule]);

  const handleEdit = (field: CustomField) => { setSelectedField(field); setIsModalOpen(true); };
  const handleDelete = (field: CustomField) => { setMergeDeleteField(field); };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/crm/settings" className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors">
            <ChevronLeft size={14} /> Settings
          </Link>
          <h1 className="text-[22px] font-semibold text-[var(--text-main)] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
              <Settings2 size={20} />
            </span>
            Custom Properties
          </h1>
          <p className="text-sm text-[var(--primary-muted)] mt-1">
            Create dynamic fields to capture specific data for your {activeModule}.
          </p>
        </div>
        <button
          onClick={() => { setSelectedField(undefined); setIsModalOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--hs-link-hover)] transition-colors"
        >
          <Plus size={15} />
          New Property
        </button>
      </div>

      {/* Module tabs + content */}
      <div className="rounded-md border border-[var(--surface-dim)] bg-white overflow-hidden shadow-sm">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--surface-dim)] bg-[var(--background)] px-4 py-2 overflow-x-auto">
          {MODULES.map((m) => (
            <button
              key={m}
              onClick={() => setActiveModule(m)}
              className={`px-5 py-2 rounded-md text-xs font-semibold capitalize transition-all ${
                activeModule === m
                  ? 'bg-white text-[var(--hs-link)] border border-[var(--surface-dim)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/60'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 size={28} className="animate-spin text-[var(--primary-muted)]" />
              <p className="text-xs font-semibold text-[var(--primary-muted)] uppercase tracking-wider">Loading properties…</p>
            </div>
          ) : fields.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-[var(--background)] rounded-md border border-[var(--surface-dim)] flex items-center justify-center mb-4">
                <Box size={28} className="text-[var(--primary-muted)]" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">No properties yet</h3>
              <p className="text-sm text-[var(--primary-muted)] max-w-xs mt-1">
                Create custom fields to start collecting more data for your {activeModule}.
              </p>
              <button
                onClick={() => { setSelectedField(undefined); setIsModalOpen(true); }}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors"
              >
                <Plus size={14} /> New Property
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map((field) => (
                <div
                  key={field._id}
                  className="group relative flex flex-col gap-3 rounded-md border border-[var(--surface-dim)] bg-white p-5 hover:border-[var(--hs-link)]/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
                      <Settings2 size={16} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(field)}
                        className="p-1.5 rounded-md hover:bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(field)}
                        className="p-1.5 rounded-md hover:bg-rose-50 text-[var(--primary-muted)] hover:text-rose-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-main)]">{field.name}</h3>
                    <p className="text-xs font-mono text-[var(--primary-muted)] mt-0.5">{field.key}</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-3 border-t border-[var(--surface-dim)]">
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--background)] border border-[var(--surface-dim)] text-xs font-semibold text-[var(--text-muted)]">
                      {TYPE_LABELS[field.type] || field.type}
                    </span>
                    {field.required && (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-100 text-xs font-semibold text-rose-600">
                        Required
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats banner */}
      <div className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Property Insights</h2>
          <p className="text-sm text-[var(--primary-muted)] mt-1 max-w-xl leading-relaxed">
            Custom properties allow you to tailor 2Bigha to your business processes — use them for lead scoring, revenue tracking, or specific contact attributes.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 px-5 py-3 rounded-md border border-[var(--surface-dim)] bg-white">
          <div className="text-[22px] font-bold text-[var(--hs-link)]">{fields.length}</div>
          <div className="text-xs font-semibold text-[var(--primary-muted)] uppercase tracking-wider leading-tight">
            Active<br />Properties
          </div>
        </div>
      </div>

      <CustomFieldModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchFields}
        field={selectedField}
      />

      <DeleteCustomFieldMergeDialog
        open={!!mergeDeleteField}
        onOpenChange={(open) => !open && setMergeDeleteField(null)}
        field={mergeDeleteField}
        module={activeModule as CrmModuleKey}
        siblingCustomFields={fields
          .filter((f) => f._id !== mergeDeleteField?._id)
          .map((f) => ({ _id: f._id, name: f.name, key: f.key }))}
        onSuccess={() => { setMergeDeleteField(null); fetchFields(); }}
      />
    </div>
  );
}
